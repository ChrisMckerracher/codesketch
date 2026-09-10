package studio

import (
	"io/fs"
	"strings"
	"testing"
)

func TestRuntimeFSIncludesCanonicalRuntimeEntryPoints(t *testing.T) {
	for _, path := range []string{
		"public/index.html",
		"src/transport/index.mjs",
		"src/studio/index.mjs",
		"src/direction/index.mjs",
		"src/painting/rendering/index.mjs",
		"src/painting/rendering/stroke.mjs",
	} {
		if _, err := fs.Stat(RuntimeFS(), path); err != nil {
			t.Errorf("RuntimeFS is missing canonical runtime file %s: %v", path, err)
		}
	}
}

func TestRuntimeFSExcludesTestsToolingAndState(t *testing.T) {
	err := fs.WalkDir(RuntimeFS(), ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if path != "." && path != "public" && path != "src" &&
				!strings.HasPrefix(path, "public/") && !strings.HasPrefix(path, "src/") {
				t.Errorf("RuntimeFS contains unexpected directory %s", path)
			}
			return nil
		}
		if !strings.HasSuffix(path, ".mjs") && !strings.HasSuffix(path, ".css") && !strings.HasSuffix(path, ".html") {
			t.Errorf("RuntimeFS contains non-runtime file %s", path)
		}
		if strings.Contains(path, ".test.") || strings.Contains("/"+path, "/tests/") {
			t.Errorf("RuntimeFS contains test file %s", path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestRendererExportsMatchEmbeddedRuntimeFiles(t *testing.T) {
	for _, renderer := range []struct {
		name, declared, path string
	}{
		{"RendererIndex", RendererIndex, "src/painting/rendering/index.mjs"},
		{"RendererStroke", RendererStroke, "src/painting/rendering/stroke.mjs"},
	} {
		data, err := fs.ReadFile(RuntimeFS(), renderer.path)
		if err != nil {
			t.Fatalf("RuntimeFS is missing %s: %v", renderer.path, err)
		}
		if string(data) != renderer.declared {
			t.Errorf("%s must remain the direct canonical export of %s", renderer.name, renderer.path)
		}
	}
}
