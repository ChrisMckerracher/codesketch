package lifecycle

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

// waitOrphanMarker bounded-waits a preload marker file and fails fast while
// the retained launcher is alive; after a deliberate kill the surviving
// child alone publishes the remaining markers, so only the deadline binds.
func waitOrphanMarker(t *testing.T, launcher *orphanLauncher, path string, timeout time.Duration, failFast bool) []byte {
	t.Helper()
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	tick := time.NewTicker(25 * time.Millisecond)
	defer tick.Stop()
	var exited <-chan struct{}
	if failFast {
		exited = launcher.done
	}
	for {
		if data, err := os.ReadFile(path); err == nil && json.Valid(data) {
			return data
		}
		select {
		case <-exited:
			t.Fatalf("the launcher died before the expected marker %s: %v log %s", path, launcher.waitErr, boundedText(launcher.diagnostics()))
		case <-deadline.C:
			t.Fatalf("the expected marker never appeared: %s log %s", path, boundedText(launcher.diagnostics()))
		case <-tick.C:
		}
	}
}

// TestLauncherDeathAfterPublicationRecoversViaEPIPE kills only the retained
// launcher after durable publication and before the readiness write, proves
// the healthy EPIPE recovery and identical reuse, then requests the
// accepted child's own crash through its control flag and proves stale
// cleanup, exact recovery preservation and a fully restored replacement.
func TestLauncherDeathAfterPublicationRecoversViaEPIPE(t *testing.T) {
	nodeAvailable(t)
	owned := ownOrphanCaseRoot(t)
	root := owned.root
	dataDir := filepath.Join(root, "data")
	cacheDir := filepath.Join(root, "cache")
	controlDir := filepath.Join(root, "control")
	owned.dataDir = dataDir
	for _, dir := range []string{dataDir, controlDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
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
	releaseFlag := filepath.Join(controlDir, "release.flag")
	crashFlag := filepath.Join(controlDir, "crash.flag")
	bootMarkerPath := filepath.Join(root, orphanBootMarkerName)
	phaseMarkerPath := filepath.Join(root, orphanPhaseMarkerName)
	pipeMarkerPath := filepath.Join(root, orphanPipeMarkerName)
	causeMarkerPath := filepath.Join(root, orphanCauseMarkerName)
	preloadPath := writeOrphanPreload(t, root)
	manager, err := New(Options{DataDir: dataDir, CacheDir: cacheDir, Node: "node", Port: 0, NoOpen: true})
	if err != nil {
		t.Fatal(err)
	}
	launcher := startOrphanLauncher(t, owned,
		orphanLauncherEnvironment(root, dataDir, controlDir, preloadPath),
		filepath.Join(root, "launcher.log"))

	var bootMarker struct {
		PID int `json:"pid"`
	}
	if err := json.Unmarshal(waitOrphanMarker(t, launcher, bootMarkerPath, 30*time.Second, true), &bootMarker); err != nil || bootMarker.PID <= 0 {
		t.Fatalf("the boot marker must carry the trusted child PID: %+v %v", bootMarker, err)
	}
	var phaseMarker struct {
		PID        int    `json:"pid"`
		InstanceID string `json:"instanceId"`
		URL        string `json:"url"`
	}
	if err := json.Unmarshal(waitOrphanMarker(t, launcher, phaseMarkerPath, 30*time.Second, true), &phaseMarker); err != nil {
		t.Fatal(err)
	}
	if phaseMarker.PID != bootMarker.PID || phaseMarker.InstanceID == "" || !validRecordURL(phaseMarker.URL) {
		t.Fatalf("the phase marker must carry public identity fields: %+v", phaseMarker)
	}
	owned.trackEndpoint(phaseMarker.URL)

	// Kill only the retained launcher and join its one Wait owner: the
	// surviving child must leave the operation lock free for the parent and
	// the writer lease busy for itself.
	launcher.kill()
	if signaled, signal := launcher.exitSignal(t, 15*time.Second); !signaled || signal != syscall.SIGKILL.String() {
		t.Fatalf("the retained launcher must die by its kill signal: %v %s", signaled, signal)
	}
	unlock, err := acquireDataLock(t.Context(), filepath.Join(dataDir, lifecycleLockName))
	if err != nil {
		t.Fatalf("the operation lock must be free after the launcher death: %v", err)
	}
	unlock()
	lease, acquired, err := probeWriterLease(t.Context(), dataDir)
	if lease != nil {
		lease.Close()
	}
	if err != nil || acquired {
		t.Fatalf("the surviving child must keep the writer lease busy: %v %v", acquired, err)
	}

	// Release the barrier: the original readiness write must report EPIPE
	// and the published runtime must stay healthy and discoverable.
	if err := os.WriteFile(releaseFlag, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	var pipeMarker struct {
		Result string `json:"result"`
	}
	if err := json.Unmarshal(waitOrphanMarker(t, launcher, pipeMarkerPath, 15*time.Second, false), &pipeMarker); err != nil {
		t.Fatal(err)
	}
	if pipeMarker.Result != "epipe" {
		t.Fatalf("the intercepted readiness write must report EPIPE: %+v", pipeMarker)
	}
	record, err := readRecord(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	owned.trackEndpoint(record.URL)
	if record.InstanceID != phaseMarker.InstanceID || record.URL != phaseMarker.URL || record.PID != phaseMarker.PID {
		t.Errorf("the durable record must match the phase marker identity: %+v", record)
	}
	if status, err := fetchStatus(t.Context(), record); err != nil || status.result().State != Running {
		t.Fatalf("the published runtime must stay authenticated-running after EPIPE: %+v %v", status, err)
	}
	reuse := runLauncherHelperProcess(t, dataDir, cacheDir, filepath.Join(root, "reuse-result.json"))
	owned.trackEndpoint(reuse.Result.URL)
	if reuse.Result.InstanceID != phaseMarker.InstanceID || reuse.Result.URL != phaseMarker.URL ||
		reuse.Result.PID != phaseMarker.PID || reuse.Result.Digest != manager.digest || reuse.Result.State != Running {
		t.Fatalf("a fresh launcher must reuse the identical instance: %+v vs marker %+v", reuse.Result, phaseMarker)
	}

	// Request the accepted child's own crash: the same Node writes its
	// private cause marker immediately before the self-SIGKILL, and the
	// accepted crash must report requested, never the watchdog expiry.
	if err := os.WriteFile(crashFlag, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	var causeMarker struct {
		Cause string `json:"cause"`
		PID   int    `json:"pid"`
	}
	data := waitOrphanMarker(t, launcher, causeMarkerPath, 20*time.Second, false)
	if err := json.Unmarshal(data, &causeMarker); err != nil {
		t.Fatalf("the crash cause marker must decode: %v", err)
	}
	if causeMarker.Cause != "requested" || causeMarker.PID != bootMarker.PID {
		t.Fatalf("the accepted child must report its requested crash from the same node: %+v", causeMarker)
	}
	waitFor(t, 20*time.Second, func() bool {
		if !endpointRefused(t.Context(), phaseMarker.URL) {
			return false
		}
		probe, probeAcquired, probeErr := probeWriterLease(t.Context(), dataDir)
		if probe != nil {
			probe.Close()
		}
		return probeErr == nil && probeAcquired
	})
	if body, err := os.ReadFile(recoveryPath); err != nil || string(body) != string(seedBytes) {
		t.Fatalf("the seed recovery bytes must survive unchanged: %v", err)
	}
	discovered, err := manager.Status(t.Context())
	if err != nil || discovered.State != Stopped {
		t.Fatalf("a fresh status must prove the residual record stale: %+v %v", discovered, err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, recordName)); !os.IsNotExist(err) {
		t.Errorf("status must clear the proven-stale record: %v", err)
	}

	// Replace with the preload disabled: the outer process never carries
	// NODE_OPTIONS, so this launch loads no preload at all.
	replacementCtx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
	defer cancel()
	replacement, err := manager.Start(replacementCtx)
	if err != nil {
		t.Fatal(err)
	}
	owned.trackEndpoint(replacement.URL)
	if replacement.InstanceID == phaseMarker.InstanceID {
		t.Fatalf("the replacement must be a fresh instance: %+v", replacement)
	}
	if replacement.Digest != manager.digest {
		t.Errorf("the replacement must carry the embedded digest: %s", replacement.Digest)
	}
	verifyRestoredSession(t, replacement.URL, &seed)
	stopAcceptedServer(t, dataDir)
	assertIdleDataDir(t, dataDir)
}
