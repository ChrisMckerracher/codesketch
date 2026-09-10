// Package input owns bounded input streams and atomic file publication.
package input

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

const MaxBytes = 8 << 20
const Timeout = 10 * time.Second

// Read consumes a regular file or takes ownership of stdin when path is "-".
// Cancellation closes the owned stream, including blocked pipes.
func Read(ctx context.Context, path string, stdin io.ReadCloser) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, Timeout)
	defer cancel()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var r io.ReadCloser
	if path == "-" {
		if stdin == nil {
			return nil, fmt.Errorf("standard input unavailable")
		}
		r = stdin
	} else {
		f, err := openRegular(path)
		if err != nil {
			return nil, err
		}
		r = f
	}
	defer r.Close()
	type result struct {
		data []byte
		err  error
	}
	done := make(chan result, 1)
	go func() {
		data, err := io.ReadAll(io.LimitReader(r, MaxBytes+1))
		done <- result{data, err}
	}()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case res := <-done:
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if res.err != nil {
			return nil, res.err
		}
		if len(res.data) > MaxBytes {
			return nil, fmt.Errorf("input exceeds %d bytes", MaxBytes)
		}
		if len(res.data) == 0 {
			return nil, fmt.Errorf("input is empty")
		}
		return res.data, nil
	}
}

// AtomicWrite stages beside the destination and preserves it on failure.
func AtomicWrite(ctx context.Context, path string, data []byte) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if path == "" || path == "-" {
		return "", fmt.Errorf("a destination file is required")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	f, err := os.CreateTemp(filepath.Dir(abs), ".paint-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if _, err = f.Write(data); err != nil {
		return "", err
	}
	if err = f.Sync(); err != nil {
		return "", err
	}
	if err = f.Close(); err != nil {
		return "", err
	}
	if err = ctx.Err(); err != nil {
		return "", err
	}
	if err = os.Rename(f.Name(), abs); err != nil {
		return "", err
	}
	return abs, nil
}

func checkRegular(f *os.File) (*os.File, error) {
	info, err := f.Stat()
	if err == nil && !info.Mode().IsRegular() {
		err = fmt.Errorf("input must be a regular file")
	}
	if err == nil && info.Size() > MaxBytes {
		err = fmt.Errorf("input exceeds %d bytes", MaxBytes)
	}
	if err != nil {
		f.Close()
		return nil, err
	}
	return f, nil
}
