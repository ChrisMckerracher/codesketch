# Nested bounded contexts

`src/painting` owns artwork. Its `document` context validates and reduces plain drawing commands; its `rendering` context turns those values into Canvas pixels. Document code has no browser, network, or filesystem access.

`src/direction` owns the human/agent session: playback, queue, history, feedback, and project serialization. It consumes painting through its public entrypoint. `src/studio` owns browser interaction, presentation, and the HTTP client. `src/transport` owns the local server, HTTP trust boundary, and persistence. `src/compositions` provides an original example painting through the drawing contract.

Dependencies flow studio → transport API and painting; transport → direction → painting. Cross-context JavaScript imports use public `index.mjs` entrypoints. Subcontexts expose their own index. No domain imports from UI or transport. Each module has one reason to change. Share stable concepts when repeated, and keep unrelated behavior separate.

Commands use canvas-space coordinates, explicit layer IDs, hex colors, finite bounded numbers, and named brush modes. Reject an entire batch before accepting any of it. Bound file sizes, command counts, layer counts, and stroke points. Preserve ordered replay and deterministic painting.

The native Go CLI lives in `cmd/paint` and `internal/cli`. The command entrypoint handles process signals and exit status; CLI orchestration owns parsing and user interaction. Nested `transport`, `input`, and `capture` packages own their respective trust and resource boundaries. Exported Go APIs define package interfaces. Capture embeds the canonical painting renderer through the root asset package, which has no application dependencies. The native executable uses the same studio HTTP/JSON contracts. Keep Go source files below 300 lines and use only standard-library imports or this module's packages.
