package capture

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image/png"
	"io"
	"math"
	"strings"
)

func finiteIn(value, min, max float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= min && value <= max
}

func numberIn(value *float64, min, max float64) bool {
	return value != nil && finiteIn(*value, min, max)
}

func (data *captureData) validateOptions(options Options) error {
	scale := options.Scale
	if scale == 0 {
		scale = 1
	}
	if !finiteIn(scale, .05, 16) {
		return errors.New("scale must be between 0.05 and 16")
	}
	if strings.ContainsRune(options.Output, 0) || (options.Output != "" && strings.TrimSpace(options.Output) == "") {
		return errors.New("invalid output path")
	}
	doc := data.Document
	crop := Crop{Width: float64(doc.Width), Height: float64(doc.Height)}
	if options.Crop != nil {
		crop = *options.Crop
		if !finiteIn(crop.X, 0, float64(doc.Width)) || !finiteIn(crop.Y, 0, float64(doc.Height)) ||
			!finiteIn(crop.Width, math.SmallestNonzeroFloat64, float64(doc.Width)) || !finiteIn(crop.Height, math.SmallestNonzeroFloat64, float64(doc.Height)) ||
			crop.X+crop.Width > float64(doc.Width) || crop.Y+crop.Height > float64(doc.Height) {
			return errors.New("crop must be a positive rectangle within the canvas")
		}
	}
	data.Crop = crop
	data.Width = max(1, int(math.Round(crop.Width*scale)))
	data.Height = max(1, int(math.Round(crop.Height*scale)))
	if data.Width > 8192 || data.Height > 8192 || data.Width*data.Height > maxPixels {
		return errors.New("output exceeds dimension or pixel budget")
	}
	// Canonical rendering allocates a canvas for each layer and a transient
	// composite, in addition to the source and scaled output canvases.
	if doc.Width*doc.Height*(len(doc.Layers)+2)+data.Width*data.Height > 64_000_000 {
		return errors.New("capture exceeds aggregate canvas pixel budget")
	}
	return nil
}

func validatePNG(body []byte, width, height int) error {
	return validatePNGContext(context.Background(), body, width, height)
}

func validatePNGContext(ctx context.Context, body []byte, width, height int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if len(body) == 0 || len(body) > maxPNGBytes {
		return errors.New("PNG exceeds body budget or is empty")
	}
	config, err := png.DecodeConfig(bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("invalid PNG header: %w", err)
	}
	if config.Width != width || config.Height != height || config.Width > 8192 || config.Height > 8192 || int64(config.Width)*int64(config.Height) > maxPixels {
		return errors.New("PNG dimensions do not match validated capture dimensions")
	}
	r := bytes.NewReader(body)
	if _, err := png.Decode(contextReader{ctx: ctx, reader: r}); err != nil {
		return fmt.Errorf("invalid PNG: %w", err)
	}
	if r.Len() != 0 {
		return errors.New("PNG contains trailing data")
	}
	return nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}
