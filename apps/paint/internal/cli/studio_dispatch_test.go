package cli

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/lifecycle"
)

var runningStudio = lifecycle.Result{
	URL: "http://127.0.0.1:5099", InstanceID: "instance-1",
	Digest: "abc123", PID: 501, State: lifecycle.Running,
}

type lifecycleCall struct {
	action  string
	options lifecycle.Options
}

// runStudioTest runs argv with an injected Lifecycle seam and an artwork
// test server. The run fails if any artwork request is attempted, so no
// lifecycle invocation can silently fall back to the transport path.
func runStudioTest(t *testing.T, seam func(context.Context, string, lifecycle.Options) (lifecycle.Result, error), args ...string) (int, string, string, []lifecycleCall) {
	t.Helper()
	var calls []lifecycleCall
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Write([]byte(stateJSON))
	}))
	defer server.Close()
	var out, stderr strings.Builder
	runner := Runner{
		In: io.NopCloser(strings.NewReader("")), Out: &out, Err: &stderr,
		Env: func(key string) string {
			if key == "PAINT_URL" {
				return server.URL
			}
			return ""
		},
		Lifecycle: func(ctx context.Context, action string, options lifecycle.Options) (lifecycle.Result, error) {
			calls = append(calls, lifecycleCall{action: action, options: options})
			return seam(ctx, action, options)
		},
	}
	exit := runner.Run(context.Background(), args)
	if requests.Load() != 0 {
		t.Fatalf("%v reached the artwork transport %d time(s)", args, requests.Load())
	}
	return exit, out.String(), stderr.String(), calls
}

func healthySeam(context.Context, string, lifecycle.Options) (lifecycle.Result, error) {
	return runningStudio, nil
}

func failingSeam(context.Context, string, lifecycle.Options) (lifecycle.Result, error) {
	return lifecycle.Result{}, errors.New("lifecycle must not run for offline commands")
}

func optionsOf(t *testing.T, calls []lifecycleCall) lifecycle.Options {
	t.Helper()
	if len(calls) != 1 {
		t.Fatalf("lifecycle calls = %d, want exactly 1", len(calls))
	}
	return calls[0].options
}

func TestBarePaintStartsManagedStudio(t *testing.T) {
	for _, tc := range []struct {
		args []string
		json bool
	}{
		{nil, false},
		{[]string{"--no-open"}, false},
		{[]string{"--json"}, true},
		{[]string{"--data-dir", "/tmp/sd-data", "--json"}, true},
		{[]string{"--cache-dir", "/tmp/sd-cache", "--node", "node22", "--port", "0", "--no-open"}, false},
	} {
		exit, out, stderr, calls := runStudioTest(t, healthySeam, tc.args...)
		if exit != 0 || stderr != "" {
			t.Errorf("%v: exit=%d stderr=%s", tc.args, exit, stderr)
			continue
		}
		if len(calls) != 1 || calls[0].action != "start" {
			t.Errorf("%v: calls = %+v, want one start", tc.args, calls)
			continue
		}
		options := calls[0].options
		baseline, err := lifecycle.DefaultOptions()
		if err != nil {
			t.Fatal(err)
		}
		if v, ok := flagOf(tc.args, "--data-dir"); ok {
			baseline.DataDir = v
		}
		if v, ok := flagOf(tc.args, "--cache-dir"); ok {
			baseline.CacheDir = v
		}
		if v, ok := flagOf(tc.args, "--node"); ok {
			baseline.Node = v
		}
		if hasFlag(tc.args, "--port") {
			baseline.Port = 0
		}
		baseline.NoOpen = hasFlag(tc.args, "--no-open")
		if options != baseline {
			t.Errorf("%v: options = %+v, want %+v", tc.args, options, baseline)
		}
		if tc.json {
			var result lifecycle.Result
			if err := json.Unmarshal([]byte(out), &result); err != nil || result != runningStudio {
				t.Errorf("%v: json = %s (%v)", tc.args, out, err)
			}
			continue
		}
		if !strings.Contains(out, "Studio running at http://127.0.0.1:5099 (pid 501)") {
			t.Errorf("%v: text = %s", tc.args, out)
		}
	}
}

func flagOf(args []string, name string) (string, bool) {
	for i, arg := range args {
		if arg == name && i+1 < len(args) {
			return args[i+1], true
		}
		if strings.HasPrefix(arg, name+"=") {
			return strings.TrimPrefix(arg, name+"="), true
		}
	}
	return "", false
}

func hasFlag(args []string, name string) bool {
	for _, arg := range args {
		if arg == name || strings.HasPrefix(arg, name+"=") {
			return true
		}
	}
	return false
}

func TestBarePaintOfflineBehaviorPreserved(t *testing.T) {
	for _, args := range [][]string{{"--help"}, {"-h"}, {"--version"}, {"--artist-skill"}} {
		exit, out, stderr, calls := runStudioTest(t, failingSeam, args...)
		if exit != 0 || out == "" || stderr != "" || len(calls) != 0 {
			t.Errorf("%v: exit=%d out=%d stderr=%s calls=%d", args, exit, len(out), stderr, len(calls))
		}
	}
}

func TestStudioCommandDispatchesEachAction(t *testing.T) {
	for _, action := range []string{"start", "status", "stop", "restart"} {
		exit, out, stderr, calls := runStudioTest(t, healthySeam, "studio", action)
		if exit != 0 || stderr != "" {
			t.Errorf("studio %s: exit=%d stderr=%s", action, exit, stderr)
			continue
		}
		if len(calls) != 1 || calls[0].action != action {
			t.Errorf("studio %s: calls = %+v", action, calls)
		}
		if !strings.Contains(out, "Studio running at http://127.0.0.1:5099 (pid 501)") {
			t.Errorf("studio %s: text = %s", action, out)
		}
	}
}

func TestLifecycleJSONIsThePublicResult(t *testing.T) {
	for _, args := range [][]string{{"studio", "status", "--json"}, {"studio", "stop", "--json"}} {
		exit, out, stderr, _ := runStudioTest(t, healthySeam, args...)
		if exit != 0 || stderr != "" {
			t.Fatalf("%v: exit=%d stderr=%s", args, exit, stderr)
		}
		var result lifecycle.Result
		if err := json.Unmarshal([]byte(out), &result); err != nil {
			t.Fatalf("%v: %v", args, err)
		}
		if result != runningStudio {
			t.Errorf("%v: json result = %+v, want %+v", args, result, runningStudio)
		}
	}
}

func TestLifecycleConciseStoppedOutput(t *testing.T) {
	stopped := lifecycle.Result{State: lifecycle.Stopped}
	exit, out, stderr, _ := runStudioTest(t, func(context.Context, string, lifecycle.Options) (lifecycle.Result, error) {
		return stopped, nil
	}, "studio", "status")
	if exit != 0 || stderr != "" || strings.TrimSpace(out) != "Studio stopped" {
		t.Errorf("stopped: exit=%d out=%q stderr=%s", exit, out, stderr)
	}
}

func TestBrowserErrorAfterHealthyStartReportsResultThenError(t *testing.T) {
	seam := func(context.Context, string, lifecycle.Options) (lifecycle.Result, error) {
		return runningStudio, errors.New("browser failed to open")
	}
	exit, out, stderr, _ := runStudioTest(t, seam, "studio", "start")
	if exit != 1 || !strings.Contains(out, "Studio running at http://127.0.0.1:5099 (pid 501)") ||
		!strings.Contains(stderr, "browser failed to open") {
		t.Errorf("text: exit=%d out=%q stderr=%q", exit, out, stderr)
	}
	exit, out, stderr, _ = runStudioTest(t, seam, "studio", "start", "--json")
	var result lifecycle.Result
	if exit != 1 || json.Unmarshal([]byte(out), &result) != nil || result != runningStudio ||
		!strings.Contains(stderr, "ERROR") {
		t.Errorf("json: exit=%d out=%q stderr=%q", exit, out, stderr)
	}
}

func TestOtherLifecycleErrorsPrintNoFakeResult(t *testing.T) {
	seam := func(context.Context, string, lifecycle.Options) (lifecycle.Result, error) {
		return lifecycle.Result{}, errors.New("discovery failed")
	}
	exit, out, stderr, _ := runStudioTest(t, seam, "studio", "status")
	if exit != 1 || out != "" || !strings.Contains(stderr, "discovery failed") {
		t.Errorf("status: exit=%d out=%q stderr=%q", exit, out, stderr)
	}
}

func TestStudioInvalidInvocationsFailBeforeLifecycle(t *testing.T) {
	for _, args := range [][]string{
		{"studio", "deploy"}, {"studio", "start", "stop"}, {"studio", "status", "--no-open"},
		{"studio", "stop", "--port", "0"}, {"studio", "restart", "--node="},
		{"studio", "start", "--port", "abc"}, {"studio", "--data-dir="}, {"--no-open", "status"},
	} {
		exit, out, stderr, calls := runStudioTest(t, healthySeam, append(args, "--json")...)
		var detail map[string]string
		if exit != 2 || out != "" || len(calls) != 0 ||
			json.Unmarshal([]byte(stderr), &detail) != nil || detail["error"] != "USAGE" {
			t.Errorf("%v: exit=%d out=%q stderr=%q calls=%d", args, exit, out, stderr, len(calls))
		}
	}
}
