package cli

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func TestGrantFlagValidationNeverRequests(t *testing.T) {
	var requests atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Write([]byte(stateJSON))
	}))
	defer s.Close()
	cases := [][]string{
		{"stroke", "--points", "1,2", "--generation", "g1"},
		{"stroke", "--points", "1,2", "--epoch", "3"},
		{"resume", "--grant", "tok"},
		{"new", "--generation", "", "--epoch", "0"},
		{"new", "--generation", "  ", "--epoch", "0"},
		{"layer", "--generation", "g1", "--epoch", "2"},
		{"layer", "--grant", "tok"},
		{"layer", "list", "--generation", "g1", "--epoch", "2"},
		{"layer", "list", "--grant", "tok"},
		{"undo", "--generation", "g1", "--epoch", "9007199254740992"},
		{"undo", "--generation", "g1", "--epoch", "-1"},
		{"undo", "--generation", "g1", "--epoch", "abc"},
		{"undo", "--generation", "g1", "--epoch", "+1"},
		{"step", "--generation", strings.Repeat("g", 81), "--epoch", "1"},
		{"clear", "--generation", "g1", "--epoch", "1", "--grant", strings.Repeat("t", 81)},
		{"redo", "--generation", "g1", "--epoch", "1", "--grant", "bad\ttok"},
		// Flag validation precedes any file read: the paths below do not exist.
		{"submit", "/nonexistent/grants-input.json", "--generation", "g1"},
		{"load", "/nonexistent/grants-project.json", "--epoch", "2"},
		// Commands outside the mutation set never accept the flags.
		{"pause", "--generation", "g1", "--epoch", "2"},
		{"speed", "4", "--grant", "tok"},
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
		t.Fatalf("invalid grant invocation made %d requests", requests.Load())
	}
}

func TestGrantContextMergedOnAllMutations(t *testing.T) {
	var path, method string
	var body map[string]any
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path, method = r.URL.Path, r.Method
		body = nil
		if r.Method == "POST" {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
		}
		w.Write([]byte(stateJSON))
	}))
	defer s.Close()
	dir := t.TempDir()
	project := filepath.Join(dir, "project.json")
	if err := os.WriteFile(project, []byte(`{"format":"codesketch","version":2,"commands":[],"cursor":0,"queue":[],"comments":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	flags := []string{"--generation", "g1", "--epoch", "3", "--grant", "tok1"}
	cases := []struct {
		name, action string
		args         []string
		stdin        string
	}{
		{"stroke", "", append([]string{"stroke", "--points", "1,2"}, flags...), ""},
		{"rect", "", append([]string{"rect", "--x", "0", "--y", "0", "--width", "2", "--height", "3"}, flags...), ""},
		{"ellipse", "", append([]string{"ellipse", "--x", "0", "--y", "0", "--width", "2", "--height", "3"}, flags...), ""},
		{"fill", "", append([]string{"fill", "#ffffff"}, flags...), ""},
		{"layer add", "", append([]string{"layer", "add", "sky", "Sky"}, flags...), ""},
		{"layer update", "", append([]string{"layer", "update", "sky", "--name", "Clouds"}, flags...), ""},
		{"submit", "", append([]string{"submit", "-"}, flags...), `[{"type":"fill","color":"#ffffff"}]`},
		{"load", "", append([]string{"load", project}, flags...), ""},
		{"resume", "resume", append([]string{"resume"}, flags...), ""},
		{"step", "step", append([]string{"step"}, flags...), ""},
		{"clear", "clear", append([]string{"clear"}, flags...), ""},
		{"undo", "undo", append([]string{"undo"}, flags...), ""},
		{"redo", "redo", append([]string{"redo"}, flags...), ""},
		{"new", "new", append([]string{"new"}, flags...), ""},
	}
	for _, tc := range cases {
		code, out, stderr := runTest(context.Background(), s.URL, tc.stdin, append(tc.args, "--json")...)
		if code != 0 || stderr != "" || method != "POST" {
			t.Fatalf("%s: %d %s %s %s %s", tc.name, code, out, stderr, method, path)
		}
		if body["expectedDocGeneration"] != "g1" || body["epoch"] != float64(3) || body["grantToken"] != "tok1" {
			t.Fatalf("%s: context fields missing or mistyped: %+v", tc.name, body)
		}
		switch path {
		case "/api/control":
			if tc.action == "" || body["action"] != tc.action {
				t.Fatalf("%s: control body: %+v", tc.name, body)
			}
		case "/api/commands":
			if tc.action != "" || len(body["commands"].([]any)) != 1 {
				t.Fatalf("%s: commands body: %+v", tc.name, body)
			}
		case "/api/project":
			if tc.action != "" || body["source"] != "agent" {
				t.Fatalf("%s: load wrapper source: %+v", tc.name, body)
			}
			if body["project"].(map[string]any)["format"] != "codesketch" {
				t.Fatalf("%s: load wrapper project: %+v", tc.name, body)
			}
		default:
			t.Fatalf("%s: unexpected path %s", tc.name, path)
		}
	}
}

// Guarded mutations without explicit context are rejected before any I/O;
// the paths below point at an existing file so only context can fail.
func TestGrantMissingFlagsRejectedBeforeIO(t *testing.T) {
	var requests atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Write([]byte(stateJSON))
	}))
	defer s.Close()
	dir := t.TempDir()
	project := filepath.Join(dir, "project.json")
	if err := os.WriteFile(project, []byte(`{"format":"codesketch","version":2,"commands":[],"cursor":0,"queue":[],"comments":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{
		{"stroke", "--points", "1,2"},
		{"fill", "#ffffff"},
		{"layer", "add", "sky", "Sky"},
		{"submit", "-"},
		{"load", project},
		{"resume"}, {"step"}, {"clear"}, {"undo"}, {"redo"}, {"new"},
	} {
		code, out, stderr := runTest(context.Background(), s.URL, `[{"type":"fill","color":"#ffffff"}]`, append(args, "--json")...)
		var detail map[string]string
		if code != 2 || out != "" || json.Unmarshal([]byte(stderr), &detail) != nil || detail["error"] != "USAGE" {
			t.Errorf("%v: exit=%d stdout=%s stderr=%s", args, code, out, stderr)
		}
	}
	if requests.Load() != 0 {
		t.Fatalf("missing-context invocation made %d requests", requests.Load())
	}
}

// Pause, speed, and both layer list forms run without any context and never
// carry context fields.
func TestExemptCommandsStayContextfree(t *testing.T) {
	var requestPath string
	var body map[string]any
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestPath = r.URL.Path
		body = nil
		if r.Method == "POST" {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
		}
		w.Write([]byte(stateJSON))
	}))
	defer s.Close()
	for _, tc := range []struct {
		name, wantPath, action string
		args                   []string
	}{
		{"pause", "/api/control", "pause", []string{"pause"}},
		{"speed", "/api/control", "speed", []string{"speed", "2"}},
		{"layer list", "/api/state", "", []string{"layer", "list"}},
	} {
		code, out, stderr := runTest(context.Background(), s.URL, "", append(tc.args, "--json")...)
		if code != 0 || stderr != "" || requestPath != tc.wantPath {
			t.Fatalf("%s: %d %s %s %s", tc.name, code, out, stderr, requestPath)
		}
		for _, key := range []string{"expectedDocGeneration", "epoch", "grantToken"} {
			if _, ok := body[key]; ok {
				t.Fatalf("%s: unexpected %s in payload: %+v", tc.name, key, body)
			}
		}
		if tc.action != "" && body["action"] != tc.action {
			t.Fatalf("%s: action: %+v", tc.name, body)
		}
	}
}
