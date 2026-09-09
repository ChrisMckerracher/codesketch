# Codesketch operating instructions

Build an intuitive local painting instrument for agents and humans. The user watches strokes appear, pauses the painter, and leaves feedback.

## Working agreements

- State current behavior directly. Use concise, affirmative prose.
- A good manager and architect delegates implementation. The lead owns scope, architecture, contracts, assignments, review, verification, and delivery; the lead does not write application code or tests. Delegate all implementation and fixes through `herdr`, then inspect and verify the results. Work autonomously within the approved product scope.
- Use `herdr` for all delegated agent requests. Give agy bounded writing/review tasks and opencode small implementation tasks with explicit contracts. Review every result. Use Codex Astra high through herdr for a difficult independent gut check.
- Workers share this repository. Edit only assigned files and preserve others' work. Do not install dependencies, commit, or change architecture from a worker assignment.
- Track work with `bd`. Read `docs/plans/architect/studio.md` and relevant standards before changing code.
- Standards: `docs/standards/architecture.md`, `docs/standards/security.md`, `docs/standards/testing.md`, and `docs/standards/interface.md` define context boundaries, supply-chain policy, release verification, and the Mac application visual language.
- Design Codesketch as a polished Mac creative application. Keep the canvas prominent, use system typography and compact desktop controls, and keep interface surfaces neutral. The lead delegates visual implementation through `herdr`.
- Use native JavaScript ES modules, HTML, CSS, browser APIs, and Node built-ins. External dependencies require a concrete proposal and user approval. Development tools already installed on the machine are tooling, not shipped dependencies.
- Keep each file focused and preferably under 200 lines (hard verification ceiling 300 for source). Model folders as nested bounded contexts, with public `index.mjs` entrypoints. Avoid generic helper dumping grounds.
- Run `npm run verify` and relevant browser checks before completion. Keep generated browser artifacts out of commits.
- Manual edits use apply_patch. A shared integration branch is authorized for this initial bootstrap, with non-overlapping worker file ownership.

## Commands

`npm start` starts the loopback studio. `npm test` runs Node's native tests. `npm run verify` also enforces architecture and supply-chain policy. `npm run test:browser` runs isolated browser checks with the installed Playwright CLI. `node tools/paint.mjs help` describes the agent interface. Release evidence is in `docs/verification.md`.
