import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE, repositoryFiles, checkSources, checkDirection } from '../tools/go-policy/source.mjs';
import { studioRuntimeFiles } from '../tools/go-policy/runtime-inventory.mjs';
import { checkEmbeds } from '../tools/go-policy/inventory.mjs';
import { STUDIO_ASSETS, fixture, studioEmbeds, studioPackage, docsPackage } from './go-policy-fixture.mjs';

test('lifecycle context may import studio assets and keeps every other boundary', t => {
  checkDirection('apps/paint/internal/cli/lifecycle', `${MODULE}/apps/studio`);
  checkDirection('apps/paint/internal/cli/lifecycle/nested', `${MODULE}/apps/studio`);
  for (const to of ['docs', 'apps/paint/cmd/paint', 'apps/paint/internal/cli/capture', 'apps/paint/internal/cli/transport']) {
    assert.throws(() => checkDirection('apps/paint/internal/cli/lifecycle', `${MODULE}/${to}`), /cannot import/);
  }
  const root = fixture(t, {
    'apps/paint/internal/cli/lifecycle/manager.go': `package lifecycle\n\nimport _ "${MODULE}/apps/studio"\n`,
  });
  checkSources(root, repositoryFiles(root), new Set(['embed']));
});

test('studio runtime inventory requires an embed for every source and public file', t => {
  const extra = 'src/transport/index.mjs';
  const root = fixture(t, { [`apps/studio/${extra}`]: 'export const fixture = true;\n' });
  const complete = [...studioEmbeds, extra];
  checkEmbeds(root, [studioPackage(root, { EmbedPatterns: complete, EmbedFiles: complete }), docsPackage(root)]);
  assert.throws(
    () => checkEmbeds(root, [studioPackage(root), docsPackage(root)]),
    error => /exactly the canonical assets bundle/.test(error.message) &&
             /missing \[src\/transport\/index\.mjs\]/.test(error.message),
  );
});

test('studio assets reject wildcard, directory, and unexpected test embeds', t => {
  for (const pattern of ['src/painting/rendering/*.mjs', 'all:public', 'src', 'tests/http.test.mjs']) {
    const root = fixture(t, { 'apps/studio/assets.go': `${STUDIO_ASSETS}\n//go:embed ${pattern}\nvar Stray embed.FS\n` });
    assert.throws(() => checkSources(root, repositoryFiles(root), new Set(['embed'])), /unapproved embed/);
  }
});

test('studio runtime inventory rejects unexpected non-module and unsafe src paths', t => {
  assert.throws(
    () => studioRuntimeFiles(fixture(t, { 'apps/studio/src/notes.md': 'Stray notes.\n' })),
    /non-module files: src\/notes\.md/,
  );
  assert.throws(
    () => studioRuntimeFiles(fixture(t, { 'apps/studio/src/bad\\name.mjs': 'export const fixture = true;\n' })),
    /manifest-safe path contract/,
  );
});

test('guidance markdown anywhere in the runtime tree is never shipped', t => {
  const root = fixture(t, {
    'apps/studio/src/README.md': '# Source guidance.\n',
    'apps/studio/src/transport/AGENTS.md': 'Transport guidance.\n',
    'apps/studio/public/README.md': '# Public guidance.\n',
  });
  const inventory = studioRuntimeFiles(root);
  assert.ok(!inventory.some(path => path.endsWith('README.md') || path.endsWith('AGENTS.md')));
  assert.deepEqual(inventory, studioEmbeds);
});
