package cli

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

// studioGrantState is a full snapshot plus the control grant context fields.
type studioGrantState struct {
	snapshot
	DocGeneration string `json:"docGeneration"`
	ControlEpoch  int    `json:"controlEpoch"`
	RequiresGrant bool   `json:"requiresGrant"`
	ActiveGrant   *struct {
		DocGeneration string `json:"docGeneration"`
		ControlEpoch  int    `json:"controlEpoch"`
		GrantToken    string `json:"grantToken"`
	} `json:"activeGrant"`
	Comments []commentRecord `json:"comments"`
}

// postStudioAPI drives the same loopback HTTP surface the studio UI uses,
// including explicit human sources for test setup.
func postStudioAPI(t *testing.T, endpoint, path string, body any) studioGrantState {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.Post(endpoint+path, "application/json", bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("human API %s: %d %s", path, resp.StatusCode, raw)
	}
	var decoded studioGrantState
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("human API %s: %v", path, err)
	}
	return decoded
}

// observedFlags builds explicit mutation context flags from a snapshot the
// caller already observed; negative cases never auto-read or auto-refresh.
func observedFlags(s studioGrantState) []string {
	return []string{"--generation", s.DocGeneration, "--epoch", strconv.Itoa(s.ControlEpoch)}
}

func buildPaintBinary(t *testing.T, ctx context.Context, root, dir string) string {
	t.Helper()
	binary := filepath.Join(dir, "paint")
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	build := exec.CommandContext(ctx, "go", "build", "-o", binary, "./apps/paint/cmd/paint")
	build.Dir = root
	build.Env = append(os.Environ(), "GOPROXY=off", "GOSUMDB=off", "GOTOOLCHAIN=local", "GOWORK=off", "CGO_ENABLED=0")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	return binary
}

func isolatedStudio(t *testing.T, ctx context.Context, root string) string {
	t.Helper()
	script := `const {pathToFileURL}=require('node:url');
(async()=>{const root=process.argv[1];
const {createStudio}=await import(pathToFileURL(root+'/apps/studio/src/transport/index.mjs'));
const {server}=await createStudio({root:root+'/apps/studio'});
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
