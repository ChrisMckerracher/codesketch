package cli

import (
	"encoding/json"
	"fmt"
	"strings"
)

type snapshot struct {
	InstanceID  string `json:"instanceId"`
	Revision    int64  `json:"revision"`
	ArtRevision int64  `json:"artRevision"`
	Playback    struct {
		Status    string  `json:"status"`
		Speed     float64 `json:"speed"`
		Remaining int     `json:"remaining"`
		Active    *struct {
			Progress float64 `json:"progress"`
			Command  struct {
				Type string `json:"type"`
			} `json:"command"`
		} `json:"active"`
	} `json:"playback"`
	History struct {
		Cursor int `json:"cursor"`
		Total  int `json:"total"`
	} `json:"history"`
	Document struct {
		Layers []layerInfo `json:"layers"`
	} `json:"document"`
	Feedback      []note `json:"feedback"`
	PlaybackError string `json:"playbackError"`
	StorageError  string `json:"storageError"`
	Unchanged     bool   `json:"unchanged"`
}

type layerInfo struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Visible bool    `json:"visible"`
	Opacity float64 `json:"opacity"`
}
type note struct {
	ID     string `json:"id"`
	Text   string `json:"text"`
	Cursor int    `json:"cursor"`
	At     string `json:"at"`
}

func decodeSnapshot(data json.RawMessage) (snapshot, error) {
	var s snapshot
	if err := json.Unmarshal(data, &s); err != nil {
		return s, fmt.Errorf("invalid studio snapshot: %w", err)
	}
	if !s.Unchanged && (s.InstanceID == "" || (s.Playback.Status != "idle" && s.Playback.Status != "paused" && s.Playback.Status != "playing")) {
		return s, fmt.Errorf("studio snapshot is missing session identity or playback state")
	}
	if s.Feedback == nil {
		s.Feedback = []note{}
	}
	if s.Document.Layers == nil {
		s.Document.Layers = []layerInfo{}
	}
	return s, nil
}

func formatStatus(s snapshot) string {
	active := ""
	if a := s.Playback.Active; a != nil {
		active = fmt.Sprintf(", active: %s @ %.0f%%", a.Command.Type, a.Progress*100)
	}
	lines := []string{
		fmt.Sprintf("Instance: %s (revision %d, artRevision %d)", s.InstanceID, s.Revision, s.ArtRevision),
		fmt.Sprintf("Playback: %s (speed: %gx, remaining: %d%s)", s.Playback.Status, s.Playback.Speed, s.Playback.Remaining, active),
		fmt.Sprintf("History: cursor %d / %d marks", s.History.Cursor, s.History.Total),
		fmt.Sprintf("Layers: %d layer(s)", len(s.Document.Layers)),
		fmt.Sprintf("Feedback: %d note(s)", len(s.Feedback)),
	}
	if len(s.Feedback) > 0 {
		lines = append(lines, "Latest feedback: "+s.Feedback[len(s.Feedback)-1].Text)
	}
	if s.PlaybackError != "" {
		lines = append(lines, "Playback error: "+s.PlaybackError)
	}
	if s.StorageError != "" {
		lines = append(lines, "Storage error: "+s.StorageError)
	}
	return strings.Join(lines, "\n")
}

func formatFeedback(notes []note) string {
	if len(notes) == 0 {
		return "No feedback notes."
	}
	lines := []string{fmt.Sprintf("Feedback notes (%d):", len(notes))}
	for i, n := range notes {
		lines = append(lines, fmt.Sprintf("  [%d] (cursor %d, at %s) %s", i+1, n.Cursor, n.At, n.Text))
	}
	return strings.Join(lines, "\n")
}

func formatLayers(layers []layerInfo) string {
	if len(layers) == 0 {
		return "No layers registered."
	}
	lines := []string{fmt.Sprintf("Layers (%d):", len(layers))}
	for _, l := range layers {
		visibility := "hidden"
		if l.Visible {
			visibility = "visible"
		}
		lines = append(lines, fmt.Sprintf("  %s: %q (%s, opacity: %g)", l.ID, l.Name, visibility, l.Opacity))
	}
	return strings.Join(lines, "\n")
}
