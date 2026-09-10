package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"image/png"
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

// This opt-in test launches only its own ephemeral, non-persistent studio.
// Node is a test fixture runtime; the executable is exercised with PATH empty.
func TestNativeStudioIntegration(t *testing.T) {
	if os.Getenv("PAINT_STUDIO_TESTS") != "1" {
		t.Skip("set PAINT_STUDIO_TESTS=1 for isolated real-studio integration")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
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
		cmd.Stderr = &stderr
		out, err := cmd.Output()
		if err != nil {
			t.Fatalf("paint %v: %v\nstdout=%s\nstderr=%s", args, err, out, &stderr)
		}
		if stderr.Len() != 0 || !json.Valid(out) {
			t.Fatalf("paint %v: stdout=%s stderr=%s", args, out, &stderr)
		}
		return json.RawMessage(out)
	}
	state := func(args ...string) studioGrantState {
		t.Helper()
		var s studioGrantState
		if err := json.Unmarshal(run(args...), &s); err != nil {
			t.Fatal(err)
		}
		return s
	}
	// try runs one invocation against the isolated endpoint.
	try := func(args ...string) (int, string, string) {
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
		return exit, out.String(), stderr.String()
	}
	// mustFail expects a single 409 API failure with no stdout payload.
	mustFail := func(args ...string) {
		t.Helper()
		exit, out, stderr := try(args...)
		var detail map[string]string
		if exit != 1 || out != "" || json.Unmarshal([]byte(stderr), &detail) != nil ||
			detail["error"] != "API_ERROR" || !strings.Contains(stderr, "409") {
			t.Fatalf("expected 409 for %v: exit=%d stdout=%s stderr=%s", args, exit, out, stderr)
		}
	}
	// mustUsage expects a before-I/O usage rejection with no stdout payload.
	mustUsage := func(args ...string) {
		t.Helper()
		exit, out, stderr := try(args...)
		var detail map[string]string
		if exit != 2 || out != "" || json.Unmarshal([]byte(stderr), &detail) != nil || detail["error"] != "USAGE" {
			t.Fatalf("expected usage failure for %v: exit=%d stdout=%s stderr=%s", args, exit, out, stderr)
		}
	}
	post := func(body map[string]any) studioGrantState {
		return postStudioAPI(t, endpoint, "/api/control", body)
	}

	run("guide")
	run("version")
	run("help", "stroke")
	initial := state("status")
	if initial.History.Total != 0 {
		t.Fatal("isolated studio is not empty")
	}

	// A fresh session still stages work; guarded mutations carry explicit
	// observed generation and epoch from the snapshot the test observed.
	for _, args := range [][]string{
		{"fill", "#ffffff", "--paused"},
		{"step"},
		{"layer", "add", "sky", "Sky", "--paused"},
		{"step"},
		{"rect", "--x", "0", "--y", "0", "--width", "100", "--height", "100", "--color", "#ff0000", "--layer", "sky", "--paused"},
		{"step"},
		{"ellipse", "--x", "200", "--y", "200", "--width", "100", "--height", "80", "--paused"},
		{"step"},
		{"stroke", "--points", "10,20 30,40", "--brush", "pencil", "-size=4", "--paused"},
		{"step"},
		{"layer", "update", "sky", "--opacity", "0.5", "--visible", "true", "--paused"},
		{"step"},
	} {
		state(append(args, observedFlags(initial)...)...)
	}
	var layers []layerInfo
	if err := json.Unmarshal(run("layer", "list"), &layers); err != nil || len(layers) != 2 {
		t.Fatalf("layers: %v %v", layers, err)
	}
	state("speed", "2")
	artBefore := state("status").ArtRevision

	// A human pause arms the grant requirement.
	paused := post(map[string]any{"action": "pause", "source": "human"})
	if !paused.RequiresGrant || paused.ActiveGrant != nil {
		t.Fatal("human pause did not require a grant")
	}
	// Missing context fails as usage before I/O; a stale generation is
	// refused 409 and leaves the canvas unchanged.
	mustUsage("stroke", "--points", "50,50 70,70")
	mustFail("stroke", "--points", "50,50 70,70", "--generation", "stale-generation",
		"--epoch", strconv.Itoa(paused.ControlEpoch))
	if state("status").ArtRevision != artBefore {
		t.Fatal("rejected stroke changed artwork")
	}
	// Explicit generation/epoch context stages without a grant token.
	current := state("status")
	staged := state("stroke", "--points", "300,300 310,310", "--paused",
		"--generation", current.DocGeneration, "--epoch", strconv.Itoa(current.ControlEpoch))
	if staged.Playback.Status != "paused" {
		t.Fatal("staged stroke did not stay paused")
	}
	// A human resume issues an active grant; the observed grant authorizes
	// native execution.
	granted := post(map[string]any{"action": "resume", "source": "human"})
	if granted.ActiveGrant == nil || granted.ActiveGrant.GrantToken == "" {
		t.Fatal("human resume did not issue a grant")
	}
	grant := granted.ActiveGrant
	state("stroke", "--points", "330,300 340,310", "--generation", grant.DocGeneration,
		"--epoch", strconv.Itoa(grant.ControlEpoch), "--grant", grant.GrantToken)
	state("wait", "--timeout", "3")
	if state("status").History.Total <= staged.History.Total {
		t.Fatal("granted execution did not commit")
	}
	// A later human pause revokes the observed flags.
	post(map[string]any{"action": "pause", "source": "human"})
	mustFail("stroke", "--points", "350,300 360,310", "--generation", grant.DocGeneration,
		"--epoch", strconv.Itoa(grant.ControlEpoch), "--grant", grant.GrantToken)

	// A human comment pauses and records through the same loopback API with
	// the paused current context; flagless staging stays a usage failure.
	observed := state("status")
	commented := postStudioAPI(t, endpoint, "/api/comments", map[string]any{
		"requestId":             "native-comment-1",
		"text":                  "Keep the painter paused",
		"rect":                  nil,
		"expectedDocGeneration": observed.DocGeneration,
		"expectedArtRevision":   observed.ArtRevision,
	})
	if commented.Playback.Status != "paused" || len(commented.Comments) != 1 {
		t.Fatal("human comment pause contract failed")
	}
	mustUsage("stroke", "--points", "60,60 70,70", "--paused")
	// Guarded staging keeps one pending command for the roundtrip.
	later := state("status")
	state("stroke", "--points", "400,300 410,310", "--paused",
		"--generation", later.DocGeneration, "--epoch", strconv.Itoa(later.ControlEpoch))

	// Saved-project roundtrip through the native guarded load wrapper: the
	// grant comes from a fresh human resume, never from stale flags.
	state("wait", "--timeout", "0.1")
	file := filepath.Join(dir, "project.json")
	run("save", file)
	before, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(before, []byte("Keep the painter paused")) {
		t.Fatal("save omitted comments")
	}
	loaded := post(map[string]any{"action": "resume", "source": "human"})
	if loaded.ActiveGrant == nil {
		t.Fatal("human resume before load did not issue a grant")
	}
	loadGrant := loaded.ActiveGrant
	restored := state("load", file, "--generation", loadGrant.DocGeneration,
		"--epoch", strconv.Itoa(loadGrant.ControlEpoch), "--grant", loadGrant.GrantToken)
	if restored.Playback.Status != "paused" || restored.Playback.Remaining != 1 || len(restored.Comments) != 1 {
		t.Fatalf("guarded load did not restore the paused project: %+v", restored)
	}

	// Setup resets use the direct human API, then restage for capture with
	// the post-reset observed context.
	post(map[string]any{"action": "new", "source": "human"})
	if state("status").History.Total != 0 {
		t.Fatal("human new did not reset the session")
	}
	restarted := state("status")
	for _, args := range [][]string{
		{"fill", "#ffffff", "--paused"},
		{"step"},
		{"layer", "add", "sky", "Sky", "--paused"},
		{"step"},
		{"rect", "--x", "0", "--y", "0", "--width", "100", "--height", "100", "--color", "#ff0000", "--layer", "sky", "--paused"},
		{"step"},
		{"layer", "update", "sky", "--opacity", "0.5", "--visible", "true", "--paused"},
		{"step"},
	} {
		state(append(args, observedFlags(restarted)...)...)
	}
	if os.Getenv("PAINT_BROWSER_TESTS") == "1" {
		for _, command := range []string{"view", "export"} {
			path := filepath.Join(dir, command+".png")
			var result struct {
				Path          string `json:"path"`
				Width, Height int
			}
			if err := json.Unmarshal(run(command, path, "--crop", "0,0,100,100"), &result); err != nil {
				t.Fatal(err)
			}
			f, err := os.Open(result.Path)
			if err != nil {
				t.Fatal(err)
			}
			im, err := png.Decode(f)
			f.Close()
			if err != nil {
				t.Fatal(err)
			}
			if im.Bounds().Dx() != 100 || im.Bounds().Dy() != 100 || result.Width != 100 || result.Height != 100 {
				t.Fatal("capture dimensions mismatch")
			}
			red, green, blue, _ := im.At(50, 50).RGBA()
			if red < 64000 || green < 31000 || green > 34000 || blue < 31000 || blue > 34000 {
				t.Fatalf("layer pixel: %d %d %d", red, green, blue)
			}
		}
	}
	if runtime.GOOS != "windows" {
		testBinaryInterrupt(t, ctx, binary, dir, env)
	}
}
