package capture

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"
)

// Run captures one immutable snapshot with an installed, sandboxed Chromium.
// Its deadline is 15 seconds or the caller's earlier deadline. Publication
// follows PNG validation and cleanup of owned browser and server resources.
func Run(ctx context.Context, snapshot json.RawMessage, options Options) (Result, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var result Result
	if err := ctx.Err(); err != nil {
		return result, err
	}
	data, err := validateSnapshot(snapshot, options)
	if err != nil {
		return result, err
	}
	browser, err := DiscoverBrowser(options.Browser)
	if err != nil {
		return result, err
	}
	if err = ctx.Err(); err != nil {
		return result, err
	}
	body, err := capturePNG(ctx, browser, data)
	if err != nil {
		return result, err
	}
	path, err := writePNG(ctx, body, options.Output)
	if err != nil {
		return result, fmt.Errorf("publish capture: %w", err)
	}
	return Result{Path: path, MIMEType: "image/png", Width: data.Width, Height: data.Height, InstanceID: data.InstanceID, Revision: data.Revision}, nil
}

func capturePNG(ctx context.Context, browser string, data captureData) (body []byte, err error) {
	profile, err := os.MkdirTemp("", "codesketch-capture-profile-*")
	if err != nil {
		return nil, err
	}
	var process *browserProcess
	var server *captureServer
	defer func() {
		if server != nil {
			err = errors.Join(err, server.close())
		}
		if process != nil {
			if stopErr := process.stop(); stopErr != nil {
				err = errors.Join(err, stopErr)
				return // Keep the profile if its owner could not be reaped.
			}
		}
		err = errors.Join(err, removeProfile(profile))
	}()
	if err = ctx.Err(); err != nil {
		return nil, err
	}
	server, err = startServer(ctx, data)
	if err != nil {
		return nil, err
	}
	if err = ctx.Err(); err != nil {
		return nil, err
	}
	process, err = startBrowser(browser, profile, server.url)
	if err != nil {
		return nil, err
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case value := <-server.result:
		if err = ctx.Err(); err != nil {
			return nil, err
		}
		return value.png, value.err
	case <-process.done:
		return resultAfterExit(ctx, server, process.err)
	case serveErr := <-server.serveDone:
		return nil, fmt.Errorf("capture server stopped: %w", serveErr)
	}
}

func resultAfterExit(ctx context.Context, server *captureServer, exitErr error) ([]byte, error) {
	// Allow the listener to dispatch a callback already sent by an exiting
	// browser. Once claimed, body receipt and validation own the outcome.
	timer := time.NewTimer(200 * time.Millisecond)
	defer timer.Stop()
	select {
	case value := <-server.result:
		return value.png, value.err
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-server.callbackStarted:
		select {
		case value := <-server.result:
			return value.png, value.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	case <-timer.C:
		return nil, fmt.Errorf("capture browser exited before delivering PNG: %v", exitErr)
	}
}

func removeProfile(path string) error {
	var err error
	for range 5 {
		if err = os.RemoveAll(path); err == nil {
			return nil
		}
		time.Sleep(50 * time.Millisecond)
	}
	return fmt.Errorf("remove capture profile: %w", err)
}
