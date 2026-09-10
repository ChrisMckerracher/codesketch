package transport

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestEndpoint(t *testing.T) {
	for _, raw := range []string{"", DefaultURL, "http://localhost:4317/", "http://[::1]:4317", "https://127.2.3.4"} {
		if _, err := Endpoint(raw); err != nil {
			t.Errorf("%s: %v", raw, err)
		}
	}
	for _, raw := range []string{"http://example.com", "http://localhost.evil", "http://127.0.0.1@evil", "http://x@localhost", "file:///tmp/a", "http://localhost/api", "http://localhost?x=1", "http://localhost#x", "http://localhost:", "http://localhost:0", "http://localhost:65536", "http://[::ffff:192.168.1.1]", "http://[::1%25lo0]"} {
		if _, err := Endpoint(raw); err == nil {
			t.Errorf("accepted %s", raw)
		}
	}
}

func TestRequestBoundaries(t *testing.T) {
	var hits atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		switch r.URL.Path {
		case "/api/redirect":
			http.Redirect(w, r, "/api/state", 302)
		case "/api/large":
			w.Write([]byte(strings.Repeat("x", MaxResponseBytes+1)))
		case "/api/bad":
			w.Write([]byte("not json"))
		case "/api/fail":
			w.WriteHeader(400)
			w.Write([]byte(`{"error":"bad command"}`))
		case "/api/slow":
			<-r.Context().Done()
		default:
			if r.Method == "POST" && r.Header.Get("Content-Type") != "application/json" {
				t.Error("missing content type")
			}
			w.Write([]byte(`{"revision":1}`))
		}
	}))
	defer s.Close()
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:1")
	t.Setenv("HTTPS_PROXY", "http://127.0.0.1:1")
	t.Setenv("ALL_PROXY", "http://127.0.0.1:1")
	c, err := New(s.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	if _, err := c.Request(context.Background(), "POST", "/api/commands", map[string]int{"a": 1}); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/redirect", "/api/large", "/api/bad", "/api/fail"} {
		before := hits.Load()
		if _, err := c.Request(context.Background(), "GET", path, nil); err == nil {
			t.Errorf("accepted %s", path)
		}
		if hits.Load() != before+1 {
			t.Error("followed redirect")
		}
	}
	before := hits.Load()
	if _, err := c.Request(context.Background(), "POST", "/api/commands", strings.Repeat("a", MaxRequestBytes)); err == nil {
		t.Error("oversized body accepted")
	}
	if _, err := c.Request(context.Background(), "GET", "http://example.com/api/state", nil); err == nil {
		t.Error("external path accepted")
	}
	if hits.Load() != before {
		t.Error("invalid request sent")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, err := c.Request(ctx, "GET", "/api/slow", nil); !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("deadline: %v", err)
	}
}

func TestDialRejectsActualNonLoopbackIP(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if conn, err := loopbackDial(ctx, "tcp", "192.0.2.1:80"); err == nil {
		conn.Close()
		t.Fatal("dialed non-loopback")
	}
}
