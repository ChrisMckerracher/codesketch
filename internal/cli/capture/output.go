package capture

import (
	"context"
	"crypto/rand"
	"os"
	"path/filepath"
)

func writePNG(ctx context.Context, body []byte, output string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if output == "" {
		output = filepath.Join(os.TempDir(), "codesketch-"+rand.Text()+".png")
	}
	target, err := filepath.Abs(output)
	if err != nil {
		return "", err
	}
	if err = os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return "", err
	}
	f, err := os.CreateTemp(filepath.Dir(target), ".codesketch-png-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if _, err = f.Write(body); err != nil {
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
	if err = os.Rename(f.Name(), target); err != nil {
		return "", err
	}
	return target, nil
}
