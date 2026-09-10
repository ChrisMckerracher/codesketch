//go:build darwin || linux

package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

const (
	// extractLockDeadline bounds how long a caller without an earlier
	// deadline waits for the extraction lock.
	extractLockDeadline = 30 * time.Second
	// extractLockPoll is the nonblocking retry interval.
	extractLockPoll = 25 * time.Millisecond
)

// acquireExtractLock holds an advisory exclusive flock on the stable
// extraction lock file, opening it once with 0600 permissions and never
// unlinking or replacing it, so its inode stays stable across acquisitions.
// Acquisition polls the nonblocking lock until it succeeds, the context is
// cancelled, or the bounded deadline expires. Releasing the lock closes the
// descriptor; this helper is deliberately unrelated to the later writer-lease
// transfer, which needs a close-without-unlock variant.
func acquireExtractLock(ctx context.Context, runtimeRoot string) (func(), error) {
	name := filepath.Join(runtimeRoot, extractLockName)
	if ctx.Err() != nil {
		return nil, fmt.Errorf("%s: extraction lock wait cancelled: %w", name, ctx.Err())
	}
	fd, err := syscall.Open(name, syscall.O_RDWR|syscall.O_CREAT|syscall.O_NOFOLLOW|syscall.O_CLOEXEC, 0o600)
	if err != nil {
		if errors.Is(err, syscall.ELOOP) {
			return nil, fmt.Errorf("%s: extraction lock must not be a symlink", name)
		}
		return nil, err
	}
	var info syscall.Stat_t
	if err := syscall.Fstat(fd, &info); err != nil {
		syscall.Close(fd)
		return nil, err
	}
	if info.Mode&syscall.S_IFMT != syscall.S_IFREG {
		syscall.Close(fd)
		return nil, fmt.Errorf("%s: extraction lock must be a regular file", name)
	}
	if info.Mode&0o077 != 0 {
		syscall.Close(fd)
		return nil, fmt.Errorf("%s: extraction lock must be private", name)
	}
	if info.Uid != uint32(os.Getuid()) {
		syscall.Close(fd)
		return nil, fmt.Errorf("%s: extraction lock must be owned by the current user", name)
	}
	handle := os.NewFile(uintptr(fd), name)
	deadline := time.Now().Add(extractLockDeadline)
	if interruption, ok := ctx.Deadline(); ok && interruption.Before(deadline) {
		deadline = interruption
	}
	for {
		if ctx.Err() != nil {
			handle.Close()
			return nil, fmt.Errorf("%s: extraction lock wait cancelled: %w", name, ctx.Err())
		}
		err := syscall.Flock(fd, syscall.LOCK_EX|syscall.LOCK_NB)
		if err == nil {
			return func() { handle.Close() }, nil
		}
		if !errors.Is(err, syscall.EWOULDBLOCK) {
			handle.Close()
			return nil, fmt.Errorf("%s: extraction lock failed: %w", name, err)
		}
		if time.Now().After(deadline) {
			handle.Close()
			return nil, fmt.Errorf("%s: timed out waiting for the extraction lock", name)
		}
		select {
		case <-ctx.Done():
			handle.Close()
			return nil, fmt.Errorf("%s: extraction lock wait cancelled: %w", name, ctx.Err())
		case <-time.After(extractLockPoll):
		}
	}
}

// ownedByCurrentUser enforces Unix ownership on validated cache paths.
func ownedByCurrentUser(info os.FileInfo) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && stat.Uid == uint32(os.Getuid())
}
