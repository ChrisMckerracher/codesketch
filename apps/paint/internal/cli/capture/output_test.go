package capture

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestAtomicOutput(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "capture.png")
	body := pngBytes(t, 2, 3)
	got, err := writePNG(context.Background(), body, path)
	if err != nil || got != path {
		t.Fatal(got, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := writePNG(ctx, []byte("replacement"), path); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	actual, err := os.ReadFile(path)
	if err != nil || string(actual) != string(body) {
		t.Fatal("existing output changed", err)
	}
	files, err := os.ReadDir(filepath.Dir(path))
	if err != nil || len(files) != 1 {
		t.Fatal("staging file leaked", err)
	}
	if _, err := writePNG(context.Background(), body, filepath.Dir(path)); err == nil {
		t.Fatal("directory replaced")
	}
	files, _ = os.ReadDir(filepath.Dir(path))
	if len(files) != 1 {
		t.Fatal("failed publication leaked staging file")
	}
}

func TestDefaultOutput(t *testing.T) {
	path, err := writePNG(context.Background(), pngBytes(t, 1, 1), "")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(path)
	if !filepath.IsAbs(path) || filepath.Ext(path) != ".png" {
		t.Fatal(path)
	}
}
