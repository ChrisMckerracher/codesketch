package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/parse"
	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/transport"
)

// paint comments [list|wait|watch|ack|address] follows human comments without
// ever resuming playback. All timeouts are bounded; interruption keeps the
// standard 130 exit via the Runner.

const commentsPollInterval = 400 * time.Millisecond

// commentsOptions carries validated comments subcommand values before I/O.
type commentsOptions struct {
	action     string
	id         string
	generation string
	seq        int64
	since      string
	hasSince   bool
	timeout    time.Duration
}

func prepareComments(a *parse.Result, j *invocation) error {
	opts, err := prepareCommentsOptions(a)
	if err != nil {
		return err
	}
	j.comments = &opts
	return nil
}

func (r Runner) commentsCommand(ctx context.Context, c *transport.Client, a *parse.Result, j invocation) error {
	opts := *j.comments
	switch opts.action {
	case "list":
		return r.listComments(ctx, c, a)
	case "wait":
		return r.waitComments(ctx, c, a, opts)
	case "watch":
		return r.watchComments(ctx, c, a, opts)
	default: // ack, address
		return r.commentLifecycle(ctx, c, a, opts)
	}
}

func (r Runner) listComments(ctx context.Context, c *transport.Client, a *parse.Result) error {
	data, err := c.Request(ctx, "GET", "/api/comments", nil)
	if err != nil {
		return err
	}
	if _, err := decodeCommentsEnvelope(data); err != nil {
		return err
	}
	return r.outputCommentsEnvelope(a, data, nil)
}

// outputCommentsEnvelope prints the raw envelope for --json so every rich
// server field is preserved, or the concise listing for text.
func (r Runner) outputCommentsEnvelope(a *parse.Result, data json.RawMessage, env *commentsEnvelope) error {
	if a.Booleans["json"] {
		return r.output(data)
	}
	if env == nil {
		decoded, err := decodeCommentsEnvelope(data)
		if err != nil {
			return err
		}
		env = &decoded
	}
	return r.text(formatCommentsText(*env))
}

func commentsRequestSince(opts commentsOptions) *string {
	if opts.hasSince {
		since := opts.since
		return &since
	}
	return nil
}

// waitComments returns on the first wake relative to the established
// baseline. The first poll only counts when it carries a non-empty delta;
// an empty or reset-only first response establishes the baseline and keeps
// waiting. Deadline exits 1 with COMMENTS_TIMEOUT.
func (r Runner) waitComments(parent context.Context, c *transport.Client, a *parse.Result, opts commentsOptions) error {
	ctx, cancel := context.WithTimeout(parent, opts.timeout)
	defer cancel()
	since := commentsRequestSince(opts)
	var baseline *commentsEnvelope
	for {
		env, data, err := pollCommentsOnce(ctx, c, since)
		if err != nil {
			if parent.Err() != nil {
				return parent.Err()
			}
			if ctx.Err() != nil {
				return commentsTimeout(opts.timeout)
			}
			return err
		}
		current := env
		if commentsWaitRelevant(baseline, opts.hasSince, env) {
			return r.outputCommentsEnvelope(a, data, &env)
		}
		baseline = &current
		if env.Cursor != "" {
			since = &current.Cursor
		}
		if err := commentsSleep(ctx); err != nil {
			if parent.Err() != nil {
				return parent.Err()
			}
			return commentsTimeout(opts.timeout)
		}
	}
}

// watchComments emits the initial envelope once, then only actual changes,
// as compact NDJSON (or text) until the bounded deadline, which exits clean 0.
func (r Runner) watchComments(parent context.Context, c *transport.Client, a *parse.Result, opts commentsOptions) error {
	ctx, cancel := context.WithTimeout(parent, opts.timeout)
	defer cancel()
	since := commentsRequestSince(opts)
	var baseline *commentsEnvelope
	first := true
	for {
		env, data, err := pollCommentsOnce(ctx, c, since)
		if err != nil {
			if parent.Err() != nil {
				return parent.Err()
			}
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		current := env
		if first {
			if err := r.emitCommentsEvent(a, "initial", data); err != nil {
				return err
			}
		} else if commentsWaitRelevant(baseline, opts.hasSince, env) {
			if err := r.emitCommentsEvent(a, commentsEventName(baseline, env), data); err != nil {
				return err
			}
		}
		first = false
		baseline = &current
		if env.Cursor != "" {
			since = &current.Cursor
		}
		if err := commentsSleep(ctx); err != nil {
			if parent.Err() != nil {
				return parent.Err()
			}
			return nil
		}
	}
}

func pollCommentsOnce(ctx context.Context, c *transport.Client, since *string) (commentsEnvelope, json.RawMessage, error) {
	data, err := c.Request(ctx, "POST", "/api/comments/poll", map[string]any{"since": since})
	if err != nil {
		return commentsEnvelope{}, nil, err
	}
	env, err := decodeCommentsEnvelope(data)
	if err != nil {
		return commentsEnvelope{}, nil, err
	}
	return env, data, nil
}

// commentsWaitRelevant compares the wake fields against the baseline: cursor,
// generation, epoch, requiresGrant, and activeGrant. A reset always wakes a
// supplied --since immediately (even when the delta is empty: the caller
// needs the reset event) and wakes any established baseline even when a
// malformed remote repeats the same cursor. The very first no-since response
// without a reset only counts when it carries a non-empty delta; an empty or
// reset-only first response establishes the baseline and keeps waiting.
func commentsWaitRelevant(baseline *commentsEnvelope, hasSince bool, env commentsEnvelope) bool {
	if env.Reset && (baseline != nil || hasSince) {
		return true
	}
	if baseline == nil {
		return len(env.Comments) > 0
	}
	return env.Cursor != baseline.Cursor ||
		env.DocGeneration != baseline.DocGeneration ||
		env.ControlEpoch != baseline.ControlEpoch ||
		env.RequiresGrant != baseline.RequiresGrant ||
		!sameActiveGrant(env.ActiveGrant, baseline.ActiveGrant)
}

func commentsEventName(baseline *commentsEnvelope, env commentsEnvelope) string {
	if env.Reset {
		return "reset"
	}
	if env.RequiresGrant != baseline.RequiresGrant ||
		env.ControlEpoch != baseline.ControlEpoch ||
		env.DocGeneration != baseline.DocGeneration ||
		!sameActiveGrant(env.ActiveGrant, baseline.ActiveGrant) {
		return "control"
	}
	return "change"
}

func commentsSleep(ctx context.Context) error {
	timer := time.NewTimer(commentsPollInterval)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func commentsTimeout(timeout time.Duration) error {
	return &failure{code: "COMMENTS_TIMEOUT", message: fmt.Sprintf(
		"comments wait timed out after %s before any change (COMMENTS_TIMEOUT)", timeout)}
}

func (r Runner) emitCommentsEvent(a *parse.Result, event string, data json.RawMessage) error {
	if a.Booleans["json"] {
		return json.NewEncoder(r.Out).Encode(struct {
			Event    string          `json:"event"`
			Envelope json.RawMessage `json:"envelope"`
		}{Event: event, Envelope: data})
	}
	env, err := decodeCommentsEnvelope(data)
	if err != nil {
		return err
	}
	return r.text(fmt.Sprintf("[%s] %s", event, commentsSummary(env)))
}

// commentLifecycle posts ack/address with the caller-provided generation and
// sequence guards. There is no auto-refresh: stale 409s surface as errors.
func (r Runner) commentLifecycle(ctx context.Context, c *transport.Client, a *parse.Result, opts commentsOptions) error {
	path, verb := "/api/comments/ack", "Acknowledged comment"
	if opts.action == "address" {
		path, verb = "/api/comments/address", "Addressed comment"
	}
	data, err := c.Request(ctx, "POST", path, map[string]any{
		"id":                    opts.id,
		"expectedDocGeneration": opts.generation,
		"expectedSeq":           opts.seq,
	})
	if err != nil {
		return err
	}
	if a.Booleans["json"] {
		return r.output(data)
	}
	return r.text(fmt.Sprintf("%s %s (generation %s, expected seq %d)", verb, opts.id, opts.generation, opts.seq))
}
