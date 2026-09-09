package capture

import (
	"bytes"
	"image"
	"image/png"
)

func helperPNG(width, height int) []byte {
	var body bytes.Buffer
	if err := png.Encode(&body, image.NewRGBA(image.Rect(0, 0, width, height))); err != nil {
		panic(err)
	}
	return body.Bytes()
}
