package capture

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
)

const (
	maxSnapshotBytes = 8 << 20
	maxPNGBytes      = 64 << 20
	maxPixels        = 16_000_000
)

var colorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
var idPattern = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]{0,39}$`)

type document struct {
	Width      int     `json:"width"`
	Height     int     `json:"height"`
	Background string  `json:"background"`
	Layers     []layer `json:"layers"`
	Marks      []mark  `json:"marks"`
}

type layer struct {
	ID      string   `json:"id"`
	Visible *bool    `json:"visible"`
	Opacity *float64 `json:"opacity"`
}

type mark struct {
	Type    string       `json:"type"`
	Layer   string       `json:"layer"`
	Color   string       `json:"color"`
	Opacity *float64     `json:"opacity"`
	Points  [][]*float64 `json:"points,omitempty"`
	Size    *float64     `json:"size,omitempty"`
	Brush   string       `json:"brush,omitempty"`
	X       *float64     `json:"x,omitempty"`
	Y       *float64     `json:"y,omitempty"`
	Width   *float64     `json:"width,omitempty"`
	Height  *float64     `json:"height,omitempty"`
}

type activeMark struct {
	Command  mark     `json:"command"`
	Progress *float64 `json:"progress"`
}

type captureData struct {
	Document   document    `json:"document"`
	Active     *activeMark `json:"active"`
	Crop       Crop        `json:"crop"`
	Width      int         `json:"width"`
	Height     int         `json:"height"`
	InstanceID string      `json:"-"`
	Revision   int64       `json:"-"`
}

func validateSnapshot(raw json.RawMessage, options Options) (captureData, error) {
	var data captureData
	if len(raw) == 0 || len(raw) > maxSnapshotBytes {
		return data, errors.New("snapshot must contain at most 8 MiB")
	}
	var envelope struct {
		Document   json.RawMessage `json:"document"`
		InstanceID string          `json:"instanceId"`
		Revision   int64           `json:"revision"`
		Active     *activeMark     `json:"active"`
		Playback   struct {
			Active *activeMark `json:"active"`
		} `json:"playback"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return data, fmt.Errorf("invalid snapshot: %w", err)
	}
	docJSON := envelope.Document
	if len(docJSON) == 0 {
		docJSON = raw
	}
	if err := json.Unmarshal(docJSON, &data.Document); err != nil {
		return data, fmt.Errorf("invalid document: %w", err)
	}
	data.InstanceID, data.Revision = envelope.InstanceID, envelope.Revision
	if len(data.InstanceID) > 200 || data.Revision < 0 || data.Revision > 9_007_199_254_740_991 {
		return data, errors.New("invalid snapshot identity or revision")
	}
	data.Active = envelope.Playback.Active
	if data.Active == nil {
		data.Active = envelope.Active
	}
	if err := data.validateDocument(); err != nil {
		return data, err
	}
	if options.Committed {
		data.Active = nil
	}
	if err := data.validateOptions(options); err != nil {
		return data, err
	}
	return data, nil
}

func (data *captureData) validateDocument() error {
	doc := data.Document
	if doc.Width < 1 || doc.Height < 1 || doc.Width > 4096 || doc.Height > 4096 || doc.Width*doc.Height > maxPixels {
		return errors.New("source canvas exceeds dimension or pixel budget")
	}
	if !colorPattern.MatchString(doc.Background) || doc.Layers == nil || doc.Marks == nil || len(doc.Layers) < 1 || len(doc.Layers) > 24 || len(doc.Marks) > 3000 {
		return errors.New("invalid document background, layers or marks budget")
	}
	layers := make(map[string]bool)
	for _, layer := range doc.Layers {
		if !idPattern.MatchString(layer.ID) || layers[layer.ID] || layer.Visible == nil || !numberIn(layer.Opacity, 0, 1) {
			return errors.New("invalid or duplicate layer")
		}
		layers[layer.ID] = true
	}
	points := 0
	for _, mark := range doc.Marks {
		if err := validateMark(mark, doc, layers); err != nil {
			return err
		}
		points += len(mark.Points)
	}
	if data.Active != nil {
		if len(doc.Marks) == 3000 || !numberIn(data.Active.Progress, 0, 1) {
			return errors.New("invalid active progress or mark budget")
		}
		if err := validateMark(data.Active.Command, doc, layers); err != nil {
			return err
		}
		points += len(data.Active.Command.Points)
	}
	if points > 150000 {
		return errors.New("snapshot exceeds total stroke points budget")
	}
	return nil
}

func validateMark(m mark, doc document, layers map[string]bool) error {
	if !layers[m.Layer] || !colorPattern.MatchString(m.Color) || !numberIn(m.Opacity, 0, 1) {
		return errors.New("invalid mark layer, color or opacity")
	}
	if m.Type == "stroke" {
		if len(m.Points) < 1 || len(m.Points) > 2000 || !numberIn(m.Size, 1, 100) {
			return errors.New("invalid stroke size or points budget")
		}
		switch m.Brush {
		case "brush", "pencil", "marker", "eraser":
		default:
			return errors.New("invalid brush")
		}
		for _, p := range m.Points {
			if len(p) != 2 || !numberIn(p[0], 0, float64(doc.Width)) || !numberIn(p[1], 0, float64(doc.Height)) {
				return errors.New("stroke points must be bounded coordinate pairs")
			}
		}
		return nil
	}
	if m.Type != "rect" && m.Type != "ellipse" {
		return errors.New("invalid mark type")
	}
	if len(m.Points) != 0 || !numberIn(m.X, 0, float64(doc.Width)) || !numberIn(m.Y, 0, float64(doc.Height)) || !numberIn(m.Width, 1, float64(doc.Width)) || !numberIn(m.Height, 1, float64(doc.Height)) {
		return errors.New("invalid shape geometry")
	}
	if *m.X+*m.Width > float64(doc.Width) || *m.Y+*m.Height > float64(doc.Height) {
		return errors.New("shape exceeds canvas")
	}
	return nil
}
