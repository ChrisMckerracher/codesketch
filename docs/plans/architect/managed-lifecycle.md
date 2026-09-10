# Managed studio lifecycle contract

This document is the implementation contract for native management of the local studio. It covers the current lifecycle API, runtime packaging, launch ownership, readiness, discovery, recovery, authentication, shutdown, and browser opening seams.

## Runtime modes

Development uses `tools/studio-dev.mjs`. It binds loopback port `0`, uses in-memory persistence by default, and rejects port `4317`.

Normal `paint` management uses production port `4317` by default and durable application data. Development and implementation verification use explicit temporary data/cache directories and port `0`; `.studio/session.json` is never lifecycle persistence.

## Go API

Package: `apps/paint/internal/cli/lifecycle`.

```go
type Options struct {
    DataDir, CacheDir, Node string
    Port                   int
    NoOpen                 bool
}

type State string

const (
    Stopped  State = "stopped"
    Running  State = "running"
    Stopping State = "stopping"
)

type Result struct {
    URL, InstanceID, Digest string
    PID                    int
    State                  State
}

type Manager struct { /* private fields */ }

func DefaultOptions() (Options, error)
func New(opts Options) (*Manager, error)
func (*Manager) Start(context.Context) (Result, error)
func (*Manager) Status(context.Context) (Result, error)
func (*Manager) Stop(context.Context) (Result, error)
func (*Manager) Restart(context.Context) (Result, error)
```

`DefaultOptions` resolves `filepath.Join(os.UserConfigDir(), "codesketch")`, `filepath.Join(os.UserCacheDir(), "codesketch")`, executable `node`, and port `4317`. It reads environment directories only; it creates no files and starts no process. `New` requires nonempty directories and executable, accepts port `0` or `1024..65535`, normalizes directories to absolute paths, freezes the embedded runtime digest, and performs no process or extraction work. macOS and Linux are supported; other platforms return an explicit unsupported-platform error.

`Status` and `Stop` do not require an installed Node executable or cache extraction. The expected digest comes from embedded assets. A stopped result has empty URL, instance ID, and digest, with PID `0`. Ownership, incompatibility, port occupancy, timeout, persistence, and platform failures are errors, never a false `Stopped` result. Results and errors never contain capability material.

`Start` reuses a verified healthy instance of the current digest. A nonzero requested port must match the existing instance; port `0` permits reuse of its recorded port. `Start` and `Restart` open the returned URL unless `NoOpen`. Browser-open failure returns the healthy result and a nonnil error. `Status` and `Stop` never open a browser.

`Restart` holds one operation lock across internal stop and start helpers, without recursively locking public methods. It starts a replacement only after successful stop proof; port `0` may choose a different port. An incompatible runtime is never restarted automatically. All lock retries, startup, HTTP, and shutdown operations are context-aware and bounded even when the caller supplies no deadline. HTTP clients disable proxies and redirects, validate literal loopback URLs and actual dial targets, bound responses, and validate exact response shapes. Cancellation does not terminate an already accepted healthy runtime.

## Paths, ownership, and locks

- Durable data: `DataDir`.
- Cache: `CacheDir`.
- Runtime tree: `CacheDir/runtime/<digest>`.
- Recovery: `DataDir/recovery.json`, strict recovery envelope format `codesketch-recovery`, version `1`.
- Ownership record: `DataDir/lifecycle.json`.
- Operation lock: `DataDir/.lifecycle.lock`.
- Writer lease: `DataDir/.writer.lock`.

Application directories must be private, real, and owned by the current user. Lock and record paths reject symlinks and nonregular files. Lock files keep stable inodes and are never unlinked or replaced. Go acquires `.lifecycle.lock` before every manager operation and uses cancellable nonblocking retries. The writer lease is probed with an independently opened descriptor using exclusive nonblocking locking.

Go owns stale-record validation and removal while holding both locks. Node holds the inherited writer lease through recovery, service, shutdown, and ownership-record cleanup. Node publication and removal do not acquire the operation lock. Node keeps the inherited writer descriptor open until process exit, does not explicitly unlock it, and does not pass it to descendants.

## Canonical runtime and manifest

`apps/studio/assets.go` owns the complete explicit runtime embedding and exposes:

```go
func RuntimeFS() fs.FS
```

The filesystem contains the shipped `src/` and `public/` runtime files, including the managed entrypoint and every transitive runtime import or static asset. It excludes tests, artifacts, persistence, source-control metadata, and developer tooling. Existing capture renderer exports remain direct views of canonical assets.

The deterministic manifest is compact UTF-8 JSON followed by one LF byte, with no BOM:

```json
{"files":[{"path":"public/base.css","size":123,"sha256":"<64 lowercase hex>"}]}
```

The object key is `files`; entry keys are ordered `path`, `size`, `sha256`. Entries are sorted by ASCII relative slash-separated path. Paths contain only ASCII letters, digits, `_`, `-`, `.`, and `/`; absolute paths, empty or dot segments, backslashes, controls, and duplicates are rejected. `size` is the exact byte length and `sha256` is the hash of exact bytes. The runtime digest is the lowercase SHA-256 of the exact manifest bytes. The extracted name is `runtime-manifest.json`, excluded from its own file list.

Go derives the manifest and digest from embedded bytes. Node independently validates the canonical encoding, supplied digest, and complete runtime tree before recovery and listening. Verification rejects symlinks, unexpected files or directories, missing files, wrong sizes or hashes, and non-private entries.

## Cache publication

Cache extraction is serialized by one stable private `CacheDir/runtime/.extract.lock`, shared by all data directories using that `CacheDir`. The lock file is created once as a private regular file and is never unlinked or replaced. Each extractor acquires it before inspecting or publishing `runtime/<digest>` and closes its lock descriptor without unlinking the lock.

Under the lock, an existing digest target is verified byte-for-byte against the embedded manifest. If the target is absent, extraction proceeds into a private sibling temporary directory, which is synced and verified before atomic rename publication. A known target is never replaced or repaired in place. Corrupt, modified, extra, missing, or obsolete cache content is rejected.

The extracted tree contains exactly the manifest inventory plus `runtime-manifest.json`. Files are private `0600`, directories are private, and files and directories are synced before publication. Cache verification is not protection against a hostile same-user process modifying files after verification.

## Launch protocol and file descriptors

The managed entrypoint is `src/transport/managed.mjs`. Go launches it by absolute path with argv and the verified runtime root as working directory, without a shell. Node derives the runtime root from the entrypoint URL.

Launch stdin is exactly this JSON object:

```json
{"dataDir":"/absolute/private/data","port":0,"capability":"<64 lowercase hex>","digest":"<64 lowercase hex>"}
```

Go generates capability from 32 cryptographically random bytes for each new launch. Input is limited to 16 KiB. Go writes the complete object and closes stdin. Node waits for EOF, validates exact keys and types, and rejects malformed, truncated, oversized, unknown-field, or obsolete input before recovery. Capability never appears in argv, environment, URL, browser state, assets, stdout, errors, or diagnostics.

The descriptor contract is fixed:

- fd `0`: bounded launch JSON, then EOF.
- fd `3`: inherited writer lease, `ExtraFiles[0]`.
- fd `4`: private readiness write pipe, `ExtraFiles[1]`.
- stdout/stderr: launcher-independent descriptors such as `/dev/null`.

The child runs in a detached OS session so launcher or terminal exit does not send a terminal hangup. `.lifecycle.lock` is never passed to Node. After `cmd.Start`, Go closes its writer descriptor without `LOCK_UN`; duplicated descriptors share the lock. Go retains one wait owner for child reaping and does not use cancellation that kills an accepted server.

## Startup, recovery, and readiness

Node startup is ordered as follows:

1. Validate launch input and fd 3/fd 4 as the required inherited resources.
2. Verify the runtime manifest, tree, and supplied digest.
3. Create a fresh session identity and restore strict recovery from `DataDir/recovery.json`. Missing recovery starts fresh. Malformed or unreadable recovery fails before listening and preserves original bytes.
4. Bind only `127.0.0.1` to the requested port and obtain the actual port.
5. Build identity from session instance ID, `process.pid`, actual URL, verified digest, and capability.
6. Durably publish the sole ownership record.
7. Call `markReady()` synchronously.
8. Write exactly one bounded newline-terminated status object to fd 4 and close fd 4.

Durable publication gates readiness. Before publication, lifecycle status is `503` and ordinary artwork mutations are rejected with `503`. A failure before publication closes the listener, cancels timers, and exits, releasing fd 3. If record rename succeeds but directory sync fails, startup is failed; the service closes and only a matching record may be removed. A residual exact record is stale metadata, never authority for PID signaling.

After the readiness frame, Go reads the durable record and performs authenticated HTTP status. It compares record, pipe, and HTTP identity, direct child PID, intended capability and digest, requested nonzero port, and literal loopback URL. Readiness alone is insufficient. If the readiness pipe returns `EPIPE` after publication, Node remains healthy and discoverable and does not remove metadata or shut down.

Before Start accepts the runtime, startup cancellation may terminate only the retained child and reap it; Go never signals a PID read from metadata. After acceptance, browser failure or caller cancellation preserves the healthy server. The writer lease remains held after launcher exit, and later discovery uses the published record plus authenticated status.

## Exact ownership record

The sole record has exactly this schema and no state field:

```json
{"instanceId":"<fresh session identity>","pid":12345,"url":"http://127.0.0.1:49152","digest":"<64 lowercase hex>","capability":"<64 lowercase hex>"}
```

It is a bounded private `0600` file containing exactly the five keys, a nonempty instance ID, positive integer PID, literal `http://127.0.0.1:<port>` URL with no credentials/query/fragment/path, and valid lowercase hashes/token. Node writes a unique exclusive temporary file in the private data directory, syncs it, atomically renames it to `lifecycle.json`, and syncs the directory. The record is never served by static routes.

Node rejects an unexpected pre-existing record instead of overwriting unexplained ownership. Node is the sole active publisher and shutdown remover. Go clears only proven-stale metadata while holding both locks. Node removes a record only when its full identity tuple, including capability and digest, still matches the instance it published; it compares and unlinks while retaining fd 3, then syncs the directory. A missing record is harmless. A different record is preserved and reported privately.

## Discovery rules

- Writer busy plus valid matching record and authenticated matching status means `Running` or `Stopping` according to endpoint state; the digest must match current embedded assets.
- Writer busy plus missing/malformed record or failed/mismatched endpoint yields an ownership error after bounded discovery retry. Files and processes are preserved.
- Writer acquired plus no record means `Stopped` for Status/Stop; Start may proceed subject to port binding.
- Writer acquired plus a record requires the lease to remain held while checking the endpoint. A live authenticated matching endpoint with a free lease is an ownership violation. An alien responder or incompatible record is preserved and reported.
- A current record whose endpoint is definitively absent is stale and may be removed under both locks. Timeout, parse failure, or authentication failure is not proof of absence.

Never use `kill(pid, 0)`, PID reuse assumptions, record age, or connection failure alone as ownership authority. Re-read metadata under held locks before stale cleanup. Retain the writer lease from stale cleanup through preparation and transfer to the new child. An occupied requested port never permits takeover.

## Node transport seam and authentication

The transport public seam remains:

```js
createStudio({ root, persistence, lifecycle: { capability, digest } })
  -> Promise<{ server, session, flush, markReady, shutdown }>

flush() -> Promise<void>
markReady() -> void
shutdown() -> Promise<void>
```

The managed entrypoint owns inherited resources, record publication, readiness, and exit. Transport owns authentication, status, stop coalescing, mutation gating, tick suspension, and flush/close sequencing. `markReady()` is called synchronously after record directory sync and before fd 4; it opens lifecycle status and ordinary-mutation gates and throws if called before listen, after stopping, or twice. Isolated in-process construction may omit lifecycle; authenticated lifecycle routes remain unavailable and ordinary in-process behavior is ready without `markReady()`.

Both lifecycle endpoints require `X-Codesketch-Capability`, strict loopback peer and exact Host validation, and reject every `Origin` or `Sec-Fetch-*` header. Capability comparison is constant-time after length validation. Responses are bounded, JSON, and `no-store`; capability is never returned. Lifecycle routes are dispatched before generic body parsing. Stop input has an independent 1 KiB budget.

`GET /api/lifecycle/status` returns exactly:

```json
{"instanceId":"<fresh session identity>","pid":12345,"url":"http://127.0.0.1:49152","digest":"<64 lowercase hex>","state":"running"}
```

State is `running` or `stopping`, independent of playback. Status is `503` before durable publication. Identity remains stable during shutdown. The current-only contract has no protocol version; exact schema and current digest are required.

`POST /api/lifecycle/stop` requires JSON exactly `{"instanceId":"<expected identity>"}`. Authentication and identity matching precede mutation. Wrong identity is `409`; invalid body `400`; browser-originated or unauthenticated requests `403`; wrong method `405`. Concurrent authenticated matching requests coalesce into one shutdown attempt.

## Stop and recovery preservation

Shutdown synchronously engages the stopping gate, suspends ticks, pauses while preserving active preview and queue, and invalidates continuation grants once. Every awaited request-body path rechecks the gate immediately before ordinary domain mutation; late writes receive `503`.

The server awaits a fresh-snapshot flush serialized behind earlier persistence writes. Flush rejection clears the stopping gate, returns `500`, and preserves the live paused session and ownership record for retry. On successful durable flush, it responds `200` with exactly `{"instanceId":"<identity>","state":"stopping"}` before bounded listener and connection cleanup. The shutdown promise represents completed listener closure. The handler must not await a shutdown promise that waits for its own response.

After listener closure, the managed entrypoint removes only its exact record while fd 3 remains open, then exits cleanly. Handled SIGINT/SIGTERM use the same graceful path. Flush failure leaves the paused service alive. Uncatchable termination relies on the last durable recovery snapshot.

Go Stop waits for authenticated success, endpoint termination, and writer-lease acquisition. Under the operation lock and lease, absent record is idempotent success; matching stale residual may be removed; a different record is preserved and reported. Replacement alien listeners are occupancy errors. Flush failure or timeout retains discovery information and prevents Restart from launching. Existing-server stop failures never escalate to PID signaling.

## Browser opening

macOS uses `open <verified-url>` and Linux uses `xdg-open <verified-url>`, with separate argv and no shell. The opener is reaped with a bounded invocation. Unsupported platforms return an explicit error. Failure returns the healthy result plus an error containing the usable URL. Capability never appears in the URL. Start opens reused and newly started healthy instances unless `NoOpen`; Status and Stop never open a browser.

## Compatibility rule

Only the current contracts in this document are supported. There are no legacy formats, aliases, adapters, migrations, compatibility readers, fallback variants, or protocol-version branches. Obsolete input, recovery, records, manifests, and runtimes are rejected explicitly.

Related context: [native CLI plan](native-cli.md), [studio architecture](studio.md), [security standard](../../standards/security.md), and [testing standard](../../standards/testing.md).
