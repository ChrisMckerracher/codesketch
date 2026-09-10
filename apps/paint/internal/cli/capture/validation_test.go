package capture

import (
	"bytes"
	"encoding/json"
	"image"
	"image/png"
	"math"
	"strings"
	"testing"
)

const testSnapshot = `{"instanceId":"capture-test","revision":0,"playback":{"active":null},"document":{"width":100,"height":80,"background":"#ffffff","layers":[{"id":"paint","visible":true,"opacity":1}],"marks":[]}}`

func snapshotWith(t *testing.T, change func(map[string]any, map[string]any)) json.RawMessage {
	t.Helper()
	var snap map[string]any
	if err := json.Unmarshal([]byte(testSnapshot), &snap); err != nil {
		t.Fatal(err)
	}
	change(snap, snap["document"].(map[string]any))
	raw, err := json.Marshal(snap)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func stroke() map[string]any {
	return map[string]any{"type": "stroke", "layer": "paint", "color": "#ff0000", "opacity": 1, "size": 10, "brush": "brush", "points": [][]float64{{10, 20}, {90, 20}}}
}

func TestSnapshotAndOptions(t *testing.T) {
	raw := snapshotWith(t, func(s, d map[string]any) {
		s["playback"] = map[string]any{"active": map[string]any{"command": stroke(), "progress": .5}}
	})
	for _, committed := range []bool{false, true} {
		got, err := validateSnapshot(raw, Options{Committed: committed, Scale: 2, Crop: &Crop{X: 10, Y: 5, Width: 20, Height: 30}})
		if err != nil {
			t.Fatal(err)
		}
		if got.Width != 40 || got.Height != 60 || got.InstanceID != "capture-test" || got.Revision != 0 || (got.Active == nil) != committed {
			t.Fatalf("unexpected capture: %+v", got)
		}
	}
	got, err := validateSnapshot(json.RawMessage(testSnapshot), Options{})
	if err != nil || got.Width != 100 || got.Height != 80 {
		t.Fatalf("default: %+v %v", got, err)
	}
}

func TestRejectSnapshotBudgetsAndMalformedValues(t *testing.T) {
	tests := map[string]func(map[string]any, map[string]any){
		"canvas":            func(s, d map[string]any) { d["width"] = 5000 },
		"fractional canvas": func(s, d map[string]any) { d["width"] = 1.5 },
		"source pixels":     func(s, d map[string]any) { d["width"] = 4096; d["height"] = 4096 },
		"background":        func(s, d map[string]any) { d["background"] = "url(evil)" },
		"layers missing":    func(s, d map[string]any) { delete(d, "layers") },
		"duplicate layers":  func(s, d map[string]any) { d["layers"] = []any{d["layers"].([]any)[0], d["layers"].([]any)[0]} },
		"layer count":       func(s, d map[string]any) { d["layers"] = make([]any, 25) },
		"marks count":       func(s, d map[string]any) { d["marks"] = make([]any, 3001) },
		"opacity missing":   func(s, d map[string]any) { m := stroke(); delete(m, "opacity"); d["marks"] = []any{m} },
		"brush":             func(s, d map[string]any) { m := stroke(); m["brush"] = "unknown"; d["marks"] = []any{m} },
		"layer":             func(s, d map[string]any) { m := stroke(); m["layer"] = "missing"; d["marks"] = []any{m} },
		"points shape":      func(s, d map[string]any) { m := stroke(); m["points"] = [][]float64{{1, 2, 3}}; d["marks"] = []any{m} },
		"points bounds":     func(s, d map[string]any) { m := stroke(); m["points"] = [][]float64{{-1, 2}}; d["marks"] = []any{m} },
		"points count":      func(s, d map[string]any) { m := stroke(); m["points"] = make([][]float64, 2001); d["marks"] = []any{m} },
		"total points": func(s, d map[string]any) {
			m := stroke()
			p := make([][]float64, 2000)
			for i := range p {
				p[i] = []float64{1, 2}
			}
			m["points"] = p
			marks := make([]any, 76)
			for i := range marks {
				marks[i] = m
			}
			d["marks"] = marks
		},
		"active bounds": func(s, d map[string]any) {
			s["playback"] = map[string]any{"active": map[string]any{"command": stroke(), "progress": 1.1}}
		},
		"active budget": func(s, d map[string]any) {
			marks := make([]any, 3000)
			for i := range marks {
				marks[i] = stroke()
			}
			d["marks"] = marks
			s["playback"] = map[string]any{"active": map[string]any{"command": stroke(), "progress": .5}}
		},
		"document missing":        func(s, d map[string]any) { delete(s, "document") },
		"identity":                func(s, d map[string]any) { s["instanceId"] = false },
		"identity missing":        func(s, d map[string]any) { delete(s, "instanceId") },
		"identity empty":          func(s, d map[string]any) { s["instanceId"] = "" },
		"identity length":         func(s, d map[string]any) { s["instanceId"] = strings.Repeat("i", 201) },
		"revision":                func(s, d map[string]any) { s["revision"] = -1 },
		"revision missing":        func(s, d map[string]any) { delete(s, "revision") },
		"revision null":           func(s, d map[string]any) { s["revision"] = nil },
		"revision fractional":     func(s, d map[string]any) { s["revision"] = 1.5 },
		"playback missing":        func(s, d map[string]any) { delete(s, "playback") },
		"playback null":           func(s, d map[string]any) { s["playback"] = nil },
		"playback active missing": func(s, d map[string]any) { s["playback"] = map[string]any{} },
		"legacy top-level active": func(s, d map[string]any) { s["active"] = s["playback"]; delete(s, "playback") },
	}
	for name, change := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := validateSnapshot(snapshotWith(t, change), Options{}); err == nil {
				t.Fatal("accepted invalid snapshot")
			}
		})
	}
	rawDocument := `{"width":100,"height":80,"background":"#ffffff","layers":[{"id":"paint","visible":true,"opacity":1}],"marks":[]}`
	for _, raw := range []string{"null", "[]", "{}", rawDocument, testSnapshot + "{}", strings.Repeat(" ", maxSnapshotBytes+1)} {
		if _, err := validateSnapshot(json.RawMessage(raw), Options{}); err == nil {
			t.Fatal("accepted invalid JSON or budget")
		}
	}
}

func TestCanonicalPlaybackNullIgnoresTopLevelActive(t *testing.T) {
	raw := snapshotWith(t, func(s, _ map[string]any) {
		s["active"] = map[string]any{"command": stroke(), "progress": .5}
	})
	data, err := validateSnapshot(raw, Options{})
	if err != nil || data.Active != nil {
		t.Fatalf("canonical playback null must never read top-level active: %+v %v", data, err)
	}
	if data.InstanceID != "capture-test" || data.Revision != 0 {
		t.Fatalf("unexpected capture: %+v", data)
	}
}

func TestRejectOptions(t *testing.T) {
	for _, options := range []Options{
		{Scale: math.NaN()}, {Scale: math.Inf(1)}, {Scale: -1}, {Scale: 17}, {Scale: .01},
		{Crop: &Crop{Width: 1, Height: 1, X: -1}}, {Crop: &Crop{Width: 101, Height: 1}}, {Crop: &Crop{Width: 0, Height: 1}}, {Crop: &Crop{Width: 1, Height: math.NaN()}},
		{Output: " "}, {Output: "a\x00b"},
	} {
		if _, err := validateSnapshot(json.RawMessage(testSnapshot), options); err == nil {
			t.Fatalf("accepted %+v", options)
		}
	}
	raw := snapshotWith(t, func(s, d map[string]any) { d["width"] = 2000; d["height"] = 2000 })
	if _, err := validateSnapshot(raw, Options{Scale: 3}); err == nil {
		t.Fatal("accepted output pixel excess")
	}
}

func pngBytes(t *testing.T, width, height int) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, width, height))); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func TestPNGFullValidation(t *testing.T) {
	good := pngBytes(t, 10, 8)
	if err := validatePNG(good, 10, 8); err != nil {
		t.Fatal(err)
	}
	badCRC := bytes.Clone(good)
	badCRC[len(badCRC)-1] ^= 1
	for _, b := range [][]byte{nil, []byte("not png"), good[:33], badCRC, append(bytes.Clone(good), 1), pngBytes(t, 11, 8)} {
		if err := validatePNG(b, 10, 8); err == nil {
			t.Fatal("accepted invalid PNG")
		}
	}
}
