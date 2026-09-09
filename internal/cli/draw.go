package cli

import (
	"fmt"
	"strings"
	"unicode/utf16"

	"github.com/ChrisMckerracher/codesketch/internal/cli/parse"
)

func drawing(command string, a *parse.Result) (map[string]any, error) {
	if command == "layer" {
		return layer(a)
	}
	c := map[string]any{"type": command}
	if command == "fill" {
		if err := count(a, 0, 1, "fill COLOR"); err != nil {
			return nil, err
		}
		raw := a.Flags["color"]
		if len(a.Positionals) == 1 {
			if _, ok := a.Flags["color"]; ok {
				return nil, usage("color provided via both flag and argument")
			}
			raw = a.Positionals[0]
		}
		color, err := parse.Color(raw)
		if err != nil {
			return nil, usage("%s", err)
		}
		c["color"] = color
		return c, nil
	}
	if err := count(a, 0, 0, command+" [flags]"); err != nil {
		return nil, err
	}
	color, err := parse.Color(value(a, "color", "#253d38"))
	if err != nil {
		return nil, usage("%s", err)
	}
	id, err := parse.Identifier(value(a, "layer", "paint"))
	if err != nil {
		return nil, usage("%s", err)
	}
	opacity, err := number(a, "opacity", "1", 0, 1)
	if err != nil {
		return nil, err
	}
	c["color"], c["layer"], c["opacity"] = color, id, opacity
	if command == "stroke" {
		points, err := parse.Points(a.Flags["points"])
		if err != nil {
			return nil, usage("%s", err)
		}
		if len(points) > 2000 {
			return nil, usage("stroke requires 1..2000 points")
		}
		pairs := make([][2]float64, len(points))
		for i, p := range points {
			pairs[i] = [2]float64{p.X, p.Y}
		}
		brush := value(a, "brush", "brush")
		switch brush {
		case "brush", "pencil", "marker", "eraser":
		default:
			return nil, usage("unknown brush %q", brush)
		}
		size, err := number(a, "size", "8", 1, 100)
		if err != nil {
			return nil, err
		}
		c["points"], c["brush"], c["size"] = pairs, brush, size
	} else {
		for _, spec := range []struct {
			name      string
			low, high float64
		}{{"x", 0, 1000}, {"y", 0, 700}, {"width", 1, 1000}, {"height", 1, 700}} {
			n, err := number(a, spec.name, "", spec.low, spec.high)
			if err != nil {
				return nil, err
			}
			c[spec.name] = n
		}
		if c["x"].(float64)+c["width"].(float64) > 1000 || c["y"].(float64)+c["height"].(float64) > 700 {
			return nil, usage("shape exceeds canvas")
		}
	}
	return c, nil
}

func layer(a *parse.Result) (map[string]any, error) {
	if len(a.Positionals) == 0 {
		return nil, usage("layer requires list, add, or update")
	}
	sub := a.Positionals[0]
	allowed := "json help h"
	switch sub {
	case "list":
		if err := count(a, 1, 1, "layer list"); err != nil {
			return nil, err
		}
	case "add":
		allowed += " paused replace"
		if err := count(a, 3, 3, "layer add ID NAME"); err != nil {
			return nil, err
		}
	case "update":
		allowed += " paused replace name opacity visible"
		if err := count(a, 2, 2, "layer update ID [--name N] [--opacity O] [--visible true|false]"); err != nil {
			return nil, err
		}
	default:
		return nil, usage("unknown layer subcommand %q", sub)
	}
	for k := range a.Flags {
		if !strings.Contains(" "+allowed+" ", " "+k+" ") {
			return nil, usage("unknown flag --%s for layer %s", k, sub)
		}
	}
	for k := range a.Booleans {
		if !strings.Contains(" "+allowed+" ", " "+k+" ") {
			return nil, usage("unknown flag --%s for layer %s", k, sub)
		}
	}
	if sub == "list" {
		return nil, nil
	}
	id, err := parse.Identifier(a.Positionals[1])
	if err != nil {
		return nil, usage("%s", err)
	}
	c := map[string]any{"type": "layer." + sub, "id": id}
	if sub == "add" {
		name, err := label(a.Positionals[2], "layer name", 80)
		if err != nil {
			return nil, err
		}
		c["name"] = name
	} else {
		if raw, ok := a.Flags["name"]; ok {
			name, err := label(raw, "layer name", 80)
			if err != nil {
				return nil, err
			}
			c["name"] = name
		}
		if _, ok := a.Flags["opacity"]; ok {
			n, err := number(a, "opacity", "", 0, 1)
			if err != nil {
				return nil, err
			}
			c["opacity"] = n
		}
		if raw, ok := a.Flags["visible"]; ok {
			b, err := parse.Boolean(raw, "visible")
			if err != nil {
				return nil, usage("%s", err)
			}
			c["visible"] = b
		}
		if len(c) == 2 {
			return nil, usage("layer update requires at least one property")
		}
	}
	return c, nil
}

func label(raw, name string, limit int) (string, error) {
	if strings.TrimSpace(raw) == "" || len(utf16.Encode([]rune(raw))) > limit {
		return "", usage("%s requires 1..%d characters", name, limit)
	}
	return strings.TrimSpace(raw), nil
}

func drawLabel(c map[string]any) string {
	if c["type"] == "stroke" {
		return fmt.Sprintf("Queued stroke (%d points on %q)", len(c["points"].([][2]float64)), c["layer"])
	}
	return fmt.Sprintf("Queued %s", c["type"])
}
