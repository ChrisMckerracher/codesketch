package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/capture"
)

func TestWaitSettlesWithoutResuming(t *testing.T) {
	var hits atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Error("wait mutated session")
		}
		body := stateJSON
		if hits.Add(1) == 1 {
			body = strings.Replace(body, `"status":"paused"`, `"status":"playing"`, 1)
		}
		w.Write([]byte(body))
	}))
	defer s.Close()
	code, out, err := runTest(context.Background(), s.URL, "", "wait", "--timeout", "1", "--json")
	if code != 0 || err != "" || !strings.Contains(out, `"paused"`) || hits.Load() != 2 {
		t.Fatalf("%d %s %s hits=%d", code, out, err, hits.Load())
	}
}

func TestObservationDeadlineAndInterrupt(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer s.Close()
	for _, command := range []string{"wait", "watch"} {
		start := time.Now()
		code, _, stderr := runTest(context.Background(), s.URL, "", command, "--timeout", "0.03", "--json")
		if time.Since(start) > time.Second {
			t.Fatal("request exceeded observation deadline")
		}
		if command == "wait" && (code != 1 || !strings.Contains(stderr, `"error":"WAIT_TIMEOUT"`)) {
			t.Fatalf("wait: %d %s", code, stderr)
		}
		if command == "watch" && (code != 0 || stderr != "") {
			t.Fatalf("watch: %d %s", code, stderr)
		}
		ctx, cancel := context.WithCancel(context.Background())
		timer := time.AfterFunc(20*time.Millisecond, cancel)
		code, _, stderr = runTest(ctx, s.URL, "", command, "--json")
		timer.Stop()
		cancel()
		if code != 130 || !strings.Contains(stderr, `"error":"INTERRUPTED"`) {
			t.Fatalf("interrupt: %d %s", code, stderr)
		}
	}
}

func TestWatchNDJSONAndQuery(t *testing.T) {
	var hits atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := hits.Add(1)
		if r.Method != "GET" {
			t.Error("watch mutated session")
		}
		if n > 1 && (r.URL.Query().Get("instanceId") != "test-session" || r.URL.Query().Get("since") == "") {
			t.Error("missing watch identity query")
		}
		if n > 2 {
			w.Write([]byte(`{"unchanged":true}`))
			return
		}
		body := strings.Replace(stateJSON, `"revision":4`, fmt.Sprintf(`"revision":%d`, n), 1)
		w.Write([]byte(body))
	}))
	defer s.Close()
	code, out, err := runTest(context.Background(), s.URL, "", "watch", "--timeout", "0.2", "--interval", "50", "--json")
	if code != 0 || err != "" {
		t.Fatalf("%d %s %s", code, out, err)
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 2 {
		t.Fatalf("unexpected NDJSON: %s", out)
	}
	for i, line := range lines {
		var event map[string]any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatal(err)
		}
		want := "initial"
		if i == 1 {
			want = "change"
		}
		if event["event"] != want || event["document"] != nil || event["comments"] == nil {
			t.Errorf("bad compact event: %s", line)
		}
	}
}

func TestCaptureUsesOneImmutableSnapshot(t *testing.T) {
	var hits atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if r.Method != "GET" {
			t.Error("capture mutated studio")
		}
		w.Write([]byte(stateJSON))
	}))
	defer s.Close()
	for _, command := range []string{"view", "export"} {
		var out, stderr bytes.Buffer
		r := Runner{Out: &out, Err: &stderr, Env: func(key string) string {
			if key == "PAINT_URL" {
				return s.URL
			}
			return ""
		},
			Capture: func(ctx context.Context, raw json.RawMessage, options capture.Options) (capture.Result, error) {
				if string(raw) != stateJSON {
					t.Error("snapshot altered")
				}
				if options.Committed != (command == "export") || options.Scale != 2 || options.Crop.X != 1 || options.Output != "picture.png" {
					t.Errorf("options: %+v", options)
				}
				return capture.Result{Path: "picture.png", MIMEType: "image/png", Width: 20, Height: 20, InstanceID: "test-session", Revision: 4}, nil
			}}
		before := hits.Load()
		code := r.Run(context.Background(), []string{command, "picture.png", "--crop", "1,2,10,10", "--scale", "2", "--json"})
		if code != 0 || stderr.Len() != 0 || hits.Load() != before+1 {
			t.Fatalf("%d %s %s", code, &out, &stderr)
		}
		var result map[string]any
		if err := json.Unmarshal(out.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if command == "view" && result["playback"] != "paused" {
			t.Error("missing view playback metadata")
		}
	}
}

func TestDoctorChecks(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(stateJSON)) }))
	defer s.Close()
	code, out, stderr := runTest(context.Background(), s.URL, "", "doctor", "--browser", "/missing/paint-browser", "--json")
	var report struct {
		OK     bool
		Checks map[string]check
		Build  map[string]string
	}
	if code != 1 || json.Unmarshal([]byte(out), &report) != nil || report.OK || !report.Checks["studio"].OK || report.Checks["browser"].OK || report.Build["version"] != Version || !strings.Contains(stderr, "DOCTOR_FAILED") {
		t.Fatalf("%d %s %s", code, out, stderr)
	}
}

func TestRuntimeErrorsAreStructured(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		w.Write([]byte(`{"error":"test refusal"}`))
	}))
	defer s.Close()
	code, out, stderr := runTest(context.Background(), s.URL, "", "pause", "--json")
	if code != 1 || out != "" || !strings.Contains(stderr, `"error":"API_ERROR"`) {
		t.Fatalf("%d %s %s", code, out, stderr)
	}
}
