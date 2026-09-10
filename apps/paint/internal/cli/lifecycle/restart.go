package lifecycle

import (
	"context"
	"fmt"
	"path/filepath"
)

// Restart stops the discovered runtime and launches a replacement under one
// operation lock, without recursively locking the public methods. A failed
// stop never starts a replacement; the replacement launches only after the
// stop proof, and port 0 may bind a different port. The replacement URL is
// opened unless NoOpen. An incompatible busy runtime is never restarted
// automatically: discovery reports the ownership error and preserves it.
func (m *Manager) Restart(ctx context.Context) (Result, error) {
	if err := ensurePrivateDir(m.dataDir); err != nil {
		return Result{}, err
	}
	unlock, err := acquireDataLock(ctx, filepath.Join(m.dataDir, lifecycleLockName))
	if err != nil {
		return Result{}, err
	}
	defer unlock()
	if _, err := m.stopLocked(ctx); err != nil {
		return Result{}, fmt.Errorf("lifecycle restart requires a successful stop: %w", err)
	}
	result, err := m.startLocked(ctx)
	if err != nil {
		return Result{}, err
	}
	return m.openResult(ctx, result)
}
