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

// ArtistSkill contains the offline painting workflow.
//
//go:embed docs/artist-skill/SKILL.md
var ArtistSkill string

// ArtistSkillReferenceStudy contains the bundled reference-study example.
//
//go:embed docs/artist-skill/references/season-one-example.md
var ArtistSkillReferenceStudy string

// ArtistSkillCLICraft contains the bundled native CLI craft and recovery reference.
//
//go:embed docs/artist-skill/references/cli-craft.md
var ArtistSkillCLICraft string
