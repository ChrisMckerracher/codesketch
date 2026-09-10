package lifecycle

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func privateDataDir(t *testing.T) string {
	t.Helper()
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatal(err)
	}
	return dataDir
}

func TestAcquireDataLockIsExclusiveStableAndCloseReleased(t *testing.T) {
	path := filepath.Join(privateDataDir(t), lifecycleLockName)
	held, err := acquireDataLock(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	before := lockInode(t, path)
	// A bounded wait proves mutual exclusion: the flock must stay held.
	contested, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err := acquireDataLock(contested, path); err == nil || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("held data lock must exclude a second acquirer: %v", err)
	}
	// A cancelled context must fail promptly without attempting the lock.
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := acquireDataLock(cancelled, path); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled data lock wait must fail with cancellation: %v", err)
	}
	held()
	again, err := acquireDataLock(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer again()
	if lockInode(t, path) != before {
		t.Error("data lock inode must remain stable across acquisitions")
	}
}

func TestAcquireDataLockRejectsCorruptLockFilesWithoutReplacing(t *testing.T) {
	dataDir := privateDataDir(t)
	path := filepath.Join(dataDir, lifecycleLockName)
	if err := os.Symlink(filepath.Join(dataDir, "target"), path); err != nil {
		t.Fatal(err)
	}
	if _, err := acquireDataLock(context.Background(), path); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("symlinked data lock must be rejected: %v", err)
	}
	info, err := os.Lstat(path)
	if err != nil || info.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("rejected lock files must never be unlinked or replaced: %v %v", info, err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("lease"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := acquireDataLock(context.Background(), path); err == nil || !strings.Contains(err.Error(), "private") {
		t.Fatalf("unprivate data lock must be rejected: %v", err)
	}
}

func TestProbeWriterLeaseReportsBusySeparatelyFromErrors(t *testing.T) {
	dataDir := privateDataDir(t)
	lease, acquired, err := probeWriterLease(context.Background(), dataDir)
	if err != nil || !acquired || lease == nil {
		t.Fatalf("a fresh writer lease must probe acquired: %v", err)
	}
	busyLease, busy, err := probeWriterLease(context.Background(), dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if busy || busyLease != nil {
		t.Fatal("a held writer lease must probe busy with a nil lease and nil error")
	}
	if err := lease.Close(); err != nil {
		t.Fatal(err)
	}
	releaseFile, reacquired, err := probeWriterLease(context.Background(), dataDir)
	if err != nil || !reacquired {
		t.Fatalf("released writer lease must probe acquired again: %v", err)
	}
	releaseFile.Close()
}

func TestProbeWriterLeaseRejectsCorruptLockFilesAndCancellation(t *testing.T) {
	dataDir := privateDataDir(t)
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if lease, _, err := probeWriterLease(cancelled, dataDir); !errors.Is(err, context.Canceled) || lease != nil {
		t.Fatalf("cancelled writer lease probe must fail with cancellation: %v", err)
	}
	path := filepath.Join(dataDir, writerLockName)
	if err := os.WriteFile(path, []byte("lease"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o604); err != nil {
		t.Fatal(err)
	}
	if lease, _, err := probeWriterLease(context.Background(), dataDir); err == nil || !strings.Contains(err.Error(), "private") || lease != nil {
		t.Fatalf("unprivate writer lock must be rejected: %v", err)
	}
}
