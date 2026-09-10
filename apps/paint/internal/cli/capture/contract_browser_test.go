package capture

import (
	"image/color"
	"testing"
)

func TestBrowserPausedCommandContract(t *testing.T) {
	for name, fixture := range contractSnapshots(t) {
		for _, committed := range []bool{false, true} {
			mode := "preview"
			if committed {
				mode = "export"
			}
			t.Run(name+"/"+mode, func(t *testing.T) {
				im := browserImage(t, fixture.Raw, Options{Committed: committed})
				// In particular, an active fill must not change white to green,
				// and layer.update must not hide or fade the committed red mark.
				pixel(t, im, 500, 500, color.RGBA{255, 255, 255, 255}, 0)
				pixel(t, im, 20, 20, color.RGBA{255, 0, 0, 255}, 0)
				if !fixture.Drawable || committed {
					pixel(t, im, 20, 100, color.RGBA{255, 255, 255, 255}, 0)
					pixel(t, im, 120, 120, color.RGBA{255, 255, 255, 255}, 0)
				} else if name == "stroke" {
					pixel(t, im, 20, 100, color.RGBA{140, 140, 255, 255}, 2)
					pixel(t, im, 70, 100, color.RGBA{255, 255, 255, 255}, 0)
				} else {
					pixel(t, im, 120, 120, color.RGBA{0, 0, 255, 255}, 0)
				}
			})
		}
	}
}
