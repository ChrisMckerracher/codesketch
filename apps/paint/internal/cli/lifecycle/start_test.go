package lifecycle

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// nodeAvailable skips real-child tests only when no node executable exists.
func nodeAvailable(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("node"); err != nil {
		t.Skipf("node executable unavailable: %v", err)
	}
}

func newStartManager(t *testing.T) (*Manager, string, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	cacheDir := filepath.Join(base, "cache")
	manager, err := New(Options{DataDir: dataDir, CacheDir: cacheDir, Node: "node", Port: 0, NoOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	return manager, dataDir, cacheDir
}

// stopAcceptedServer shuts a live accepted runtime down through the
// authenticated stop route until the public Stop method lands.
func stopAcceptedServer(t *testing.T, dataDir string) {
	t.Helper()
	record, err := readRecord(dataDir)
	if os.IsNotExist(err) {
		// Already shut down by an earlier cleanup pass.
		return
	}
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(http.MethodPost, record.URL+"/api/lifecycle/stop",
		strings.NewReader(fmt.Sprintf(`{"instanceId":%q}`, record.InstanceID)))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set(capabilityHeader, record.Capability)
	request.Header.Set("Content-Type", "application/json")
	client := newDirectClient(5 * time.Second)
	defer client.CloseIdleConnections()
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	if response.StatusCode != http.StatusOK {
		t.Fatalf("authenticated stop failed: %d %s", response.StatusCode, body)
	}
	// Prove the runtime is stopped and the writer lease is free with a
	// fresh bounded context, so no accepted child survives cleanup.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	waitFor(t, 10*time.Second, func() bool {
		lease, acquired, err := probeWriterLease(ctx, dataDir)
		if lease != nil {
			lease.Close()
		}
		return err == nil && acquired
	})
}

func waitFor(t *testing.T, timeout time.Duration, check func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("condition was not reached in time")
}

func assertIdleDataDir(t *testing.T, dataDir string) {
	t.Helper()
	lease, acquired, err := probeWriterLease(t.Context(), dataDir)
	if err != nil || !acquired || lease == nil {
		t.Fatalf("the writer lease must be free after shutdown or failure: %v", err)
	}
	lease.Close()
}

func assertNoDiagnosticLogs(t *testing.T, cacheDir string) {
	t.Helper()
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".managed-") {
			t.Errorf("the parent must remove its diagnostic log: %s", entry.Name())
		}
	}
}

// cleanupAcceptedRuntime stops any accepted runtime a test left behind (even
// after an unexpected success or a mid-test assertion failure) and waits for
// the writer lease to be released before the temporary data disappears.
// Registered through t.Cleanup it always runs before t.TempDir deletion.
func cleanupAcceptedRuntime(t *testing.T, dataDir string) {
	t.Helper()
	if record, err := readRecord(dataDir); err == nil {
		client := newDirectClient(5 * time.Second)
		request, requestErr := http.NewRequest(http.MethodPost, record.URL+"/api/lifecycle/stop",
			strings.NewReader(fmt.Sprintf(`{"instanceId":%q}`, record.InstanceID)))
		if requestErr == nil {
			request.Header.Set(capabilityHeader, record.Capability)
			request.Header.Set("Content-Type", "application/json")
			response, stopErr := client.Do(request)
			if stopErr == nil {
				response.Body.Close()
			}
		}
		client.CloseIdleConnections()
	}
	if !awaitLeaseRelease(t, dataDir) {
		t.Errorf("the runtime child never released the writer lease before cleanup finished")
	}
}

func awaitLeaseRelease(t *testing.T, dataDir string) bool {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		lease, acquired, err := probeWriterLease(context.Background(), dataDir)
		if lease != nil {
			lease.Close()
		}
		if err == nil && acquired {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

func TestStartLaunchesVerifiedRuntimeAndAcceptsIt(t *testing.T) {
	nodeAvailable(t)
	manager, dataDir, cacheDir := newStartManager(t)
	result, err := manager.Start(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	if result.State != Running || !strings.HasPrefix(result.URL, "http://127.0.0.1:") || result.PID <= 0 {
		t.Fatalf("accepted runtime must be running on loopback: %+v", result)
	}
	if result.Digest != manager.digest {
		t.Errorf("accepted runtime must carry the embedded digest: %s", result.Digest)
	}
	// The parent closed its lease descriptor; the child alone holds the lock.
	if lease, acquired, err := probeWriterLease(t.Context(), dataDir); err != nil || acquired || lease != nil {
		t.Fatalf("the child must keep the writer lock while the parent lease is closed: %v %v", acquired, err)
	}
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
	assertDetachedSession(t, result.PID)
	stopAcceptedServer(t, dataDir)
	waitFor(t, 10*time.Second, func() bool {
		discovered, err := manager.Status(t.Context())
		return err == nil && discovered.State == Stopped
	})
	assertIdleDataDir(t, dataDir)
	assertNoDiagnosticLogs(t, cacheDir)
}

func TestStartReusesHealthyRuntimeAndHonoursRequestedPort(t *testing.T) {
	nodeAvailable(t)
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	cacheDir := filepath.Join(base, "cache")
	build := func(port int) *Manager {
		manager, err := New(Options{DataDir: dataDir, CacheDir: cacheDir, Node: "node", Port: port, NoOpen: true})
		if err != nil {
			t.Fatal(err)
		}
		return manager
	}
	manager := build(0)
	first, err := manager.Start(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	// Register authenticated cleanup immediately: a later assertion failure
	// must not leave an accepted Node child running.
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	second, err := manager.Start(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if second != first {
		t.Fatalf("a healthy runtime must be reused verbatim: %+v vs %+v", second, first)
	}
	matching := build(urlPort(first.URL))
	if again, err := matching.Start(t.Context()); err != nil || again != first {
		t.Fatalf("a matching nonzero port must reuse the runtime: %+v %v", again, err)
	}
	// The conflicting port must stay inside 1024..65535 without binding:
	// 1024 is never in the ephemeral range, and 65535 covers the impossible
	// case of a bound port at 1024 itself.
	conflictingPort := 1024
	if urlPort(first.URL) == conflictingPort {
		conflictingPort = 65535
	}
	conflicting := build(conflictingPort)
	if _, err := conflicting.Start(t.Context()); err == nil || !strings.Contains(err.Error(), "instead of the requested") {
		t.Fatalf("a conflicting nonzero port must be rejected: %v", err)
	}
}

// assertDetachedSession proves the accepted child leads its own detached OS
// session instead of retaining the launcher's session identity. The kernel
// SYS_GETSID syscall observes session identifiers on every supported
// platform, so the main successful Start test never skips.
func assertDetachedSession(t *testing.T, pid int) {
	t.Helper()
	child, err := testSessionID(pid)
	if err != nil {
		t.Fatalf("the accepted child session must be observable: %v", err)
	}
	self, err := testSessionID(os.Getpid())
	if err != nil {
		t.Fatalf("the test process session must be observable: %v", err)
	}
	if child != pid {
		t.Errorf("the detached child must lead its own session: sid %d for pid %d", child, pid)
	}
	if child == self {
		t.Errorf("the accepted child must not retain the launcher session %d: pid %d", self, pid)
	}
}
