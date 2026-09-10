package cli

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Response models for the actual /api/comments contract (see
// src/direction/feedback/store.mjs, grant.mjs, and src/transport/comments.mjs).
// JSON commands output the raw server envelope so rich comment fields
// (cursor, artRevision, timestamps, request) are preserved byte-faithfully.

// commentsRect is the anchored region in document coordinates; null means
// the whole canvas.
type commentsRect struct {
	X      int64 `json:"x"`
	Y      int64 `json:"y"`
	Width  int64 `json:"width"`
	Height int64 `json:"height"`
}

// commentsLayer mirrors a visible-layer snapshot entry; visibleLayers is a
// required array and empty when nothing is visible.
type commentsLayer struct {
	ID      string  `json:"id"`
	Opacity float64 `json:"opacity"`
}

// commentsGrant mirrors the active control grant object or null.
type commentsGrant struct {
	DocGeneration string `json:"docGeneration"`
	ControlEpoch  int64  `json:"controlEpoch"`
	GrantToken    string `json:"grantToken"`
}

type commentRecord struct {
	ID             string          `json:"id"`
	Number         int             `json:"number"`
	Seq            int64           `json:"seq"`
	Text           string          `json:"text"`
	Rect           json.RawMessage `json:"rect"`
	Status         string          `json:"status"`
	Cursor         int64           `json:"cursor"`
	ArtRevision    *int64          `json:"artRevision"`
	At             string          `json:"at"`
	AcknowledgedAt *string         `json:"acknowledgedAt"`
	AddressedAt    *string         `json:"addressedAt"`
	ResolvedAt     *string         `json:"resolvedAt"`
	VisibleLayers  []commentsLayer `json:"visibleLayers"`
	Request        json.RawMessage `json:"request"`
}

// commentsEnvelope is the shared envelope for /api/comments and
// /api/comments/poll. controlEpoch is an integer; activeGrant is an object
// or null. It carries no document payload.
type commentsEnvelope struct {
	Cursor        string          `json:"cursor"`
	Comments      []commentRecord `json:"comments"`
	Reset         bool            `json:"reset"`
	DocGeneration string          `json:"docGeneration"`
	ControlEpoch  int64           `json:"controlEpoch"`
	RequiresGrant bool            `json:"requiresGrant"`
	ActiveGrant   *commentsGrant  `json:"activeGrant"`
	Heartbeat     *struct {
		LastSeenAt *string `json:"lastSeenAt"`
	} `json:"heartbeat"`
}

func decodeCommentsEnvelope(data json.RawMessage) (commentsEnvelope, error) {
	var env commentsEnvelope
	if err := json.Unmarshal(data, &env); err != nil {
		return env, fmt.Errorf("invalid comments envelope: %w", err)
	}
	if env.Comments == nil {
		return env, fmt.Errorf("invalid comments envelope: comments array is required")
	}
	if err := validateCommentRecords(env.Comments); err != nil {
		return env, fmt.Errorf("invalid comments envelope: %w", err)
	}
	return env, nil
}

// validateCommentRecords enforces the current comment contract shared by the
// snapshot and envelope decoders: every record carries a nonnegative
// artRevision, visibleLayers, and a rect (explicit null means the whole
// canvas).
func validateCommentRecords(comments []commentRecord) error {
	for i := range comments {
		c := &comments[i]
		if c.ArtRevision == nil || *c.ArtRevision < 0 {
			return fmt.Errorf("comment %d requires a nonnegative artRevision", c.Number)
		}
		if c.VisibleLayers == nil {
			return fmt.Errorf("comment %d requires visibleLayers", c.Number)
		}
		if len(c.Rect) == 0 {
			return fmt.Errorf("comment %d requires rect (use null for the whole canvas)", c.Number)
		}
	}
	return nil
}

func sameActiveGrant(a, b *commentsGrant) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func commentsRectText(raw json.RawMessage) string {
	if string(raw) == "null" {
		return "whole canvas"
	}
	var rect commentsRect
	if err := json.Unmarshal(raw, &rect); err != nil {
		return strings.TrimSpace(string(raw))
	}
	return fmt.Sprintf("(%d,%d %dx%d)", rect.X, rect.Y, rect.Width, rect.Height)
}

func commentsLayersText(layers []commentsLayer) string {
	if len(layers) == 0 {
		return "no visible layers"
	}
	parts := make([]string, len(layers))
	for i, layer := range layers {
		parts[i] = fmt.Sprintf("%s @%g", layer.ID, layer.Opacity)
	}
	return "layers " + strings.Join(parts, ", ")
}

// commentLines renders one concise line per comment with the identifiers and
// guards needed for follow-up wait/ack/address calls.
func commentLines(comments []commentRecord) []string {
	lines := make([]string, 0, len(comments))
	for _, c := range comments {
		lines = append(lines, fmt.Sprintf("  #%d [%s] (id %s, seq %d) %s (%s, %s)",
			c.Number, c.Status, c.ID, c.Seq, c.Text, commentsRectText(c.Rect), commentsLayersText(c.VisibleLayers)))
	}
	return lines
}

// formatCommentsRecords renders snapshot comment records without an envelope
// summary, for status and playback wait/watch output.
func formatCommentsRecords(comments []commentRecord) string {
	if len(comments) == 0 {
		return "No comments."
	}
	lines := append([]string{fmt.Sprintf("Comments (%d):", len(comments))}, commentLines(comments)...)
	return strings.Join(lines, "\n")
}

func commentsSummary(env commentsEnvelope) string {
	summary := fmt.Sprintf("cursor %s, %d comment(s), generation %s, epoch %d",
		env.Cursor, len(env.Comments), env.DocGeneration, env.ControlEpoch)
	if env.RequiresGrant {
		summary += ", grant required"
	}
	if env.ActiveGrant != nil {
		summary += fmt.Sprintf(", grant %s (generation %s, epoch %d)",
			env.ActiveGrant.GrantToken, env.ActiveGrant.DocGeneration, env.ActiveGrant.ControlEpoch)
	}
	if env.Reset {
		summary += ", reset"
	}
	return summary
}

// formatCommentsText renders the concise human listing with the identifiers
// and guards needed for follow-up wait/ack/address calls.
func formatCommentsText(env commentsEnvelope) string {
	head := fmt.Sprintf("Comments: %d - %s", len(env.Comments), commentsSummary(env))
	if len(env.Comments) == 0 {
		return head
	}
	return strings.Join(append([]string{head}, commentLines(env.Comments)...), "\n")
}
