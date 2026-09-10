package studio

import (
	"errors"
	"io/fs"
	"strings"
	"testing"
)

func TestRuntimeFSIncludesRetainedLogicEntryPoints(t *testing.T) {
	for _, path := range []string{
		"src/compositions/index.mjs",
		"src/direction/index.mjs",
		"src/painting/index.mjs",
		"src/painting/rendering/index.mjs",
		"src/painting/rendering/stroke.mjs",
		"src/studio/api.mjs",
		"src/studio/state.mjs",
		"src/studio/renderer.mjs",
		"src/studio/comments/index.mjs",
		"src/studio/comments/geometry.mjs",
		"src/studio/comments/handshake.mjs",
		"src/transport/index.mjs",
		"src/transport/server.mjs",
		"src/transport/human-context.mjs",
		"src/studio/application/local.mjs",
		"src/studio/gesture/index.mjs",
		"src/studio/inspector/index.mjs",
		"src/studio/layers/index.mjs",
		"src/studio/model/index.mjs",
		"src/studio/playback/index.mjs",
		"src/studio/requests/index.mjs",
		"src/studio/review/index.mjs",
		"src/studio/review/presentation/index.mjs",
		"src/studio/tools/index.mjs",
		"src/studio/viewport/index.mjs",
		"public/index.html",
		"public/icon.svg",
		"public/tokens.css",
	} {
		if _, err := fs.Stat(RuntimeFS(), path); err != nil {
			t.Errorf("RuntimeFS is missing retained logic file %s: %v", path, err)
		}
	}
}

func TestRuntimeFSExcludesRemovedUI(t *testing.T) {
	for _, path := range []string{
		"public/base.css",
		"public/comments.css",
		"public/dialogs.css",
		"public/layout.css",
		"public/responsive.css",
		"public/tools.css",
		"src/studio/icons.mjs",
		"src/studio/dialogs.mjs",
		"src/studio/tools-ui.mjs",
		"src/studio/layers-ui.mjs",
		"src/studio/playback-ui.mjs",
		"src/studio/canvas-controller.mjs",
		"src/studio/layer-opacity.mjs",
		"src/studio/comments/comment-shortcuts.mjs",
		"src/studio/comments/comments-list.mjs",
		"src/studio/comments/comments-ui.mjs",
		"src/studio/comments/composer.mjs",
		"src/studio/comments/listening-status.mjs",
		"src/studio/comments/overlay.mjs",
		"src/studio/comments/selection.mjs",
	} {
		if _, err := fs.Stat(RuntimeFS(), path); err == nil {
			t.Errorf("RuntimeFS still contains removed UI file %s", path)
		} else if !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("statting removed UI file %s: %v", path, err)
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
		if !strings.HasSuffix(path, ".mjs") && !strings.HasSuffix(path, ".css") &&
			!strings.HasSuffix(path, ".html") && !strings.HasSuffix(path, ".svg") {
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
