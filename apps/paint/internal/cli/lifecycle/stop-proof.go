package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"
	"syscall"
	"time"
)

const (
	// stopProofWindow bounds the wait for both shutdown proofs even when the
	// caller supplies no earlier deadline.
	stopProofWindow = 15 * time.Second
	// stopProofPoll paces the proof retries while shutdown completes.
	stopProofPoll = 25 * time.Millisecond
	// proofDialTimeout bounds one absence probe.
	proofDialTimeout = 500 * time.Millisecond
)

// proveStopped waits for the double shutdown proof: the recorded endpoint
// refuses connections and the writer lease is free. A still-held lease, a
// listener that has not closed yet, and transient dial failures retry within
// the bounded window. The returned lease stays held for the caller's record
// cleanup and must be closed by the caller. Metadata PIDs are never
// signalled: termination comes only from a definitive connection refusal.
func (m *Manager) proveStopped(ctx context.Context, record ownershipRecord) (*os.File, error) {
	deadline := time.Now().Add(stopProofWindow)
	if interruption, ok := ctx.Deadline(); ok && interruption.Before(deadline) {
		deadline = interruption
	}
	for {
		if err := proofWait(ctx, deadline); err != nil {
			return nil, err
		}
		if !endpointRefused(ctx, record.URL) {
			if err := proofPause(ctx); err != nil {
				return nil, err
			}
			continue
		}
		lease, acquired, err := probeWriterLease(ctx, m.dataDir)
		if err != nil {
			return nil, err
		}
		if acquired {
			return lease, nil
		}
		if err := proofPause(ctx); err != nil {
			return nil, err
		}
	}
}

// proofWait rejects rounds once the bounded window expires or the context is
// cancelled, so the failure always reports the proof outcome instead of
// silently preserving an unproven stop.
func proofWait(ctx context.Context, deadline time.Time) error {
	if time.Now().After(deadline) {
		return errors.New("lifecycle ownership error: the stopping runtime never proved endpoint termination and a free writer lease")
	}
	if ctx.Err() != nil {
		return fmt.Errorf("lifecycle stop proof cancelled: %w", ctx.Err())
	}
	return nil
}

func proofPause(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return fmt.Errorf("lifecycle stop proof cancelled: %w", ctx.Err())
	case <-time.After(stopProofPoll):
		return nil
	}
}

// endpointRefused reports whether the record's literal loopback endpoint
// refuses connections right now. A successful dial (the original listener
// still closing, or an alien replacement listener) and any non-refusal dial
// failure leave the proof open for a bounded retry; a malformed record URL
// can never pass and keeps the stop uncertain.
func endpointRefused(ctx context.Context, rawURL string) bool {
	const prefix = "http://127.0.0.1:"
	if !strings.HasPrefix(rawURL, prefix) {
		return false
	}
	dialer := &net.Dialer{Timeout: proofDialTimeout}
	connection, err := dialer.DialContext(ctx, "tcp4", "127.0.0.1:"+rawURL[len(prefix):])
	if err != nil {
		return errors.Is(err, syscall.ECONNREFUSED)
	}
	connection.Close()
	return false
}
