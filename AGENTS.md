# Codesketch operating instructions

Build an intuitive local painting instrument for agents and humans. The user watches strokes appear, pauses the painter, and leaves feedback.

## Working agreements

- State current behavior directly. Use concise, affirmative prose.
- Before judging task or agent speed, check actual start and current timestamps and calculate elapsed time. Base timing claims and interventions on that evidence and the task's scope; tool-call count and subjective impressions do not establish elapsed time.
- Painting agents begin with `paint guide` (or `bin/paint guide` after `make build`). Use the native CLI for drawing, status, feedback, and PNG inspection through `view`; open its returned image path with the agent's image reader. Preserve a human pause until continuation is authorized.
- A good manager and architect delegates implementation. The lead owns scope, architecture, contracts, assignments, review, verification, and delivery; the lead does not write application code or tests. Delegate all implementation and fixes through `herdr`, then inspect and verify the results. Work autonomously within the approved product scope.
- Use `herdr` for all delegated agent requests. Give agy bounded writing/review tasks and opencode small implementation tasks with explicit contracts. Review every result. Use Codex Astra high through herdr for a difficult independent gut check.
- Workers share this repository. Edit only assigned files and preserve others' work. Do not install dependencies, commit, or change architecture from a worker assignment.
- Track work with `bd`. Read `docs/plans/architect/studio.md` and relevant standards before changing code.
- Standards: `docs/standards/architecture.md`, `docs/standards/security.md`, `docs/standards/testing.md`, and `docs/standards/interface.md` define context boundaries, supply-chain policy, release verification, and the Mac application visual language.
- Design Codesketch as a polished Mac creative application. Keep the canvas prominent, use system typography and compact desktop controls, and keep interface surfaces neutral. The lead delegates visual implementation through `herdr`.
- Use native JavaScript ES modules, HTML, CSS, browser APIs, and Node built-ins for the studio; use Go and its standard library for the native CLI. External dependencies require a concrete proposal and user approval. Development tools already installed on the machine are tooling, not shipped dependencies.
- Keep each file focused and preferably under 200 lines (hard verification ceiling 300 for source). Model folders as nested bounded contexts, with public `index.mjs` entrypoints. Avoid generic helper dumping grounds.
- Run `npm run verify` and relevant browser checks before completion. Keep generated browser artifacts out of commits.
- Manual edits use apply_patch. A shared integration branch is authorized for this initial bootstrap, with non-overlapping worker file ownership.

## Commands

`npm start` starts the loopback studio. `make install` builds and installs the native `paint` command in `~/.local/bin`; `make build` writes `bin/paint`. `paint guide` contains the canonical agent instructions and `paint doctor` checks local readiness. `npm run verify` runs JavaScript checks plus Go formatting, dependency/context policy, vet and race tests. `PAINT_STUDIO_TESTS=1 PAINT_BROWSER_TESTS=1 make test-go` includes isolated real-studio and native browser checks. `npm run test:browser` checks the studio with the installed Playwright CLI. Release evidence is in `docs/verification.md`.
