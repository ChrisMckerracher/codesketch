package lifecycle

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStatusOwnershipErrorWhenBusyWithoutRecord(t *testing.T) {
	manager, dataDir := newTestManager(t)
	freshDataDir(t, dataDir)
	ctx, cancel := context.WithTimeout(t.Context(), 150*time.Millisecond)
	defer cancel()
	lease, acquired, err := probeWriterLease(t.Context(), dataDir)
	if err != nil || !acquired {
		t.Fatalf("the simulated writer must hold the lease: %v", err)
	}
	defer lease.Close()
	if _, err := manager.Status(ctx); err == nil || !strings.Contains(err.Error(), "no verified runtime record") {
		t.Fatalf("a busy writer without a record must yield an ownership error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); !os.IsNotExist(err) {
		t.Errorf("ownership errors must preserve the data directory: %v", err)
	}
}

func TestStatusBusyIncompatibleDigestErrorsAndPreserves(t *testing.T) {
	manager, dataDir := newTestManager(t)
	freshDataDir(t, dataDir)
	record := testRecord("http://127.0.0.1:1", strings.Repeat("e", 64))
	writeOwnershipRecord(t, dataDir, record)
	lease, acquired, err := probeWriterLease(t.Context(), dataDir)
	if err != nil || !acquired {
		t.Fatalf("the simulated writer must hold the lease: %v", err)
	}
	defer lease.Close()
	if _, err := manager.Status(t.Context()); err == nil || !strings.Contains(err.Error(), "incompatible") {
		t.Fatalf("an incompatible busy runtime must error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); err != nil {
		t.Fatalf("incompatible records must be preserved: %v", err)
	}
}

func TestStatusRemovesStaleRecordOnlyOnDefinitiveAbsence(t *testing.T) {
	manager, dataDir := newTestManager(t)
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	abandoned := "http://" + listener.Addr().String()
	listener.Close()
	record := runningRecord(t, manager, abandoned)
	writeOwnershipRecord(t, dataDir, record)
	result, err := manager.Status(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if result != (Result{State: Stopped}) {
		t.Fatalf("a definitively absent runtime is stopped: %+v", result)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); !os.IsNotExist(err) {
		t.Fatalf("stale records must be removed under both locks: %v", err)
	}
}

func TestStatusPreservesRecordOnUnverifiableEndpoint(t *testing.T) {
	manager, dataDir := newTestManager(t)
	freshDataDir(t, dataDir)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	record := runningRecord(t, manager, server.URL)
	writeOwnershipRecord(t, dataDir, record)
	lease, acquired, err := probeWriterLease(t.Context(), dataDir)
	if err != nil || !acquired {
		t.Fatalf("the simulated writer must hold the lease: %v", err)
	}
	defer lease.Close()
	ctx, cancel := context.WithTimeout(t.Context(), 150*time.Millisecond)
	defer cancel()
	if _, err := manager.Status(ctx); err == nil || !strings.Contains(err.Error(), "ownership error") {
		t.Fatalf("an unready busy endpoint must yield an ownership error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); err != nil {
		t.Fatalf("unready endpoints must preserve the record: %v", err)
	}
}

func TestStatusErrorsNeverContainCapabilityMaterial(t *testing.T) {
	manager, dataDir := newTestManager(t)
	freshDataDir(t, dataDir)
	record := runningRecord(t, manager, "http://127.0.0.1:1")
	writeOwnershipRecord(t, dataDir, record)
	// Force an unusable-record error path: a directory sits at the record
	// path, so reading fails without any capability material being quoted.
	if err := os.Remove(filepath.Join(dataDir, recordName)); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dataDir, recordName), 0o700); err != nil {
		t.Fatal(err)
	}
	_, err := manager.Status(t.Context())
	if err == nil {
		t.Fatal("an unusable record must error")
	}
	if strings.Contains(err.Error(), record.Capability) {
		t.Errorf("lifecycle errors must never contain capability material: %v", err)
	}
}

func TestDiscoverLeasedComposesWithoutRecursiveLocking(t *testing.T) {
	manager, dataDir := newTestManager(t)
	freshDataDir(t, dataDir)
	unlock, err := acquireDataLock(t.Context(), filepath.Join(dataDir, lifecycleLockName))
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	// Holding the operation lock from outside must not block an internal
	// helper that assumes the lock is already held.
	discovered, err := manager.discoverLeased(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if discovered.lease != nil {
		discovered.lease.Close()
	}
	if discovered.result.State != Stopped {
		t.Fatalf("expected stopped classification: %+v", discovered.result)
	}
}
