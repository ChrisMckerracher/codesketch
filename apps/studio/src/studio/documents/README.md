# Documents

[`index.mjs`](index.mjs) handles document and project intents: new document,
demo composition, project open/save, and committed PNG export.

[`exporter.mjs`](exporter.mjs) creates a canvas and uses painting’s public
renderer with no transient active mark. [`downloads.mjs`](downloads.mjs)
turns blobs into browser downloads and revokes object URLs after completion.

Project files are read as bounded JSON input and delegated to the studio API.
Save and load preserve the current project contract; PNG export represents
committed artwork. Browser availability and stale session generations are
reported as explicit validation or stale outcomes.

The context depends on [`../../painting/rendering/index.mjs`](../../painting/rendering/index.mjs)
and sibling model/request entrypoints supplied by the application coordinator.
Coverage: `studio-documents.test.mjs`, `studio-documents-downloads.test.mjs`,
and `studio-documents-export.test.mjs`.
