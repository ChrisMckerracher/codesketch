package lifecycle

import (
	"context"
	"errors"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStartWrongNodeFailsBeforeAccept(t *testing.T) {
	base := t.TempDir()
	manager, err := New(Options{DataDir: filepath.Join(base, "data"), CacheDir: filepath.Join(base, "cache"), Node: "codesketch-absent-node", Port: 0, NoOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Start(t.Context()); err == nil || !strings.Contains(err.Error(), "start failed") {
		t.Fatalf("a missing node executable must fail the launch: %v", err)
	}
	assertIdleDataDir(t, manager.dataDir)
	if _, err := os.Stat(filepath.Join(manager.dataDir, recordName)); !os.IsNotExist(err) {
		t.Errorf("a failed launch must not leave a record: %v", err)
	}
	assertNoDiagnosticLogs(t, manager.cacheDir)
}

func TestStartCorruptRecoveryFailsAndPreservesBytes(t *testing.T) {
	nodeAvailable(t)
	manager, dataDir, cacheDir := newStartManager(t)
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatal(err)
	}
	recovery := filepath.Join(dataDir, "recovery.json")
	if err := os.WriteFile(recovery, []byte("{not the recovery envelope"), 0o600); err != nil {
		t.Fatal(err)
	}
	// A child that exits before readiness must be reaped and Start must
	// return well inside the bounded startup deadline.
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	begun := time.Now()
	_, err := manager.Start(ctx)
	if err == nil {
		t.Fatal("malformed recovery must fail startup")
	}
	// Depending on scheduling the launch reports either the pipe EOF or the
	// child exit branch; both are bounded, and the diagnostic tail must name
	// the actionable recovery cause.
	if elapsed := time.Since(begun); elapsed > 9*time.Second {
		t.Fatalf("the reaped child must not block the bounded startup: %v", elapsed)
	}
	if !strings.Contains(strings.ToLower(err.Error()), "recovery") {
		t.Fatalf("the failure must carry the actionable recovery diagnostic: %v", err)
	}
	body, readErr := os.ReadFile(recovery)
	if readErr != nil || string(body) != "{not the recovery envelope" {
		t.Fatalf("recovery bytes must be preserved: %v %s", readErr, body)
	}
	assertIdleDataDir(t, dataDir)
	assertNoDiagnosticLogs(t, cacheDir)
}

func TestStartOccupiedAlienPortIsAnErrorNotTakeover(t *testing.T) {
	nodeAvailable(t)
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	base := t.TempDir()
	manager, err := New(Options{DataDir: filepath.Join(base, "data"), CacheDir: filepath.Join(base, "cache"), Node: "node", Port: port, NoOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Start(t.Context()); err == nil {
		t.Fatal("an occupied requested port must fail the launch")
	}
	if _, err := net.Dial("tcp", listener.Addr().String()); err != nil {
		t.Fatalf("the alien listener must stay occupied: %v", err)
	}
	assertIdleDataDir(t, manager.dataDir)
	assertNoDiagnosticLogs(t, manager.cacheDir)
}

func TestStartCancellationBeforeAcceptKillsRetainedChild(t *testing.T) {
	nodeAvailable(t)
	manager, dataDir, cacheDir := newStartManager(t)
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatal(err)
	}
	// A test-only preload outside the runtime tree blocks the child just
	// before its first readiness byte: the marker is written after durable
	// publication, so cancelling on it lands after publication and before
	// acceptance. The barrier makes this deterministic despite bounded
	// observation polling.
	// The preload lives under a directory containing a space: the file URL
	// must be percent-encoded so NODE_OPTIONS splits into a single flag for
	// arbitrary temporary paths.
	fixture := filepath.Join(t.TempDir(), "pre load dir")
	if err := os.MkdirAll(fixture, 0o700); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(fixture, "readiness-marker")
	preload := filepath.Join(fixture, "block-fd4.mjs")
	preloadScript := `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.writeSync;
let armed = false;
fs.writeSync = function (fd, ...rest) {
  if (fd === 4 && !armed) {
    armed = true;
    fs.appendFileSync(process.env.CODESKETCH_TEST_MARKER, 'readiness blocked\n');
    const held = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(held, 0, 0);
  }
  return original(fd, ...rest);
};
syncBuiltinESMExports();
`
	if err := os.WriteFile(preload, []byte(preloadScript), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("NODE_OPTIONS", "--import "+(&url.URL{Scheme: "file", Path: preload}).String())
	t.Setenv("CODESKETCH_TEST_MARKER", marker)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	outcome := make(chan startOutcome, 1)
	go func() {
		result, startErr := manager.Start(ctx)
		outcome <- startOutcome{result: result, err: startErr}
	}()
	// Unexpected acceptance must also be cleaned up: no assertion path may
	// leave an accepted child running while temp data disappears.
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	// While waiting for the marker, observe the Start outcome so an early
	// child exit fails promptly with its diagnostic.
	markerSeen := false
	var launched startOutcome
	deadline := time.Now().Add(20 * time.Second)
	for !markerSeen && time.Now().Before(deadline) {
		select {
		case launched = <-outcome:
			cleanupAcceptedRuntime(t, dataDir)
			t.Fatalf("the child finished before the readiness barrier: %+v %v", launched.result, launched.err)
		default:
		}
		if _, err := os.Stat(marker); err == nil {
			markerSeen = true
			break
		}
		time.Sleep(25 * time.Millisecond)
	}
	cancel()
	if !markerSeen {
		// Cleanup must cancel and await the outcome before failing.
		select {
		case launched = <-outcome:
			t.Fatalf("the child exited before the readiness barrier: %+v %v", launched.result, launched.err)
		case <-time.After(10 * time.Second):
			t.Fatal("the readiness barrier marker was never written")
		}
	}
	select {
	case launched = <-outcome:
	case <-time.After(20 * time.Second):
		t.Fatal("Start did not return after cancellation")
	}
	if !errors.Is(launched.err, context.Canceled) {
		t.Fatalf("cancellation before acceptance must fail with cancellation: %+v %v", launched.result, launched.err)
	}
	// The killed child released the lease; the residual record is preserved
	// because the next discovery owns full stale proof under both locks.
	assertIdleDataDir(t, dataDir)
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); err != nil {
		t.Fatalf("a failed launch preserves the residual record: %v", err)
	}
	discovered, err := manager.Status(t.Context())
	if err != nil || discovered.State != Stopped {
		t.Fatalf("the next discovery must prove and clear the stale record: %+v %v", discovered, err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); !os.IsNotExist(err) {
		t.Errorf("discovery must remove the proven-stale record: %v", err)
	}
	assertNoDiagnosticLogs(t, cacheDir)
}

type startOutcome struct {
	result Result
	err    error
}
