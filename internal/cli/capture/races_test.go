package capture

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestExitWaitsForClaimedCallback(t *testing.T) {
	s := &captureServer{result: make(chan outcome, 1), callbackStarted: make(chan struct{})}
	close(s.callbackStarted)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { _, err := resultAfterExit(ctx, s, errors.New("exited")); done <- err }()
	select {
	case err := <-done:
		t.Fatal("returned before callback", err)
	case <-time.After(250 * time.Millisecond):
	}
	s.result <- outcome{png: []byte("validated")}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestExitWaitCancellation(t *testing.T) {
	s := &captureServer{result: make(chan outcome, 1), callbackStarted: make(chan struct{})}
	close(s.callbackStarted)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := resultAfterExit(ctx, s, nil); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}

func TestPNGDecodeCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := validatePNGContext(ctx, pngBytes(t, 10, 10), 10, 10); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}
