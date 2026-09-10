package cli

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// Fixtures mirror the exact shapes produced by src/direction/feedback/
// store.mjs (comment records, poll cursor), grant.mjs (controlEpoch integer,
// activeGrant object), and src/transport/comments.mjs (heartbeat).
const commentsEnvelopeJSON = `{"cursor":"[\"sess-1\",\"gen-1\",5]","reset":false,"docGeneration":"gen-1",` +
	`"controlEpoch":2,"requiresGrant":true,"activeGrant":{"docGeneration":"gen-1","controlEpoch":2,"grantToken":"tok-1"},` +
	`"heartbeat":{"lastSeenAt":"2026-09-09T00:00:00Z"},"comments":[` +
	`{"id":"c-1","number":1,"seq":3,"text":"Fix the sky","rect":{"x":10,"y":20,"width":30,"height":40},` +
	`"status":"acknowledged","cursor":2,"artRevision":5,"at":"2026-09-09T00:00:00Z",` +
	`"acknowledgedAt":"2026-09-09T00:01:00Z","addressedAt":null,"resolvedAt":null,` +
	`"visibleLayers":[{"id":"paint","opacity":1},{"id":"sky","opacity":0.5}],` +
	`"request":{"id":"req-1","fingerprint":"fp-1"}},` +
	`{"id":"c-2","number":2,"seq":4,"text":"Whole canvas note","rect":null,"status":"open","cursor":2,` +
	`"artRevision":5,"at":"2026-09-09T00:00:30Z","acknowledgedAt":null,"addressedAt":null,"resolvedAt":null,` +
	`"visibleLayers":[],"request":null},` +
	`{"id":"c-3","number":3,"seq":5,"text":"Hidden layers note","rect":{"x":0,"y":0,"width":5,"height":5},` +
	`"status":"open","cursor":2,"artRevision":7,"at":"2026-09-09T00:00:40Z","acknowledgedAt":null,` +
	`"addressedAt":null,"resolvedAt":null,"visibleLayers":[],"request":null}]}`

func commentsStaticServer(body string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(body))
	}))
}

func TestCommentsValidationNeverRequests(t *testing.T) {
	var requests atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Write([]byte(stateJSON))
	}))
	defer s.Close()
	long := strings.Repeat("x", 257)
	cases := [][]string{
		{"comments", "bogus"},
		{"comments", "list", "extra"},
		{"comments", "list", "--since", "cur-1"},
		{"comments", "list", "--timeout", "5"},
		{"comments", "list", "--generation", "g1"},
		{"comments", "list", "--seq", "1"},
		{"comments", "wait", "extra"},
		{"comments", "wait", "--generation", "g"},
		{"comments", "watch", "--seq", "3"},
		{"comments", "wait", "--timeout", "0"},
		{"comments", "wait", "--timeout", "31"},
		{"comments", "wait", "--timeout", "NaN"},
		{"comments", "wait", "--since", long},
		{"comments", "ack"},
		{"comments", "ack", "c-1"},
		{"comments", "ack", "c-1", "--generation", "g1"},
		{"comments", "ack", "c-1", "--generation", "", "--seq", "1"},
		{"comments", "ack", "c-1", "--generation", "g1", "--seq", "0"},
		{"comments", "ack", "c-1", "--generation", "g1", "--seq", "9007199254740992"},
		{"comments", "ack", "c-1", "--generation", "g1", "--seq", "abc"},
		{"comments", "ack", "c-1", "--generation", "g1", "--seq", "+1"},
		{"comments", "ack", "c-1", "--since", "cur-1", "--generation", "g1", "--seq", "1"},
		{"comments", "address", "a", "b", "--generation", "g1", "--seq", "1"},
		{"comments", "ack", "--unknown"},
	}
	for _, args := range cases {
		args = append(args, "--json")
		code, out, stderr := runTest(context.Background(), s.URL, "", args...)
		var detail map[string]string
		if code != 2 || out != "" || json.Unmarshal([]byte(stderr), &detail) != nil || detail["error"] != "USAGE" {
			t.Errorf("%v: exit=%d stdout=%s stderr=%s", args, code, out, stderr)
		}
	}
	if requests.Load() != 0 {
		t.Fatalf("invalid comments invocation made %d requests", requests.Load())
	}
}

func TestCommentsListJSONPreservation(t *testing.T) {
	s := commentsStaticServer(commentsEnvelopeJSON)
	defer s.Close()
	for _, args := range [][]string{{"comments", "--json"}, {"comments", "list", "--json"}} {
		code, out, stderr := runTest(context.Background(), s.URL, "", args...)
		if code != 0 || stderr != "" {
			t.Fatalf("%v: %d %s", args, code, stderr)
		}
		var env map[string]any
		if err := json.Unmarshal([]byte(out), &env); err != nil {
			t.Fatalf("%v: %s", args, err)
		}
		if env["cursor"] != "[\"sess-1\",\"gen-1\",5]" || env["docGeneration"] != "gen-1" {
			t.Errorf("%v: envelope scalars: %s", args, out)
		}
		if env["controlEpoch"] != 2.0 || env["requiresGrant"] != true {
			t.Errorf("%v: grant scalars: %s", args, out)
		}
		grant := env["activeGrant"].(map[string]any)
		if grant["grantToken"] != "tok-1" || grant["docGeneration"] != "gen-1" || grant["controlEpoch"] != 2.0 {
			t.Errorf("%v: activeGrant object: %s", args, out)
		}
		comments := env["comments"].([]any)
		if len(comments) != 3 {
			t.Fatalf("%v: expected 3 comments: %s", args, out)
		}
		first := comments[0].(map[string]any)
		if first["artRevision"] != 5.0 || first["cursor"] != 2.0 || first["at"] == nil || first["request"] == nil {
			t.Errorf("%v: rich fields not preserved: %s", args, out)
		}
		if first["acknowledgedAt"] == nil || first["addressedAt"] != nil || first["resolvedAt"] != nil {
			t.Errorf("%v: lifecycle timestamps not preserved: %s", args, out)
		}
		layers := first["visibleLayers"].([]any)
		if len(layers) != 2 || layers[0].(map[string]any)["opacity"] != 1.0 ||
			layers[1].(map[string]any)["id"] != "sky" || layers[1].(map[string]any)["opacity"] != 0.5 {
			t.Errorf("%v: visibleLayers objects not preserved: %s", args, out)
		}
		second := comments[1].(map[string]any)
		emptyLayers, present := second["visibleLayers"].([]any)
		if !present || len(emptyLayers) != 0 {
			t.Errorf("%v: empty visibleLayers must stay an array: %s", args, out)
		}
		if second["rect"] != nil || second["request"] != nil {
			t.Errorf("%v: null rect/request must stay null: %s", args, out)
		}
		third := comments[2].(map[string]any)
		if len(third["visibleLayers"].([]any)) != 0 {
			t.Errorf("%v: empty visibleLayers must stay an array: %s", args, out)
		}
		if third["artRevision"] != 7.0 {
			t.Errorf("%v: artRevision must stay an integer: %s", args, out)
		}
	}
}

func TestCommentsListText(t *testing.T) {
	s := commentsStaticServer(commentsEnvelopeJSON)
	defer s.Close()
	code, out, stderr := runTest(context.Background(), s.URL, "", "comments")
	if code != 0 || stderr != "" {
		t.Fatalf("%d %s", code, stderr)
	}
	for _, want := range []string{
		"#1 [acknowledged] (id c-1, seq 3) Fix the sky",
		"#2 [open] (id c-2, seq 4) Whole canvas note",
		"(10,20 30x40)", "whole canvas",
		"layers paint @1, sky @0.5", "no visible layers",
		"cursor [\"sess-1\",\"gen-1\",5]", "generation gen-1", "epoch 2",
		"grant required", "grant tok-1 (generation gen-1, epoch 2)",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("text listing missing %q:\n%s", want, out)
		}
	}
}
