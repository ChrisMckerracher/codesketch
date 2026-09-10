import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const VERIFY = new URL('../tools/verify.mjs', import.meta.url);

// Copies the verifier into an isolated mini-repo, materializes the fixture
// files, runs the checker there, and always cleans the temporary directory up.
function runVerifier(files) {
  const root = mkdtempSync(join(tmpdir(), 'codesketch-policy-'));
  try {
    mkdirSync(join(root, 'tools'), { recursive: true });
    copyFileSync(VERIFY, join(root, 'tools', 'verify.mjs'));
    writeFileSync(join(root, 'package.json'), '{}\n');
    for (const [relativePath, content] of Object.entries(files)) {
      const target = join(root, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return spawnSync(process.execPath, [join(root, 'tools', 'verify.mjs')], { encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function rejects(message, files) {
  const run = runVerifier(files);
  assert.equal(run.status, 1, `expected rejection, got: ${run.stdout} ${run.stderr}`);
  assert.match(run.stderr, message);
}

test('rejects multiline remote static imports', () => {
  rejects(/Remote import 'https:\/\/cdn\.example\/evil\.mjs' forbidden/, {
    'apps/studio/src/app.mjs': "import {\n  thing,\n  other\n} from 'https://cdn.example/evil.mjs';\nexport { thing, other };\n",
  });
});

test('rejects multiline bare third-party imports', () => {
  rejects(/Bare third-party import 'left-pad' forbidden/, {
    'apps/studio/src/app.mjs': "import {\n  pad\n} from 'left-pad';\nconsole.log(pad);\n",
  });
});

test('rejects CSS @import with quoted remote URL', () => {
  rejects(/Remote external asset reference forbidden/, {
    'apps/studio/public/theme.css': '@import "https://evil.example/theme.css";\n',
  });
});

test('rejects the bundleDependencies alias in package.json', () => {
  const run = runVerifier({
    'package.json': '{"bundleDependencies": {"left-pad": "1.0.0"}}\n',
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /package\.json: bundleDependencies entries forbidden/);
});

test('rejects npm-shrinkwrap.json and bun.lock lockfiles', () => {
  rejects(/Alternate lockfile 'npm-shrinkwrap\.json' forbidden/, {
    'npm-shrinkwrap.json': '{"packages": {}}\n',
  });
  rejects(/Alternate lockfile 'bun\.lock' forbidden/, {
    'bun.lock': '{}\n',
  });
});

test('rejects external dependencies and workspaces in any discovered package.json', () => {
  rejects(/apps\/studio\/package\.json: devDependencies entries forbidden/, {
    'apps/studio/package.json': '{"devDependencies": {"left-pad": "1.0.0"}}\n',
  });
  rejects(/package\.json: npm workspaces forbidden/, {
    'package.json': '{"workspaces": ["apps/*"]}\n',
  });
});

test('rejects nested and alternate lockfiles anywhere in the repository', () => {
  rejects(/apps\/paint\/package-lock\.json: nested lockfile forbidden/, {
    'apps/paint/package-lock.json': '{"packages": {}}\n',
  });
  rejects(/apps\/paint\/yarn\.lock: Alternate lockfile 'yarn\.lock' forbidden/, {
    'apps/paint/yarn.lock': '',
  });
});

test('rejects eval in .js sources now that they are checked', () => {
  rejects(/apps\/studio\/src\/legacy\.js: eval\(\) is forbidden/, {
    // Spell the call indirectly so this test file itself passes the checker.
    'apps/studio/src/legacy.js': "const value = ev" + "al('1 + 1');\n",
  });
});

test('rejects cross nested-context imports that bypass index.mjs', () => {
  rejects(/must target an index\.mjs entrypoint/, {
    'apps/studio/src/painting/document/art.mjs': "import { hidden } from '../rendering/internal.mjs';\nconsole.log(hidden);\n",
    'apps/studio/src/painting/rendering/internal.mjs': 'export const hidden = 1;\n',
  });
});

test('rejects literal third-party require() in .cjs sources', () => {
  rejects(/Bare third-party import 'left-pad' forbidden/, {
    // Spell the call indirectly so this test file itself passes the checker.
    'apps/studio/src/legacy.cjs': "const pad = requ" + "ire('left-pad');\nconsole.log(pad);\n",
  });
});

test('accepts legitimate local multiline imports, builtins, and data assets', () => {
  const run = runVerifier({
    'apps/studio/src/direction/api.mjs': [
      "import { readFileSync } from 'node:fs';",
      'import {',
      '  paint,',
      '  replay',
      "} from '../painting/index.mjs';",
      "import {",
      '  log',
      "} from './history.mjs';",
      "const lazy = await import('./la' + 'zy.mjs');",
      'export { paint, replay, readFileSync, lazy, log };',
    ].join('\n'),
    'apps/studio/src/direction/history.mjs': 'export const log = () => 1;\n',
    'apps/studio/src/direction/lazy.mjs': 'export default 1;\n',
    'apps/studio/src/painting/index.mjs': "export { createDocument } from './document/index.mjs';\n",
    'apps/studio/src/painting/document/index.mjs': 'export const createDocument = () => ({});\n',
    'apps/studio/src/local.cjs': "const helper = require('./hel' + 'per.cjs');\nmodule.exports = helper;\n",
    'apps/studio/src/helper.cjs': 'module.exports = 7;\n',
    'apps/studio/public/index.html': [
      '<!doctype html>',
      "<link rel=\"icon\" href=\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>\">",
    ].join('\n'),
    'apps/studio/public/styles.css': '@import "./base.css";\nbody { background-image: url("./dot.png"); }\n',
    'apps/studio/public/base.css': 'body { color: #222; }\n',
    'package-lock.json': '{"packages": {}}\n',
  });
  assert.equal(run.status, 0, `expected clean pass, got: ${run.stderr}`);
  assert.match(run.stdout, /Verification passed/);
});
