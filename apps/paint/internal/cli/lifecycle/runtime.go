package lifecycle

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/ChrisMckerracher/codesketch/apps/studio"
)

const (
	// runtimeDirName is the private runtime cache directory below the cache
	// root; digest-keyed trees and the extraction lock live inside it.
	runtimeDirName = "runtime"
	// extractLockName is the stable extraction lock inside the runtime cache
	// directory. It is created once as a private regular file and is never
	// unlinked or replaced, so cooperating extractors share one stable inode.
	extractLockName = ".extract.lock"
	// manifestName is the frozen extraction name of the runtime manifest.
	// The manifest excludes itself from its own files list.
	manifestName = "runtime-manifest.json"
)

// ensureRuntime returns the verified cache root for the embedded canonical
// runtime, extracting it exactly once per digest. Cache and runtime
// directories must be private real directories. An existing digest tree is
// verified against the embedded manifest and never repaired, so corrupt or
// altered caches fail instead of being replaced. Extraction writes a fresh
// sibling temporary tree, verifies it byte-for-byte, then publishes it by
// no-overwrite rename while holding the stable extraction lock.
func ensureRuntime(ctx context.Context, cacheDir string) (string, string, error) {
	if !filepath.IsAbs(cacheDir) {
		return "", "", fmt.Errorf("lifecycle cache directory must be absolute: %s", cacheDir)
	}
	if err := ensurePrivateDir(cacheDir); err != nil {
		return "", "", err
	}
	runtimeRoot := filepath.Join(cacheDir, runtimeDirName)
	if err := ensurePrivateDir(runtimeRoot); err != nil {
		return "", "", err
	}
	manifestBytes, digest, err := runtimeManifest()
	if err != nil {
		return "", "", err
	}
	var document manifest
	if err := json.Unmarshal(manifestBytes, &document); err != nil {
		return "", "", err
	}
	target := filepath.Join(runtimeRoot, digest)
	unlock, err := acquireExtractLock(ctx, runtimeRoot)
	if err != nil {
		return "", "", err
	}
	defer unlock()
	if err := ensureLive(ctx); err != nil {
		return "", "", err
	}
	if _, err := os.Lstat(target); err == nil {
		if err := verifyRuntimeTree(ctx, target, manifestBytes, document.Files); err != nil {
			return "", "", err
		}
		return target, digest, nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return "", "", err
	}
	temp, err := os.MkdirTemp(runtimeRoot, ".extract-")
	if err != nil {
		return "", "", err
	}
	published := false
	defer func() {
		if !published {
			os.RemoveAll(temp)
		}
	}()
	if err := extractRuntimeTree(ctx, temp, manifestBytes, document.Files); err != nil {
		return "", "", err
	}
	if err := verifyRuntimeTree(ctx, temp, manifestBytes, document.Files); err != nil {
		return "", "", err
	}
	if _, err := os.Lstat(target); err == nil {
		// A non-cooperating publisher created the destination. Never replace
		// it: verify and adopt the winner while the deferred cleanup removes
		// only our own unpublished temporary tree.
		if err := verifyRuntimeTree(ctx, target, manifestBytes, document.Files); err != nil {
			return "", "", err
		}
		return target, digest, nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return "", "", err
	}
	if err := ensureLive(ctx); err != nil {
		return "", "", err
	}
	if err := os.Rename(temp, target); err != nil {
		return "", "", err
	}
	published = true
	if err := syncDirectory(runtimeRoot); err != nil {
		return "", "", err
	}
	return target, digest, nil
}

// ensureLive reports cancellation between filesystem operations so long
// extraction and verification phases abort early and the deferred cleanup
// removes only unpublished temporaries.
func ensureLive(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("runtime cache work cancelled: %w", err)
	}
	return nil
}

// ensurePrivateDir requires dir to be a private real directory, creating it
// with 0700 permissions when absent, and rejects symlinks, non-directories
// group/other access and foreign ownership on the revalidated final path.
func ensurePrivateDir(dir string) error {
	info, err := os.Lstat(dir)
	if errors.Is(err, fs.ErrNotExist) {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return err
		}
		if info, err = os.Lstat(dir); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return fmt.Errorf("%s: lifecycle cache path must be a real directory", dir)
	}
	if !ownedByCurrentUser(info) {
		return fmt.Errorf("%s: lifecycle cache directory must be owned by the current user", dir)
	}
	if info.Mode().Perm()&0o077 != 0 {
		return fmt.Errorf("%s: lifecycle cache directory must be private", dir)
	}
	return nil
}

// extractRuntimeTree writes exactly the embedded runtime inventory plus the
// canonical manifest into the fresh temporary tree. Every file is created
// exclusively with private 0600 permissions and synced, then every directory
// is synced bottom-up so publication is durable.
func extractRuntimeTree(ctx context.Context, temp string, manifestBytes []byte, entries []manifestEntry) error {
	if err := ensureLive(ctx); err != nil {
		return err
	}
	for _, entry := range entries {
		if err := ensureLive(ctx); err != nil {
			return err
		}
		data, err := fs.ReadFile(studio.RuntimeFS(), entry.Path)
		if err != nil {
			return err
		}
		if err := writeExclusiveFile(filepath.Join(temp, filepath.FromSlash(entry.Path)), data); err != nil {
			return err
		}
	}
	if err := writeExclusiveFile(filepath.Join(temp, manifestName), manifestBytes); err != nil {
		return err
	}
	dirs := []string{temp}
	err := filepath.WalkDir(temp, func(name string, entry fs.DirEntry, err error) error {
		if err == nil {
			if walkErr := ensureLive(ctx); walkErr != nil {
				return walkErr
			}
		}
		if entry.IsDir() && name != temp {
			dirs = append(dirs, name)
		}
		return nil
	})
	if err != nil {
		return err
	}
	for i := len(dirs) - 1; i >= 0; i-- {
		if err := syncDirectory(dirs[i]); err != nil {
			return err
		}
	}
	return nil
}

func writeExclusiveFile(name string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(name), 0o700); err != nil {
		return err
	}
	file, err := os.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	if _, err := file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	return file.Close()
}

// syncDirectory flushes a directory entry so created children and renames
// survive crashes.
func syncDirectory(dir string) error {
	handle, err := os.Open(dir)
	if err != nil {
		return err
	}
	if err := handle.Sync(); err != nil {
		handle.Close()
		return err
	}
	return handle.Close()
}
