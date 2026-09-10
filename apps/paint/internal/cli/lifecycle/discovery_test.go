package lifecycle

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestManager(t *testing.T) (*Manager, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	manager, err := New(Options{DataDir: dataDir, CacheDir: filepath.Join(base, "cache"), Node: "node", Port: 0})
	if err != nil {
		t.Fatal(err)
	}
	return manager, dataDir
}

// freshDataDir prepares an existing private data directory for tests that
// probe the writer lease directly, mirroring what discover does for callers.
func freshDataDir(t *testing.T, dataDir string) {
	t.Helper()
	if err := ensurePrivateDir(dataDir); err != nil {
		t.Fatal(err)
	}
}

func runningRecord(t *testing.T, manager *Manager, url string) ownershipRecord {
	t.Helper()
	return testRecord(url, manager.digest)
}

func writeOwnershipRecord(t *testing.T, dataDir string, record ownershipRecord) {
	t.Helper()
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatal(err)
	}
	body, err := json.Marshal(record)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, recordName), body, 0o600); err != nil {
		t.Fatal(err)
	}
}

// statusHandler answers with the exact verified body for a record whose URL
// is this server's own loopback address, so identity checks pass.
func statusHandler(manager *Manager, state string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(capabilityHeader) == "" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.Write([]byte(statusBody(testRecord("http://"+r.Host, manager.digest), state)))
	}
}

func TestStatusStoppedWhenWriterLeaseAcquiredWithoutRecord(t *testing.T) {
	manager, dataDir := newTestManager(t)
	result, err := manager.Status(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if result != (Result{State: Stopped}) {
		t.Fatalf("stopped results carry no runtime fields: %+v", result)
	}
	if _, err := os.Stat(filepath.Join(dataDir, writerLockName)); err != nil {
		t.Errorf("the probe must create the stable writer lock: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); !os.IsNotExist(err) {
		t.Errorf("stopped discovery must not create a record: %v", err)
	}
	// A fresh missing data directory must be created private before the
	// operation lock is taken.
	info, err := os.Stat(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if !info.IsDir() || info.Mode().Perm() != 0o700 {
		t.Errorf("Status must create the private data directory: %v", info.Mode())
	}
}

func TestStatusRunningWhenBusyWithMatchingRecord(t *testing.T) {
	manager, dataDir := newTestManager(t)
	freshDataDir(t, dataDir)
	server := httptest.NewServer(statusHandler(manager, "running"))
	defer server.Close()
	record := runningRecord(t, manager, server.URL)
	writeOwnershipRecord(t, dataDir, record)
	lease, acquired, err := probeWriterLease(t.Context(), dataDir)
	if err != nil || !acquired {
		t.Fatalf("the simulated live writer must hold the lease: %v", err)
	}
	result, err := manager.Status(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	expected := Result{URL: record.URL, InstanceID: record.InstanceID, Digest: record.Digest, PID: record.PID, State: Running}
	if result != expected {
		t.Fatalf("busy discovery must report the verified runtime: %+v", result)
	}
	lease.Close()
	// With the lease released, a live endpoint behind a free lease is an
	// ownership violation and the record is preserved.
	if _, err := manager.Status(t.Context()); err == nil || !strings.Contains(err.Error(), "writer lease is free") {
		t.Fatalf("live endpoint with a free lease must be an ownership error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); err != nil {
		t.Fatalf("preserved record must remain: %v", err)
	}
}

func TestStaleCleanupReturnsRetainedLease(t *testing.T) {
	manager, dataDir := newTestManager(t)
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	abandoned := "http://" + listener.Addr().String()
	listener.Close()
	writeOwnershipRecord(t, dataDir, runningRecord(t, manager, abandoned))
	discovered, err := manager.discover(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if discovered.lease == nil {
		t.Fatal("stale cleanup must retain the acquired writer lease")
	}
	// The retained lease must still exclude a second probe.
	if competitor, acquired, err := probeWriterLease(t.Context(), dataDir); err != nil || acquired || competitor != nil {
		t.Fatalf("the retained lease must block a second probe: %v %v", acquired, err)
	}
	// Releasing it must allow normal re-acquisition.
	discovered.lease.Close()
	again, acquired, err := probeWriterLease(t.Context(), dataDir)
	if err != nil || !acquired || again == nil {
		t.Fatalf("the released lease must be reacquirable: %v", err)
	}
	again.Close()
}

func TestStatusStoppingWhenBusyEndpointReportsStopping(t *testing.T) {
	manager, dataDir := newTestManager(t)
	freshDataDir(t, dataDir)
	server := httptest.NewServer(statusHandler(manager, "stopping"))
	defer server.Close()
	writeOwnershipRecord(t, dataDir, runningRecord(t, manager, server.URL))
	lease, acquired, err := probeWriterLease(t.Context(), dataDir)
	if err != nil || !acquired {
		t.Fatalf("the simulated stopping writer must hold the lease: %v", err)
	}
	defer lease.Close()
	result, err := manager.Status(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if result.State != Stopping {
		t.Fatalf("a stopping endpoint must map to the stopping state: %+v", result)
	}
}

func TestStatusBusyRetriesUntilRecordAppears(t *testing.T) {
	manager, dataDir := newTestManager(t)
	freshDataDir(t, dataDir)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(statusBody(testRecord("http://"+r.Host, manager.digest), "running")))
	}))
	defer server.Close()
	lease, acquired, err := probeWriterLease(t.Context(), dataDir)
	if err != nil || !acquired {
		t.Fatalf("the simulated writer must hold the lease: %v", err)
	}
	defer lease.Close()
	time.AfterFunc(50*time.Millisecond, func() {
		writeOwnershipRecord(t, dataDir, runningRecord(t, manager, server.URL))
	})
	result, err := manager.Status(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if result.State != Running || result.URL != server.URL {
		t.Fatalf("late records must still classify as running: %+v", result)
	}
}
