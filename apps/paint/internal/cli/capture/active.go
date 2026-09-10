package capture

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// Preview follows the canonical renderer: only strokes and shapes contribute
// transient pixels. Fill and layer commands affect artwork upon session commit.
// Their unused properties never enter the renderer or a second reducer here.
func previewActive(raw json.RawMessage) (*activeMark, error) {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, nil
	}
	var envelope struct {
		Command struct {
			Type string `json:"type"`
		} `json:"command"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, fmt.Errorf("invalid active command: %w", err)
	}
	switch envelope.Command.Type {
	case "fill", "layer.add", "layer.update":
		return nil, nil
	case "stroke", "rect", "ellipse":
		var active activeMark
		if err := json.Unmarshal(raw, &active); err != nil {
			return nil, fmt.Errorf("invalid active mark: %w", err)
		}
		return &active, nil // Document validation checks geometry and budgets.
	default:
		return nil, fmt.Errorf("unknown active command type %q", envelope.Command.Type)
	}
}
