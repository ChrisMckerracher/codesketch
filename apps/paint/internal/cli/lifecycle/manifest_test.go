package lifecycle

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"strings"
	"testing"

	"github.com/ChrisMckerracher/codesketch/apps/studio"
)

func TestRuntimeManifestIsDeterministic(t *testing.T) {
	canonical, digest, err := runtimeManifest()
	if err != nil {
		t.Fatal(err)
	}
	repeated, repeatedDigest, err := runtimeManifest()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(canonical, repeated) || digest != repeatedDigest {
		t.Fatal("runtime manifest derivation must be deterministic")
	}
}

func TestRuntimeManifestEncodingIsCanonical(t *testing.T) {
	canonical, digest, err := runtimeManifest()
	if err != nil {
		t.Fatal(err)
	}
	text := string(canonical)
	if !strings.HasSuffix(text, "\n") || strings.HasSuffix(text, "\n\n") {
		t.Error("manifest must end with exactly one LF byte")
	}
	if strings.HasPrefix(text, "\xEF\xBB\xBF") {
		t.Error("manifest must not start with a BOM")
	}
	if !strings.HasPrefix(text, `{"files":[{"path":"public/icon.svg","size":`) {
		t.Errorf("manifest must open with canonical key order and the first sorted entry: %.60s", text)
	}
	if strings.Contains(text, ", ") || strings.Contains(text, `": `) {
		t.Error("manifest must be compact JSON without extra whitespace")
	}
	sum := sha256.Sum256(canonical)
	if hex.EncodeToString(sum[:]) != digest {
		t.Error("runtime digest must be the SHA-256 of the exact manifest bytes")
	}
}

func TestRuntimeManifestPathsAreSortedUniqueAndComplete(t *testing.T) {
	canonical, _, err := runtimeManifest()
	if err != nil {
		t.Fatal(err)
	}
	var document manifest
	if err := json.Unmarshal(canonical, &document); err != nil {
		t.Fatal(err)
	}
	if len(document.Files) == 0 {
		t.Fatal("manifest must list runtime files")
	}
	for i, entry := range document.Files {
		if !validManifestPath(entry.Path) {
			t.Errorf("%s: manifest path violates the path contract", entry.Path)
		}
		if i > 0 && document.Files[i-1].Path >= entry.Path {
			t.Errorf("manifest entries must be strictly ASCII-sorted by path at %s", entry.Path)
		}
	}
	count := 0
	err = fs.WalkDir(studio.RuntimeFS(), ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			count++
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(document.Files) != count {
		t.Fatalf("manifest must cover every embedded runtime file: %d entries for %d files", len(document.Files), count)
	}
}

func TestRuntimeManifestHashesCanonicalRendererAssets(t *testing.T) {
	canonical, _, err := runtimeManifest()
	if err != nil {
		t.Fatal(err)
	}
	var document manifest
	if err := json.Unmarshal(canonical, &document); err != nil {
		t.Fatal(err)
	}
	hashed := 0
	for _, entry := range document.Files {
		if entry.Path != "src/painting/rendering/index.mjs" && entry.Path != "src/painting/rendering/stroke.mjs" {
			continue
		}
		data, err := fs.ReadFile(studio.RuntimeFS(), entry.Path)
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(data)
		if int64(len(data)) != entry.Size || hex.EncodeToString(sum[:]) != entry.SHA256 {
			t.Errorf("%s: manifest entry must hash the canonical embedded bytes", entry.Path)
		}
		hashed++
	}
	if hashed != 2 {
		t.Fatalf("manifest must contain both canonical renderer entries, found %d", hashed)
	}
}
