package cli

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGrantLoadWrapperPreservesRawProject(t *testing.T) {
	var path string
	var body map[string]any
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		w.Write([]byte(stateJSON))
	}))
	defer s.Close()
	// Saved transient control metadata inside the project must survive
	// byte-for-byte inside `project` and never leak to the wrapper.
	raw := `{"format":"codesketch","version":2,"commands":[],"cursor":0,"queue":[],"comments":[],` +
		`"source":"human","expectedDocGeneration":"old","epoch":7,"grantToken":"oldtok",` +
		`"controlEpoch":9,"activeGrant":{"docGeneration":"old"},"requiresGrant":true}`
	project := filepath.Join(t.TempDir(), "project.json")
	if err := os.WriteFile(project, []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
	code, out, stderr := runTest(context.Background(), s.URL, "", "load", project,
		"--generation", "g1", "--epoch", "3", "--grant", "tok1", "--json")
	if code != 0 || stderr != "" || path != "/api/project" {
		t.Fatalf("load: %d %s %s %s", code, out, stderr, path)
	}
	if body["source"] != "agent" || body["expectedDocGeneration"] != "g1" ||
		body["epoch"] != float64(3) || body["grantToken"] != "tok1" {
		t.Fatalf("wrapper context: %+v", body)
	}
	wrapperKeys := 0
	for _, key := range []string{"expectedDocGeneration", "epoch", "grantToken", "project", "source"} {
		if _, ok := body[key]; ok {
			wrapperKeys++
		}
	}
	if wrapperKeys != 5 {
		t.Fatalf("wrapper carries exactly project, source, and observed flags: %+v", body)
	}
	inner := body["project"].(map[string]any)
	if inner["format"] != "codesketch" || inner["source"] != "human" || inner["controlEpoch"] != 9.0 ||
		inner["requiresGrant"] != true || inner["grantToken"] != "oldtok" {
		t.Fatalf("raw project must be preserved untouched: %+v", inner)
	}
}

func TestGrantSubmitWrapperMetadataIgnored(t *testing.T) {
	var body map[string]any
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		w.Write([]byte(stateJSON))
	}))
	defer s.Close()
	input := `{"commands":[{"type":"fill","color":"#ffffff"}],"epoch":99,"grantToken":"x","expectedDocGeneration":"old"}`
	code, _, stderr := runTest(context.Background(), s.URL, input, "submit", "-",
		"--generation", "g2", "--epoch", "5", "--json")
	if code != 0 || stderr != "" {
		t.Fatalf("submit: %d %s", code, stderr)
	}
	if body["expectedDocGeneration"] != "g2" || body["epoch"] != 5.0 {
		t.Fatalf("explicit CLI observed flags must win over wrapper metadata: %+v", body)
	}
	for _, key := range []string{"grantToken"} {
		if _, ok := body[key]; ok {
			t.Fatalf("submit wrapper metadata leaked into %s: %+v", key, body)
		}
	}
	if len(body["commands"].([]any)) != 1 {
		t.Fatalf("commands preserved: %+v", body)
	}
}

func TestGrantStaleConflictSingleRequest(t *testing.T) {
	var requests int
	var methods, paths []string
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		methods = append(methods, r.Method)
		paths = append(paths, r.URL.Path)
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{"error":"stale control grant"}`))
	}))
	defer s.Close()
	code, out, stderr := runTest(context.Background(), s.URL, "", "resume",
		"--generation", "g1", "--epoch", "2", "--grant", "tok1", "--json")
	var detail map[string]string
	if code != 1 || out != "" || json.Unmarshal([]byte(stderr), &detail) != nil {
		t.Fatalf("409: %d %s %s", code, out, stderr)
	}
	if detail["error"] != "API_ERROR" || !strings.Contains(detail["message"], "stale control grant") {
		t.Fatalf("409 detail: %s", stderr)
	}
	// Exactly one request, no automatic state reads or refreshes.
	if requests != 1 || methods[0] != "POST" || paths[0] != "/api/control" {
		t.Fatalf("requests: %d %v %v", requests, methods, paths)
	}
}
