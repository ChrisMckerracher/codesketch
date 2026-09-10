package lifecycle

import (
	"errors"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

// Private preload control variables shared with the orphan preload script.
// The launcher environment sets every one exactly once, because a missing
// variable silently disables the entire stimulus.
const (
	orphanControlEnv      = "CODESKETCH_ORPHAN_CONTROL"
	orphanDataEnv         = "CODESKETCH_ORPHAN_DATA"
	orphanMarkerEnv       = "CODESKETCH_ORPHAN_MARKER"
	orphanPipeEnv         = "CODESKETCH_ORPHAN_PIPE"
	orphanBootEnv         = "CODESKETCH_ORPHAN_BOOT"
	orphanCauseEnv        = "CODESKETCH_ORPHAN_CAUSE"
	orphanBootMarkerName  = "boot-marker.json"
	orphanPhaseMarkerName = "phase-marker.json"
	orphanPipeMarkerName  = "pipe-marker.json"
	orphanCauseMarkerName = "cause-marker.json"
)

// orphanLauncher is the one retained exec.Cmd of the compiled test binary
// in its launcher role. Exactly one Wait goroutine owns the single wait: it
// caches the outcome and then closes the completion channel, so later
// readers join without consuming anything twice.
type orphanLauncher struct {
	cmd     *exec.Cmd
	logPath string
	done    chan struct{}
	waitErr error
}

// startOrphanLauncher spawns the retained launcher helper. Diagnostics go
// to a private regular file: no exec pipes exist to leak.
func startOrphanLauncher(t *testing.T, owned *orphanCaseRoot, env []string, logPath string) *orphanLauncher {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(executable, "-test.run", helperTestRun, "-test.timeout", "60s")
	cmd.Env = env
	log, err := os.OpenFile(logPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	cmd.Stdout, cmd.Stderr = log, log
	if err := cmd.Start(); err != nil {
		log.Close()
		t.Fatal(err)
	}
	launcher := &orphanLauncher{cmd: cmd, logPath: logPath, done: make(chan struct{})}
	owned.launchers = append(owned.launchers, launcher)
	go func() {
		err := cmd.Wait()
		log.Close()
		launcher.waitErr = err
		close(launcher.done)
	}()
	return launcher
}

// kill sends the termination signal through the retained handle only.
func (l *orphanLauncher) kill() {
	if l.cmd.Process != nil {
		_ = l.cmd.Process.Kill()
	}
}

// awaitCompletion bounds the wait on the single Wait goroutine's completion
// channel: it never blocks past the budget and never signals the process.
// After joined the cached outcome is stable; when unjoined the goroutine
// keeps sole ownership of the command.
func (l *orphanLauncher) awaitCompletion(budget time.Duration) (bool, error) {
	select {
	case <-l.done:
		return true, l.waitErr
	case <-time.After(budget):
		return false, nil
	}
}

// terminate kills the launcher through the retained handle and bounds the
// join of its single Wait owner. A completed join is cleanup success
// whatever the exit status: the deliberate kill reports SIGKILL and the
// test asserts that evidence separately, so only an unproven join is a
// cleanup failure.
func (l *orphanLauncher) terminate(budget time.Duration) error {
	l.kill()
	if joined, _ := l.awaitCompletion(budget); !joined {
		return errors.New("the retained launcher's single wait owner never completed")
	}
	return nil
}

// exitSignal reports the platform exit evidence of the launcher once its
// single Wait owner completes within the bounded budget; a timeout is a
// test failure, never a blocking join.
func (l *orphanLauncher) exitSignal(t *testing.T, budget time.Duration) (bool, string) {
	t.Helper()
	joined, err := l.awaitCompletion(budget)
	if !joined {
		t.Fatalf("the retained launcher's single wait owner never completed: log %s", boundedText(l.diagnostics()))
	}
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("the retained launcher wait must carry exit evidence: %v", err)
	}
	if status, ok := exitErr.Sys().(syscall.WaitStatus); ok && status.Signaled() {
		return true, status.Signal().String()
	}
	return false, ""
}

// diagnostics reads the private launcher log after the Wait owner closed
// it; a still-running launcher reports nothing.
func (l *orphanLauncher) diagnostics() string {
	select {
	case <-l.done:
		if data, err := os.ReadFile(l.logPath); err == nil {
			return string(data)
		}
	default:
	}
	return ""
}

// orphanLauncherEnvironment builds the retained launcher's environment from
// the inherited environment minus the control variables this role must set
// exactly once; duplicate keys would shadow the explicit role in the child.
// The preload rides only this helper's NODE_OPTIONS.
func orphanLauncherEnvironment(caseRoot, dataDir, controlDir, preloadPath string) []string {
	env := make([]string, 0, 32)
	for _, entry := range os.Environ() {
		if strings.HasPrefix(entry, "NODE_OPTIONS=") ||
			strings.HasPrefix(entry, "CODESKETCH_LIFECYCLE_TEST_") ||
			strings.HasPrefix(entry, "CODESKETCH_ORPHAN_") {
			continue
		}
		env = append(env, entry)
	}
	return append(env,
		helperRoleEnv+"="+helperRoleLauncher,
		helperDataEnv+"="+dataDir,
		helperCacheEnv+"="+filepath.Join(caseRoot, "cache"),
		helperResultEnv+"="+filepath.Join(caseRoot, "launcher-result.json"),
		orphanControlEnv+"="+controlDir,
		orphanDataEnv+"="+dataDir,
		orphanMarkerEnv+"="+filepath.Join(caseRoot, orphanPhaseMarkerName),
		orphanPipeEnv+"="+filepath.Join(caseRoot, orphanPipeMarkerName),
		orphanBootEnv+"="+filepath.Join(caseRoot, orphanBootMarkerName),
		orphanCauseEnv+"="+filepath.Join(caseRoot, orphanCauseMarkerName),
		"NODE_OPTIONS=--import "+(&url.URL{Scheme: "file", Path: preloadPath}).String(),
	)
}
