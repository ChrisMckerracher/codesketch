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

func TestProveStoppedReturnsHeldLeaseAfterDoubleProof(t *testing.T) {
	manager, dataDir := newTestManager(t)
	freshDataDir(t, dataDir)
	server := httptest.NewServer(statusHandler(manager, "stopping"))
	defer server.Close()
	record := runningRecord(t, manager, server.URL)
	writeOwnershipRecord(t, dataDir, record)
	lease, acquired, err := probeWriterLease(t.Context(), dataDir)
	if err != nil || !acquired {
		t.Fatalf("the simulated stopping writer must hold the lease: %v", err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 300*time.Millisecond)
	defer cancel()
	if held, err := manager.proveStopped(ctx, record); err == nil {
		held.Close()
		t.Fatal("a live endpoint must never pass the termination proof")
	}
	// Release the lease and close the listener: both proofs must now pass
	// and the returned lease must exclude a competing probe.
	lease.Close()
	server.Close()
	held, err := manager.proveStopped(t.Context(), record)
	if err != nil {
		t.Fatal(err)
	}
	if competitor, acquired, err := probeWriterLease(t.Context(), dataDir); err != nil || acquired || competitor != nil {
		t.Errorf("the proven lease must stay held: %v %v", acquired, err)
	}
	held.Close()
}

func TestProveStoppedHonoursCallerDeadline(t *testing.T) {
	manager, dataDir := newTestManager(t)
	freshDataDir(t, dataDir)
	server := httptest.NewServer(statusHandler(manager, "running"))
	defer server.Close()
	record := runningRecord(t, manager, server.URL)
	writeOwnershipRecord(t, dataDir, record)
	lease, acquired, err := probeWriterLease(t.Context(), dataDir)
	if err != nil || !acquired {
		t.Fatalf("the simulated writer must hold the lease: %v", err)
	}
	defer lease.Close()
	begun := time.Now()
	ctx, cancel := context.WithTimeout(t.Context(), 250*time.Millisecond)
	defer cancel()
	if _, err := manager.proveStopped(ctx, record); err == nil {
		t.Fatal("an unproven stop must fail inside the caller deadline")
	}
	if elapsed := time.Since(begun); elapsed > 5*time.Second {
		t.Fatalf("the proof must stay bounded by the caller deadline: %v", elapsed)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); err != nil {
		t.Errorf("an unproven stop must preserve the record: %v", err)
	}
}

func TestClearStoppedRecordSemantics(t *testing.T) {
	manager, dataDir := newTestManager(t)
	freshDataDir(t, dataDir)

	// A missing record is idempotent: the runtime removed its own metadata.
	if err := manager.clearStoppedRecord(runningRecord(t, manager, "http://127.0.0.1:1")); err != nil {
		t.Fatalf("a missing record must be idempotent success: %v", err)
	}

	// The exact same full five-field record is removed after the proof.
	record := runningRecord(t, manager, "http://127.0.0.1:1")
	writeOwnershipRecord(t, dataDir, record)
	if err := manager.clearStoppedRecord(record); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); !os.IsNotExist(err) {
		t.Fatalf("the exact stopped record must be removed: %v", err)
	}

	// A different record must remain and is reported.
	different := runningRecord(t, manager, "http://127.0.0.1:2")
	different.InstanceID = "replacement-instance"
	writeOwnershipRecord(t, dataDir, different)
	if err := manager.clearStoppedRecord(record); err == nil || !strings.Contains(err.Error(), "changed") {
		t.Fatalf("a different record must remain and error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); err != nil {
		t.Fatalf("a different record must be preserved: %v", err)
	}

	// A malformed record must remain and is reported.
	if err := os.Remove(filepath.Join(dataDir, recordName)); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, recordName), []byte(`{"instanceId":`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := manager.clearStoppedRecord(record); err == nil || !strings.Contains(err.Error(), "unusable") {
		t.Fatalf("a malformed record must remain and error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); err != nil {
		t.Fatalf("a malformed record must be preserved: %v", err)
	}
}

func TestEndpointRefusedRequiresDefinitiveRefusal(t *testing.T) {
	// A live listener is not absent.
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer server.Close()
	if endpointRefused(t.Context(), server.URL) {
		t.Error("a live endpoint must never pass the absence proof")
	}
	// A closed listener refuses connections.
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	abandoned := "http://" + listener.Addr().String()
	listener.Close()
	waitFor(t, 5*time.Second, func() bool { return endpointRefused(t.Context(), abandoned) })
	// A malformed record URL can never pass.
	if endpointRefused(t.Context(), "http://127.0.0.1") {
		t.Error("a malformed record url must never pass the absence proof")
	}
}
