// Package docs embeds the canonical offline instructions so the native CLI
// serves the exact agent guide and artist skill without reading the
// repository. There is no copied content: these declarations are the single
// embedded provenance for the instruction documents.
package docs

import _ "embed"

// AgentGuide contains the canonical offline agent instructions.
//
//go:embed agent-guide.md
var AgentGuide string

// ArtistSkill contains the offline painting workflow.
//
//go:embed artist-skill/SKILL.md
var ArtistSkill string

// ArtistSkillReferenceStudy contains the bundled reference-study example.
//
//go:embed artist-skill/references/season-one-example.md
var ArtistSkillReferenceStudy string

// ArtistSkillCLICraft contains the bundled native CLI craft and recovery reference.
//
//go:embed artist-skill/references/cli-craft.md
var ArtistSkillCLICraft string
