package lifecycle

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// fakeChildScript builds an owned fake managed child: it always publishes an
// alien record (its capability cannot match the intended launch), optionally
// writes a readiness frame to fd 4, and stays alive so the launcher abort
// path must reap it.
func fakeChildScript(state string, extraFrames, closePipe bool) string {
	script := `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const launch = JSON.parse(input);
  const record = { instanceId: 'fake-instance', pid: 1, url: 'http://127.0.0.1:1', digest: launch.digest, capability: 'f'.repeat(64) };
  fs.writeFileSync(path.join(launch.dataDir, 'lifecycle.json'), JSON.stringify(record), { mode: 0o600 });
`
	if state != "" {
		script += "  const frame = JSON.stringify({ instanceId: 'fake-instance', pid: 1, url: 'http://127.0.0.1:1', digest: launch.digest, state: '" + state + "' });\n"
		ending := " + '\\n'"
		if extraFrames {
			ending = " + '\\n' + frame + '\\n'"
		}
		script += "  fs.writeSync(4, frame" + ending + ");\n"
		if closePipe {
			script += "  fs.closeSync(4);\n"
		}
	}
	script += "  setInterval(() => {}, 10000);\n});\n"
	return script
}

func startFakeChild(t *testing.T, script string, deadline time.Duration) (*Manager, error) {
	t.Helper()
	manager, dataDir, _ := newStartManager(t)
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatal(err)
	}
	fake := filepath.Join(t.TempDir(), "fake-node")
	if err := os.WriteFile(fake, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	manager.node = fake
	if deadline > 0 {
		// The real caller deadline covers all startup, including the cold
		// runtime extraction. This test prewarms extraction so the bounded
		// context exercises the readiness-pipe deadline specifically.
		if _, _, err := ensureRuntime(t.Context(), manager.cacheDir); err != nil {
			t.Fatalf("prewarming the isolated runtime cache failed: %v", err)
		}
	}
	ctx := t.Context()
	if deadline > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, deadline)
		defer cancel()
	}
	_, err := manager.Start(ctx)
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	return manager, err
}

// fakeOpener shadows the platform opener with a test-local shell script.
func fakeOpener(t *testing.T, body string) {
	t.Helper()
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("browser opening is macOS and Linux behaviour")
	}
	bin := t.TempDir()
	name := "open"
	if runtime.GOOS == "linux" {
		name = "xdg-open"
	}
	if err := os.WriteFile(filepath.Join(bin, name), []byte("#!/bin/sh\n"+body), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func TestStartFakeChildIdentityMismatchIsAborted(t *testing.T) {
	manager, err := startFakeChild(t, fakeChildScript("running", false, true), 0)
	if err == nil || !strings.Contains(err.Error(), "capability") {
		t.Fatalf("the fake child identity must be rejected: %v", err)
	}
	if strings.Contains(err.Error(), strings.Repeat("f", 64)) {
		t.Errorf("capability material must never appear in errors: %v", err)
	}
	assertIdleDataDir(t, manager.dataDir)
	// The mismatched record is alien metadata: preserved, never authority.
	if _, err := os.Stat(filepath.Join(manager.dataDir, recordName)); err != nil {
		t.Errorf("an alien residual record must be preserved: %v", err)
	}
}

func TestStartRejectsExtraReadinessFrames(t *testing.T) {
	manager, err := startFakeChild(t, fakeChildScript("running", true, true), 0)
	if err == nil || !strings.Contains(err.Error(), "exactly one newline-terminated") {
		t.Fatalf("trailing frames must be rejected: %v", err)
	}
	assertIdleDataDir(t, manager.dataDir)
}

func TestStartUnclosedReadinessPipeHitsCallerDeadline(t *testing.T) {
	begun := time.Now()
	manager, err := startFakeChild(t, fakeChildScript("", false, false), 1*time.Second)
	if err == nil || !strings.Contains(err.Error(), "did not complete") {
		t.Fatalf("an unclosed pipe must hit the bounded startup: %v", err)
	}
	if elapsed := time.Since(begun); elapsed > 5*time.Second {
		t.Fatalf("the unclosed pipe must resolve through the caller deadline: %v", elapsed)
	}
	assertIdleDataDir(t, manager.dataDir)
}

func TestStartRejectsStoppingReadinessFrame(t *testing.T) {
	manager, err := startFakeChild(t, fakeChildScript("stopping", false, true), 0)
	if err == nil || !strings.Contains(err.Error(), "not running") {
		t.Fatalf("a stopping readiness frame must be rejected: %v", err)
	}
	assertIdleDataDir(t, manager.dataDir)
}

func TestStartOpensBrowserThroughPlatformOpener(t *testing.T) {
	nodeAvailable(t)
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("browser opening is macOS and Linux behaviour")
	}
	opened := filepath.Join(t.TempDir(), "opened")
	fakeOpener(t, "printf '%s\\n' \"$1\" > "+opened)
	manager, dataDir, _ := newStartManager(t)
	manager.noOpen = false
	result, err := manager.Start(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	body, err := os.ReadFile(opened)
	if err != nil || strings.TrimSpace(string(body)) != result.URL {
		t.Fatalf("the opener must receive the verified URL: %v %q", err, body)
	}
}

func TestStartReuseOpenerFailureKeepsHealthyServer(t *testing.T) {
	nodeAvailable(t)
	manager, dataDir, _ := newStartManager(t)
	first, err := manager.Start(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer stopAcceptedServer(t, dataDir)
	// A PATH with no opener must fail the reuse-time browser open while the
	// reused result stays healthy and the server stays discoverable.
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("browser opening is macOS and Linux behaviour")
	}
	t.Setenv("PATH", t.TempDir())
	reuser, err := New(Options{DataDir: manager.dataDir, CacheDir: manager.cacheDir, Node: "node", Port: 0, NoOpen: false})
	if err != nil {
		t.Fatal(err)
	}
	reused, err := reuser.Start(t.Context())
	if err == nil || !strings.Contains(err.Error(), first.URL) {
		t.Fatalf("reuse opener failure must return the URL error: %+v %v", reused, err)
	}
	if reused != first {
		t.Fatalf("the reused result must stay healthy: %+v vs %+v", reused, first)
	}
	record, err := readRecord(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fetchStatus(t.Context(), record); err != nil {
		t.Fatalf("authenticated status must still work after opener failure: %v", err)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
}

func TestStartLockedNeverOpensBrowser(t *testing.T) {
	nodeAvailable(t)
	opened := filepath.Join(t.TempDir(), "opened")
	fakeOpener(t, "printf '%s\\n' \"$1\" > "+opened)
	manager, dataDir, _ := newStartManager(t)
	manager.noOpen = false
	// startLocked assumes Start's preconditions are already met: private
	// directories and the operation lock held by the caller.
	if err := ensurePrivateDir(manager.dataDir); err != nil {
		t.Fatal(err)
	}
	unlock, err := acquireDataLock(t.Context(), filepath.Join(manager.dataDir, lifecycleLockName))
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	result, err := manager.startLocked(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	// The lock-owning helper must never touch the opener.
	if _, err := os.Stat(opened); !os.IsNotExist(err) {
		t.Fatalf("startLocked must not open a browser: %v", err)
	}
	// openResult owns the opener behaviour for the same healthy result.
	opened_result, err := manager.openResult(t.Context(), result)
	if err != nil || opened_result != result {
		t.Fatalf("openResult must return the healthy result: %+v %v", opened_result, err)
	}
	body, err := os.ReadFile(opened)
	if err != nil || strings.TrimSpace(string(body)) != result.URL {
		t.Fatalf("openResult must open the verified URL: %v %q", err, body)
	}
}

func TestStartOpenerFailureKeepsHealthyServer(t *testing.T) {
	nodeAvailable(t)
	fakeOpener(t, "exit 3")
	manager, dataDir, _ := newStartManager(t)
	manager.noOpen = false
	result, err := manager.Start(t.Context())
	if err == nil || !strings.Contains(err.Error(), result.URL) {
		t.Fatalf("opener failure must return the healthy result and a URL error: %+v %v", result, err)
	}
	if result.State != Running {
		t.Fatalf("the runtime must stay healthy behind an opener failure: %+v", result)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); err != nil {
		t.Fatalf("the healthy server must stay discoverable: %v", err)
	}
}
