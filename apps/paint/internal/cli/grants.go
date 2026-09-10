package cli

import (
	"encoding/json"
	"strconv"
	"strings"
	"unicode"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/parse"
)

// Explicit mutation context flags (paint-2u2.5): --generation STRING and
// --epoch N are required on every guarded mutation and forward as
// expectedDocGeneration and epoch; --grant TOKEN is optional and forwards as
// grantToken. Nothing is ever read, refreshed, or supplied automatically;
// the CLI never claims source 'human'.

// grantEligibleCommands lists the guarded mutations that require context
// flags. Read-only commands, pause, speed, and the read-only layer list
// never accept them.
var grantEligibleCommands = map[string]bool{
	"stroke": true, "rect": true, "ellipse": true, "fill": true, "layer": true,
	"submit": true, "load": true, "resume": true, "step": true, "finish": true, "clear": true,
	"undo": true, "redo": true, "new": true,
}

// grantContext carries explicitly supplied mutation context flags, validated
// before any I/O. Context is mandatory for guarded mutations.
type grantContext struct {
	generation string
	epoch      int64
	grantToken string
}

func hasGrantFlags(a *parse.Result) bool {
	if _, ok := a.Flags["generation"]; ok {
		return true
	}
	if _, ok := a.Flags["epoch"]; ok {
		return true
	}
	_, ok := a.Flags["grant"]
	return ok
}

// parseGrantFlags validates the required context flags strictly: generation
// and epoch must both be supplied, optional grant requires both, strings are
// nonempty and at most 80 characters without control characters, and epoch
// is a decimal integer in 0..9007199254740991.
func parseGrantFlags(a *parse.Result) (grantContext, error) {
	_, hasGeneration := a.Flags["generation"]
	_, hasEpoch := a.Flags["epoch"]
	if !hasGeneration && !hasEpoch {
		return grantContext{}, usage("--generation and --epoch are required for this mutation")
	}
	if hasGeneration != hasEpoch {
		return grantContext{}, usage("--generation and --epoch must be supplied together")
	}
	generation, err := parseGrantString("--generation", value(a, "generation", ""))
	if err != nil {
		return grantContext{}, err
	}
	epoch, err := parseGrantEpoch(value(a, "epoch", ""))
	if err != nil {
		return grantContext{}, err
	}
	token := ""
	if _, hasGrant := a.Flags["grant"]; hasGrant {
		token, err = parseGrantString("--grant", value(a, "grant", ""))
		if err != nil {
			return grantContext{}, err
		}
	}
	return grantContext{generation: generation, epoch: epoch, grantToken: token}, nil
}

// applyTo merges the explicit context into a JSON body map; grantToken is
// added only when supplied.
func (g grantContext) applyTo(body map[string]any) {
	body["expectedDocGeneration"] = g.generation
	body["epoch"] = g.epoch
	if g.grantToken != "" {
		body["grantToken"] = g.grantToken
	}
}

func parseGrantString(flag, raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", usage("%s requires a non-empty string", flag)
	}
	if len(trimmed) > 80 {
		return "", usage("%s exceeds 80 characters", flag)
	}
	if strings.ContainsFunc(trimmed, unicode.IsControl) {
		return "", usage("%s contains control characters", flag)
	}
	return trimmed, nil
}

// parseGrantEpoch accepts a plain decimal integer within the JSON-safe range.
func parseGrantEpoch(raw string) (int64, error) {
	if raw == "" {
		return 0, usage("--epoch requires a decimal integer")
	}
	if raw[0] == '+' || raw[0] == '-' {
		return 0, usage("--epoch must be a decimal integer in 0..9007199254740991")
	}
	epoch, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || epoch < 0 || epoch > 9007199254740991 {
		return 0, usage("--epoch must be a decimal integer in 0..9007199254740991")
	}
	return epoch, nil
}

// prepareGrantFlags validates required context flags for an eligible command
// before any file or network I/O. The read-only layer list rejects any
// context flags entirely; bare layer is rejected later as incomplete.
func prepareGrantFlags(command string, a *parse.Result, j *invocation) error {
	if !grantEligibleCommands[command] {
		return nil
	}
	if command == "layer" && len(a.Positionals) > 0 && a.Positionals[0] == "list" {
		if hasGrantFlags(a) {
			return usage("layer list rejects --generation, --epoch, and --grant")
		}
		return nil
	}
	grant, err := parseGrantFlags(a)
	if err != nil {
		return err
	}
	j.grant = grant
	return nil
}

// projectLoadBody wraps the raw project document in the guarded load
// envelope POSTed to /api/project:
//
//	{project: <raw>, source: 'agent', expectedDocGeneration, epoch, grantToken?}
//
// The required generation and epoch are added outside the project wrapper;
// grantToken is added only when --grant is supplied. The project payload
// stays byte-faithful; transient metadata inside it is ignored by the
// project validator.
func projectLoadBody(data []byte, grant grantContext) (map[string]any, error) {
	var probe map[string]any
	if err := json.Unmarshal(data, &probe); err != nil || probe == nil {
		return nil, usage("load requires a JSON project object")
	}
	body := map[string]any{"project": json.RawMessage(data), "source": "agent"}
	grant.applyTo(body)
	return body, nil
}
