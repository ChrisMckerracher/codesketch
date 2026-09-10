package lifecycle

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
)

// verifyRuntimeTree checks that root contains exactly the embedded runtime
// inventory plus the canonical manifest bytes: no missing, extra, symlinked
// or modified files, and exactly the implied directories, all private.
// Existing trees are never repaired; any deviation is an error.
func verifyRuntimeTree(ctx context.Context, root string, manifestBytes []byte, entries []manifestEntry) error {
	if err := ensureLive(ctx); err != nil {
		return err
	}
	info, err := os.Lstat(root)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return fmt.Errorf("%s: runtime root must be a real directory", root)
	}
	if info.Mode().Perm()&0o077 != 0 {
		return fmt.Errorf("%s: runtime root must be private", root)
	}
	if !ownedByCurrentUser(info) {
		return fmt.Errorf("%s: runtime root must be owned by the current user", root)
	}
	expectedFiles := make(map[string]manifestEntry, len(entries))
	expectedDirs := map[string]bool{}
	for _, entry := range entries {
		expectedFiles[entry.Path] = entry
		for dir := path.Dir(entry.Path); dir != "." && !expectedDirs[dir]; dir = path.Dir(dir) {
			expectedDirs[dir] = true
		}
	}
	system := os.DirFS(root)
	seen := map[string]bool{}
	err = fs.WalkDir(system, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if walkErr := ensureLive(ctx); walkErr != nil {
			return walkErr
		}
		if name == "." {
			return nil
		}
		seen[name] = true
		if entry.IsDir() {
			if !expectedDirs[name] {
				return fmt.Errorf("runtime directory %s is unexpected", name)
			}
			info, err := entry.Info()
			if err != nil {
				return err
			}
			if info.Mode().Perm()&0o077 != 0 {
				return fmt.Errorf("runtime directory %s must be private", name)
			}
			if !ownedByCurrentUser(info) {
				return fmt.Errorf("runtime directory %s must be owned by the current user", name)
			}
			return nil
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("runtime entry %s must be a regular file", name)
		}
		expected, known := expectedFiles[name]
		if !known && name != manifestName {
			return fmt.Errorf("runtime file %s is unexpected", name)
		}
		expectedSize := int64(len(manifestBytes))
		if known {
			expectedSize = expected.Size
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode().Perm()&0o077 != 0 {
			return fmt.Errorf("runtime file %s must be private", name)
		}
		if !ownedByCurrentUser(info) {
			return fmt.Errorf("runtime file %s must be owned by the current user", name)
		}
		if info.Size() != expectedSize {
			return fmt.Errorf("runtime file %s has the wrong size", name)
		}
		data, err := readBounded(system, name, expectedSize)
		if err != nil {
			return err
		}
		if name == manifestName {
			if !bytes.Equal(data, manifestBytes) {
				return fmt.Errorf("%s: manifest bytes do not match the embedded runtime", manifestName)
			}
			return nil
		}
		if int64(len(data)) != expected.Size {
			return fmt.Errorf("runtime file %s has the wrong size", name)
		}
		sum := sha256.Sum256(data)
		if hex.EncodeToString(sum[:]) != expected.SHA256 {
			return fmt.Errorf("runtime file %s has the wrong digest", name)
		}
		return nil
	})
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !seen[entry.Path] {
			return fmt.Errorf("runtime file %s is missing", entry.Path)
		}
	}
	if !seen[manifestName] {
		return fmt.Errorf("%s: runtime manifest is missing", manifestName)
	}
	return nil
}

// readBounded reads at most limit+1 bytes of name so a corrupt or growing
// cache file cannot force an unbounded allocation; callers compare the
// result length against the exact expected size.
func readBounded(system fs.FS, name string, limit int64) ([]byte, error) {
	file, err := system.Open(name)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return io.ReadAll(io.LimitReader(file, limit+1))
}
