# Supply-chain and local trust

The application ships zero third-party dependencies. Node and the browser are user-provided runtimes. `npm run verify` rejects dependency declarations, lockfiles with packages, bare third-party imports, remote source imports, and oversized source files. `.npmrc` disables install scripts and requests exact versions as defense in depth. Any future dependency proposal must include need, alternatives, exact version, provenance, license, advisory review, transitive inventory, integrity lock, and update ownership; user approval precedes adoption.

Bind HTTP to 127.0.0.1. Validate Host and Origin, require JSON for writes, emit a strict same-origin Content Security Policy, and serve an explicit static directory allowlist. Never evaluate agent commands as code. Treat project files and feedback as untrusted values. Use textContent for feedback and names. Persist projects atomically to a local ignored directory. Reject excessive requests and malformed imported projects before mutation.

The loopback API is available to local processes. It has no multi-user authentication and is intended for a trusted local machine. Do not bind it to public interfaces. Artwork and feedback stay local.

CLI capture uses an installed browser executable with a fresh temporary profile and the browser sandbox enabled. It owns and cleans up its browser, protocol connection, and ephemeral loopback server. Serve only explicit capture assets and one immutable snapshot; treat artwork as data. Bound capture time, output pixels, files, stdin, and network responses. Never attach to a user's browser, install a browser automatically, or execute artwork text. CLI server URLs remain loopback-only.
