package capture

import (
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func browserImage(t *testing.T, raw json.RawMessage, options Options) image.Image {
	t.Helper()
	if os.Getenv("PAINT_BROWSER_TESTS") != "1" {
		t.Skip("set PAINT_BROWSER_TESTS=1 for installed Chromium pixel checks")
	}
	temp := t.TempDir()
	t.Setenv("TMPDIR", temp)
	options.Output = filepath.Join(t.TempDir(), "capture.png")
	got, err := Run(context.Background(), raw, options)
	if err != nil {
		t.Fatal(err)
	}
	assertNoProfiles(t, temp)
	var identity struct {
		InstanceID string `json:"instanceId"`
		Revision   int64  `json:"revision"`
	}
	if err := json.Unmarshal(raw, &identity); err != nil {
		t.Fatal(err)
	}
	if got.Path != options.Output || got.InstanceID != identity.InstanceID || got.Revision != identity.Revision || got.MIMEType != "image/png" {
		t.Fatalf("metadata: %+v", got)
	}
	f, err := os.Open(got.Path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	im, err := png.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	if im.Bounds().Dx() != got.Width || im.Bounds().Dy() != got.Height {
		t.Fatal("dimension metadata mismatch")
	}
	return im
}

func assertNoProfiles(t *testing.T, path string) {
	t.Helper()
	entries, err := os.ReadDir(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "codesketch-capture-profile-") {
			t.Fatal("capture profile survived", entry.Name())
		}
	}
}

func TestBrowserCancellationCleanup(t *testing.T) {
	if os.Getenv("PAINT_BROWSER_TESTS") != "1" {
		t.Skip("set PAINT_BROWSER_TESTS=1 for installed Chromium cleanup check")
	}
	temp := t.TempDir()
	t.Setenv("TMPDIR", temp)
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	_, err := Run(ctx, json.RawMessage(testSnapshot), Options{Output: filepath.Join(temp, "output.png")})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("expected browser startup cancellation", err)
	}
	assertNoProfiles(t, temp)
	if _, err := os.Stat(filepath.Join(temp, "output.png")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("canceled capture published output", err)
	}
}

func pixel(t *testing.T, im image.Image, x, y int, want color.RGBA, tolerance int) {
	t.Helper()
	got := color.RGBAModel.Convert(im.At(x, y)).(color.RGBA)
	for i, v := range []uint8{got.R, got.G, got.B, got.A} {
		w := []uint8{want.R, want.G, want.B, want.A}[i]
		d := int(v) - int(w)
		if d < -tolerance || d > tolerance {
			t.Fatalf("pixel (%d,%d): %+v, want %+v ±%d", x, y, got, want, tolerance)
		}
	}
}

func TestBrowserBrushPixels(t *testing.T) {
	raw := snapshotWith(t, func(s, d map[string]any) {
		var marks []any
		for i, brush := range []string{"brush", "pencil", "marker"} {
			m := stroke()
			m["brush"] = brush
			m["points"] = [][]float64{{10, float64(15 + i*25)}, {90, float64(15 + i*25)}}
			marks = append(marks, m)
		}
		d["marks"] = marks
	})
	im := browserImage(t, raw, Options{})
	pixel(t, im, 50, 15, color.RGBA{255, 107, 107, 255}, 3)
	pixel(t, im, 50, 40, color.RGBA{255, 38, 38, 255}, 2)
	pixel(t, im, 50, 65, color.RGBA{255, 140, 140, 255}, 2)
	pixel(t, im, 50, 78, color.RGBA{255, 255, 255, 255}, 0)
}

func layerSnapshot(t *testing.T) json.RawMessage {
	return snapshotWith(t, func(s, d map[string]any) {
		d["layers"] = []any{map[string]any{"id": "paint", "opacity": 1, "visible": true}, map[string]any{"id": "top", "opacity": .5, "visible": true}, map[string]any{"id": "hidden", "opacity": 1, "visible": false}}
		var marks []any
		for _, spec := range []struct{ id, color string }{{"paint", "#ff0000"}, {"top", "#0000ff"}, {"hidden", "#00ff00"}} {
			marks = append(marks, map[string]any{"type": "rect", "layer": spec.id, "x": 0, "y": 0, "width": 100, "height": 80, "color": spec.color, "opacity": 1})
		}
		eraser := stroke()
		eraser["layer"] = "top"
		eraser["brush"] = "eraser"
		eraser["points"] = [][]float64{{50, 40}}
		eraser["size"] = 20
		d["marks"] = append(marks, eraser)
	})
}

func TestBrowserLayersEraserAndCropPixels(t *testing.T) {
	raw := layerSnapshot(t)
	t.Run("layers", func(t *testing.T) {
		im := browserImage(t, raw, Options{})
		pixel(t, im, 10, 10, color.RGBA{127, 0, 128, 255}, 1)
		pixel(t, im, 50, 40, color.RGBA{255, 0, 0, 255}, 0)
	})
	t.Run("crop", func(t *testing.T) {
		im := browserImage(t, raw, Options{Crop: &Crop{X: 40, Y: 30, Width: 20, Height: 20}, Scale: 2})
		if im.Bounds().Dx() != 40 || im.Bounds().Dy() != 40 {
			t.Fatal(im.Bounds())
		}
		pixel(t, im, 20, 20, color.RGBA{255, 0, 0, 255}, 0)
		pixel(t, im, 0, 0, color.RGBA{127, 0, 128, 255}, 2)
	})
}

func TestBrowserPartialAndCommittedPixels(t *testing.T) {
	raw := snapshotWith(t, func(s, d map[string]any) {
		m := stroke()
		m["brush"] = "marker"
		s["playback"] = map[string]any{"active": map[string]any{"command": m, "progress": .5}}
	})
	t.Run("partial", func(t *testing.T) {
		im := browserImage(t, raw, Options{})
		pixel(t, im, 20, 20, color.RGBA{255, 140, 140, 255}, 2)
		pixel(t, im, 80, 20, color.RGBA{255, 255, 255, 255}, 0)
	})
	t.Run("committed", func(t *testing.T) {
		im := browserImage(t, raw, Options{Committed: true})
		pixel(t, im, 20, 20, color.RGBA{255, 255, 255, 255}, 0)
	})
}
