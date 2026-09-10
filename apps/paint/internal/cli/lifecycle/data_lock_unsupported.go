//go:build !darwin && !linux

package lifecycle

import (
	"context"
	"errors"
	"os"
)

// openFileNoFollow reports the explicit unsupported-platform error.
func openFileNoFollow(_ string, _ int, _ uint32) (int, error) {
	return -1, errors.New("lifecycle data locking supports macOS and Linux only")
}

// acquireDataLock reports the explicit unsupported-platform error.
func acquireDataLock(_ context.Context, _ string) (func(), error) {
	return nil, errors.New("lifecycle data locking supports macOS and Linux only")
}

// probeWriterLease reports the explicit unsupported-platform error.
func probeWriterLease(_ context.Context, _ string) (*os.File, bool, error) {
	return nil, false, errors.New("lifecycle data locking supports macOS and Linux only")
}

// nonBlockOpen is unused outside macOS and Linux: the unsupported-platform
// errors fire before any file is opened.
const nonBlockOpen = 0
