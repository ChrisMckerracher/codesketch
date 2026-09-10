import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyGoPolicy } from '../tools/go-policy/index.mjs';
import { goEnvironment, jsonObjects } from '../tools/go-policy/environment.mjs';
import { MODULE, importsOf, repositoryFiles, checkSources, checkDirection } from '../tools/go-policy/source.mjs';
import { checkManifest, checkModules, checkPackages, checkEmbeds } from '../tools/go-policy/inventory.mjs';
import {
  DOCS_ASSETS, STUDIO_ASSETS, artistSkill, docsDeclarations, docsEmbeds, docsPackage,
  fixture, guide, moduleAt, packageAt, renderer, studioDeclarations, studioEmbeds, studioPackage,
} from './go-policy-fixture.mjs';

test('Go environment disables downloads, workspace files, persistent flags and build overrides', () => {
  const env = goEnvironment({ GOTOOLCHAIN: 'auto', GOPROXY: 'https://example.invalid', GOSUMDB: 'sum.example.invalid', GOWORK: '/tmp/evil', GOFLAGS: '-modfile=evil.mod', GOENV: '/tmp/evil', CGO_ENABLED: '1' });
  assert.deepEqual([env.GOTOOLCHAIN, env.GOPROXY, env.GOSUMDB, env.GOWORK, env.GOFLAGS, env.GOENV, env.CGO_ENABLED], ['local', 'off', 'off', 'off', '', 'off', '1']);
});

test('accepts a complete isolated module with canonical assets and real resolved inventory', t => {
  const result = verifyGoPolicy(fixture(t));
  assert.equal(result.sources, 2);
  assert.ok(result.packages > 2);
});

test('manifest rejects dependency, replacement, toolchain and module changes', t => {
  for (const suffix of ['require example.invalid/pkg v1.0.0', 'replace example.invalid/pkg => ./local', 'toolchain go1.26.0', 'exclude example.invalid/pkg v1.0.0', 'retract v1.0.0']) {
    const root = fixture(t, { 'go.mod': `module ${MODULE}\n\ngo 1.25.7\n${suffix}\n` });
    assert.throws(() => checkManifest(root), /dependencies, replacements and toolchain/);
  }
  assert.throws(() => checkManifest(fixture(t, { 'go.mod': 'module example.invalid/other\n\ngo 1.25.7\n' })), /approved module/);
});

test('rejects lockfiles, vendoring and nested workspaces/modules anywhere in source', t => {
  for (const path of ['go.sum', 'go.work', 'go.work.sum', 'vendor/modules.txt', 'apps/paint/internal/cli/nested/go.mod', 'apps/paint/internal/cli/nested/go.work']) {
    assert.throws(() => repositoryFiles(fixture(t, { [path]: '' })), /forbidden/);
  }
});

test('ignores generated binary/artifact directories', t => {
  const root = fixture(t, { 'bin/paint': 'binary', 'artifacts/fixture/go.sum': '' });
  assert.ok(repositoryFiles(root).every(file => !file.includes('/bin/') && !file.includes('/artifacts/')));
});

test('module and package inventory reject replacements and external directories', t => {
  const root = fixture(t), other = fixture(t);
  checkModules(root, [moduleAt(root)]);
  for (const modules of [[], [moduleAt(root), { Path: 'example.invalid/x' }], [{ ...moduleAt(root), Replace: {} }], [moduleAt(other)]]) {
    assert.throws(() => checkModules(root, modules), /only the local root module/);
  }
  checkPackages(root, [{ Standard: true }, studioPackage(root), docsPackage(root)]);
  for (const pkg of [studioPackage(root, { Module: { Path: 'example.invalid/x' } }), studioPackage(root, { Module: moduleAt(other) }), docsPackage(root, { CgoFiles: ['c.go'] })]) {
    assert.throws(() => checkPackages(root, [pkg]), /external resolved package|CGo sources/);
  }
});

test('parses Go imports across comments, aliases and platform-excluded sources', t => {
  const source = '//go:build plan9\npackage capture\n// import "ignored.invalid"\nimport (\n _ "context"\n evil `example.invalid/pkg`\n)\n';
  assert.deepEqual(importsOf(source), ['context', 'example.invalid/pkg']);
  const root = fixture(t, { 'apps/paint/internal/cli/capture/hidden.go': source });
  assert.throws(() => checkSources(root, repositoryFiles(root), new Set(['embed', 'context'])), /non-standard Go import/);
  assert.throws(() => importsOf('package x; import "example\\x2einvalid/pkg"'), /Escaped/);
});

test('enforces source ceiling and approved package contexts', t => {
  const oversized = `package capture\n${'// source line\n'.repeat(300)}`;
  let root = fixture(t, { 'apps/paint/internal/cli/capture/large.go': oversized });
  assert.throws(() => checkSources(root, repositoryFiles(root), new Set(['embed'])), /exceeds 300/);
  root = fixture(t, { 'apps/paint/internal/cli/gallery/app.go': 'package gallery\n' });
  assert.throws(() => checkSources(root, repositoryFiles(root), new Set(['embed'])), /unapproved Go source context/);
});

test('enforces package dependency direction for assets, entrypoint and nested contexts', () => {
  for (const [from, to] of [
    ['', 'apps/paint/internal/cli'],
    ['apps/studio', 'apps/paint/internal/cli'],
    ['apps/studio', 'apps/paint/cmd/paint'],
    ['docs', 'apps/paint/internal/cli'],
    ['docs', 'apps/paint/cmd/paint'],
    ['apps/paint/cmd/paint', 'apps/paint/internal/cli/capture'],
    ['apps/paint/cmd/paint', 'docs'],
    ['apps/paint/internal/cli/capture', 'apps/paint/internal/cli'],
    ['apps/paint/internal/cli/capture', 'docs'],
    ['apps/paint/internal/cli/input', 'apps/paint/internal/cli/transport'],
    ['apps/paint/internal/cli/input', 'docs'],
    ['apps/paint/internal/cli', 'apps/studio'],
    ['apps/studio', 'docs'],
    ['docs', 'apps/studio'],
  ]) {
    assert.throws(() => checkDirection(from, `${MODULE}/${to}`), /cannot import/);
  }
  for (const [from, to] of [
    ['apps/paint/cmd/paint', '/apps/paint/internal/cli'],
    ['apps/paint/internal/cli', '/docs'],
    ['apps/paint/internal/cli', '/apps/paint/internal/cli'],
    ['apps/paint/internal/cli', '/apps/paint/internal/cli/capture'],
    ['apps/paint/internal/cli/capture', '/apps/studio'],
    ['apps/paint/internal/cli/capture', '/apps/paint/internal/cli/capture'],
    ['apps/paint/internal/cli/input', '/apps/paint/internal/cli/input'],
  ]) checkDirection(from, MODULE + to);
});

test('asset packages cannot import CLI or application packages from source', t => {
  const cliImport = STUDIO_ASSETS.replace('import _ "embed"', `import (\n _ "embed"\n _ "${MODULE}/apps/paint/internal/cli"\n)`);
  let root = fixture(t, { 'apps/studio/assets.go': cliImport });
  assert.throws(() => checkSources(root, repositoryFiles(root), new Set(['embed'])), /cannot import/);
  const cmdImport = DOCS_ASSETS.replace('import _ "embed"', `import (\n _ "embed"\n _ "${MODULE}/apps/paint/cmd/paint"\n)`);
  root = fixture(t, { 'docs/assets.go': cmdImport });
  assert.throws(() => checkSources(root, repositoryFiles(root), new Set(['embed'])), /cannot import/);
});

test('requires exact canonical renderer, guide and artist skill embeds', t => {
  const root = fixture(t);
  checkEmbeds(root, [studioPackage(root), docsPackage(root)]);
  for (const [pkg, field] of [[studioPackage(root), studioEmbeds], [docsPackage(root), docsEmbeds]]) {
    const other = pkg.ImportPath === `${MODULE}/apps/studio` ? docsPackage(root) : studioPackage(root);
    for (const patterns of [[], [...field, 'copy.mjs'], field.slice(1)]) {
      assert.throws(() => checkEmbeds(root, [{ ...pkg, EmbedPatterns: patterns }, other]), /exactly the canonical/);
    }
  }
  for (const [name, file, source] of [
    ...studioDeclarations.map(([name]) => [name, 'apps/studio/assets.go', STUDIO_ASSETS]),
    ...docsDeclarations.map(([name]) => [name, 'docs/assets.go', DOCS_ASSETS]),
  ]) {
    const renamed = fixture(t, { [file]: source.replace(`var ${name} string`, 'var Copied string') });
    assert.throws(() => checkEmbeds(renamed, [studioPackage(renamed), docsPackage(renamed)]), new RegExp(`Missing canonical ${name}`));
  }
  const strayCapture = packageAt(root, `${MODULE}/apps/paint/internal/cli/capture`, null,
    { EmbedPatterns: ['copied-renderer.mjs'], EmbedFiles: ['copied-renderer.mjs'] });
  assert.throws(() => checkEmbeds(root, [studioPackage(root), docsPackage(root), strayCapture]), /unapproved embed/);
  const hidden = fixture(t, { 'apps/paint/internal/cli/capture/hidden.go': '//go:build plan9\npackage capture\nimport _ "embed"\n//go:embed *.mjs\nvar hidden string\n' });
  assert.throws(() => checkSources(hidden, repositoryFiles(hidden), new Set(['embed'])), /unapproved embed/);
});

test('artist skill policy rejects missing references, extra resolved files and renamed declarations', t => {
  const root = fixture(t);
  for (const field of ['EmbedPatterns', 'EmbedFiles']) {
    for (const paths of [...artistSkill.map(missing => docsEmbeds.filter(path => `docs/${path}` !== missing)), [...docsEmbeds, 'artist-skill/stray.md']]) {
      assert.throws(() => checkEmbeds(root, [studioPackage(root), docsPackage(root, { [field]: paths })]), /exactly the canonical/);
    }
  }
  for (const context of ['apps/paint/internal/cli', 'apps/paint/internal/cli/capture']) {
    const pkg = packageAt(root, MODULE + '/' + context, null, { EmbedPatterns: [], EmbedFiles: ['stray.md'] });
    assert.throws(() => checkEmbeds(root, [studioPackage(root), docsPackage(root), pkg]), /unapproved embedded file/);
  }
});

test('source allowlist rejects stray and wildcard artist skill embeds including excluded sources', t => {
  for (const path of ['artist-skill/stray.md', 'artist-skill/*', 'artist-skill/references/*.md', 'artist-skill', 'all:artist-skill']) {
    const root = fixture(t, { 'docs/assets.go': `${DOCS_ASSETS}\n//go:embed ${path}\nvar Stray string\n` });
    assert.throws(() => checkSources(root, repositoryFiles(root), new Set(['embed'])), /unapproved embed/);
  }
  const root = fixture(t, { 'apps/paint/internal/cli/hidden.go': '//go:build plan9\npackage cli\nimport _ "embed"\n//go:embed stray.md\nvar hidden string\n' });
  assert.throws(() => checkSources(root, repositoryFiles(root), new Set(['embed'])), /unapproved embed/);
});

test('real inventory rejects an additional artist skill embed', t => {
  const root = fixture(t, {
    'docs/assets.go': `${DOCS_ASSETS}\n//go:embed artist-skill/stray.md\nvar Stray string\n`,
    'docs/artist-skill/stray.md': 'Unapproved extra instructions.\n',
  });
  const result = spawnSync('go', ['list', '-json', './docs'], { cwd: root, env: goEnvironment(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.throws(() => checkEmbeds(root, jsonObjects(result.stdout)), /exactly the canonical/);
  assert.throws(() => verifyGoPolicy(root), /unapproved embed/);
});

test('Make shares one policy prerequisite across build, install and verification', t => {
  const root = fixture(t);
  copyFileSync(new URL('../Makefile', import.meta.url), join(root, 'Makefile'));
  const result = spawnSync('make', ['-n', 'build', 'install', 'verify-go'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.split('node tools/verify-go.mjs --policy-only').length - 1, 1);
  assert.ok(result.stdout.indexOf('--policy-only') < result.stdout.indexOf('go build'));
  assert.match(result.stdout, /CGO_ENABLED=0 go build -trimpath -o bin\/paint/);
  assert.match(result.stdout, /CGO_ENABLED=1 go test -race/);
  assert.match(result.stdout, /GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOWORK=off GOFLAGS=/);
});

test('rejects unformatted Go source through the real installed formatter', t => {
  const root = fixture(t, { 'apps/paint/internal/cli/input/format.go': 'package input\nfunc Value( )int{return 1}\n' });
  assert.throws(() => verifyGoPolicy(root), /Go formatting failed/);
});

test('decodes streamed Go inventory with quoted braces and rejects malformed output', () => {
  assert.deepEqual(jsonObjects('{"s":"{\\\"}"}\n{"n":1}\n'), [{ s: '{"}' }, { n: 1 }]);
  for (const text of ['{"a":', '{"a":"x}', 'bad']) assert.throws(() => jsonObjects(text), /Go JSON inventory/);
});

function verifyJavaScriptFixture(t, importer, spec, canonical = true) {
  const root = fixture(t);
  mkdirSync(join(root, 'tools'), { recursive: true });
  copyFileSync(new URL('../tools/verify.mjs', import.meta.url), join(root, 'tools/verify.mjs'));
  const page = join(root, importer);
  mkdirSync(dirname(page), { recursive: true });
  writeFileSync(page, `await imp` + `ort('${spec}');\n`);
  if (!canonical) rmSync(join(root, renderer[0]));
  return spawnSync(process.execPath, [join(root, 'tools/verify.mjs')], { encoding: 'utf8' });
}

test('allows precisely the embedded capture page canonical renderer import', t => {
  const result = verifyJavaScriptFixture(t, 'apps/paint/internal/cli/capture/page.mjs', './rendering/index.mjs');
  assert.equal(result.status, 0, result.stderr);
});

test('embedded route mapping rejects other importers, paths and missing canonical source', t => {
  for (const [importer, spec, canonical] of [
    ['apps/paint/internal/cli/capture/other.mjs', './rendering/index.mjs', true],
    ['apps/paint/internal/cli/capture/page.mjs', './rendering/missing.mjs', true],
    ['apps/paint/internal/cli/capture/page.mjs', './rendering/index.mjs', false],
  ]) {
    const result = verifyJavaScriptFixture(t, importer, spec, canonical);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /does not exist on disk/);
  }
});
