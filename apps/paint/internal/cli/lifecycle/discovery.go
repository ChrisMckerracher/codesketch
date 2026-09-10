package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

const (
	// discoveryWindow bounds the busy-writer retry for a late record or an
	// unready endpoint; callers bound it earlier with their own deadline.
	discoveryWindow = 2 * time.Second
	discoveryPoll   = 25 * time.Millisecond
)

// discovery is the classified runtime state found under the operation lock.
// A non-nil lease is the acquired writer lease, retained for a later start;
// a busy discovery leaves it nil. Metadata PIDs are never signalled from
// any branch here.
type discovery struct {
	lease    *os.File
	busy     bool
	recorded bool
	record   ownershipRecord
	result   Result
}

// discover runs one classified discovery pass under the operation lock.
func (m *Manager) discover(ctx context.Context) (discovery, error) {
	if err := ensurePrivateDir(m.dataDir); err != nil {
		return discovery{}, err
	}
	unlock, err := acquireDataLock(ctx, filepath.Join(m.dataDir, lifecycleLockName))
	if err != nil {
		return discovery{}, err
	}
	defer unlock()
	return m.discoverLeased(ctx)
}

// discoverLeased probes the writer lease and classifies the runtime. It
// assumes the caller already holds the operation lock, so future start,
// stop and restart helpers can compose it without recursive public locking.
func (m *Manager) discoverLeased(ctx context.Context) (discovery, error) {
	lease, acquired, err := probeWriterLease(ctx, m.dataDir)
	if err != nil {
		return discovery{}, err
	}
	if !acquired {
		return m.discoverBusy(ctx)
	}
	discovered, err := m.discoverAcquired(ctx, lease)
	if err != nil {
		lease.Close()
		return discovery{}, err
	}
	return discovered, nil
}

// discoverBusy classifies a busy writer: bounded retries wait for a late
// record and an unready endpoint; a valid current record with an
// authenticated matching status yields running or stopping. Malformed
// records, authentication failures, timeouts, identity mismatches and
// incompatible digests error immediately and preserve every file and
// process.
func (m *Manager) discoverBusy(ctx context.Context) (discovery, error) {
	deadline := discoveryDeadline(ctx)
	for {
		record, err := readRecord(m.dataDir)
		switch {
		case err == nil:
			if record.Digest != m.digest {
				return discovery{}, errors.New("lifecycle ownership error: the busy writer runs an incompatible runtime")
			}
			response, err := fetchStatus(ctx, record)
			if err == nil {
				return discovery{busy: true, recorded: true, record: record, result: response.result()}, nil
			}
			if !errors.Is(err, errStatusUnready) && !errors.Is(err, syscall.ECONNREFUSED) {
				return discovery{}, fmt.Errorf("lifecycle ownership error: the busy writer endpoint failed: %w", err)
			}
		case errors.Is(err, fs.ErrNotExist):
			// The writer may still be starting; the record can appear late.
		default:
			return discovery{}, fmt.Errorf("lifecycle ownership error: the busy writer record is unusable: %w", err)
		}
		if err := discoveryWait(ctx, deadline); err != nil {
			return discovery{}, err
		}
	}
}

// discoverAcquired classifies a runtime recorded under an acquired writer
// lease. An acquired lease with no record is stopped. Only a definitive
// connection refusal proves staleness; unready endpoints, authentication
// failures, timeouts and mismatches are preserved and reported, and a live
// endpoint answering with a free lease is an ownership violation.
func (m *Manager) discoverAcquired(ctx context.Context, lease *os.File) (discovery, error) {
	record, err := readRecord(m.dataDir)
	if errors.Is(err, fs.ErrNotExist) {
		return discovery{lease: lease, result: Result{State: Stopped}}, nil
	}
	if err != nil {
		return discovery{}, fmt.Errorf("lifecycle ownership error: the idle writer record is unusable: %w", err)
	}
	if record.Digest != m.digest {
		return discovery{}, errors.New("lifecycle ownership error: the idle writer record describes an incompatible runtime")
	}
	if _, err := fetchStatus(ctx, record); err == nil {
		return discovery{}, errors.New("lifecycle ownership error: a live runtime responds while the writer lease is free")
	} else if !errors.Is(err, syscall.ECONNREFUSED) {
		return discovery{}, fmt.Errorf("lifecycle ownership error: the recorded endpoint is unverifiable: %w", err)
	}
	return m.removeStaleRecord(lease, record)
}

// removeStaleRecord re-reads the full record under both held locks and
// unlinks it only when it still matches exactly, then syncs the data
// directory. The acquired writer lease stays held across cleanup and is
// returned with the discovery so a later start can transfer it.
func (m *Manager) removeStaleRecord(lease *os.File, record ownershipRecord) (discovery, error) {
	reread, err := readRecord(m.dataDir)
	if err != nil {
		return discovery{}, fmt.Errorf("lifecycle ownership error: the stale record changed while being verified: %w", err)
	}
	if reread != record {
		return discovery{}, errors.New("lifecycle ownership error: the record changed during stale discovery")
	}
	if err := os.Remove(filepath.Join(m.dataDir, recordName)); err != nil {
		return discovery{}, err
	}
	if err := syncDirectory(m.dataDir); err != nil {
		return discovery{}, err
	}
	return discovery{lease: lease, result: Result{State: Stopped}}, nil
}

// discoveryDeadline bounds the busy retry window, respecting an earlier
// caller deadline.
func discoveryDeadline(ctx context.Context) time.Time {
	deadline := time.Now().Add(discoveryWindow)
	if interruption, ok := ctx.Deadline(); ok && interruption.Before(deadline) {
		deadline = interruption
	}
	return deadline
}

func discoveryWait(ctx context.Context, deadline time.Time) error {
	if time.Now().After(deadline) {
		return errors.New("lifecycle ownership error: the busy writer has no verified runtime record")
	}
	if ctx.Err() != nil {
		return fmt.Errorf("lifecycle ownership discovery cancelled: %w", ctx.Err())
	}
	select {
	case <-ctx.Done():
		// Loop the check once more so an expired caller deadline reports the
		// ownership outcome while an explicit cancel reports cancellation.
		if time.Now().After(deadline) {
			return errors.New("lifecycle ownership error: the busy writer has no verified runtime record")
		}
		return fmt.Errorf("lifecycle ownership discovery cancelled: %w", ctx.Err())
	case <-time.After(discoveryPoll):
		return nil
	}
}
