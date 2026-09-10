package lifecycle

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// assertFlushFailure proves a stop that hit the durable flush failure kept
// the runtime: 500 surfaced, record bytes identical, authenticated running
// identity unchanged, writer lease still busy, artwork paused.
func assertFlushFailure(t *testing.T, dataDir string, record ownershipRecord, before []byte, first Result, err error) {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), "500") {
		t.Fatalf("the durable flush failure must surface as stop 500: %v", err)
	}
	after, readErr := os.ReadFile(filepath.Join(dataDir, recordName))
	if readErr != nil || !bytes.Equal(before, after) {
		t.Fatalf("the ownership record bytes must stay identical: %v", readErr)
	}
	verified, fetchErr := fetchStatus(t.Context(), record)
	if fetchErr != nil || verified.State != string(Running) || verified.InstanceID != first.InstanceID {
		t.Fatalf("the runtime must keep its authenticated running identity: %+v %v", verified, fetchErr)
	}
	if lease, acquired, leaseErr := probeWriterLease(t.Context(), dataDir); leaseErr != nil || acquired || lease != nil {
		t.Fatalf("the live runtime must keep the writer lease busy: %v %v", acquired, leaseErr)
	}
	var state struct {
		InstanceID string `json:"instanceId"`
		Playback   struct {
			Status string `json:"status"`
		} `json:"playback"`
	}
	if err := json.Unmarshal(studioRoute(t, record.URL, http.MethodGet, "/api/state", ""), &state); err != nil {
		t.Fatal(err)
	}
	if state.InstanceID != first.InstanceID || state.Playback.Status != "paused" {
		t.Fatalf("the artwork must stay paused under the same identity: %+v", state)
	}
}

// TestStopFailurePreservesRunningIdentityAndRecord drives the real flush
// failure through the actual Go writer lease: a read-only data directory
// makes the studio's durable flush fail, so Stop and Restart report 500 and
// preserve everything for retry until the directory is restored.
func TestStopFailurePreservesRunningIdentityAndRecord(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("the flush failure requires a non-root effective uid")
	}
	nodeAvailable(t)
	manager, dataDir, cacheDir := newStartManager(t)
	first, err := manager.Start(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	// Registered first so cleanup order runs the permission restore before
	// the authenticated teardown even when an assertion fails midway.
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	t.Cleanup(func() { _ = os.Chmod(dataDir, 0o700) })
	seeded := studioRoute(t, first.URL, http.MethodPost, "/api/commands",
		humanSeed(t, first.URL, `{"type":"fill","color":"#112233"}`))
	var artwork struct {
		Document struct {
			Background string `json:"background"`
		} `json:"document"`
		History struct {
			Cursor int `json:"cursor"`
			Total  int `json:"total"`
		} `json:"history"`
	}
	if err := json.Unmarshal(seeded, &artwork); err != nil {
		t.Fatal(err)
	}
	if artwork.Document.Background != "#112233" || artwork.History.Cursor != 1 || artwork.History.Total != 1 {
		t.Fatalf("the known artwork must be committed and paused: %s", seeded)
	}
	recordPath := filepath.Join(dataDir, recordName)
	before, err := os.ReadFile(recordPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dataDir, 0o500); err != nil {
		t.Fatal(err)
	}
	record, err := readRecord(dataDir)
	if err != nil {
		t.Fatal(err)
	}

	_, stopErr := manager.Stop(t.Context())
	assertFlushFailure(t, dataDir, record, before, first, stopErr)

	_, restartErr := manager.Restart(t.Context())
	if restartErr == nil || !strings.Contains(restartErr.Error(), "successful stop") {
		t.Fatalf("a failed stop must abort the restart without starting: %v", restartErr)
	}
	assertFlushFailure(t, dataDir, record, before, first, restartErr)

	// With the directory restored the same runtime flushes durably and the
	// public stop succeeds, releasing the writer lease.
	if err := os.Chmod(dataDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(recordPath); !os.IsNotExist(err) {
		t.Fatalf("the successful stop must remove the record: %v", err)
	}
	assertIdleDataDir(t, dataDir)
	assertNoDiagnosticLogs(t, cacheDir)
}
