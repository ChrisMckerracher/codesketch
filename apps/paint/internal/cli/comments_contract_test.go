package cli

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const commentsEmptyJSON = `{"cursor":"[\"sess-1\",\"gen-1\",0]","reset":false,"docGeneration":"gen-1",` +
	`"controlEpoch":0,"requiresGrant":false,"activeGrant":null,"heartbeat":{"lastSeenAt":null},"comments":[]}`

const commentsResetEmptyJSON = `{"cursor":"[\"sess-1\",\"gen-1\",0]","reset":true,"docGeneration":"gen-1",` +
	`"controlEpoch":0,"requiresGrant":false,"activeGrant":null,"heartbeat":{"lastSeenAt":null},"comments":[]}`

// withOneComment builds a valid envelope carrying exactly one comment record.
func withOneComment(record string) string {
	return strings.Replace(commentsEmptyJSON, `"comments":[]`, `"comments":[`+record+`]`, 1)
}

func TestDecodeCommentsEnvelopeRejectsMissingProvenance(t *testing.T) {
	valid := `{"id":"c-1","number":1,"seq":1,"text":"x","rect":null,"status":"open","cursor":1,` +
		`"artRevision":1,"at":"2026-09-09T00:00:00Z","acknowledgedAt":null,"addressedAt":null,` +
		`"resolvedAt":null,"visibleLayers":[],"request":null}`
	for name, record := range map[string]string{
		"missing artRevision":   strings.Replace(valid, `"artRevision":1,`, "", 1),
		"null artRevision":      strings.Replace(valid, `"artRevision":1`, `"artRevision":null`, 1),
		"negative artRevision":  strings.Replace(valid, `"artRevision":1`, `"artRevision":-1`, 1),
		"missing visibleLayers": strings.Replace(valid, `,"visibleLayers":[]`, "", 1),
		"null visibleLayers":    strings.Replace(valid, `"visibleLayers":[]`, `"visibleLayers":null`, 1),
		"missing rect":          strings.Replace(valid, `"rect":null,`, "", 1),
	} {
		if _, err := decodeCommentsEnvelope([]byte(withOneComment(record))); err == nil {
			t.Errorf("%s: expected rejection", name)
		}
	}
	for name, body := range map[string]string{
		"missing comments": strings.Replace(commentsEmptyJSON, `,"comments":[]`, "", 1),
		"null comments":    strings.Replace(commentsEmptyJSON, `"comments":[]`, `"comments":null`, 1),
	} {
		if _, err := decodeCommentsEnvelope([]byte(body)); err == nil {
			t.Errorf("%s: expected rejection", name)
		}
	}
	if _, err := decodeCommentsEnvelope([]byte(withOneComment(valid))); err != nil {
		t.Errorf("valid record rejected: %v", err)
	}
}

const stateWithoutCommentsJSON = `{"instanceId":"test-session","revision":4,"artRevision":3,"playback":{"status":"paused","speed":1,"remaining":1,"active":null},"history":{"cursor":2,"total":3},"document":{"layers":[{"id":"paint","name":"Paint","visible":true,"opacity":1}],"marks":[]},"storageError":null,"playbackError":null}`

func TestDecodeSnapshotRequiresCommentsOnFullSnapshots(t *testing.T) {
	if _, err := decodeSnapshot([]byte(stateWithoutCommentsJSON)); err == nil {
		t.Error("full snapshot without comments must be rejected")
	}
	if _, err := decodeSnapshot([]byte(stateJSON)); err != nil {
		t.Errorf("canonical snapshot rejected: %v", err)
	}
	if _, err := decodeSnapshot([]byte(`{"unchanged":true}`)); err != nil {
		t.Errorf("compact poll response must decode without comments: %v", err)
	}
}

// pollRecorder answers each /api/comments/poll with scripted envelopes and
// records the decoded since values the client sent.
type pollRecorder struct {
	bodies   []*string
	scripts  []string
	requests int
}

func (p *pollRecorder) server(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/api/comments/poll" {
			t.Errorf("request %s %s", r.Method, r.URL.Path)
		}
		var body struct {
			Since *string `json:"since"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		p.bodies = append(p.bodies, body.Since)
		script := p.scripts[len(p.scripts)-1]
		if p.requests < len(p.scripts) {
			script = p.scripts[p.requests]
		}
		p.requests++
		w.Write([]byte(script))
	}))
}

func TestCommentsWaitImmediateAndBaselineWake(t *testing.T) {
	s := commentsStaticServer(commentsEnvelopeJSON)
	defer s.Close()
	// No --since with an existing non-empty delta returns on the first poll.
	code, out, stderr := runTest(context.Background(), s.URL, "", "comments", "wait", "--json")
	if code != 0 || stderr != "" || !strings.Contains(out, "c-1") {
		t.Fatalf("immediate wait: %d %s %s", code, out, stderr)
	}

	rec := &pollRecorder{scripts: []string{commentsEmptyJSON, commentsEnvelopeJSON}}
	srv := rec.server(t)
	defer srv.Close()
	code, out, stderr = runTest(context.Background(), srv.URL, "", "comments", "wait", "--timeout", "5", "--json")
	if code != 0 || stderr != "" || !strings.Contains(out, "Fix the sky") {
		t.Fatalf("baseline wake: %d %s %s", code, out, stderr)
	}
	if len(rec.bodies) != 2 || rec.bodies[0] != nil ||
		rec.bodies[1] == nil || *rec.bodies[1] != "[\"sess-1\",\"gen-1\",0]" {
		t.Fatalf("poll since progression: %+v", rec.bodies)
	}
}

func TestCommentsWaitSuppliedCursorFirstDelta(t *testing.T) {
	s := commentsStaticServer(commentsEnvelopeJSON)
	defer s.Close()
	// A supplied cursor whose first response carries a non-empty delta wakes
	// immediately even though reset is false.
	code, out, stderr := runTest(context.Background(), s.URL, "", "comments",
		"wait", "--since", "[\"sess-1\",\"gen-1\",4]", "--timeout", "5", "--json")
	if code != 0 || stderr != "" || !strings.Contains(out, "visibleLayers") {
		t.Fatalf("supplied cursor first delta: %d %s %s", code, out, stderr)
	}
}

func TestCommentsWaitSuppliedSinceResetReturnsImmediately(t *testing.T) {
	// A supplied --since whose first response is reset:true must return at
	// once even with an empty delta: the caller needs the reset event.
	s := commentsStaticServer(commentsResetEmptyJSON)
	defer s.Close()
	code, out, stderr := runTest(context.Background(), s.URL, "", "comments",
		"wait", "--since", "[\"sess-1\",\"gen-1\",0]", "--timeout", "5", "--json")
	if code != 0 || stderr != "" {
		t.Fatalf("supplied since reset: %d %s %s", code, out, stderr)
	}
	var env map[string]any
	if err := json.Unmarshal([]byte(out), &env); err != nil || env["reset"] != true {
		t.Fatalf("reset envelope: %s %s", out, err)
	}

	// A later reset wakes an established baseline even when a malformed
	// remote repeats the same cursor.
	rec := &pollRecorder{scripts: []string{commentsEmptyJSON, commentsResetEmptyJSON}}
	srv := rec.server(t)
	defer srv.Close()
	code, out, stderr = runTest(context.Background(), srv.URL, "", "comments", "wait", "--timeout", "5", "--json")
	if code != 0 || stderr != "" {
		t.Fatalf("later reset wake on repeated cursor: %d %s %s", code, out, stderr)
	}
	if err := json.Unmarshal([]byte(out), &env); err != nil || env["reset"] != true {
		t.Fatalf("later reset envelope: %s %s", out, err)
	}
	if len(rec.bodies) != 2 {
		t.Fatalf("later reset must wake on the second poll: %+v", rec.bodies)
	}
}

func TestCommentsWaitEmptyResetAndNoChangeTimeout(t *testing.T) {
	// A reset-only empty first response establishes the baseline and waits;
	// with nothing else changing, the bounded timeout ends the wait.
	s := commentsStaticServer(commentsResetEmptyJSON)
	defer s.Close()
	code, out, stderr := runTest(context.Background(), s.URL, "", "comments", "wait", "--timeout", "0.2", "--json")
	var detail map[string]string
	if code != 1 || out != "" || json.Unmarshal([]byte(stderr), &detail) != nil || detail["error"] != "COMMENTS_TIMEOUT" {
		t.Fatalf("empty reset timeout: %d %s %s", code, out, stderr)
	}

	// Identical polls never wake either.
	quiet := commentsStaticServer(commentsEmptyJSON)
	defer quiet.Close()
	code, _, stderr = runTest(context.Background(), quiet.URL, "", "comments", "wait", "--timeout", "0.2", "--json")
	if code != 1 || json.Unmarshal([]byte(stderr), &detail) != nil || detail["error"] != "COMMENTS_TIMEOUT" {
		t.Fatalf("no-change timeout: %d %s", code, stderr)
	}
}
