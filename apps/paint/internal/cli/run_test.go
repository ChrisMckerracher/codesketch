package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	assets "github.com/ChrisMckerracher/codesketch/docs"
)

const stateJSON = `{"instanceId":"test-session","revision":4,"artRevision":3,"playback":{"status":"paused","speed":1,"remaining":1,"active":null},"history":{"cursor":2,"total":3},"document":{"layers":[{"id":"paint","name":"Paint","visible":true,"opacity":1}],"marks":[]},"comments":[{"id":"c-1","number":1,"seq":1,"text":"Keep paused","rect":null,"status":"open","cursor":2,"artRevision":3,"at":"2026-09-09T00:00:00Z","acknowledgedAt":null,"addressedAt":null,"resolvedAt":null,"visibleLayers":[{"id":"paint","opacity":1}],"request":null}],"storageError":null,"playbackError":null}`

func runTest(ctx context.Context, endpoint, stdin string, args ...string) (int, string, string) {
	var out, stderr bytes.Buffer
	r := Runner{In: io.NopCloser(strings.NewReader(stdin)), Out: &out, Err: &stderr,
		Env: func(key string) string {
			if key == "PAINT_URL" {
				return endpoint
			}
			return ""
		}}
	exit := r.Run(ctx, args)
	return exit, out.String(), stderr.String()
}

func TestOfflineCommands(t *testing.T) {
	// Bare paint and startup-flag invocations now take the managed start
	// path; offline coverage lives in studio_dispatch_test.go.
	for _, args := range [][]string{{"help"}, {"guide"}, {"version"}, {"--version"}, {"completion", "bash"}, {"completion", "zsh"}, {"completion", "fish"}} {
		code, out, err := runTest(context.Background(), "bad-url", "", args...)
		if code != 0 || out == "" || err != "" {
			t.Fatalf("%v: %d %s %s", args, code, out, err)
		}
	}
	for _, command := range commandNames() {
		code, out, err := runTest(context.Background(), "bad-url", "", command, "--help")
		if code != 0 || !strings.Contains(out, "Usage: paint "+command) || err != "" {
			t.Errorf("%s help: %d %s %s", command, code, out, err)
		}
		code, out, err = runTest(context.Background(), "bad-url", "", command, "--help", "--json")
		var help map[string]string
		if code != 0 || err != "" || json.Unmarshal([]byte(out), &help) != nil || !strings.Contains(help["text"], "Usage: paint "+command) {
			t.Errorf("%s JSON help: %d %s %s", command, code, out, err)
		}
	}
	_, out, _ := runTest(context.Background(), "bad-url", "", "guide")
	if strings.TrimSpace(out) != strings.TrimSpace(assets.AgentGuide) {
		t.Error("guide differs from canonical embedded document")
	}
}

func TestCommandHelpContextGuidance(t *testing.T) {
	for _, tc := range []struct {
		command, absent string
		present         []string
	}{
		{"comments", "--epoch", []string{"--generation", "--seq"}},
		{"stroke", "", []string{"required together", "--epoch", "fresh session"}},
		{"layer", "", []string{"layer add and layer update", "layer list rejects them"}},
	} {
		_, out, err := runTest(context.Background(), "bad-url", "", "help", tc.command)
		if err != "" || !strings.Contains(out, "Usage: paint "+tc.command) {
			t.Fatalf("%s help: %s %s", tc.command, out, err)
		}
		if tc.absent != "" && strings.Contains(out, tc.absent) {
			t.Errorf("%s help must not mention %s:\n%s", tc.command, tc.absent, out)
		}
		for _, want := range tc.present {
			if !strings.Contains(out, want) {
				t.Errorf("%s help missing %q:\n%s", tc.command, want, out)
			}
		}
	}
}

func TestInvalidInvocationsNeverRequest(t *testing.T) {
	var requests atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { requests.Add(1); w.Write([]byte(stateJSON)) }))
	defer s.Close()
	cases := [][]string{
		{"stroke", "--points", "1,2", "-size=4", "extra", "--generation", "g1", "--epoch", "0"},
		{"stroke", "--points", "1,2", "--size", "NaN", "--generation", "g1", "--epoch", "0"},
		{"stroke", "--points", "1,2", "--size", "4", "-size=5"},
		{"stroke", "--points", "1,2", "--brush", "invalid", "--generation", "g1", "--epoch", "0"},
		{"stroke", "--points", strings.Repeat("1,2 ", 2001), "--generation", "g1", "--epoch", "0"},
		{"stroke", "--points", "1,2", "--paused=true", "--generation", "g1", "--epoch", "0"},
		{"fill", "#ffffff", "--color", "#000000", "--generation", "g1", "--epoch", "0"},
		{"fill", "#fff"}, {"status", "extra"}, {"pause", "extra"},
		{"rect", "--x", "990", "--y", "0", "--width", "20", "--height", "10", "--generation", "g1", "--epoch", "0"},
		{"rect", "--x", "0", "--y", "0", "--height", "10", "--generation", "g1", "--epoch", "0"},
		{"layer", "list", "--paused"},
		{"layer", "add", "sky", "Sky", "--opacity", "1", "--generation", "g1", "--epoch", "0"},
		{"layer", "add", "sky", " ", "--generation", "g1", "--epoch", "0"},
		{"layer", "update", "sky", "--generation", "g1", "--epoch", "0"},
		{"layer", "update", "sky", "--visible", "yes", "--generation", "g1", "--epoch", "0"},
		{"layer", "update", "sky", "--name", "-json", "--generation", "g1", "--epoch", "0"},
		{"speed", "4", "--speed", "5"}, {"speed", "0"}, {"feedback", " "}, {"feedback"},
		{"stroke", "--points", "1,2"},
		{"stroke", "--points", "1,2", "--generation", "g"},
		{"stroke", "--points", "1,2", "--epoch", "0"},
		{"stroke", "--points", "1,2", "--grant", "tok"},
		{"stroke", "--points", "1,2", "--generation", "", "--epoch", "0"},
		{"stroke", "--points", "1,2", "--generation", "g", "--epoch", "x"},
		{"layer", "--generation", "g", "--epoch", "0"}, {"layer", "list", "--generation", "g", "--epoch", "0"},
		{"save", "-"}, {"load", "--generation", "g1", "--epoch", "0"}, {"submit", "-", "extra", "--generation", "g1", "--epoch", "0"},
		{"view", "--crop", "999,0,2,2"}, {"view", "--scale", "0"}, {"view", "--browser="}, {"export"},
		{"watch", "--interval", "20"}, {"wait", "--timeout", "0"}, {"doctor", "extra"},
		{"completion", "sh"}, {"guide", "extra"}, {"version", "extra"}, {"wat"}, {"status", "--unknown"},
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
		t.Fatalf("invalid invocation made %d requests", requests.Load())
	}
}

func TestDrawingPayloads(t *testing.T) {
	for _, tc := range []struct {
		args []string
		kind string
	}{
		{[]string{"stroke", "--points", "1,2 3,4", "-size=4", "--paused", "--replace", "--generation", "test-generation", "--epoch", "0"}, "stroke"},
		{[]string{"rect", "--x", "0", "--y", "0", "--width", "2", "--height", "3", "--generation", "test-generation", "--epoch", "0"}, "rect"},
		{[]string{"ellipse", "--x", "0", "--y", "0", "--width", "2", "--height", "3", "--generation", "test-generation", "--epoch", "0"}, "ellipse"},
		{[]string{"fill", "#AbC123", "--generation", "test-generation", "--epoch", "0"}, "fill"},
		{[]string{"layer", "add", "sky", "Sky", "--generation", "test-generation", "--epoch", "0"}, "layer.add"},
		{[]string{"layer", "update", "sky", "--name", "Clouds", "--opacity", "0.5", "--visible", "false", "--generation", "test-generation", "--epoch", "0"}, "layer.update"},
	} {
		t.Run(tc.kind, func(t *testing.T) {
			var payload struct {
				Commands              []map[string]any
				Play, Replace         bool
				ExpectedDocGeneration string
				Epoch                 float64
			}
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != "POST" || r.URL.Path != "/api/commands" {
					t.Errorf("request %s %s", r.Method, r.URL.Path)
				}
				if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
					t.Error(err)
				}
				w.Write([]byte(stateJSON))
			}))
			defer s.Close()
			code, out, stderr := runTest(context.Background(), s.URL, "", tc.args...)
			if code != 0 || stderr != "" || !strings.Contains(out, "playback: paused") {
				t.Fatalf("%d %s %s", code, out, stderr)
			}
			if len(payload.Commands) != 1 || payload.Commands[0]["type"] != tc.kind {
				t.Fatalf("bad payload: %+v", payload)
			}
			c := payload.Commands[0]
			if payload.ExpectedDocGeneration != "test-generation" || payload.Epoch != 0 {
				t.Errorf("missing explicit mutation context: %+v", payload)
			}
			if tc.kind == "stroke" {
				if payload.Play || !payload.Replace || c["size"] != float64(4) {
					t.Errorf("bad stroke: %+v", payload)
				}
				points := c["points"].([]any)
				if len(points) != 2 || len(points[0].([]any)) != 2 {
					t.Error("points are not coordinate pairs")
				}
			} else if !payload.Play || payload.Replace {
				t.Error("wrong default queue options")
			}
		})
	}
}

func TestSessionAndFileCommands(t *testing.T) {
	var path, method string
	var body map[string]any
	project := `{"format":"codesketch","version":2,"commands":[],"cursor":0,"queue":[],"comments":[]}`
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path, method = r.URL.Path, r.Method
		body = nil
		if r.Method == "POST" {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
		}
		if r.Method == "GET" && path == "/api/project" {
			w.Write([]byte(project))
		} else {
			w.Write([]byte(stateJSON))
		}
	}))
	defer s.Close()
	for _, action := range []string{"pause", "resume", "step", "clear", "undo", "redo", "new"} {
		args := []string{action}
		if action != "pause" {
			args = append(args, "--generation", "test-generation", "--epoch", "0")
		}
		args = append(args, "--json")
		code, out, err := runTest(context.Background(), s.URL, "", args...)
		if code != 0 || !json.Valid([]byte(out)) || err != "" || path != "/api/control" || body["action"] != action {
			t.Errorf("%s: %d %s %s %v", action, code, out, err, body)
		}
		if action != "pause" && (body["expectedDocGeneration"] != "test-generation" || body["epoch"] != 0.0) {
			t.Errorf("%s: missing explicit mutation context: %v", action, body)
		}
	}
	for _, command := range []string{"status", "layer"} {
		args := []string{command}
		if command == "layer" {
			args = append(args, "list")
		}
		args = append(args, "--json")
		code, out, err := runTest(context.Background(), s.URL, "", args...)
		if code != 0 || !json.Valid([]byte(out)) || err != "" || method != "GET" {
			t.Errorf("read: %d %s %s", code, out, err)
		}
	}
	code, out, err := runTest(context.Background(), s.URL, "", "feedback", "--json")
	if code != 2 || out != "" || !strings.Contains(err, "USAGE") {
		t.Errorf("removed feedback command: %d %s %s", code, out, err)
	}
	file := filepath.Join(t.TempDir(), "saved.json")
	code, _, err = runTest(context.Background(), s.URL, "", "save", file, "--json")
	data, readErr := os.ReadFile(file)
	if code != 0 || err != "" || readErr != nil || strings.TrimSpace(string(data)) != project {
		t.Fatalf("save: %d %s %s %v", code, err, data, readErr)
	}
	code, _, err = runTest(context.Background(), s.URL, "", "load", file, "--generation", "test-generation", "--epoch", "0")
	wrapper, _ := body["project"].(map[string]any)
	if code != 0 || err != "" || path != "/api/project" || body["source"] != "agent" ||
		body["expectedDocGeneration"] != "test-generation" || body["epoch"] != 0.0 || wrapper["format"] != "codesketch" {
		t.Errorf("load: %d %s %v", code, err, body)
	}
	for _, input := range []string{`[{"type":"fill","color":"#ffffff"}]`, `{"commands":[{"type":"fill","color":"#ffffff"}]}`} {
		code, _, err = runTest(context.Background(), s.URL, input, "submit", "-", "--paused", "--generation", "test-generation", "--epoch", "0")
		if code != 0 || err != "" || path != "/api/commands" || body["play"] != false ||
			body["expectedDocGeneration"] != "test-generation" || body["epoch"] != 0.0 {
			t.Errorf("submit: %d %s %v", code, err, body)
		}
	}
}
