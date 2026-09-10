// Package studio embeds the canonical studio runtime assets. RuntimeFS
// exposes the full shipped src/ and public/ runtime tree for trusted native
// lifecycle distribution, and RendererIndex and RendererStroke remain the
// direct canonical exports of src/painting/rendering with no copied renderer.
//
// The declarations below are the build-reviewed runtime inventory: each file
// is embedded through an explicit path, and policy derives the expected list
// from the source/public tree and requires an exact match, so tests, docs,
// tooling, artwork, source-control metadata and runtime state are excluded.
package studio

import (
	"embed"
	"io/fs"
)

// RendererIndex is the canonical renderer entry module src/painting/rendering/index.mjs.
//
//go:embed src/painting/rendering/index.mjs
var RendererIndex string

// RendererStroke is the canonical stroke module src/painting/rendering/stroke.mjs.
//
//go:embed src/painting/rendering/stroke.mjs
var RendererStroke string

// runtimeFS holds every canonical runtime file: each src/*.mjs module
// descendant and each public static asset, through explicit reviewed embed
// paths only. Wildcard and directory embeds are forbidden.
//
//go:embed src/compositions/index.mjs
//go:embed src/direction/feedback/grant.mjs
//go:embed src/direction/feedback/index.mjs
//go:embed src/direction/feedback/schema.mjs
//go:embed src/direction/feedback/store.mjs
//go:embed src/direction/finish.mjs
//go:embed src/direction/history.mjs
//go:embed src/direction/index.mjs
//go:embed src/direction/playback-control.mjs
//go:embed src/direction/playback-duration.mjs
//go:embed src/direction/project.mjs
//go:embed src/direction/recovery.mjs
//go:embed src/direction/session-comments.mjs
//go:embed src/direction/session.mjs
//go:embed src/painting/document/index.mjs
//go:embed src/painting/document/validation.mjs
//go:embed src/painting/index.mjs
//go:embed src/painting/rendering/index.mjs
//go:embed src/painting/rendering/stroke.mjs
//go:embed src/studio/api.mjs
//go:embed src/studio/comments/geometry.mjs
//go:embed src/studio/comments/handshake.mjs
//go:embed src/studio/comments/index.mjs
//go:embed src/studio/renderer.mjs
//go:embed src/studio/state.mjs
//go:embed src/transport/comments.mjs
//go:embed src/transport/http.mjs
//go:embed src/transport/index.mjs
//go:embed src/transport/lifecycle-http.mjs
//go:embed src/transport/lifecycle.mjs
//go:embed src/transport/managed-input.mjs
//go:embed src/transport/managed.mjs
//go:embed src/transport/persistence.mjs
//go:embed src/transport/ownership.mjs
//go:embed src/transport/runtime-manifest.mjs
//go:embed src/transport/server.mjs
var runtimeFS embed.FS

// RuntimeFS returns the canonical studio runtime tree rooted at the shipped
// public/ and src/ directories.
func RuntimeFS() fs.FS { return runtimeFS }
