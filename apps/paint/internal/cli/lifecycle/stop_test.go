package lifecycle

import (
	"context"
	"net"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestStopStopsRealRuntimeAndIsIdempotent(t *testing.T) {
	nodeAvailable(t)
	manager, dataDir, cacheDir := newStartManager(t)
	first, err := manager.Start(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	if first.State != Running {
		t.Fatalf("the runtime must be running before the stop: %+v", first)
	}
	stopped, err := manager.Stop(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if stopped != (Result{State: Stopped}) {
		t.Fatalf("a stopped result must carry no runtime fields: %+v", stopped)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); !os.IsNotExist(err) {
		t.Fatalf("the stopped runtime record must be gone: %v", err)
	}
	assertIdleDataDir(t, dataDir)
	assertNoDiagnosticLogs(t, cacheDir)

	// A second stop is idempotent success on the already quiet directory.
	again, err := manager.Stop(t.Context())
	if err != nil || again != (Result{State: Stopped}) {
		t.Fatalf("a repeated stop must stay idempotent: %+v %v", again, err)
	}
	if result, err := manager.Status(t.Context()); err != nil || result.State != Stopped {
		t.Fatalf("status after the stop must report stopped: %+v %v", result, err)
	}
}

func TestStopNeedsNoNodeOrCache(t *testing.T) {
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	cacheDir := filepath.Join(base, "cache")
	manager, err := New(Options{DataDir: dataDir, CacheDir: cacheDir, Node: filepath.Join(base, "absent-node"), Port: 0, NoOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	stopped, err := manager.Stop(t.Context())
	if err != nil || stopped != (Result{State: Stopped}) {
		t.Fatalf("stop on a quiet directory must never need node or cache: %+v %v", stopped, err)
	}
	if _, err := os.Stat(cacheDir); !os.IsNotExist(err) {
		t.Fatalf("stop must not extract any cache content: %v", err)
	}

	// A residual record with a definitively absent endpoint is stale
	// metadata: the public stop removes it without node or cache.
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	abandoned := "http://" + listener.Addr().String()
	listener.Close()
	stale := testRecord(abandoned, manager.digest)
	writeOwnershipRecord(t, dataDir, stale)
	stopped, err = manager.Stop(t.Context())
	if err != nil || stopped != (Result{State: Stopped}) {
		t.Fatalf("a proven-stale record must stop idempotently: %+v %v", stopped, err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); !os.IsNotExist(err) {
		t.Fatalf("the stale record must be removed under both locks: %v", err)
	}
	assertIdleDataDir(t, dataDir)
}

// Concurrent stop callers serialise under the operation lock: exactly one
// performs the authenticated shutdown and the rest confirm idempotence.
func TestStopConcurrentCallersSerialiseUnderOperationLock(t *testing.T) {
	nodeAvailable(t)
	manager, dataDir, _ := newStartManager(t)
	if _, err := manager.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	const callers = 4
	results := make([]Result, callers)
	errs := make([]error, callers)
	var group sync.WaitGroup
	for slot := 0; slot < callers; slot++ {
		group.Add(1)
		go func(slot int) {
			defer group.Done()
			ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
			defer cancel()
			results[slot], errs[slot] = manager.Stop(ctx)
		}(slot)
	}
	group.Wait()
	for slot := 0; slot < callers; slot++ {
		if errs[slot] != nil {
			t.Fatal(errs[slot])
		}
		if results[slot] != (Result{State: Stopped}) {
			t.Fatalf("every caller must report stopped: %+v", results[slot])
		}
	}
	assertIdleDataDir(t, dataDir)
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); !os.IsNotExist(err) {
		t.Fatalf("the record must be gone after concurrent stops: %v", err)
	}
}
