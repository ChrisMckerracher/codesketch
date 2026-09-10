package lifecycle

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

func TestEnsureRuntimeExtractsVerifiedTree(t *testing.T) {
	cache := cachePath(t)
	root, digest, err := ensureRuntime(context.Background(), cache)
	if err != nil {
		t.Fatal(err)
	}
	manifestBytes, manifestDigest, err := runtimeManifest()
	if err != nil {
		t.Fatal(err)
	}
	if digest != manifestDigest || len(digest) != 64 {
		t.Fatalf("runtime digest must be the manifest digest: %s", digest)
	}
	if root != filepath.Join(cache, runtimeDirName, digest) {
		t.Fatalf("runtime root must be the digest directory: %s", root)
	}
	written, err := os.ReadFile(filepath.Join(root, manifestName))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(written, manifestBytes) {
		t.Error("extracted manifest must equal the embedded manifest bytes")
	}
	var document manifest
	if err := json.Unmarshal(manifestBytes, &document); err != nil {
		t.Fatal(err)
	}
	for _, entry := range document.Files {
		info, err := os.Lstat(filepath.Join(root, filepath.FromSlash(entry.Path)))
		if err != nil {
			t.Fatal(err)
		}
		if !info.Mode().IsRegular() || info.Mode().Perm() != 0o600 {
			t.Errorf("%s: extracted files must be private regular files", entry.Path)
		}
	}
	for _, dir := range []string{filepath.Join(root, "src", "compositions"), filepath.Join(root, "src"), filepath.Join(cache, runtimeDirName)} {
		info, err := os.Lstat(dir)
		if err != nil {
			t.Fatal(err)
		}
		if !info.Mode().IsDir() || info.Mode().Perm() != 0o700 {
			t.Errorf("%s: runtime directories must be private directories", dir)
		}
	}
	reused, reusedDigest, err := ensureRuntime(context.Background(), cache)
	if err != nil || reused != root || reusedDigest != digest {
		t.Fatalf("ensureRuntime must reuse the verified cache: %s %s %v", reused, reusedDigest, err)
	}
}

func TestEnsureRuntimeConcurrentSharedCachePublishesOnce(t *testing.T) {
	cache := cachePath(t)
	_, digest, err := runtimeManifest()
	if err != nil {
		t.Fatal(err)
	}
	const extractors = 8
	roots := make([]string, extractors)
	digests := make([]string, extractors)
	errs := make([]error, extractors)
	var group sync.WaitGroup
	for slot := 0; slot < extractors; slot++ {
		group.Add(1)
		go func(slot int) {
			defer group.Done()
			roots[slot], digests[slot], errs[slot] = ensureRuntime(context.Background(), cache)
		}(slot)
	}
	group.Wait()
	for slot := 0; slot < extractors; slot++ {
		if errs[slot] != nil {
			t.Fatal(errs[slot])
		}
		if roots[slot] != roots[0] || digests[slot] != digests[0] {
			t.Fatal("concurrent extractors must agree on the published tree")
		}
	}
	entries, err := os.ReadDir(filepath.Join(cache, runtimeDirName))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".extract-") {
			t.Errorf("leftover temporary extraction %s", entry.Name())
		}
		if entry.Name() != digest && entry.Name() != extractLockName {
			t.Errorf("unexpected runtime cache entry %s", entry.Name())
		}
	}
}

func TestEnsureRuntimeRejectsCorruptedCacheWithoutRepair(t *testing.T) {
	for name, corrupt := range map[string]func(t *testing.T, root string){
		"modified": func(t *testing.T, root string) {
			victim := filepath.Join(root, "src", "painting", "rendering", "stroke.mjs")
			data, err := os.ReadFile(victim)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(victim, append(data, 'x'), 0o600); err != nil {
				t.Fatal(err)
			}
		},
		"missing": func(t *testing.T, root string) {
			if err := os.Remove(filepath.Join(root, "src", "painting", "rendering", "stroke.mjs")); err != nil {
				t.Fatal(err)
			}
		},
		"extra": func(t *testing.T, root string) {
			if err := os.WriteFile(filepath.Join(root, "extra.txt"), []byte("stray"), 0o600); err != nil {
				t.Fatal(err)
			}
		},
		"symlink": func(t *testing.T, root string) {
			victim := filepath.Join(root, "src", "painting", "rendering", "stroke.mjs")
			target := filepath.Join(root, manifestName)
			if err := os.Remove(victim); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(target, victim); err != nil {
				t.Fatal(err)
			}
		},
		"manifest": func(t *testing.T, root string) {
			if err := os.WriteFile(filepath.Join(root, manifestName), []byte("{}\n"), 0o600); err != nil {
				t.Fatal(err)
			}
		},
		"unprivate": func(t *testing.T, root string) {
			if err := os.Chmod(filepath.Join(root, "src", "painting", "rendering", "stroke.mjs"), 0o644); err != nil {
				t.Fatal(err)
			}
		},
		"oversized": func(t *testing.T, root string) {
			victim := filepath.Join(root, "src", "painting", "rendering", "stroke.mjs")
			data, err := os.ReadFile(victim)
			if err != nil {
				t.Fatal(err)
			}
			grown := append(data, bytes.Repeat([]byte("x"), 1<<20)...)
			if err := os.WriteFile(victim, grown, 0o600); err != nil {
				t.Fatal(err)
			}
		},
	} {
		t.Run(name, func(t *testing.T) {
			cache := cachePath(t)
			root, _, err := ensureRuntime(context.Background(), cache)
			if err != nil {
				t.Fatal(err)
			}
			corrupt(t, root)
			if _, _, err := ensureRuntime(context.Background(), cache); err == nil {
				t.Fatal("corrupted runtime cache must be rejected")
			}
			if name != "modified" {
				return
			}
			victim := filepath.Join(root, "src", "painting", "rendering", "stroke.mjs")
			data, err := os.ReadFile(victim)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.HasSuffix(string(data), "x") {
				t.Error("corrupt cache must never be repaired in place")
			}
		})
	}
}

// cachePath returns a fresh nonexistent cache path under the world-readable
// testing root: ensureRuntime must create it with private 0700 permissions.
func cachePath(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "cache")
}

func TestEnsureRuntimeRejectsUnusableCacheDirectories(t *testing.T) {
	ctx := context.Background()
	real := filepath.Join(t.TempDir(), "real")
	if err := os.MkdirAll(real, 0o700); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "link")
	if err := os.Symlink(real, link); err != nil {
		t.Fatal(err)
	}
	if _, _, err := ensureRuntime(ctx, link); err == nil {
		t.Error("symlinked cache directory must be rejected")
	}
	unprivate := filepath.Join(t.TempDir(), "cache")
	if err := os.MkdirAll(unprivate, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(unprivate, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, _, err := ensureRuntime(ctx, unprivate); err == nil {
		t.Error("unprivate cache directory must be rejected")
	}
	adopted := filepath.Join(t.TempDir(), "cache")
	if err := os.MkdirAll(adopted, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(real, filepath.Join(adopted, runtimeDirName)); err != nil {
		t.Fatal(err)
	}
	if _, _, err := ensureRuntime(ctx, adopted); err == nil {
		t.Error("symlinked runtime directory must be rejected")
	}
	if _, _, err := ensureRuntime(ctx, "relative-cache"); err == nil {
		t.Error("relative cache directory must be rejected")
	}
}

func TestEnsureRuntimeLockRejectsCancelledContextOnFreeLock(t *testing.T) {
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	if err := os.MkdirAll(runtimeRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	acquiring := make(chan error, 1)
	go func() {
		_, err := acquireExtractLock(cancelled, runtimeRoot)
		acquiring <- err
	}()
	select {
	case err := <-acquiring:
		if err == nil {
			t.Fatal("cancelled context must never acquire a free lock")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("cancelled lock acquisition must return promptly")
	}
	if _, err := os.Lstat(filepath.Join(runtimeRoot, extractLockName)); !os.IsNotExist(err) {
		t.Errorf("rejected acquisition must not create the lock file: %v", err)
	}
}
func lockInode(t *testing.T, path string) uint64 {
	t.Helper()
	info, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	return info.Sys().(*syscall.Stat_t).Ino
}
