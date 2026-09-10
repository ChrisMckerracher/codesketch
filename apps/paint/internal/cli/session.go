package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/input"
	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/parse"
	"github.com/ChrisMckerracher/codesketch/apps/paint/internal/cli/transport"
)

func (r Runner) execute(ctx context.Context, c *transport.Client, command string, a *parse.Result, j invocation) error {
	switch command {
	case "comments":
		return r.commentsCommand(ctx, c, a, j)
	case "wait", "watch":
		return r.observe(ctx, c, command, a, j)
	case "view", "export":
		return r.picture(ctx, c, a, j)
	case "submit", "load":
		data, err := input.Read(ctx, a.Positionals[0], r.In)
		if err != nil {
			return err
		}
		if !json.Valid(data) {
			return usage("input is not valid JSON")
		}
		if command == "load" {
			body, err := projectLoadBody(data, j.grant)
			if err != nil {
				return err
			}
			j.path, j.body, j.label = "/api/project", body, "Loaded project"
		} else {
			commands, err := submitted(data)
			if err != nil {
				return err
			}
			j.path, j.body, j.label = "/api/commands", batch(commands, a, j.grant), fmt.Sprintf("Queued %d command(s)", len(commands))
		}
	case "save":
		data, err := c.Request(ctx, "GET", "/api/project", nil)
		if err != nil {
			return err
		}
		path, err := input.AtomicWrite(ctx, a.Positionals[0], append(data, '\n'))
		if err != nil {
			return err
		}
		if a.Booleans["json"] {
			return r.output(map[string]string{"path": path})
		}
		return r.text("Saved project to " + path)
	}
	method := "GET"
	if j.body != nil {
		method = "POST"
	}
	data, err := c.Request(ctx, method, j.path, j.body)
	if err != nil {
		return err
	}
	s, err := decodeSnapshot(data)
	if err != nil {
		return err
	}
	if j.body != nil {
		if a.Booleans["json"] {
			return r.output(data)
		}
		return r.text(fmt.Sprintf("%s - playback: %s, %d remaining (revision %d)", j.label, s.Playback.Status, s.Playback.Remaining, s.Revision))
	}
	switch command {
	case "layer":
		if a.Booleans["json"] {
			return r.output(s.Document.Layers)
		}
		return r.text(formatLayers(s.Document.Layers))
	default:
		if a.Booleans["json"] {
			return r.output(data)
		}
		return r.text(formatStatus(s))
	}
}

func submitted(data []byte) ([]json.RawMessage, error) {
	var commands []json.RawMessage
	if strings.HasPrefix(strings.TrimSpace(string(data)), "[") {
		if err := json.Unmarshal(data, &commands); err != nil {
			return nil, usage("invalid commands array: %s", err)
		}
	} else {
		var wrapper struct {
			Commands []json.RawMessage `json:"commands"`
		}
		if err := json.Unmarshal(data, &wrapper); err != nil {
			return nil, usage("submit requires an array or an object with commands")
		}
		commands = wrapper.Commands
	}
	if len(commands) == 0 || len(commands) > 3000 {
		return nil, usage("submit requires 1..3000 commands")
	}
	for _, raw := range commands {
		var c map[string]json.RawMessage
		if err := json.Unmarshal(raw, &c); err != nil || c == nil {
			return nil, usage("each command must be a JSON object")
		}
		var kind string
		if err := json.Unmarshal(c["type"], &kind); err != nil {
			return nil, usage("each command requires a type")
		}
		switch kind {
		case "stroke", "rect", "ellipse", "fill", "layer.add", "layer.update":
		default:
			return nil, usage("unknown command type %q", kind)
		}
	}
	return commands, nil
}
