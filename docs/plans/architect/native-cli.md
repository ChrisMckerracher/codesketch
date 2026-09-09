# Native paint executable

The user wants a mature native CLI installed as `paint`. Build it in Go using only the standard library. The existing studio remains the local service; the executable owns its complete agent interaction without invoking Node or Playwright. The user has authorized autonomous architecture, implementation, verification, and local delivery.

## Product contract

Preserve the command vocabulary and JSON transport of `docs/plans/architect/agent-cli.md`: drawing, layers, batch stdin/files, status, feedback, session controls, save/load, bounded wait/watch, immutable preview and committed PNG export. `paint new` resets the session; `paint clear` discards the pending queue. Preserve human pauses. Commands are declarative data.

Provide offline `help`, command `--help`, `guide`, `version`/`--version`, and `completion bash|zsh|fish`. `doctor [--json]` reports executable/build, configured loopback endpoint, studio reachability and installed browser availability. Document stable exit codes: 0 success, 1 runtime failure, 2 invalid invocation, 130 interruption. Structured errors go to stderr with `--json`; successful JSON goes to stdout. Watch emits newline-delimited JSON. Reject duplicate/unknown flags, extra arguments and invalid values before any mutation.

Build a single CGO-disabled executable from `cmd/paint`. It works outside the checkout and includes guidance and preview assets. Support the current Mac first and compile for Linux and Windows where platform code allows. A local install target places `paint` on the user's existing executable PATH without modifying shell startup files. Build and install use the installed Go toolchain with network module fetching and automatic toolchain downloads disabled. No external modules, vendoring, generated dependency downloads, or package manager libraries.

## Bounded contexts and ownership

Module path: `github.com/ChrisMckerracher/codesketch`. Root `assets.go` embeds the canonical `src/painting/rendering/index.mjs` and `stroke.mjs` for preview and `docs/agent-guide.md` for offline guidance; no copied renderer or guide. `cmd/paint/main.go` is the thin signal/exit entrypoint. `internal/cli` owns command parsing and orchestration. Its nested `transport` owns loopback-only bounded HTTP, `input` owns bounded file/stdin and atomic output, and `capture` owns temporary browser/server resources and PNG production. Keep packages focused and files below 300 lines. Go exported declarations define package boundaries; dependencies point from CLI orchestration to its subcontexts. Capture does not import CLI orchestration or mutate studio state.

Capture public contract: `capture.Run(ctx context.Context, snapshot json.RawMessage, options capture.Options) (capture.Result, error)`. Options fields: `Output string`, `Crop *capture.Crop` (X, Y, Width, Height float64), `Scale float64`, `Committed bool`, `Browser string`. Result fields: `Path string`, `MIMEType string`, `Width int`, `Height int`, `InstanceID string`, `Revision int64`, with lower-camel JSON names matching existing output. `capture.DiscoverBrowser(override string) (string, error)` supports doctor. Caller adds playback metadata. A zero Scale means default 1. Run has a 15-second capture deadline bounded by caller cancellation.

The implementation uses one immutable snapshot, shared Canvas renderer, a fresh installed Chromium process/profile with sandbox enabled, and an ephemeral loopback server with explicit routes and a random per-capture token. The embedded page posts a bounded PNG result to that server after rendering. Capture validates snapshot/point/layer/mark/canvas/pixel/body budgets, actual PNG dimensions, host/origin/method, and result identity. It cleans owned processes/profile/listeners on success, failure, timeout, or interruption; atomic output occurs only after complete validation. No user browser attachment or automatic browser installation. Review browser lifecycle before finalizing this transport.

## Delivery and tests

Keep the existing JavaScript CLI available to the active painter during migration. Do not restart the live studio or use live artwork for mutation tests. Delegate implementation and regression tests through Herdr; lead owns design, docs, review and release.

Use Go native tests for parsing, flag strictness, command payloads, file/stdin limits, transport trust/redirect/proxy behavior, cancellation, wait/watch, errors and output contracts. Integration checks use an isolated studio and installed browser: actual PNG pixels for layers, erasure, active partial stroke, committed export and crop/scale; browser exit/timeout cleanup; installed binary from another directory. Check `go test -race ./...`, `go vet ./...`, formatting, module inventory, Go source size and embed/renderer provenance, and existing `npm run verify`. Browser tests must clean resources and preserve active art. Document reproducible build/install commands and external runtime requirements accurately.

Risks: installed browser availability, process lifecycle differences across operating systems, output compatibility, and a stale renderer. Embedded canonical assets, explicit browser configuration, isolated capture tests and compatible command semantics address these. The CLI migration does not migrate the studio service to Go.
