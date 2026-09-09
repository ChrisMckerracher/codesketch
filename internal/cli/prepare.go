package cli

import (
	"time"

	"github.com/ChrisMckerracher/codesketch/internal/cli/capture"
	"github.com/ChrisMckerracher/codesketch/internal/cli/parse"
)

// A prepared invocation contains all validated flag values before any I/O.
type invocation struct {
	path              string
	body              any
	label             string
	capture           capture.Options
	timeout, interval time.Duration
}

func prepare(command string, a *parse.Result) (invocation, error) {
	j := invocation{path: "/api/state"}
	switch command {
	case "stroke", "rect", "ellipse", "fill", "layer":
		c, err := drawing(command, a)
		if err != nil {
			return j, err
		}
		if c != nil {
			j.path = "/api/commands"
			j.body = batch([]map[string]any{c}, a)
			j.label = drawLabel(c)
		}
		return j, nil
	case "submit", "save", "load":
		if err := count(a, 1, 1, command+" FILE"); err != nil {
			return j, err
		}
		if command == "save" && a.Positionals[0] == "-" {
			return j, usage("save requires a destination file")
		}
	case "view", "export":
		minimum := 0
		if command == "export" {
			minimum = 1
		}
		if err := count(a, minimum, 1, command+" FILE [--crop x,y,w,h] [--scale N]"); err != nil {
			return j, err
		}
		if len(a.Positionals) == 1 {
			j.capture.Output = a.Positionals[0]
			if j.capture.Output == "-" {
				return j, usage("PNG output requires a file path")
			}
		}
		j.capture.Committed = command == "export"
		j.capture.Browser = a.Flags["browser"]
		if raw, ok := a.Flags["crop"]; ok {
			c, err := parse.Crop(raw)
			if err != nil {
				return j, usage("%s", err)
			}
			if c.X+c.Width > 1000 || c.Y+c.Height > 700 {
				return j, usage("crop exceeds canvas")
			}
			j.capture.Crop = &capture.Crop{X: c.X, Y: c.Y, Width: c.Width, Height: c.Height}
		}
		scale, err := number(a, "scale", "1", 0.1, 10)
		if err != nil {
			return j, err
		}
		j.capture.Scale = scale
	case "speed":
		if err := count(a, 0, 1, "speed NUMBER"); err != nil {
			return j, err
		}
		if len(a.Positionals) == 1 {
			if _, ok := a.Flags["speed"]; ok {
				return j, usage("speed provided via both flag and argument")
			}
			a.Flags["speed"] = a.Positionals[0]
		}
		n, err := number(a, "speed", "", 0.25, 8)
		if err != nil {
			return j, err
		}
		j.path, j.body, j.label = "/api/control", map[string]any{"action": "speed", "speed": n}, "Playback speed updated"
	case "feedback":
		if len(a.Positionals) != 0 {
			text, err := feedbackText(a.Positionals)
			if err != nil {
				return j, err
			}
			j.path, j.body, j.label = "/api/feedback", map[string]string{"text": text}, "Feedback recorded"
		}
	default:
		if err := count(a, 0, 0, command+" [flags]"); err != nil {
			return j, err
		}
		switch command {
		case "pause", "resume", "step", "clear", "undo", "redo", "new":
			j.path, j.body, j.label = "/api/control", map[string]string{"action": command}, command+" completed"
		case "wait", "watch":
			n, err := number(a, "timeout", "30", 0.001, 3600)
			if err != nil {
				return j, err
			}
			j.timeout = time.Duration(n * float64(time.Second))
			j.interval = 100 * time.Millisecond
			if command == "watch" {
				n, err := number(a, "interval", "400", 50, 10000)
				if err != nil {
					return j, err
				}
				j.interval = time.Duration(n * float64(time.Millisecond))
			}
		}
	}
	if v, ok := a.Flags["browser"]; ok && v == "" {
		return j, usage("--browser requires a non-empty executable path")
	}
	return j, nil
}

func batch(commands any, a *parse.Result) map[string]any {
	return map[string]any{"commands": commands, "replace": a.Booleans["replace"], "play": !a.Booleans["paused"]}
}
