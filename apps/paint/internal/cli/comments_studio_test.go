package cli

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Real comments lifecycle against an actual isolated studio: guarded
// lifecycle writes, wait wake and timeout semantics, and watch NDJSON.
func TestCommentsStudioIntegration(t *testing.T) {
	if os.Getenv("PAINT_STUDIO_TESTS") != "1" {
		t.Skip("set PAINT_STUDIO_TESTS=1 for isolated real-studio integration")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	binary := buildPaintBinary(t, ctx, root, dir)
	endpoint := isolatedStudio(t, ctx, root)
	env := append(os.Environ(), "PAINT_URL="+endpoint, "PATH=")
	run := func(args ...string) json.RawMessage {
		t.Helper()
		cmd := exec.CommandContext(ctx, binary, append(args, "--json")...)
		cmd.Dir, cmd.Env = dir, env
		var stderr bytes.Buffer
		out, err := cmd.Output()
		if err != nil {
			t.Fatalf("paint %v: %v\nstdout=%s\nstderr=%s", args, err, out, &stderr)
		}
		if stderr.Len() != 0 || !json.Valid(out) {
			t.Fatalf("paint %v: stdout=%s stderr=%s", args, out, &stderr)
		}
		return json.RawMessage(out)
	}
	runFail := func(code string, args ...string) map[string]string {
		t.Helper()
		var out, stderr bytes.Buffer
		r := Runner{In: io.NopCloser(strings.NewReader("")), Out: &out, Err: &stderr,
			Env: func(key string) string {
				if key == "PAINT_URL" {
					return endpoint
				}
				return ""
			}}
		exit := r.Run(ctx, append(args, "--json"))
		var detail map[string]string
		if exit != 1 || out.Len() != 0 || json.Unmarshal(stderr.Bytes(), &detail) != nil {
			t.Fatalf("expected failure for %v: exit=%d stdout=%s stderr=%s", args, exit, out.String(), stderr.String())
		}
		if detail["error"] != code {
			t.Fatalf("expected %s for %v, got %s", code, args, stderr.String())
		}
		return detail
	}
	status := func() studioGrantState {
		t.Helper()
		var s studioGrantState
		if err := json.Unmarshal(run("status"), &s); err != nil {
			t.Fatal(err)
		}
		return s
	}
	envelope := func(args ...string) commentsEnvelope {
		t.Helper()
		decoded, err := decodeCommentsEnvelope(run(args...))
		if err != nil {
			t.Fatal(err)
		}
		return decoded
	}
	post := func(path string, body map[string]any) studioGrantState {
		return postStudioAPI(t, endpoint, path, body)
	}

	// A human pause arms grant enforcement before any comment exists.
	post("/api/control", map[string]any{"action": "pause", "source": "human",
		"expectedDocGeneration": status().DocGeneration})
	runFail("COMMENTS_TIMEOUT", "comments", "wait", "--timeout", "0.3")

	full := status()
	post("/api/comments", map[string]any{
		"requestId":             "comments-studio-1",
		"text":                  "Fix the sky",
		"rect":                  map[string]any{"x": 10.0, "y": 20.0, "width": 30.0, "height": 40.0},
		"continuePlayback":      false,
		"expectedDocGeneration": full.DocGeneration,
		"expectedArtRevision":   full.ArtRevision,
	})

	listing := envelope("comments", "list")
	if len(listing.Comments) != 1 || listing.Comments[0].Text != "Fix the sky" {
		t.Fatalf("listing: %+v", listing)
	}
	if len(listing.Comments[0].VisibleLayers) == 0 {
		t.Fatal("visible layer snapshot missing")
	}
	comment := listing.Comments[0]
	// An existing non-empty delta returns from wait immediately.
	waited := envelope("comments", "wait", "--timeout", "5")
	if len(waited.Comments) != 1 || waited.Comments[0].ID != comment.ID {
		t.Fatalf("existing wait: %+v", waited)
	}

	// Watch emits the initial envelope, reacts to a new comment, and
	// interrupts at 130 on non-Windows platforms.
	cmd := exec.CommandContext(ctx, binary, "comments", "watch", "--timeout", "30", "--json")
	cmd.Dir, cmd.Env = dir, env
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if cmd.ProcessState == nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
	}()
	scanner := bufio.NewScanner(stdout)
	readEvent := func() map[string]any {
		t.Helper()
		if !scanner.Scan() {
			t.Fatal("watch ended before an event arrived")
		}
		var event map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil {
			t.Fatalf("watch line %q: %v", scanner.Text(), err)
		}
		return event
	}
	initialEvent := readEvent()
	if initialEvent["event"] != "initial" {
		t.Fatalf("first watch event: %v", initialEvent)
	}
	second := status()
	post("/api/comments", map[string]any{
		"requestId":             "comments-studio-2",
		"text":                  "Add clouds",
		"rect":                  nil,
		"continuePlayback":      false,
		"expectedDocGeneration": second.DocGeneration,
		"expectedArtRevision":   second.ArtRevision,
	})
	change := readEvent()
	if change["event"] == "initial" {
		t.Fatalf("second event must be a change: %v", change)
	}
	payload, _ := change["envelope"].(map[string]any)
	comments, _ := payload["comments"].([]any)
	// The poll envelope carries the delta since the prior cursor: exactly
	// the one newly added comment, not the retained history.
	if len(comments) != 1 {
		t.Fatalf("change envelope must hold only the new comment: %v", change)
	}
	delta := comments[0].(map[string]any)
	if delta["text"] != "Add clouds" {
		t.Fatalf("delta comment: %v", delta)
	}
	if runtime.GOOS != "windows" {
		if err := cmd.Process.Signal(os.Interrupt); err != nil {
			t.Fatal(err)
		}
		waitErr := cmd.Wait()
		exit, ok := waitErr.(*exec.ExitError)
		if !ok || exit.ExitCode() != 130 || !strings.Contains(stderr.String(), "INTERRUPTED") {
			t.Fatal(fmt.Sprintf("interrupt: %v %s", waitErr, &stderr))
		}
	} else {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}

	// Lifecycle writes carry generation and seq guards; stale seq and a
	// stale generation both surface as 409 without auto-refresh.
	runFail("API_ERROR", "comments", "address", comment.ID, "--generation", full.DocGeneration,
		"--seq", strconv.FormatInt(comment.Seq, 10))
	run("comments", "ack", comment.ID, "--generation", full.DocGeneration, "--seq", strconv.FormatInt(comment.Seq, 10))
	after := envelope("comments", "list")
	var acked commentRecord
	for _, item := range after.Comments {
		if item.ID == comment.ID {
			acked = item
		}
	}
	if acked.Status != "acknowledged" || acked.Seq <= comment.Seq {
		t.Fatalf("ack transition: %+v", acked)
	}
	runFail("API_ERROR", "comments", "ack", comment.ID, "--generation", "stale-generation",
		"--seq", strconv.FormatInt(acked.Seq, 10))
	run("comments", "address", comment.ID, "--generation", full.DocGeneration, "--seq", strconv.FormatInt(acked.Seq, 10))

	// With the cursor current and nothing changing, wait times out boundedly.
	current := envelope("comments", "list")
	runFail("COMMENTS_TIMEOUT", "comments", "wait", "--since", current.Cursor, "--timeout", "0.3")
}
