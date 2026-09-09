package capture

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testServer(t *testing.T) *captureServer {
	t.Helper()
	data, err := validateSnapshot(json.RawMessage(testSnapshot), Options{})
	if err != nil {
		t.Fatal(err)
	}
	s, err := startServer(context.Background(), data)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := s.close(); err != nil {
			t.Error(err)
		}
	})
	return s
}

func request(s *captureServer, method, route, origin, kind string, body []byte) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, s.base+route, bytes.NewReader(body))
	r.Host = s.host
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	if kind != "" {
		r.Header.Set("Content-Type", kind)
	}
	w := httptest.NewRecorder()
	s.handle(w, r)
	return w
}

func TestExactRoutesAndTrust(t *testing.T) {
	s := testServer(t)
	for _, route := range []string{"capture.html", "page.mjs", "rendering/index.mjs", "rendering/stroke.mjs", "snapshot.json"} {
		w := request(s, "GET", route, "", "", nil)
		if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" || !strings.Contains(w.Header().Get("Content-Security-Policy"), "default-src 'none'") {
			t.Fatalf("%s: %+v", route, w)
		}
	}
	for _, tc := range []struct {
		method, route, origin, kind string
		status                      int
	}{
		{"GET", "snapshot.json?x=1", "", "", 404}, {"GET", "../snapshot.json", "", "", 404}, {"GET", "rendering/%69ndex.mjs", "", "", 404},
		{"GET", "capture.html/", "", "", 404}, {"GET", "missing", "", "", 404}, {"POST", "snapshot.json", s.origin, "application/json", 405},
		{"GET", "snapshot.json", "http://evil.invalid", "", 403}, {"POST", "result", "", "image/png", 403},
		{"GET", "result", s.origin, "image/png", 405}, {"POST", "result", s.origin, "text/plain", 415},
	} {
		if got := request(s, tc.method, tc.route, tc.origin, tc.kind, nil).Code; got != tc.status {
			t.Errorf("%+v: %d", tc, got)
		}
	}
	for _, change := range []func(*http.Request){
		func(r *http.Request) { r.Host = "localhost:1234" },
		func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "cross-site") },
		func(r *http.Request) { r.Header.Add("Origin", s.origin); r.Header.Add("Origin", s.origin) },
	} {
		r := httptest.NewRequest("GET", s.base+"snapshot.json", nil)
		r.Host = s.host
		change(r)
		w := httptest.NewRecorder()
		s.handle(w, r)
		if w.Code != 403 {
			t.Errorf("untrusted request: %d", w.Code)
		}
	}
	r := httptest.NewRequest("GET", "/wrong-token/snapshot.json", nil)
	r.Host = s.host
	w := httptest.NewRecorder()
	s.handle(w, r)
	if w.Code != 404 {
		t.Fatal("token bypass")
	}
}

func TestCallbacksValidateAndCompleteOnce(t *testing.T) {
	t.Run("valid", func(t *testing.T) {
		s := testServer(t)
		body := pngBytes(t, 100, 80)
		w := request(s, "POST", "result", s.origin, "image/png", body)
		if w.Code != 204 {
			t.Fatal(w.Code, w.Body.String())
		}
		got := <-s.result
		if got.err != nil || !bytes.Equal(got.png, body) {
			t.Fatal("invalid outcome", got.err)
		}
		if request(s, "POST", "result", s.origin, "image/png", body).Code != 409 {
			t.Fatal("duplicate accepted")
		}
	})
	for _, tc := range []struct {
		name, route, kind string
		body              []byte
	}{
		{"bad PNG", "result", "image/png", []byte("broken")},
		{"wrong dimensions", "result", "image/png", pngBytes(t, 1, 1)},
		{"render error", "error", "text/plain", []byte("renderer import failed")},
		{"error bound", "error", "text/plain", bytes.Repeat([]byte("x"), 4097)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := testServer(t)
			if request(s, "POST", tc.route, s.origin, tc.kind, tc.body).Code != 400 {
				t.Fatal("invalid accepted")
			}
			if (<-s.result).err == nil {
				t.Fatal("missing error outcome")
			}
		})
	}
}

func TestServerLoopbackAndClose(t *testing.T) {
	s := testServer(t)
	client := &http.Client{Transport: &http.Transport{Proxy: nil}}
	defer client.CloseIdleConnections()
	res, err := client.Get(s.url)
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(res.Body)
	res.Body.Close()
	if err != nil || res.StatusCode != 200 || !bytes.Contains(body, []byte("page.mjs")) {
		t.Fatal("page response", err)
	}
	if err := s.close(); err != nil {
		t.Fatal(err)
	}
	if res, err := client.Get(s.url); err == nil {
		res.Body.Close()
		t.Fatal("listener survived close")
	}
}
