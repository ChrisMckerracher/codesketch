// Package codesketch embeds the canonical painting renderer assets so the
// native capture preview page renders with the exact shared Canvas renderer.
// There is no copied renderer: these declarations are the single embedded
// provenance for src/painting/rendering.
package codesketch

import _ "embed"

// RendererIndex is the canonical renderer entry module src/painting/rendering/index.mjs.
//
//go:embed src/painting/rendering/index.mjs
var RendererIndex string

// RendererStroke is the canonical stroke module src/painting/rendering/stroke.mjs.
//
//go:embed src/painting/rendering/stroke.mjs
var RendererStroke string

// AgentGuide contains the canonical offline agent instructions.
//
//go:embed docs/agent-guide.md
var AgentGuide string
