package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// Stop stops the discovered runtime through its authenticated stop route and
// reports an empty stopped result. It requires neither the Node executable
// nor cache extraction: discovery, the authenticated stop request, the
// termination proof and exact record cleanup all run under the operation
// lock against recorded loopback metadata. Stop never signals metadata PIDs,
// never opens a browser and never launches a runtime.
func (m *Manager) Stop(ctx context.Context) (Result, error) {
	if err := ensurePrivateDir(m.dataDir); err != nil {
		return Result{}, err
	}
	unlock, err := acquireDataLock(ctx, filepath.Join(m.dataDir, lifecycleLockName))
	if err != nil {
		return Result{}, err
	}
	defer unlock()
	return m.stopLocked(ctx)
}

// stopLocked stops the discovered runtime while the caller already holds the
// operation lock, so Restart can compose it with startLocked under one lock.
// An already stopped or proven-stale runtime is idempotent success. A busy
// verified writer receives the authenticated stop request; success reports
// only after the double proof of a refused endpoint and a free writer lease
// followed by exact record cleanup. An acknowledgement failure, proof
// timeout or uncertainty preserves the process and record for retry.
func (m *Manager) stopLocked(ctx context.Context) (Result, error) {
	discovered, err := m.discoverLeased(ctx)
	if err != nil {
		return Result{}, err
	}
	if !discovered.busy {
		// Stopped or proven stale: the probe lease is dropped because Stop
		// never transfers it to a child.
		discovered.lease.Close()
		return Result{State: Stopped}, nil
	}
	record := discovered.record
	if err := requestStop(ctx, record); err != nil {
		return Result{}, err
	}
	lease, err := m.proveStopped(ctx, record)
	if err != nil {
		return Result{}, err
	}
	if err := m.clearStoppedRecord(record); err != nil {
		lease.Close()
		return Result{}, err
	}
	lease.Close()
	return Result{State: Stopped}, nil
}

// clearStoppedRecord re-reads the record under both held locks. A missing
// record is idempotent success: the runtime removed its own metadata. Only
// the exact same full five-field record may be removed after the termination
// proof, followed by a directory sync; a different or malformed record must
// remain and is reported.
func (m *Manager) clearStoppedRecord(record ownershipRecord) error {
	reread, err := readRecord(m.dataDir)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return nil
	case err != nil:
		return fmt.Errorf("lifecycle ownership error: the stopped record is unusable and must remain: %w", err)
	}
	if reread != record {
		return errors.New("lifecycle ownership error: the record changed during shutdown and must remain")
	}
	if err := os.Remove(filepath.Join(m.dataDir, recordName)); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return syncDirectory(m.dataDir)
}
