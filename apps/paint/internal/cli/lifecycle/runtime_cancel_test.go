package lifecycle

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func cancelledContext() (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	return ctx, cancel
}

func manifestEntries(t *testing.T) ([]byte, []manifestEntry) {
	t.Helper()
	manifestBytes, _, err := runtimeManifest()
	if err != nil {
		t.Fatal(err)
	}
	var document manifest
	if err := json.Unmarshal(manifestBytes, &document); err != nil {
		t.Fatal(err)
	}
	return manifestBytes, document.Files
}

func TestExtractRuntimeTreeHonoursCancelledContext(t *testing.T) {
	manifestBytes, entries := manifestEntries(t)
	temp := t.TempDir()
	ctx, cancel := cancelledContext()
	defer cancel()
	if err := extractRuntimeTree(ctx, temp, manifestBytes, entries); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled extraction must fail with cancellation: %v", err)
	}
	written, err := os.ReadDir(temp)
	if err != nil {
		t.Fatal(err)
	}
	if len(written) != 0 {
		t.Errorf("cancelled extraction must write no files, found %d entries", len(written))
	}
}

func TestVerifyRuntimeTreeHonoursCancelledContext(t *testing.T) {
	manifestBytes, entries := manifestEntries(t)
	root, _, err := ensureRuntime(context.Background(), cachePath(t))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := cancelledContext()
	defer cancel()
	if err := verifyRuntimeTree(ctx, root, manifestBytes, entries); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled verification must fail with cancellation: %v", err)
	}
}

func TestEnsureRuntimeCancelledContextLeavesNoTemporary(t *testing.T) {
	cache := cachePath(t)
	ctx, cancel := cancelledContext()
	defer cancel()
	if _, _, err := ensureRuntime(ctx, cache); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled ensureRuntime must fail with cancellation: %v", err)
	}
	entries, err := os.ReadDir(filepath.Join(cache, runtimeDirName))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".extract-") {
			t.Errorf("cancelled extraction must remove its temporary tree: %s", entry.Name())
		}
	}
}

// extractionCancelContext is a test-only wrapper that deterministically
// cancels itself the first time production code consults the context after
// the extractor's own partial asset exists: src/compositions/index.mjs is the first
// inventory file written inside the sibling temporary directory. There is no
// goroutine, sleep or production hook: Err() simply observes the real
// filesystem whenever production checks it.
type extractionCancelContext struct {
	context.Context
	runtimeRoot string
	cancel      context.CancelFunc
	cancels     sync.Once
}

func (c *extractionCancelContext) Err() error {
	if entries, err := os.ReadDir(c.runtimeRoot); err == nil {
		for _, entry := range entries {
			if !strings.HasPrefix(entry.Name(), ".extract-") {
				continue
			}
			if _, err := os.Stat(filepath.Join(c.runtimeRoot, entry.Name(), "src", "compositions", "index.mjs")); err == nil {
				c.cancels.Do(c.cancel)
				break
			}
		}
	}
	return c.Context.Err()
}

func TestEnsureRuntimeCancellationDuringPartialExtraction(t *testing.T) {
	cache := cachePath(t)
	runtimeRoot := filepath.Join(cache, runtimeDirName)
	inner, cancel := context.WithCancel(context.Background())
	defer cancel()
	ctx := &extractionCancelContext{Context: inner, runtimeRoot: runtimeRoot, cancel: cancel}
	_, _, err := ensureRuntime(ctx, cache)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("mid-extraction cancellation must fail with cancellation: %v", err)
	}
	entries, err := os.ReadDir(runtimeRoot)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".extract-") {
			t.Errorf("cancelled extraction must remove its temporary tree: %s", entry.Name())
		}
		if !strings.HasPrefix(entry.Name(), ".") {
			t.Errorf("cancelled extraction must not publish a runtime tree: %s", entry.Name())
		}
	}
	// The extraction lock and cache must remain fully usable afterwards.
	manifestBytes, inventory := manifestEntries(t)
	recovered, _, err := ensureRuntime(context.Background(), cache)
	if err != nil {
		t.Fatalf("ensureRuntime must succeed after a cancelled attempt: %v", err)
	}
	if err := verifyRuntimeTree(context.Background(), recovered, manifestBytes, inventory); err != nil {
		t.Fatal(err)
	}
}
