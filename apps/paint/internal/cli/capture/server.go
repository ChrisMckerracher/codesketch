package capture

import (
	"context"
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	assets "github.com/ChrisMckerracher/codesketch/apps/studio"
)

//go:embed page.html
var pageHTML string

//go:embed page.mjs
var pageJS string

type outcome struct {
	png []byte
	err error
}

type captureServer struct {
	url, origin, host, base string
	data                    captureData
	snapshot                []byte
	server                  *http.Server
	result                  chan outcome
	serveDone               chan error
	claimed                 atomic.Bool
	callbackStarted         chan struct{}
	handlerMu               sync.Mutex
	handlers                sync.WaitGroup
	closing                 bool
}

func startServer(ctx context.Context, data captureData) (*captureServer, error) {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return nil, err
	}
	snapshot, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("capture listener: %w", err)
	}
	s := &captureServer{host: listener.Addr().String(), base: "/" + hex.EncodeToString(token) + "/", data: data, snapshot: snapshot, result: make(chan outcome, 1), serveDone: make(chan error, 1), callbackStarted: make(chan struct{})}
	s.origin = "http://" + s.host
	s.url = s.origin + s.base + "capture.html"
	s.server = &http.Server{Handler: http.HandlerFunc(s.handle), ReadHeaderTimeout: 2 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 2 * time.Second, MaxHeaderBytes: 8 << 10, BaseContext: func(net.Listener) context.Context { return ctx }}
	go func() { s.serveDone <- s.server.Serve(listener) }()
	return s, nil
}

func (s *captureServer) close() error {
	s.handlerMu.Lock()
	s.closing = true
	s.handlerMu.Unlock()
	err := s.server.Close()
	if errors.Is(err, http.ErrServerClosed) {
		err = nil
	}
	done := make(chan struct{})
	go func() { s.handlers.Wait(); close(done) }()
	select {
	case <-done:
		return err
	case <-time.After(time.Second):
		return errors.Join(err, errors.New("capture handlers exceeded cleanup deadline"))
	}
}

func (s *captureServer) handle(w http.ResponseWriter, r *http.Request) {
	s.handlerMu.Lock()
	if s.closing {
		s.handlerMu.Unlock()
		http.Error(w, "capture closed", 503)
		return
	}
	s.handlers.Add(1)
	s.handlerMu.Unlock()
	defer s.handlers.Done()
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
	origin, site := r.Header.Get("Origin"), r.Header.Get("Sec-Fetch-Site")
	if r.Host != s.host || (origin != "" && origin != s.origin) || (site != "" && site != "same-origin" && site != "none") || len(r.Header.Values("Origin")) > 1 {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.URL.RawQuery != "" || r.URL.RawPath != "" || r.RequestURI != r.URL.Path || !strings.HasPrefix(r.URL.Path, s.base) {
		http.NotFound(w, r)
		return
	}
	route := strings.TrimPrefix(r.URL.Path, s.base)
	if route == "result" || route == "error" {
		s.callback(w, r, route)
		return
	}
	var body, contentType string
	switch route {
	case "capture.html":
		body, contentType = pageHTML, "text/html; charset=utf-8"
	case "page.mjs":
		body, contentType = pageJS, "text/javascript; charset=utf-8"
	case "rendering/index.mjs":
		body, contentType = assets.RendererIndex, "text/javascript; charset=utf-8"
	case "rendering/stroke.mjs":
		body, contentType = assets.RendererStroke, "text/javascript; charset=utf-8"
	case "snapshot.json":
		body, contentType = string(s.snapshot), "application/json"
	default:
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		http.Error(w, "method not allowed", 405)
		return
	}
	if r.ContentLength != 0 || len(r.TransferEncoding) != 0 {
		http.Error(w, "unexpected request body", 400)
		return
	}
	w.Header().Set("Content-Type", contentType)
	io.WriteString(w, body)
}

func (s *captureServer) callback(w http.ResponseWriter, r *http.Request, route string) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "method not allowed", 405)
		return
	}
	if r.Header.Get("Origin") != s.origin {
		http.Error(w, "origin required", 403)
		return
	}
	wantType, limit := "image/png", int64(maxPNGBytes)
	if route == "error" {
		wantType, limit = "text/plain", 4096
	}
	if r.Header.Get("Content-Type") != wantType || len(r.Header.Values("Content-Type")) != 1 || r.Header.Get("Content-Encoding") != "" {
		http.Error(w, "unsupported content type", 415)
		return
	}
	if !s.claimed.CompareAndSwap(false, true) {
		http.Error(w, "capture already completed", 409)
		return
	}
	close(s.callbackStarted)
	defer r.Body.Close()
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
	if err == nil && route == "result" {
		err = validatePNGContext(r.Context(), body, s.data.Width, s.data.Height)
	}
	if err == nil && route == "error" {
		err = fmt.Errorf("browser render failed: %s", strings.TrimSpace(string(body)))
	}
	if err != nil {
		http.Error(w, "invalid capture result", 400)
		s.result <- outcome{err: err}
		return
	}
	w.WriteHeader(http.StatusNoContent)
	s.result <- outcome{png: body}
}
