// Package capture owns temporary browser/server resources and PNG production.
// It works from one immutable snapshot, never imports CLI orchestration, and
// never mutates studio state.
package capture

// Options configures a single capture run.
type Options struct {
	// Output is the destination file path; empty selects a temporary file.
	Output string `json:"output,omitempty"`
	// Crop optionally selects a source rectangle in canvas points.
	Crop *Crop `json:"crop,omitempty"`
	// Scale is the device pixel ratio applied to the capture; zero means 1.
	Scale float64 `json:"scale,omitempty"`
	// Committed captures only committed artwork instead of the live view.
	Committed bool `json:"committed,omitempty"`
	// Browser optionally names an explicit browser executable path.
	Browser string `json:"browser,omitempty"`
}

// Crop selects a source rectangle in canvas points.
type Crop struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// Result reports one validated capture with lower-camel JSON names matching
// the existing CLI output contract.
type Result struct {
	Path       string `json:"path"`
	MIMEType   string `json:"mimeType"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	InstanceID string `json:"instanceId"`
	Revision   int64  `json:"revision"`
}
