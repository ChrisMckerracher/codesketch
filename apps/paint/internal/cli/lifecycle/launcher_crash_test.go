package lifecycle

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

// crashMarker is the public, capability-free death certificate the preload
// writes before the deterministic self-SIGKILL.
type crashMarker struct {
	Phase      string `json:"phase"`
	InstanceID string `json:"instanceId"`
	PID        int    `json:"pid"`
	URL        string `json:"url"`
}

// crashSeed is the decoded embedded recovery envelope used for the exact
// restoration checks against the replacement.
type crashSeed struct {
	Project map[string]any `json:"project"`
	Active  struct {
		Progress float64 `json:"progress"`
	} `json:"active"`
}

// The two child self-crash cases prove deterministic process death at the
// ownership publication barriers: before the rename (no final record, the
// orphan temporary stays for owned cleanup) and after the rename but before
// the directory sync (the residual record stays until a fresh Status proves
// it stale and clears it). Start's retained-child Wait reaps the Node child;
// nothing here signals a PID read from metadata.
func TestStartChildCrashBeforeOwnershipRename(t *testing.T) {
	runChildCrashCase(t, "before")
}

func TestStartChildCrashAfterRenameBeforeDirectorySync(t *testing.T) {
	runChildCrashCase(t, "after")
}

func runChildCrashCase(t *testing.T, phase string) {
	t.Helper()
	nodeAvailable(t)
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	cacheDir := filepath.Join(base, "cache")
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatal(err)
	}
	seedRecovery(t, dataDir)
	recoveryPath := filepath.Join(dataDir, "recovery.json")
	seedBytes, err := os.ReadFile(recoveryPath)
	if err != nil {
		t.Fatal(err)
	}
	var seed crashSeed
	if err := json.Unmarshal(seedBytes, &seed); err != nil {
		t.Fatal(err)
	}
	if queue, _ := seed.Project["queue"].([]any); len(queue) != 2 {
		t.Fatalf("the seed must hold the active head plus one queued command")
	}
	t.Setenv("NODE_OPTIONS", "--import "+(&url.URL{Scheme: "file", Path: writeCrashPreload(t, base)}).String())
	t.Setenv("CODESKETCH_CRASH_PRELOAD_DATA", dataDir)
	t.Setenv("CODESKETCH_CRASH_PRELOAD_PHASE", phase)
	t.Setenv("CODESKETCH_CRASH_PRELOAD_MARKER", filepath.Join(base, "crash-marker.json"))
	manager, err := New(Options{DataDir: dataDir, CacheDir: cacheDir, Node: "node", Port: 0, NoOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })

	ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
	defer cancel()
	begun := time.Now()
	if _, startErr := manager.Start(ctx); startErr == nil {
		t.Fatal("the crashing child must fail the launch")
	} else if elapsed := time.Since(begun); elapsed > 14*time.Second {
		t.Fatalf("the reaped child must not block the bounded startup: %v", elapsed)
	}
	marker := readCrashMarker(t, filepath.Join(base, "crash-marker.json"))
	if marker.Phase != phase {
		t.Fatalf("the marker must report the crash phase: %+v", marker)
	}
	if marker.InstanceID == "" || marker.PID <= 0 || !validRecordURL(marker.URL) {
		t.Fatalf("the marker must carry public identity fields: %+v", marker)
	}
	if body, err := os.ReadFile(recoveryPath); err != nil || string(body) != string(seedBytes) {
		t.Fatalf("the recovery bytes must survive the crash unchanged: %v", err)
	}
	assertIdleDataDir(t, dataDir)
	if !endpointRefused(t.Context(), marker.URL) {
		t.Errorf("the crashed endpoint must refuse connections")
	}
	recordPath := filepath.Join(dataDir, recordName)
	if phase == "before" {
		if _, err := os.Stat(recordPath); !os.IsNotExist(err) {
			t.Errorf("no final record may exist before the rename: %v", err)
		}
		if orphans, _ := filepath.Glob(filepath.Join(dataDir, ".lifecycle.*.tmp")); len(orphans) != 1 {
			t.Errorf("the pre-rename crash debris must remain for owned cleanup: %v", orphans)
		}
	} else {
		record, err := readRecord(dataDir)
		if err != nil {
			t.Fatalf("the published record must remain after the crash: %v", err)
		}
		if record.InstanceID != marker.InstanceID || record.URL != marker.URL {
			t.Errorf("the residual record must match the marker identity: %+v", record)
		}
		discovered, err := manager.Status(t.Context())
		if err != nil || discovered.State != Stopped {
			t.Fatalf("a fresh status must prove the residual record stale: %+v %v", discovered, err)
		}
		if _, err := os.Stat(recordPath); !os.IsNotExist(err) {
			t.Errorf("status must clear the proven-stale record: %v", err)
		}
	}

	// Replace without the crash preload: the empty NODE_OPTIONS disables the
	// preload for this child while t.Setenv restores the value afterwards.
	t.Setenv("NODE_OPTIONS", "")
	replacementCtx, replacementCancel := context.WithTimeout(t.Context(), 15*time.Second)
	defer replacementCancel()
	replacement, err := manager.Start(replacementCtx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupAcceptedRuntime(t, dataDir) })
	if replacement.InstanceID == marker.InstanceID {
		t.Fatalf("the replacement must be a fresh instance: %+v", replacement)
	}
	if replacement.Digest != manager.digest {
		t.Errorf("the replacement must carry the embedded digest: %s", replacement.Digest)
	}
	verifyRestoredSession(t, replacement.URL, &seed)
	stopAcceptedServer(t, dataDir)
	assertIdleDataDir(t, dataDir)
}

func readCrashMarker(t *testing.T, path string) crashMarker {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("the crashing child must write its marker before the barrier: %v", err)
	}
	var marker crashMarker
	if err := json.Unmarshal(data, &marker); err != nil {
		t.Fatalf("the crash marker must decode: %v", err)
	}
	return marker
}

// verifyRestoredSession proves the replacement resumed the seeded session:
// paused playback with the exact partial progress and pending count, the
// seeded queue head as the restored active command, and a project that
// deep-equals the seeded project (seed comments already carry request null).
func verifyRestoredSession(t *testing.T, endpoint string, seed *crashSeed) {
	t.Helper()
	state := map[string]any{}
	if err := json.Unmarshal(studioRoute(t, endpoint, http.MethodGet, "/api/state", ""), &state); err != nil {
		t.Fatalf("the replacement state must decode: %v", err)
	}
	playback, _ := state["playback"].(map[string]any)
	if playback["status"] != "paused" {
		t.Errorf("recovery must resume paused: %v", playback["status"])
	}
	if playback["remaining"] != float64(2) {
		t.Errorf("the restored session must resume two pending commands: %v", playback["remaining"])
	}
	active, _ := playback["active"].(map[string]any)
	if active == nil {
		t.Fatal("the restored session must hold the partial active stroke")
	}
	if progress, _ := active["progress"].(float64); progress != seed.Active.Progress {
		t.Errorf("the partial progress must be restored exactly: %v", active["progress"])
	}
	command, _ := active["command"].(map[string]any)
	head, _ := seed.Project["queue"].([]any)[0].(map[string]any)
	if !reflect.DeepEqual(command, head) {
		t.Errorf("the restored active head must be the seeded queue head: %v", active["command"])
	}
	project := map[string]any{}
	if err := json.Unmarshal(studioRoute(t, endpoint, http.MethodGet, "/api/project", ""), &project); err != nil {
		t.Fatalf("the replacement project must decode: %v", err)
	}
	if !reflect.DeepEqual(project, seed.Project) {
		t.Errorf("the restored project must deep-equal the seeded project")
	}
}
