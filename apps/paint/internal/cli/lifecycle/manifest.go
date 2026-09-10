// Package lifecycle freezes the canonical studio runtime manifest. Go
// derives the exact manifest bytes and the runtime digest from the embedded
// studio.RuntimeFS inventory, and later native lifecycle work reuses the
// same bytes for verified cache extraction. The encoding is frozen by the
// lifecycle contract: compact UTF-8 JSON with one files array, entry keys
// path, size and sha256 in that declaration order, entries sorted by ASCII
// path, exactly one trailing LF byte and no BOM.
package lifecycle

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/ChrisMckerracher/codesketch/apps/studio"
)

// manifest is the sole canonical manifest object.
type manifest struct {
	Files []manifestEntry `json:"files"`
}

// manifestEntry is one canonical inventory entry with frozen key order.
type manifestEntry struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

// runtimeManifest derives the canonical manifest bytes and the runtime
// digest, the lowercase SHA-256 of those exact bytes, from the embedded
// canonical runtime assets. Derivation is deterministic: it contains no
// timestamps, environment data or fallback variants.
func runtimeManifest() ([]byte, string, error) {
	var entries []manifestEntry
	err := fs.WalkDir(studio.RuntimeFS(), ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("%s: embedded runtime entry is not a regular file", name)
		}
		if !validManifestPath(name) {
			return fmt.Errorf("%s: embedded runtime path violates the manifest path contract", name)
		}
		data, err := fs.ReadFile(studio.RuntimeFS(), name)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(data)
		entries = append(entries, manifestEntry{Path: name, Size: int64(len(data)), SHA256: hex.EncodeToString(sum[:])})
		return nil
	})
	if err != nil {
		return nil, "", err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	for i := 1; i < len(entries); i++ {
		if entries[i].Path == entries[i-1].Path {
			return nil, "", fmt.Errorf("%s: duplicate embedded runtime inventory path", entries[i].Path)
		}
	}
	encoded, err := json.Marshal(manifest{Files: entries})
	if err != nil {
		return nil, "", err
	}
	encoded = append(encoded, '\n')
	sum := sha256.Sum256(encoded)
	return encoded, hex.EncodeToString(sum[:]), nil
}

// validManifestPath rejects anything outside the frozen inventory path
// contract: slash-separated ASCII letters, digits, underscore, hyphen and
// period, with no absolute, empty, dot or dot-dot segments and no
// backslashes. Later tree verification reuses it on extracted and parsed
// paths.
func validManifestPath(name string) bool {
	if name == "" || strings.HasPrefix(name, "/") || strings.Contains(name, `\`) {
		return false
	}
	for _, segment := range strings.Split(name, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return false
		}
		for _, r := range segment {
			switch {
			case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '_', r == '-', r == '.':
			default:
				return false
			}
		}
	}
	return true
}
