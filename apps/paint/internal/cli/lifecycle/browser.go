package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"time"
)

// browserTimeout bounds the reaped opener invocation.
const browserTimeout = 5 * time.Second

// openBrowser opens the verified loopback URL with the platform opener,
// separate argv and no shell, reaping it within a bounded invocation.
func openBrowser(ctx context.Context, url string) error {
	var opener string
	switch runtime.GOOS {
	case "darwin":
		opener = "open"
	case "linux":
		opener = "xdg-open"
	default:
		return errors.New("lifecycle browser opening supports macOS and Linux only")
	}
	path, err := exec.LookPath(opener)
	if err != nil {
		return fmt.Errorf("lifecycle browser opener %s is unavailable: %w", opener, err)
	}
	ctx, cancel := context.WithTimeout(ctx, browserTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, url)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("lifecycle browser open failed: %w", err)
	}
	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("lifecycle browser open failed: %w", err)
	}
	return nil
}
