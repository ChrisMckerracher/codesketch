// Test-only preload for managed publication fault injection. It is loaded
// through `--import` by tests, never shipped or imported by the application.
// It fails exactly one directory sync on the data directory identified by
// its dev/ino environment, then lets every later sync (including cleanup)
// succeed. Without the environment variables this module is inert.

import { writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';

const targetDev = Number(process.env.CODESKETCH_TEST_DIRSYNC_DEV);
const targetIno = Number(process.env.CODESKETCH_TEST_DIRSYNC_INO);
const proofPath = process.env.CODESKETCH_TEST_DIRSYNC_PROOF;

if (proofPath && Number.isSafeInteger(targetDev) && Number.isSafeInteger(targetIno)) {
  const probe = await open('/dev/null', 'r');
  const handles = Object.getPrototypeOf(probe);
  await probe.close();
  const sync = handles.sync;
  let injected = 0;
  handles.sync = async function () {
    const stats = await this.stat();
    if (injected === 0 && stats.dev === targetDev && stats.ino === targetIno && stats.isDirectory()) {
      injected += 1;
      try {
        writeFileSync(proofPath, `${injected}\n`, { flag: 'a', mode: 0o600 });
      } catch {}
      throw Object.assign(new Error('injected ownership directory sync failure'), { code: 'EIO' });
    }
    return sync.call(this);
  };
}
