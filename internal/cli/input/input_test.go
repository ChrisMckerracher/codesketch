package input

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBoundedInput(t *testing.T) {
	path := filepath.Join(t.TempDir(), "commands.json")
	if err := os.WriteFile(path, []byte(`[{"type":"fill"}]`), 0600); err != nil {
		t.Fatal(err)
	}
	b, err := Read(context.Background(), path, nil)
	if err != nil || string(b) != `[{"type":"fill"}]` {
		t.Fatalf("read: %s %v", b, err)
	}
	if _, err := Read(context.Background(), filepath.Dir(path), nil); err == nil {
		t.Error("accepted directory")
	}
	for _, value := range []string{"", strings.Repeat("x", MaxBytes+1)} {
		if _, err := Read(context.Background(), "-", io.NopCloser(strings.NewReader(value))); err == nil {
			t.Error("accepted invalid input size")
		}
	}
	if err := os.Truncate(path, MaxBytes+1); err != nil {
		t.Fatal(err)
	}
	if _, err := Read(context.Background(), path, nil); err == nil {
		t.Error("accepted oversized file")
	}
}

func TestInputCancellationClosesPipe(t *testing.T) {
	r, w := io.Pipe()
	defer w.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := Read(ctx, "-", r); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("got %v", err)
	}
	if _, err := w.Write([]byte("x")); !errors.Is(err, io.ErrClosedPipe) {
		t.Fatalf("pipe not closed: %v", err)
	}
}

func TestAtomicWrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "saved.json")
	if err := os.WriteFile(path, []byte("old"), 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := AtomicWrite(ctx, path, []byte("new")); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(path); string(b) != "old" {
		t.Fatal("clobbered existing file")
	}
	if _, err := AtomicWrite(context.Background(), path, []byte("new")); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(path); string(b) != "new" {
		t.Fatal("did not publish complete output")
	}
	if _, err := AtomicWrite(context.Background(), dir, []byte("bad")); err == nil {
		t.Fatal("overwrote directory")
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("temporary files leaked: %v", entries)
	}
}
