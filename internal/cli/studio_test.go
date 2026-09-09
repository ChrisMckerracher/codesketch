package cli

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	binary := filepath.Join(dir, "paint")
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	build := exec.CommandContext(ctx, "go", "build", "-o", binary, "./cmd/paint")
	build.Dir = root
	build.Env = append(os.Environ(), "GOPROXY=off", "GOSUMDB=off", "GOTOOLCHAIN=local", "GOWORK=off", "CGO_ENABLED=0")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
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
	state := func(args ...string) snapshot {
		t.Helper()
		s, err := decodeSnapshot(run(args...))
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	run("guide")
	run("version")
	run("help", "stroke")
	initial := state("status")
	if initial.History.Total != 0 {
		t.Fatal("isolated studio is not empty")
	}
	state("fill", "#ffffff", "--paused")
	state("step")
	state("layer", "add", "sky", "Sky", "--paused")
	state("step")
	state("rect", "--x", "0", "--y", "0", "--width", "100", "--height", "100", "--color", "#ff0000", "--layer", "sky", "--paused")
	state("step")
	state("ellipse", "--x", "200", "--y", "200", "--width", "100", "--height", "80", "--paused")
	state("step")
	state("stroke", "--points", "10,20 30,40", "--brush", "pencil", "-size=4", "--paused")
	state("step")
	state("layer", "update", "sky", "--opacity", "0.5", "--visible", "true", "--paused")
	state("step")
	var layers []layerInfo
	if err := json.Unmarshal(run("layer", "list"), &layers); err != nil || len(layers) != 2 {
		t.Fatalf("layers: %v %v", layers, err)
	}
	state("speed", "2")
	state("pause")
	paused := state("feedback", "Keep the painter paused")
	if paused.Playback.Status != "paused" || len(paused.Feedback) != 1 {
		t.Fatal("feedback pause contract failed")
	}
	// The default play:true submission must preserve the real server's sticky pause.
	paused = state("stroke", "--points", "50,50 70,70")
	if paused.Playback.Status != "paused" {
		t.Fatal("submission resumed human pause")
	}
	state("wait", "--timeout", "0.1")
	file := filepath.Join(dir, "project.json")
	run("save", file)
	before, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(before, []byte("Keep the painter paused")) {
		t.Fatal("save omitted feedback")
	}
	cleared := state("new")
	if cleared.History.Total != 0 || len(cleared.Feedback) != 0 {
		t.Fatal("new did not reset session")
	}
	loaded := state("load", file)
	if loaded.Playback.Status != "paused" || loaded.Playback.Remaining != 1 || len(loaded.Feedback) != 1 || loaded.History.Total != paused.History.Total {
		t.Fatal("load did not restore project paused")
	}
	state("clear")
	undone := state("undo")
	redone := state("redo")
	if redone.History.Cursor != undone.History.Cursor+1 {
		t.Fatal("undo/redo cursor mismatch")
	}
	batchPath := filepath.Join(dir, "batch.json")
	if err := os.WriteFile(batchPath, []byte(`[{"type":"stroke","points":[[1,1],[2,2]],"color":"#000000"}]`), 0600); err != nil {
		t.Fatal(err)
	}
	state("submit", batchPath, "--paused")
	state("resume")
	state("wait", "--timeout", "3")
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

func isolatedStudio(t *testing.T, ctx context.Context, root string) string {
	t.Helper()
	script := `const {pathToFileURL}=require('node:url');
(async()=>{const root=process.argv[1];
const {createStudio}=await import(pathToFileURL(root+'/src/transport/index.mjs'));
const {server}=await createStudio({root});
server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>process.exit(0));server.closeAllConnections();});
})().catch(error=>{console.error(error);process.exit(1)});`
	cmd := exec.CommandContext(ctx, "node", "-e", script, root)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Error("isolated studio did not exit")
		}
	})
	ready := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		if scanner.Scan() {
			ready <- scanner.Text()
		} else {
			ready <- ""
		}
	}()
	select {
	case endpoint := <-ready:
		if !strings.HasPrefix(endpoint, "http://127.0.0.1:") {
			t.Fatal("studio did not report an isolated endpoint")
		}
		return endpoint
	case <-ctx.Done():
		t.Fatal("studio startup timed out")
		return ""
	}
}

func testBinaryInterrupt(t *testing.T, ctx context.Context, binary, dir string, env []string) {
	t.Helper()
	cmd := exec.CommandContext(ctx, binary, "watch", "--timeout", "30", "--json")
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
	if !scanner.Scan() || !json.Valid(scanner.Bytes()) {
		t.Fatal("watch did not emit initial NDJSON")
	}
	if err := cmd.Process.Signal(os.Interrupt); err != nil {
		t.Fatal(err)
	}
	err = cmd.Wait()
	exit, ok := err.(*exec.ExitError)
	if !ok || exit.ExitCode() != 130 || !strings.Contains(stderr.String(), "INTERRUPTED") {
		t.Fatal(fmt.Sprintf("interrupt: %v %s", err, &stderr))
	}
}
