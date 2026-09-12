package studio

import (
	"errors"
	"io/fs"
	"reflect"
	"sort"
	"strings"
	"testing"
)

var expectedRuntimeInventory = []string{
	"public/icon.svg",
	"public/index.html",
	"public/workspace.css",
	"src/compositions/index.mjs",
	"src/direction/feedback/grant.mjs",
	"src/direction/feedback/index.mjs",
	"src/direction/feedback/replies.mjs",
	"src/direction/feedback/schema.mjs",
	"src/direction/feedback/store.mjs",
	"src/direction/finish.mjs",
	"src/direction/history.mjs",
	"src/direction/index.mjs",
	"src/direction/playback-control.mjs",
	"src/direction/playback-duration.mjs",
	"src/direction/project.mjs",
	"src/direction/recovery.mjs",
	"src/direction/session-comments.mjs",
	"src/direction/session.mjs",
	"src/painting/document/index.mjs",
	"src/painting/document/validation.mjs",
	"src/painting/index.mjs",
	"src/painting/rendering/index.mjs",
	"src/painting/rendering/stroke.mjs",
	"src/studio/api.mjs",
	"src/studio/application/actions.mjs",
	"src/studio/application/index.mjs",
	"src/studio/application/local.mjs",
	"src/studio/application/mutations.mjs",
	"src/studio/comments/geometry.mjs",
	"src/studio/comments/handshake.mjs",
	"src/studio/comments/index.mjs",
	"src/studio/documents/downloads.mjs",
	"src/studio/documents/exporter.mjs",
	"src/studio/documents/index.mjs",
	"src/studio/gesture/command.mjs",
	"src/studio/gesture/index.mjs",
	"src/studio/gesture/overlay.mjs",
	"src/studio/gesture/smoothing.mjs",
	"src/studio/index.mjs",
	"src/studio/model/index.mjs",
	"src/studio/model/value.mjs",
	"src/studio/renderer.mjs",
	"src/studio/requests/index.mjs",
	"src/studio/response-artwork.mjs",
	"src/studio/response.mjs",
	"src/studio/review/index.mjs",
	"src/studio/review/pause.mjs",
	"src/studio/review/session.mjs",
	"src/studio/state.mjs",
	"src/studio/workspace/actions/index.mjs",
	"src/studio/workspace/actions/layers.mjs",
	"src/studio/workspace/actions/palette.mjs",
	"src/studio/workspace/actions/replies.mjs",
	"src/studio/workspace/controls/fields.mjs",
	"src/studio/workspace/controls/index.mjs",
	"src/studio/workspace/controls/layout.mjs",
	"src/studio/workspace/controls/pointer.mjs",
	"src/studio/workspace/controls/presentation.mjs",
	"src/studio/workspace/controls/support.mjs",
	"src/studio/workspace/controls/text-edit.mjs",
	"src/studio/workspace/feedback/canvas.mjs",
	"src/studio/workspace/feedback/comments.mjs",
	"src/studio/workspace/feedback/composer.mjs",
	"src/studio/workspace/feedback/data.mjs",
	"src/studio/workspace/feedback/index.mjs",
	"src/studio/workspace/feedback/paint.mjs",
	"src/studio/workspace/feedback/regions.mjs",
	"src/studio/workspace/feedback/render.mjs",
	"src/studio/workspace/feedback/thread.mjs",
	"src/studio/workspace/geometry/index.mjs",
	"src/studio/workspace/index.mjs",
	"src/studio/workspace/input/index.mjs",
	"src/studio/workspace/input/selection.mjs",
	"src/studio/workspace/palette/color.mjs",
	"src/studio/workspace/palette/index.mjs",
	"src/studio/workspace/render.mjs",
	"src/studio/workspace/sidebar/index.mjs",
	"src/studio/workspace/sidebar/layers.mjs",
	"src/studio/workspace/sidebar/tools.mjs",
	"src/studio/workspace/vector/glyphs.mjs",
	"src/studio/workspace/vector/index.mjs",
	"src/studio/workspace/vector/primitives.mjs",
	"src/studio/workspace/vector/text.mjs",
	"src/transport/comments.mjs",
	"src/transport/http.mjs",
	"src/transport/human-context.mjs",
	"src/transport/index.mjs",
	"src/transport/lifecycle-http.mjs",
	"src/transport/lifecycle.mjs",
	"src/transport/managed-input.mjs",
	"src/transport/managed.mjs",
	"src/transport/ownership.mjs",
	"src/transport/persistence.mjs",
	"src/transport/runtime-manifest.mjs",
	"src/transport/server.mjs",
}

func TestRuntimeFSHasExactCurrentInventory(t *testing.T) {
	actual := runtimeInventory(t)
	want := append([]string(nil), expectedRuntimeInventory...)
	sort.Strings(want)
	if !reflect.DeepEqual(actual, want) {
		t.Fatalf("runtime inventory mismatch (-actual +expected):\nactual=%v\nexpected=%v", actual, want)
	}
	if len(actual) != 95 {
		t.Fatalf("runtime inventory has %d files, want 95", len(actual))
	}
}

func TestRuntimeFSIncludesApprovedWorkspaceEntrypoints(t *testing.T) {
	for _, path := range []string{
		"src/studio/workspace/index.mjs",
		"src/studio/workspace/render.mjs",
		"src/studio/workspace/actions/index.mjs",
		"src/studio/workspace/controls/index.mjs",
		"src/studio/workspace/feedback/index.mjs",
		"src/studio/workspace/geometry/index.mjs",
		"src/studio/workspace/input/index.mjs",
		"src/studio/workspace/palette/index.mjs",
		"src/studio/workspace/sidebar/index.mjs",
		"src/studio/workspace/vector/index.mjs",
	} {
		if _, err := fs.Stat(RuntimeFS(), path); err != nil {
			t.Errorf("RuntimeFS is missing approved workspace entrypoint %s: %v", path, err)
		}
	}
}

func TestRuntimeFSExcludesDeletedPresentationAndCSS(t *testing.T) {
	for _, path := range []string{
		"src/studio/header/index.mjs",
		"src/studio/inspector/index.mjs",
		"src/studio/layers/index.mjs",
		"src/studio/playback/index.mjs",
		"src/studio/tools/index.mjs",
		"src/studio/viewport/index.mjs",
		"src/studio/review/presentation/index.mjs",
		"public/controls.css",
		"public/feedback.css",
		"public/inspector.css",
		"public/layers.css",
		"public/stage.css",
		"public/tokens.css",
	} {
		if _, err := fs.Stat(RuntimeFS(), path); err == nil {
			t.Errorf("RuntimeFS still contains deleted presentation asset %s", path)
		} else if !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("statting deleted presentation asset %s: %v", path, err)
		}
	}
}

func TestRuntimeFSExcludesTestsDocsToolingArtifactsAndState(t *testing.T) {
	for _, path := range expectedRuntimeInventory {
		if strings.HasPrefix(path, "tests/") || strings.HasPrefix(path, "docs/") ||
			strings.HasPrefix(path, "tooling/") || strings.HasPrefix(path, "artifacts/") ||
			strings.Contains(path, "/state/") || strings.HasSuffix(path, ".json") ||
			strings.HasSuffix(path, ".md") {
			t.Errorf("runtime inventory contains excluded path %s", path)
		}
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

func runtimeInventory(t *testing.T) []string {
	t.Helper()
	var actual []string
	if err := fs.WalkDir(RuntimeFS(), ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			actual = append(actual, path)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	sort.Strings(actual)
	return actual
}
