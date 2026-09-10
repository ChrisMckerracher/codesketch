# Codesketch operating instructions

Build an intuitive local painting instrument for agents and humans. The user watches strokes appear, pauses the painter, and leaves comments.

## Production protection

- Port 4317 is sole production and runs the newest released code.
- A production outage is sev0: stop feature work and restore service first.
- Only a lead-managed authorized release can restart or replace production processes. Never stop, kill, or replace production processes outside an authorized release.
- Protect production availability and actual artwork: replace production runtime data only during an authorized managed release with a verified backup, and never use `.studio/session.json` for tests.
- Never default development or test `npm start`, `paint`, or test commands to port 4317.
- All feature development, automated tests, and browser tests must use separate loopback ports (ephemeral preferred) and separate temporary persistence.
- Keep served production files under release control; use an isolated checkout for future development. Use no persistent staging runtime.

## Working agreements

- State current behavior directly. Use concise, affirmative prose.
- Before judging task or agent speed, check actual start and current timestamps and calculate elapsed time. Base timing claims and interventions on that evidence and the task's scope; tool-call count and subjective impressions do not establish elapsed time.
- Painting agents begin with `paint --artist-skill` for the reference-driven drawing workflow and `paint guide` for the instrument commands (use `bin/paint` after `make build`). Use the native CLI for drawing, status, comments, and PNG inspection through `view`; open its returned image path with the agent's image reader. Preserve a human pause until continuation is authorized.
- The lead is manager and architect responsible for scope, contracts, assignments, review, verification, and delivery; the lead does not write application code or tests. Delegate all production work including code, tests, docs, and fixes through `herdr`, then inspect and verify the results. Work autonomously within the approved product scope.
- Use `herdr` for all delegated agent requests. Give agy only creative work and writing, and opencode small explicit junior implementation assignments. Review every result. Independent buddy and gut checks use Codex Astra medium reasoning through `herdr`.
- Agy must only ever use Gemini 3.8 Flash High and remains restricted to creative work and writing. Verify the actual model before assigning a task; never silently substitute another model. Output from a wrong-model run is invalid: discard it and all downstream direction derived from it, then restart in a new project/session with only the clean user brief and zero context from the invalid run.
- Workers share this repository. Edit only assigned files and preserve others' work. Clean up workers and owned empty panes when complete. Do not install dependencies, commit, or change architecture from a worker assignment.
- Track work with `bd`. Read `docs/plans/architect/studio.md` and relevant standards before changing code.
- Standards: `docs/standards/architecture.md`, `docs/standards/security.md`, `docs/standards/testing.md`, and `docs/standards/interface.md` define context boundaries, supply-chain policy, release verification, and the Mac application visual language.
- Codesketch supports only current contracts; backwards compatibility support is forbidden permanently. No legacy formats, aliases, adapters, version migrations, or compatibility fallbacks: contract changes replace obsolete behavior and update callers, docs, and tests together, rejecting obsolete input instead of retaining a compatibility path. This applies to app, CLI, and future work. Keep deliberate current command conveniences distinct from legacy aliases.
- Design Codesketch as a polished Mac creative application. Keep the canvas prominent, use system typography and compact desktop controls, and keep interface surfaces neutral. The lead delegates visual implementation through `herdr`.
- Use native JavaScript ES modules, HTML, CSS, browser APIs, and Node built-ins for the studio; use Go and its standard library for the native CLI. External dependencies require a concrete proposal and user approval. Development tools already installed on the machine are tooling, not shipped dependencies.
- Keep each file focused and preferably under 200 lines (hard verification ceiling 300 for source). Model folders as nested bounded contexts, with public `index.mjs` entrypoints. Avoid generic helper dumping grounds.
- Run `npm run verify` and relevant browser checks before completion. Keep generated browser artifacts out of commits.
- Manual edits use apply_patch. A shared integration branch is authorized for this initial bootstrap, with non-overlapping worker file ownership.

## Commands

`npm start` starts the isolated development studio on loopback port 0 with in-memory persistence; it never targets production port 4317. `make install` builds and installs the native `paint` command in `~/.local/bin`; `make build` writes `bin/paint`. Bare `paint` starts or reuses the managed studio and opens the default browser. Managed operations are `paint studio start|status|stop|restart`; `paint status` reports artwork, while `paint studio status` reports the managed process. `paint guide` contains the canonical agent instructions and `paint doctor` checks local readiness. `npm run verify` runs JavaScript checks plus Go formatting, dependency/context policy, vet and race tests. `PAINT_STUDIO_TESTS=1 PAINT_BROWSER_TESTS=1 make test-go` includes isolated real-studio and native browser checks. `npm run test:browser` checks the studio with the installed Playwright CLI. Release evidence is in `docs/verification.md`.
