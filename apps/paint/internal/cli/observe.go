package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"time"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/capture"
	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/parse"
	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/transport"
)

func (r Runner) observe(parent context.Context, c *transport.Client, command string, a *parse.Result, j invocation) error {
	ctx, cancel := context.WithTimeout(parent, j.timeout)
	defer cancel()
	var previous snapshot
	first := true
	for {
		path := "/api/state"
		if command == "watch" && !first {
			q := url.Values{"since": {strconv.FormatInt(previous.Revision, 10)}, "instanceId": {previous.InstanceID}}
			path += "?" + q.Encode()
		}
		data, err := c.Request(ctx, "GET", path, nil)
		if err != nil {
			if parent.Err() != nil {
				return parent.Err()
			}
			if ctx.Err() != nil {
				return observationEnd(command, j.timeout)
			}
			return err
		}
		s, err := decodeSnapshot(data)
		if err != nil {
			return err
		}
		if command == "wait" && (s.Playback.Status == "idle" || s.Playback.Status == "paused") {
			if a.Booleans["json"] {
				return r.output(data)
			}
			if err := r.text(formatStatus(s)); err != nil {
				return err
			}
			if len(s.Comments) != 0 {
				return r.text(formatCommentsRecords(s.Comments))
			}
			return nil
		}
		if command == "watch" && !s.Unchanged {
			event := "change"
			if first {
				event = "initial"
			}
			if a.Booleans["json"] {
				// Keep playback metadata compact, including active type/progress.
				entry := map[string]any{"event": event, "instanceId": s.InstanceID, "revision": s.Revision,
					"artRevision": s.ArtRevision, "playback": s.Playback, "history": s.History, "comments": s.Comments}
				if err := json.NewEncoder(r.Out).Encode(entry); err != nil {
					return err
				}
			} else {
				if err := r.text(fmt.Sprintf("[%s] revision %d - %s (%d remaining, cursor: %d)", event, s.Revision, s.Playback.Status, s.Playback.Remaining, s.History.Cursor)); err != nil {
					return err
				}
				if len(s.Comments) != 0 {
					if err := r.text(formatCommentsRecords(s.Comments)); err != nil {
						return err
					}
				}
			}
			previous = s
		}
		first = false
		timer := time.NewTimer(j.interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			if parent.Err() != nil {
				return parent.Err()
			}
			return observationEnd(command, j.timeout)
		case <-timer.C:
		}
	}
}

func observationEnd(command string, timeout time.Duration) error {
	if command == "watch" {
		return nil
	}
	return &failure{code: "WAIT_TIMEOUT", message: fmt.Sprintf("wait timed out after %s before playback settled (WAIT_TIMEOUT)", timeout)}
}

func (r Runner) picture(ctx context.Context, c *transport.Client, a *parse.Result, j invocation) error {
	data, err := c.Request(ctx, "GET", "/api/state", nil)
	if err != nil {
		return err
	}
	s, err := decodeSnapshot(data)
	if err != nil {
		return err
	}
	if j.capture.Browser == "" {
		j.capture.Browser = r.Env("PAINT_BROWSER")
	}
	result, err := r.Capture(ctx, data, j.capture)
	if err != nil {
		return err
	}
	if a.Booleans["json"] {
		if j.capture.Committed {
			return r.output(result)
		}
		return r.output(struct {
			capture.Result
			Playback string `json:"playback"`
		}{result, s.Playback.Status})
	}
	label, playback := "Captured view", ", playback: "+s.Playback.Status
	if j.capture.Committed {
		label, playback = "Exported artwork", ""
	}
	return r.text(fmt.Sprintf("%s: %s (%s, %dx%d, revision %d, instance %s%s)", label, result.Path, result.MIMEType, result.Width, result.Height, result.Revision, result.InstanceID, playback))
}
