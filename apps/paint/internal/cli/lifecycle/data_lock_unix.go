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
	// dataLockDeadline bounds the nonblocking wait when the caller supplies
	// no earlier deadline.
	dataLockDeadline = 30 * time.Second
	dataLockPoll     = 25 * time.Millisecond
)

// nonBlockOpen keeps read-only opens of hostile FIFOs from blocking before
// the regular-file check.
const nonBlockOpen = syscall.O_NONBLOCK

// openFileNoFollow opens path refusing to follow a final symlink component.
func openFileNoFollow(path string, flags int, perm uint32) (int, error) {
	fd, err := syscall.Open(path, flags|syscall.O_CLOEXEC|syscall.O_NOFOLLOW, perm)
	if err != nil {
		if errors.Is(err, syscall.ELOOP) {
			return -1, fmt.Errorf("%s: lifecycle lock and record files must not be symlinks", path)
		}
		return -1, err
	}
	return fd, nil
}

// validateLockFile requires the open descriptor to be a private regular file
// owned by the current user, closing it on any rejection.
func validateLockFile(path string, fd int) error {
	var info syscall.Stat_t
	if err := syscall.Fstat(fd, &info); err != nil {
		syscall.Close(fd)
		return err
	}
	if info.Mode&syscall.S_IFMT != syscall.S_IFREG {
		syscall.Close(fd)
		return fmt.Errorf("%s: lifecycle lock must be a regular file", path)
	}
	if info.Mode&0o077 != 0 {
		syscall.Close(fd)
		return fmt.Errorf("%s: lifecycle lock must be private", path)
	}
	if info.Uid != uint32(os.Getuid()) {
		syscall.Close(fd)
		return fmt.Errorf("%s: lifecycle lock must be owned by the current user", path)
	}
	return nil
}

// acquireDataLock holds an advisory exclusive flock on the stable data lock
// at path, checking cancellation before opening and between nonblocking
// retries until acquisition or the bounded deadline. The lock file is
// created once with private permissions and is never unlinked or replaced,
// so its inode stays stable. The returned release raw-closes the descriptor:
// closing releases the lock and no explicit unlock exists anywhere, because
// the writer descriptor is later inherited by Node and the parent close must
// retain the child lease.
func acquireDataLock(ctx context.Context, path string) (func(), error) {
	if ctx.Err() != nil {
		return nil, fmt.Errorf("%s: data lock wait cancelled: %w", path, ctx.Err())
	}
	fd, err := openFileNoFollow(path, syscall.O_RDWR|syscall.O_CREAT, 0o600)
	if err != nil {
		return nil, err
	}
	if err := validateLockFile(path, fd); err != nil {
		return nil, err
	}
	handle := os.NewFile(uintptr(fd), path)
	deadline := time.Now().Add(dataLockDeadline)
	if interruption, ok := ctx.Deadline(); ok && interruption.Before(deadline) {
		deadline = interruption
	}
	for {
		if ctx.Err() != nil {
			handle.Close()
			return nil, fmt.Errorf("%s: data lock wait cancelled: %w", path, ctx.Err())
		}
		err := syscall.Flock(fd, syscall.LOCK_EX|syscall.LOCK_NB)
		if err == nil {
			return func() { handle.Close() }, nil
		}
		if !errors.Is(err, syscall.EWOULDBLOCK) {
			handle.Close()
			return nil, fmt.Errorf("%s: data lock failed: %w", path, err)
		}
		if time.Now().After(deadline) {
			handle.Close()
			return nil, fmt.Errorf("%s: timed out waiting for the data lock: %w", path, context.DeadlineExceeded)
		}
		select {
		case <-ctx.Done():
			handle.Close()
			return nil, fmt.Errorf("%s: data lock wait cancelled: %w", path, ctx.Err())
		case <-time.After(dataLockPoll):
		}
	}
}

// probeWriterLease probes the writer lease with an independently opened
// descriptor without waiting. Busy is a result, not an error: acquired false
// with a nil error and nil lease means another live writer holds the lease.
// An acquired probe returns the open lease file so a later start can pass it
// to the Node runtime as an inherited ExtraFiles descriptor; the caller
// closes it, and the raw close drops the probe lease without any explicit
// unlock.
func probeWriterLease(ctx context.Context, dataDir string) (*os.File, bool, error) {
	path := filepath.Join(dataDir, writerLockName)
	if ctx.Err() != nil {
		return nil, false, fmt.Errorf("%s: writer lease probe cancelled: %w", path, ctx.Err())
	}
	fd, err := openFileNoFollow(path, syscall.O_RDWR|syscall.O_CREAT, 0o600)
	if err != nil {
		return nil, false, err
	}
	if err := validateLockFile(path, fd); err != nil {
		return nil, false, err
	}
	if err := syscall.Flock(fd, syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		if errors.Is(err, syscall.EWOULDBLOCK) {
			syscall.Close(fd)
			return nil, false, nil
		}
		syscall.Close(fd)
		return nil, false, fmt.Errorf("%s: writer lease probe failed: %w", path, err)
	}
	return os.NewFile(uintptr(fd), path), true, nil
}
