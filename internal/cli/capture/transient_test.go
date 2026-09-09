package capture

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestTransientValidationAndCommittedIsolation(t *testing.T) {
	invalid := []any{
		"invalid active envelope",
		map[string]any{"command": map[string]any{"type": "unknown"}, "progress": .5},
		map[string]any{"command": map[string]any{"type": 12}, "progress": .5},
		map[string]any{"command": stroke(), "progress": "invalid"},
		map[string]any{"command": stroke(), "progress": 1.1},
		map[string]any{"command": stroke()},
		map[string]any{"command": map[string]any{"type": "stroke", "points": "invalid"}, "progress": .5},
		map[string]any{"command": map[string]any{"type": "rect", "layer": "paint", "color": "#ffffff", "opacity": 1, "x": 90, "y": 0, "width": 20, "height": 10}, "progress": .5},
		map[string]any{"command": map[string]any{"type": "ellipse", "layer": "paint", "color": "#ffffff", "opacity": -1, "x": 0, "y": 0, "width": 10, "height": 10}, "progress": .5},
	}
	for _, field := range []string{"active", "playback"} {
		for _, active := range invalid {
			raw := snapshotWith(t, func(s, d map[string]any) {
				if field == "active" {
					s[field] = active
				} else {
					s[field] = map[string]any{"active": active}
				}
			})
			if _, err := validateSnapshot(raw, Options{}); err == nil {
				t.Fatalf("preview accepted malformed %s: %s", field, raw)
			}
			data, err := validateSnapshot(raw, Options{Committed: true})
			if err != nil || data.Active != nil {
				t.Fatalf("export must ignore %s before decoding it: %v", field, err)
			}
		}
	}
}

func TestNonDrawingTransientsNeverReachRenderer(t *testing.T) {
	for _, kind := range []string{"fill", "layer.add", "layer.update"} {
		raw := snapshotWith(t, func(s, d map[string]any) {
			// Capture renders committed pixels for these commands. It does not
			// interpret their properties or run a second session reducer.
			s["playback"] = map[string]any{"active": map[string]any{
				"command": map[string]any{"type": kind, "points": "unused", "opacity": "unused"}, "progress": "unused",
			}}
		})
		data, err := validateSnapshot(raw, Options{})
		if err != nil || data.Active != nil {
			t.Fatalf("%s must leave committed pixels intact: %v", kind, err)
		}
	}
}

func TestCommittedCaptureRetainsSafetyBudgets(t *testing.T) {
	for _, change := range []func(map[string]any, map[string]any){
		func(s, d map[string]any) { d["width"] = 5000 },
		func(s, d map[string]any) { d["layers"] = make([]any, 25) },
		func(s, d map[string]any) { d["marks"] = make([]any, 3001) },
		func(s, d map[string]any) { m := stroke(); m["points"] = "invalid"; d["marks"] = []any{m} },
	} {
		raw := snapshotWith(t, func(s, d map[string]any) {
			s["playback"] = map[string]any{"active": "ignored"}
			change(s, d)
		})
		if _, err := validateSnapshot(raw, Options{Committed: true}); err == nil {
			t.Fatal("export accepted malformed committed document")
		}
	}
	if _, err := validateSnapshot(json.RawMessage(strings.Repeat(" ", maxSnapshotBytes+1)), Options{Committed: true}); err == nil {
		t.Fatal("export accepted oversized snapshot")
	}
	raw := contractSnapshots(t)["fill"].Raw
	if _, err := validateSnapshot(raw, Options{Committed: true, Scale: 16}); err == nil {
		t.Fatal("export accepted excessive output pixels")
	}
}

func TestRenderedTransientCountsTowardPointBudget(t *testing.T) {
	raw := snapshotWith(t, func(s, d map[string]any) {
		m := stroke()
		points := make([][]float64, 2000)
		for i := range points {
			points[i] = []float64{10, 20}
		}
		m["points"] = points
		marks := make([]any, 75)
		for i := range marks {
			marks[i] = m
		}
		d["marks"] = marks
		s["playback"] = map[string]any{"active": map[string]any{"command": stroke(), "progress": .5}}
	})
	if _, err := validateSnapshot(raw, Options{}); err == nil || !strings.Contains(err.Error(), "total stroke points") {
		t.Fatal("preview must count active points with committed points", err)
	}
	if _, err := validateSnapshot(raw, Options{Committed: true}); err != nil {
		t.Fatal("committed document fits the point budget", err)
	}
}
