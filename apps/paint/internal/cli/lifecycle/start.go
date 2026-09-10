package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
)

// Start discovers the runtime under the operation lock, reusing a verified
// healthy instance of the current digest when one is already running, and
// otherwise extracts the embedded runtime and launches the managed Node
// entrypoint as a detached direct child. The writer lease from stale cleanup
// is retained through extraction and transferred to the new child. The
// returned URL is opened unless NoOpen; browser failure returns the healthy
// result plus an error containing the URL.
func (m *Manager) Start(ctx context.Context) (Result, error) {
	if err := ensurePrivateDir(m.dataDir); err != nil {
		return Result{}, err
	}
	unlock, err := acquireDataLock(ctx, filepath.Join(m.dataDir, lifecycleLockName))
	if err != nil {
		return Result{}, err
	}
	defer unlock()
	result, err := m.startLocked(ctx)
	if err != nil {
		return Result{}, err
	}
	return m.openResult(ctx, result)
}

// startLocked performs discovery, reuse, extraction and launch while the
// caller already holds the operation lock. It never opens a browser, so a
// future Restart can compose stop and start under one lock and still route
// the final result through openResult.
func (m *Manager) startLocked(ctx context.Context) (Result, error) {
	discovered, err := m.discoverLeased(ctx)
	if err != nil {
		return Result{}, err
	}
	var result Result
	if discovered.busy {
		// A verified reused instance passes through the same opener
		// behaviour as a freshly launched one.
		result, err = m.reuseRunning(discovered.result)
	} else {
		lease := discovered.lease
		root, digest, extractErr := ensureRuntime(ctx, m.cacheDir)
		if extractErr != nil {
			lease.Close()
			return Result{}, extractErr
		}
		if digest != m.digest {
			lease.Close()
			return Result{}, errors.New("lifecycle ownership error: the embedded runtime digest is incompatible")
		}
		result, err = m.launch(ctx, lease, root)
	}
	if err != nil {
		return Result{}, err
	}
	return result, nil
}

// openResult opens the verified loopback URL unless NoOpen is set. A browser
// failure returns the healthy result plus an error containing the URL.
func (m *Manager) openResult(ctx context.Context, result Result) (Result, error) {
	if m.noOpen {
		return result, nil
	}
	if err := openBrowser(ctx, result.URL); err != nil {
		return result, fmt.Errorf("lifecycle browser open failed for %s: %w", result.URL, err)
	}
	return result, nil
}

// reuseRunning accepts a verified healthy running writer when the requested
// nonzero port matches the recorded bound port; a stopping writer is an
// ownership error. Port 0 permits reuse of the recorded bound port.
func (m *Manager) reuseRunning(result Result) (Result, error) {
	if result.State != Running {
		return Result{}, errors.New("lifecycle ownership error: the busy writer is stopping")
	}
	if m.port != 0 && urlPort(result.URL) != m.port {
		return Result{}, fmt.Errorf("lifecycle ownership error: the busy writer runs on port %d instead of the requested %d", urlPort(result.URL), m.port)
	}
	return result, nil
}

// urlPort parses the explicit port from a validated literal loopback URL.
func urlPort(rawURL string) int {
	value, err := strconv.Atoi(strings.TrimPrefix(rawURL, "http://127.0.0.1:"))
	if err != nil {
		return 0
	}
	return value
}
