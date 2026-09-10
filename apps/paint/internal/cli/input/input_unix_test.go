//go:build !windows

package input

import (
	"context"
	"path/filepath"
	"syscall"
	"testing"
)

func TestFIFORejectedWithoutWriter(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pipe")
	if err := syscall.Mkfifo(path, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Read(context.Background(), path, nil); err == nil {
		t.Fatal("accepted FIFO")
	}
}
