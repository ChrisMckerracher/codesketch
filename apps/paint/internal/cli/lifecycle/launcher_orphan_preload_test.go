package lifecycle

import (
	"os"
	"path/filepath"
	"testing"
)

// orphanPreload is the test-only Node preload for the launcher-death case.
// It is materialized into the private case directory, outside the extracted
// runtime tree, and loaded through NODE_OPTIONS --import in the retained
// launcher helper's environment only. The environment contract is explicit:
// all six private paths must be set, a partial set fails the import loudly
// instead of silently arming half the stimulus, and with none set the
// module stays inert. On load it writes a boot marker with its own PID
// (deterministic cleanup evidence even when the fd4 phase is never reached)
// and starts one unref'd Worker with execArgv:[] that polls private
// zero-byte flag files: the release flag completes the main-thread barrier
// through a SharedArrayBuffer, and the crash flag or an absolute 30s
// watchdog makes the same Node process self-SIGKILL immediately after
// writing the private cause marker (requested or watchdog), so no test
// code ever signals the child. The main thread wraps only the first fd4
// write: it polls for the durably published lifecycle record so the public
// phase marker (pid/instanceId/url, never capability) can only carry the
// published identity, blocks until release, then calls the original
// writeSync. An EPIPE result is reported in the pipe marker and rethrown so
// the real managed entrypoint keeps the published, healthy runtime running.
// Both crash sites write the cause marker consistently before the signal.
const orphanPreload = `import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';

const environment = {
  controlDir: process.env.CODESKETCH_ORPHAN_CONTROL,
  dataDir: process.env.CODESKETCH_ORPHAN_DATA,
  bootMarkerPath: process.env.CODESKETCH_ORPHAN_BOOT,
  markerPath: process.env.CODESKETCH_ORPHAN_MARKER,
  pipeMarkerPath: process.env.CODESKETCH_ORPHAN_PIPE,
  causeMarkerPath: process.env.CODESKETCH_ORPHAN_CAUSE,
};
const missing = Object.keys(environment).filter((key) => !environment[key]);
if (missing.length > 0 && missing.length < Object.keys(environment).length) {
  throw new Error('the orphan preload requires every private path explicitly: missing ' + missing.join(', '));
}

if (missing.length === 0) {
  const { controlDir, dataDir, bootMarkerPath, markerPath, pipeMarkerPath, causeMarkerPath } = environment;
  fs.writeFileSync(bootMarkerPath, JSON.stringify({ pid: process.pid }) + '\n', { mode: 0o600 });
  const writeCause = (cause) => {
    try {
      fs.writeFileSync(causeMarkerPath, JSON.stringify({ cause, pid: process.pid }) + '\n', { mode: 0o600 });
    } catch (error) {}
  };
  const sab = new SharedArrayBuffer(8);
  const flags = new Int32Array(sab);
  const releaseFlag = path.join(controlDir, 'release.flag');
  const crashFlag = path.join(controlDir, 'crash.flag');
  const recordPath = path.join(dataDir, 'lifecycle.json');
  const workerSource = [
    "const fs = require('node:fs');",
    "const { workerData } = require('node:worker_threads');",
    "const flags = new Int32Array(workerData.sab);",
    "const deadline = Date.now() + workerData.watchdogMs;",
    "const writeCause = (cause) => {",
    "  try {",
    "    fs.writeFileSync(workerData.causePath, JSON.stringify({ cause, pid: process.pid }) + '\\n', { mode: 0o600 });",
    "  } catch (error) {}",
    "};",
    "(function poll() {",
    "  if (fs.existsSync(workerData.crashFlag) || Date.now() > deadline) {",
    "    writeCause(fs.existsSync(workerData.crashFlag) ? 'requested' : 'watchdog');",
    "    process.kill(process.pid, 'SIGKILL');",
    "    return;",
    "  }",
    "  if (fs.existsSync(workerData.releaseFlag) && Atomics.load(flags, 0) === 0) {",
    "    Atomics.store(flags, 0, 1);",
    "    Atomics.notify(flags, 0, Infinity);",
    "  }",
    "  setTimeout(poll, 20);",
    "})();",
  ].join('\n');
  const worker = new Worker(workerSource, { eval: true, execArgv: [],
    workerData: { sab, releaseFlag, crashFlag, causePath: causeMarkerPath, watchdogMs: 30000 } });
  worker.unref();

  const originalWriteSync = fs.writeSync;
  let armed = false;
  fs.writeSync = function (fd, ...rest) {
    if (fd === 4 && !armed) {
      armed = true;
      // The actual fd4 readiness write only happens after the awaited
      // durable publishOwnership, so the published record must already
      // exist here; an absent record surfaces immediately.
      const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
      fs.writeFileSync(markerPath, JSON.stringify({ pid: process.pid,
        instanceId: record.instanceId, url: record.url }) + '\n', { mode: 0o600 });
      while (Atomics.load(flags, 0) === 0) {
        if (fs.existsSync(crashFlag)) {
          writeCause('requested');
          process.kill(process.pid, 'SIGKILL');
        }
        Atomics.wait(flags, 0, 0, 500);
      }
      try {
        return originalWriteSync.call(fs, fd, ...rest);
      } catch (error) {
        const result = error && error.code === 'EPIPE' ? 'epipe' : 'error:' + String(error && error.code);
        fs.writeFileSync(pipeMarkerPath, JSON.stringify({ result }) + '\n', { mode: 0o600 });
        throw error;
      }
    }
    return originalWriteSync.call(fs, fd, ...rest);
  };
  syncBuiltinESMExports();
}`

// writeOrphanPreload materializes the preload into the private case
// directory and returns its path for the percent-encoded NODE_OPTIONS URL.
func writeOrphanPreload(t *testing.T, dir string) string {
	t.Helper()
	path := filepath.Join(dir, "orphan-preload.mjs")
	if err := os.WriteFile(path, []byte(orphanPreload), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}
