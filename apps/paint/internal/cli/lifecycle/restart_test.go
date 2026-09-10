package lifecycle

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// studioRoute drives one ordinary studio route with a plain loopback client
// and returns the bounded response body.
func studioRoute(t *testing.T, url, method, path, body string) []byte {
	t.Helper()
	request, err := http.NewRequest(method, url+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	client := newDirectClient(10 * time.Second)
	defer client.CloseIdleConnections()
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 1024*1024))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("%s %s must succeed: %d %s", method, path, response.StatusCode, data)
	}
	return data
}

func TestRestartReplacesRuntimeWithNewIdentity(t *testing.T) {
	nodeAvailable(t)
	manager, dataDir, cacheDir := newStartManager(t)
	first, err := manager.Start(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	second, err := manager.Restart(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	// The replacement must be a fresh session identity: port 0 and PID
	// values may legally repeat, so only the identity proves replacement.
	if second.State != Running || second.InstanceID == "" || second.URL == "" || second.PID <= 0 {
		t.Fatalf("the replacement must be running: %+v", second)
	}
	if second.InstanceID == first.InstanceID {
		t.Fatalf("the replacement must carry a fresh instance identity: %+v vs %+v", second, first)
	}
	record, err := readRecord(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if record.InstanceID != second.InstanceID || record.URL != second.URL {
		t.Fatalf("the record must describe the replacement: %+v vs %+v", record, second)
	}
	verified, err := fetchStatus(t.Context(), record)
	if err != nil || verified.State != string(Running) {
		t.Fatalf("the replacement must answer authenticated status: %+v %v", verified, err)
	}
	assertNoDiagnosticLogs(t, cacheDir)
}

func TestRestartRecoversDurablePausedArtwork(t *testing.T) {
	nodeAvailable(t)
	manager, dataDir, _ := newStartManager(t)
	first, err := manager.Start(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	seed := `{"commands":[{"type":"fill","color":"#223344"}],"source":"human","play":false,"immediate":true}`
	seeded := studioRoute(t, first.URL, http.MethodPost, "/api/commands", seed)
	var before struct {
		Document struct {
			Background string `json:"background"`
		} `json:"document"`
		History struct {
			Cursor int `json:"cursor"`
			Total  int `json:"total"`
		} `json:"history"`
	}
	if err := json.Unmarshal(seeded, &before); err != nil {
		t.Fatal(err)
	}
	if before.Document.Background != "#223344" || before.History.Cursor != 1 || before.History.Total != 1 {
		t.Fatalf("the committed artwork must exist before the stop: %s", seeded)
	}
	if _, err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, "recovery.json")); err != nil {
		t.Fatalf("the stop must leave durable recovery bytes: %v", err)
	}
	second, err := manager.Restart(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	// Read the recovered state before any mutation: the replacement session
	// must already be the recovered paused artwork.
	var after struct {
		InstanceID string `json:"instanceId"`
		Document   struct {
			Background string `json:"background"`
		} `json:"document"`
		Playback struct {
			Status    string `json:"status"`
			Remaining int    `json:"remaining"`
		} `json:"playback"`
		History struct {
			Cursor int `json:"cursor"`
			Total  int `json:"total"`
		} `json:"history"`
	}
	if err := json.Unmarshal(studioRoute(t, second.URL, http.MethodGet, "/api/state", ""), &after); err != nil {
		t.Fatal(err)
	}
	if after.InstanceID != second.InstanceID {
		t.Fatalf("the replacement must report its own identity: %+v vs %+v", after, second)
	}
	if after.Playback.Status != "paused" || after.Playback.Remaining != 0 {
		t.Fatalf("the recovered session must be paused with no queued work: %+v", after.Playback)
	}
	if after.Document.Background != before.Document.Background || after.History != before.History {
		t.Fatalf("the replacement must recover the durable paused artwork: %+v vs %+v", after, before)
	}
	var restored struct {
		Format   string            `json:"format"`
		Version  int               `json:"version"`
		Commands []json.RawMessage `json:"commands"`
		Cursor   int               `json:"cursor"`
		Queue    []json.RawMessage `json:"queue"`
	}
	if err := json.Unmarshal(studioRoute(t, second.URL, http.MethodGet, "/api/project", ""), &restored); err != nil {
		t.Fatal(err)
	}
	if restored.Format != "codesketch" || restored.Version != 2 ||
		len(restored.Commands) != before.History.Total || restored.Cursor != before.History.Cursor || len(restored.Queue) != 0 {
		t.Fatalf("the recovered project must match the committed work: %+v", restored)
	}
}

// A failed stop must never start a replacement: the simulated live writer
// answers authenticated status but its stop route reports the durable flush
// failure, so Restart fails with the stop cause and preserves the record.
func TestRestartFailedStopNeverStarts(t *testing.T) {
	manager, dataDir := newTestManager(t)
	freshDataDir(t, dataDir)
	record := runningRecord(t, manager, "")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case statusEndpoint:
			w.Write([]byte(statusBody(record, "running")))
		case stopEndpoint:
			w.WriteHeader(http.StatusInternalServerError)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	record.URL = server.URL
	writeOwnershipRecord(t, dataDir, record)
	lease, acquired, err := probeWriterLease(t.Context(), dataDir)
	if err != nil || !acquired {
		t.Fatalf("the simulated live writer must hold the lease: %v", err)
	}
	defer lease.Close()
	manager.node = filepath.Join(t.TempDir(), "absent-node")
	if _, err := manager.Restart(t.Context()); err == nil ||
		!strings.Contains(err.Error(), "successful stop") || !strings.Contains(err.Error(), "500") {
		t.Fatalf("a failed stop must abort the restart with the stop cause: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); err != nil {
		t.Fatalf("a failed stop must preserve the record: %v", err)
	}
	if _, err := os.Stat(filepath.Join(manager.cacheDir, runtimeDirName)); !os.IsNotExist(err) {
		t.Fatalf("a failed stop must never start or extract a runtime: %v", err)
	}
}

func TestRestartOnQuietDirectoryStartsFreshRuntime(t *testing.T) {
	nodeAvailable(t)
	manager, dataDir, _ := newStartManager(t)
	result, err := manager.Restart(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	if result.State != Running || result.InstanceID == "" || result.URL == "" || result.PID <= 0 {
		t.Fatalf("a quiet restart must launch a fresh runtime: %+v", result)
	}
	record, err := readRecord(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	verified, err := fetchStatus(t.Context(), record)
	if err != nil || verified.InstanceID != result.InstanceID {
		t.Fatalf("the fresh runtime must answer with its own identity: %+v %v", verified, err)
	}
	if _, err := manager.Stop(t.Context()); err != nil {
		t.Fatalf("stop after the quiet restart must succeed: %v", err)
	}
}
