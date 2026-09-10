package lifecycle

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestEnsureRuntimeLockWaitHonoursContextAndStableInode(t *testing.T) {
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	if err := os.MkdirAll(runtimeRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	held, err := acquireExtractLock(context.Background(), runtimeRoot)
	if err != nil {
		t.Fatal(err)
	}
	lockPath := filepath.Join(runtimeRoot, extractLockName)
	before := lockInode(t, lockPath)
	info, err := os.Lstat(lockPath)
	if err != nil {
		t.Fatal(err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm() != 0o600 {
		t.Fatalf("extraction lock must be a private regular file: %s", info.Mode())
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	waiting := make(chan error, 1)
	go func() {
		_, err := acquireExtractLock(cancelled, runtimeRoot)
		waiting <- err
	}()
	select {
	case err := <-waiting:
		if err == nil {
			t.Fatal("cancelled lock wait must fail")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("cancelled lock wait must return promptly")
	}
	held()
	again, err := acquireExtractLock(context.Background(), runtimeRoot)
	if err != nil {
		t.Fatal(err)
	}
	defer again()
	if lockInode(t, lockPath) != before {
		t.Error("extraction lock inode must remain stable across acquisitions")
	}
}
