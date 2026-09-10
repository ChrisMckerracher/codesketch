package lifecycle

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestLauncherExitRetainsWriterLeaseAndDiscovery proves the real launcher
// boundary: a launcher process starts the runtime with the actual Start and
// exits, the detached child alone retains the writer lease, the operation
// lock becomes acquirable, and a fresh launcher process reuses the exact
// same instance before an authenticated stop releases everything.
func TestLauncherExitRetainsWriterLeaseAndDiscovery(t *testing.T) {
	nodeAvailable(t)
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	cacheDir := filepath.Join(base, "cache")
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatal(err)
	}
	seedRecovery(t, dataDir)
	manager, err := New(Options{DataDir: dataDir, CacheDir: cacheDir, Node: "node", Port: 0, NoOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	// Registered before any launch: a later assertion failure must not leave
	// an accepted Node child behind while temporary data disappears.
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })

	first := runLauncherHelperProcess(t, dataDir, cacheDir, filepath.Join(base, "helper-first.json"))
	result := *first.Result
	if result.State != Running || !strings.HasPrefix(result.URL, "http://127.0.0.1:") || result.PID <= 0 {
		t.Fatalf("the accepted runtime must run on loopback: %+v", result)
	}
	if result.Digest != manager.digest {
		t.Errorf("the accepted runtime must carry the embedded digest: %s", result.Digest)
	}
	assertDetachedSession(t, result.PID)
	childSID, err := testSessionID(result.PID)
	if err != nil {
		t.Fatalf("the accepted child session must stay observable while it runs: %v", err)
	}
	if childSID == first.LauncherSID {
		t.Errorf("the accepted child must not retain the exiting launcher session %d: pid %d", first.LauncherSID, result.PID)
	}
	// The launcher exit closed the parent lease descriptor: the child alone
	// keeps holding the writer lease, while the operation lock is free.
	lease, acquired, err := probeWriterLease(t.Context(), dataDir)
	if lease != nil {
		lease.Close()
	}
	if err != nil || acquired {
		t.Fatalf("the child must keep the writer lease after the launcher exit: %v %v", acquired, err)
	}
	unlock, err := acquireDataLock(t.Context(), filepath.Join(dataDir, lifecycleLockName))
	if err != nil {
		t.Fatalf("the operation lock must be acquirable after the launcher exit: %v", err)
	}
	unlock()

	record, err := readRecord(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if record.PID != result.PID || record.URL != result.URL {
		t.Errorf("the record must describe the accepted runtime: %+v", record)
	}
	if _, err := fetchStatus(t.Context(), record); err != nil {
		t.Fatalf("authenticated status must verify the accepted runtime: %v", err)
	}

	second := runLauncherHelperProcess(t, dataDir, cacheDir, filepath.Join(base, "helper-second.json"))
	if *second.Result != result {
		t.Fatalf("a fresh launcher process must reuse the accepted runtime verbatim: %+v vs %+v", *second.Result, result)
	}

	endpoint := record.URL
	stopAcceptedServer(t, dataDir)
	if !endpointRefused(t.Context(), endpoint) {
		t.Error("the stopped endpoint must refuse connections")
	}
	assertIdleDataDir(t, dataDir)
	assertNoDiagnosticLogs(t, cacheDir)
	discovered, err := manager.Status(t.Context())
	if err != nil || discovered.State != Stopped {
		t.Fatalf("discovery must classify the stopped runtime: %+v %v", discovered, err)
	}
}
