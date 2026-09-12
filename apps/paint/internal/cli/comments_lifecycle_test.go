package cli

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCommentsWatchEventsAndCleanTimeout(t *testing.T) {
	rec := &pollRecorder{scripts: []string{commentsEmptyJSON, commentsEnvelopeJSON}}
	srv := rec.server(t)
	defer srv.Close()
	code, out, stderr := runTest(context.Background(), srv.URL, "", "comments", "watch", "--timeout", "5", "--json")
	if code != 0 || stderr != "" {
		t.Fatalf("watch: %d %s", code, stderr)
	}
	var events []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		var event map[string]any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatalf("NDJSON line %q: %s", line, err)
		}
		if _, ok := event["document"]; ok {
			t.Fatalf("watch event must not carry a document: %s", line)
		}
		events = append(events, event)
	}
	if len(events) != 2 || events[0]["event"] != "initial" {
		t.Fatalf("expected initial then one change: %s", out)
	}
	// Empty baseline to full envelope moves epoch and grant state, so the
	// wake is named "control".
	if events[1]["event"] != "control" {
		t.Fatalf("expected control event name: %s", out)
	}
	envelope := events[1]["envelope"].(map[string]any)
	comments := envelope["comments"].([]any)
	if len(comments) != 3 || envelope["controlEpoch"] != 2.0 {
		t.Fatalf("change event must carry the raw envelope: %s", out)
	}

	// Identical repeats after the change produce no further events.
	repeat := &pollRecorder{scripts: []string{commentsEmptyJSON, commentsEnvelopeJSON, commentsEnvelopeJSON}}
	srv = repeat.server(t)
	defer srv.Close()
	code, out, stderr = runTest(context.Background(), srv.URL, "", "comments", "watch", "--timeout", "1", "--json")
	if code != 0 || stderr != "" || strings.Count(strings.TrimSpace(out), "\n") != 1 {
		t.Fatalf("watch must not emit fabricated events: %d %s %s", code, out, stderr)
	}

	always := commentsStaticServer(commentsEmptyJSON)
	defer always.Close()
	code, out, stderr = runTest(context.Background(), always.URL, "", "comments", "watch", "--timeout", "0.2")
	if code != 0 || stderr != "" || !strings.Contains(out, "[initial]") {
		t.Fatalf("watch timeout must exit clean 0: %d %s %s", code, out, stderr)
	}
}

func TestCommentsWatchCancelInterrupts(t *testing.T) {
	s := commentsStaticServer(commentsEmptyJSON)
	defer s.Close()
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(80*time.Millisecond, cancel)
	defer cancel()
	code, _, stderr := runTest(ctx, s.URL, "", "comments", "watch", "--timeout", "30")
	if code != 130 {
		t.Fatalf("cancel: %d %s", code, stderr)
	}
}

func TestCommentsAckAddressBodiesAndNoResume(t *testing.T) {
	var path, method string
	var body map[string]any
	var controlRequests int
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path, method = r.URL.Path, r.Method
		if r.URL.Path == "/api/control" {
			controlRequests++
		}
		body = nil
		if r.Method == "POST" {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
		}
		w.Write([]byte(stateJSON))
	}))
	defer s.Close()
	code, out, stderr := runTest(context.Background(), s.URL, "", "comments",
		"ack", "c-1", "--generation", "g1", "--seq", "3", "--json")
	if code != 0 || stderr != "" || method != "POST" || path != "/api/comments/ack" {
		t.Fatalf("ack: %d %s %s %s %s", code, out, stderr, method, path)
	}
	if len(body) != 4 || body["id"] != "c-1" || body["source"] != "agent" ||
		body["expectedDocGeneration"] != "g1" || body["expectedSeq"] != 3.0 {
		t.Fatalf("ack body: %+v", body)
	}

	code, out, stderr = runTest(context.Background(), s.URL, "", "comments",
		"address", "c-2", "--generation", "g1", "--seq", "4")
	if code != 0 || stderr != "" || path != "/api/comments/address" {
		t.Fatalf("address: %d %s %s %s", code, out, stderr, path)
	}
	if !strings.Contains(out, "Addressed comment c-2 (generation g1, expected seq 4)") {
		t.Fatalf("address text: %s", out)
	}
	if len(body) != 4 || body["id"] != "c-2" || body["source"] != "agent" ||
		body["expectedDocGeneration"] != "g1" || body["expectedSeq"] != 4.0 {
		t.Fatalf("address body: %+v", body)
	}
	if controlRequests != 0 {
		t.Fatalf("lifecycle must never resume playback; saw %d control requests", controlRequests)
	}
}

func TestCommentsStaleConflictSurfaces(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{"error":"comment changed since the provided generation"}`))
	}))
	defer s.Close()
	code, out, stderr := runTest(context.Background(), s.URL, "", "comments",
		"ack", "c-1", "--generation", "stale", "--seq", "3", "--json")
	var detail map[string]string
	if code != 1 || out != "" || json.Unmarshal([]byte(stderr), &detail) != nil {
		t.Fatalf("409: %d %s %s", code, out, stderr)
	}
	if detail["error"] != "API_ERROR" || !strings.Contains(detail["message"], "comment changed") {
		t.Fatalf("409 detail: %s", stderr)
	}
}
