package cli

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/parse"
)

// Comments subcommand validation. Every check here runs before any I/O:
// bad subcommands, flags, cursor tokens, generations, and sequence numbers
// exit with USAGE without touching the network.

const maxCursorLength = 256

// prepareCommentsOptions validates `paint comments` arguments strictly and
// returns the bounded option set for the requested action.
func prepareCommentsOptions(a *parse.Result) (commentsOptions, error) {
	opts := commentsOptions{action: "list"}
	args := a.Positionals
	if len(args) > 0 {
		opts.action = args[0]
		args = args[1:]
	}
	switch opts.action {
	case "list":
		if len(args) != 0 {
			return opts, usage("usage: paint comments list")
		}
		if commentsHasFlags(a, "since", "timeout", "generation", "seq", "request-id") {
			return opts, usage("comments list rejects --since, --timeout, --generation, --seq, and --request-id")
		}
	case "wait", "watch":
		if len(args) != 0 {
			return opts, usage("usage: paint comments %s [--since CURSOR] [--timeout SECONDS]", opts.action)
		}
		if commentsHasFlags(a, "generation", "seq", "request-id") {
			return opts, usage("comments %s rejects --generation, --seq, and --request-id", opts.action)
		}
		seconds, err := number(a, "timeout", "30", 0.001, 30)
		if err != nil {
			return opts, err
		}
		opts.timeout = time.Duration(seconds * float64(time.Second))
		if raw, ok := a.Flags["since"]; ok {
			cursor, err := parseCommentsCursor(raw)
			if err != nil {
				return opts, usage("%s", err)
			}
			opts.since, opts.hasSince = cursor, true
		}
	case "ack", "address":
		if len(args) != 1 {
			return opts, usage("usage: paint comments %s ID --generation STRING --seq N", opts.action)
		}
		if commentsHasFlags(a, "since", "timeout", "request-id") {
			return opts, usage("comments %s rejects --since, --timeout, and --request-id", opts.action)
		}
		id, err := parseCommentsID(args[0])
		if err != nil {
			return opts, usage("%s", err)
		}
		generation, err := parseCommentsGeneration(value(a, "generation", ""))
		if err != nil {
			return opts, usage("%s", err)
		}
		seq, err := parseCommentsSeq(value(a, "seq", ""))
		if err != nil {
			return opts, usage("%s", err)
		}
		opts.id, opts.generation, opts.seq = id, generation, seq
	case "reply":
		if len(args) != 2 {
			return opts, usage("usage: paint comments reply ID TEXT --generation STRING --seq N --request-id ID")
		}
		if commentsHasFlags(a, "since", "timeout") {
			return opts, usage("comments reply rejects --since and --timeout")
		}
		id, err := parseCommentsID(args[0])
		if err != nil {
			return opts, usage("%s", err)
		}
		if _, err := label(args[1], "reply text", 2000); err != nil {
			return opts, err
		}
		text := args[1]
		generation, err := parseCommentsGeneration(value(a, "generation", ""))
		if err != nil {
			return opts, usage("%s", err)
		}
		seq, err := parseCommentsSeq(value(a, "seq", ""))
		if err != nil {
			return opts, usage("%s", err)
		}
		requestID, err := parseCommentsRequestID(value(a, "request-id", ""))
		if err != nil {
			return opts, usage("%s", err)
		}
		opts.id, opts.text, opts.generation, opts.seq, opts.requestID = id, text, generation, seq, requestID
	default:
		return opts, usage("unknown comments action %q; use list, wait, watch, ack, address, or reply", opts.action)
	}
	return opts, nil
}

func commentsHasFlags(a *parse.Result, names ...string) bool {
	for _, name := range names {
		if _, ok := a.Flags[name]; ok {
			return true
		}
	}
	return false
}

// parseCommentsCursor bounds the opaque follow-up cursor to 1..256 clean bytes.
func parseCommentsCursor(raw string) (string, error) {
	if raw == "" {
		return "", fmt.Errorf("--since requires a cursor token")
	}
	if len(raw) > maxCursorLength {
		return "", fmt.Errorf("--since cursor exceeds %d characters", maxCursorLength)
	}
	if strings.ContainsFunc(raw, unicode.IsControl) {
		return "", fmt.Errorf("--since cursor contains control characters")
	}
	return raw, nil
}

// parseCommentsGeneration validates the stale-write guard string (1..80).
func parseCommentsGeneration(raw string) (string, error) {
	generation := strings.TrimSpace(raw)
	if generation == "" {
		return "", fmt.Errorf("--generation requires the current docGeneration string")
	}
	if len(generation) > 80 {
		return "", fmt.Errorf("--generation exceeds 80 characters")
	}
	if strings.ContainsFunc(generation, unicode.IsControl) {
		return "", fmt.Errorf("--generation contains control characters")
	}
	return generation, nil
}

// parseCommentsSeq validates the positive JSON-safe sequence guard.
func parseCommentsSeq(raw string) (int64, error) {
	if raw == "" {
		return 0, fmt.Errorf("--seq requires a positive integer")
	}
	if raw[0] == '+' || raw[0] == '-' {
		return 0, fmt.Errorf("--seq must be a positive integer")
	}
	seq, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || seq < 1 || seq > 9007199254740991 {
		return 0, fmt.Errorf("--seq must be an integer in 1..9007199254740991")
	}
	return seq, nil
}

// parseCommentsID bounds the comment identifier without interpreting it.
func parseCommentsID(raw string) (string, error) {
	id, err := label(raw, "comment ID", 80)
	if err != nil {
		return "", err
	}
	if strings.ContainsFunc(id, unicode.IsControl) {
		return "", fmt.Errorf("comment ID contains control characters")
	}
	return id, nil
}

func parseCommentsRequestID(raw string) (string, error) {
	requestID, err := label(raw, "--request-id", 80)
	if err != nil {
		return "", err
	}
	if strings.ContainsFunc(requestID, unicode.IsControl) {
		return "", fmt.Errorf("--request-id contains control characters")
	}
	return requestID, nil
}
