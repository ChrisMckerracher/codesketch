package lifecycle

import (
	"os"
	"path/filepath"
	"testing"
)

// childCrashPreload is the test-only Node preload for deterministic child
// self-crash evidence. It is materialized into the private case directory,
// outside the extracted runtime tree, and loaded through NODE_OPTIONS
// --import before the managed imports execute, so the wrapper below is
// visible to the ownership publication code. The wrapper matches only the
// exact ownership rename (destination lifecycle.json inside the case data
// directory with the frozen temporary source basename) and turns it into a
// process-death barrier at the assigned phase: immediately before the
// original rename, or after the rename succeeded but before the caller can
// run its directory sync. The marker carries the phase and the public
// identity fields read from the temporary record (before) or the final
// record (after); capability material never reaches the marker. Without the
// environment variables this module is inert.
const childCrashPreload = `import fs from 'node:fs';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';

const dataDir = process.env.CODESKETCH_CRASH_PRELOAD_DATA;
const phase = process.env.CODESKETCH_CRASH_PRELOAD_PHASE;
const markerPath = process.env.CODESKETCH_CRASH_PRELOAD_MARKER;

if (dataDir && markerPath && (phase === 'before' || phase === 'after')) {
  const originalRename = fsp.rename;
  const tempName = /^\.lifecycle\.[0-9a-f]{16}\.tmp$/;
  let armed = false;
  const writeMarker = (record) => {
    const marker = { phase, instanceId: record.instanceId, pid: record.pid, url: record.url };
    fs.writeFileSync(markerPath, JSON.stringify(marker) + '\n', { mode: 0o600 });
  };
  fsp.rename = async function (from, to) {
    const source = String(from);
    const matched = !armed && path.resolve(String(to)) === path.resolve(dataDir, 'lifecycle.json') &&
      path.dirname(path.resolve(source)) === path.resolve(dataDir) && tempName.test(path.basename(source));
    if (matched) {
      armed = true;
      if (phase === 'before') {
        writeMarker(JSON.parse(fs.readFileSync(source, 'utf8')));
        process.kill(process.pid, 'SIGKILL');
      }
      const result = await originalRename.call(fsp, from, to);
      if (phase === 'after') {
        writeMarker(JSON.parse(fs.readFileSync(path.join(dataDir, 'lifecycle.json'), 'utf8')));
        process.kill(process.pid, 'SIGKILL');
      }
      return result;
    }
    return originalRename.call(fsp, from, to);
  };
  syncBuiltinESMExports();
}`

// writeCrashPreload materializes the preload into the private case directory
// and returns its path for the percent-encoded NODE_OPTIONS import URL.
func writeCrashPreload(t *testing.T, dir string) string {
	t.Helper()
	path := filepath.Join(dir, "crash-preload.mjs")
	if err := os.WriteFile(path, []byte(childCrashPreload), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}
