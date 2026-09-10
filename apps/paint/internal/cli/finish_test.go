package cli

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestFinishRejectsMissingOrMalformedContextBeforeIO(t *testing.T) {
	hit := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit = true
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	cases := map[string][]string{
		"missing both flags": {"finish"},
		"generation only":    {"finish", "--generation", "gen-1"},
		"epoch only":         {"finish", "--epoch", "3"},
		"non-integer epoch":  {"finish", "--generation", "gen-1", "--epoch", "later"},
		"negative epoch":     {"finish", "--generation", "gen-1", "--epoch", "-3"},
		"epoch beyond 2^53":  {"finish", "--generation", "gen-1", "--epoch", "9007199254740992"},
	}
	for name, argv := range cases {
		code, out, stderr := runTest(context.Background(), server.URL, "", append(argv, "--json")...)
		if code != 2 || out != "" || !strings.Contains(stderr, "USAGE") {
			t.Fatalf("%s: exit=%d out=%q stderr=%q", name, code, out, stderr)
		}
	}
	if hit {
		t.Fatal("studio received a request before explicit context validation")
	}
}

func TestFinishSendsExactGuardedBody(t *testing.T) {
	var bodies []map[string]any
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		bodies = append(bodies, body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"instanceId":"i-1","revision":9,"playback":{"status":"paused","remaining":0},"comments":[]}`))
	}))
	defer server.Close()
	code, out, stderr := runTest(context.Background(), server.URL, "", "finish", "--generation", "gen-7", "--epoch", "4", "--grant", "tok-9", "--json")
	if code != 0 || stderr != "" {
		t.Fatalf("finish failed: exit=%d stderr=%q", code, stderr)
	}
	want := map[string]any{"action": "finish", "expectedDocGeneration": "gen-7", "epoch": float64(4), "grantToken": "tok-9"}
	if len(bodies) != 1 || paths[0] != "/api/control" || !reflect.DeepEqual(bodies[0], want) {
		t.Fatalf("exact body mismatch: paths=%v bodies=%v", paths, bodies)
	}
	if !strings.Contains(out, `"remaining": 0`) {
		t.Fatalf("expected snapshot json output, got %q", out)
	}
	code, _, stderr = runTest(context.Background(), server.URL, "", "finish", "--generation", "gen-7", "--epoch", "4", "--json")
	if code != 0 || stderr != "" {
		t.Fatalf("tokenless finish failed: exit=%d stderr=%q", code, stderr)
	}
	wantNoToken := map[string]any{"action": "finish", "expectedDocGeneration": "gen-7", "epoch": float64(4)}
	if len(bodies) != 2 || !reflect.DeepEqual(bodies[1], wantNoToken) {
		t.Fatalf("tokenless body mismatch: %v", bodies[1])
	}
}

func TestFinishSurfacesStaleContextConflict(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":"stale control epoch"}`))
	}))
	defer server.Close()
	code, out, stderr := runTest(context.Background(), server.URL, "", "finish", "--generation", "gen-1", "--epoch", "1", "--json")
	if code != 1 || out != "" || !strings.Contains(stderr, "API_ERROR") || !strings.Contains(stderr, "stale control epoch") {
		t.Fatalf("stale finish: exit=%d out=%q stderr=%q", code, out, stderr)
	}
}

func TestFinishAppearsInHelpAndCompletion(t *testing.T) {
	_, help, _ := runTest(context.Background(), "", "", "help")
	if !strings.Contains(help, "\n  finish\n") {
		t.Fatalf("general help does not visibly list finish: %q", help)
	}
	_, finishHelp, _ := runTest(context.Background(), "", "", "finish", "--help")
	if !strings.Contains(finishHelp, "Finish the active partial stroke and every queued command atomically") {
		t.Fatalf("finish help missing its description: %q", finishHelp)
	}
	for _, shell := range []string{"bash", "zsh", "fish"} {
		_, completionOut, _ := runTest(context.Background(), "", "", "completion", shell)
		if !strings.Contains(completionOut, "finish") || !strings.Contains(completionOut, "generation") {
			t.Fatalf("%s completion does not include finish with its flags", shell)
		}
	}
}
