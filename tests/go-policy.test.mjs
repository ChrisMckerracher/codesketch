import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyGoPolicy } from '../tools/go-policy/index.mjs';
import { goEnvironment, jsonObjects } from '../tools/go-policy/environment.mjs';
import { MODULE, importsOf, repositoryFiles, checkSources, checkDirection } from '../tools/go-policy/source.mjs';
import { checkManifest, checkModules, checkPackages, checkEmbeds } from '../tools/go-policy/inventory.mjs';

const assets = readFileSync(new URL('../assets.go', import.meta.url), 'utf8');
const guide = 'docs/agent-guide.md';
const renderer = ['src/painting/rendering/index.mjs', 'src/painting/rendering/stroke.mjs'];
const embeds = [guide, ...renderer];

function fixture(t, changes = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'codesketch-go-policy-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    'go.mod': `module ${MODULE}\n\ngo 1.25.7\n`, 'assets.go': assets,
    [guide]: 'Fixture instructions.\n', [renderer[0]]: 'export const fixture = true;\n',
    [renderer[1]]: 'export const fixture = true;\n', ...changes,
  };
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

function moduleAt(root) { return { Path: MODULE, Main: true, Dir: root }; }
function packageAt(root, extra = {}) {
  return { ImportPath: MODULE, Module: moduleAt(root), Dir: root, Imports: ['embed'], EmbedPatterns: embeds, EmbedFiles: embeds, ...extra };
}

test('Go environment disables downloads, workspace files, persistent flags and build overrides', () => {
  const env = goEnvironment({ GOTOOLCHAIN: 'auto', GOPROXY: 'https://example.invalid', GOSUMDB: 'sum.example.invalid', GOWORK: '/tmp/evil', GOFLAGS: '-modfile=evil.mod', GOENV: '/tmp/evil', CGO_ENABLED: '1' });
  assert.deepEqual([env.GOTOOLCHAIN, env.GOPROXY, env.GOSUMDB, env.GOWORK, env.GOFLAGS, env.GOENV, env.CGO_ENABLED], ['local', 'off', 'off', 'off', '', 'off', '1']);
});

test('accepts a complete isolated module with canonical assets and real resolved inventory', t => {
  const root = fixture(t);
  const result = verifyGoPolicy(root);
  assert.equal(result.sources, 1);
  assert.ok(result.packages > 1);
});

test('manifest rejects dependency, replacement, toolchain and module changes', t => {
  for (const suffix of ['require example.invalid/pkg v1.0.0', 'replace example.invalid/pkg => ./local', 'toolchain go1.26.0', 'exclude example.invalid/pkg v1.0.0', 'retract v1.0.0']) {
    const root = fixture(t, { 'go.mod': `module ${MODULE}\n\ngo 1.25.7\n${suffix}\n` });
    assert.throws(() => checkManifest(root), /dependencies, replacements and toolchain/);
  }
  assert.throws(() => checkManifest(fixture(t, { 'go.mod': 'module example.invalid/other\n\ngo 1.25.7\n' })), /approved module/);
});

test('rejects lockfiles, vendoring and nested workspaces/modules anywhere in source', t => {
  for (const path of ['go.sum', 'go.work', 'go.work.sum', 'vendor/modules.txt', 'internal/cli/nested/go.mod', 'internal/cli/nested/go.work']) {
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
  checkPackages(root, [{ Standard: true }, packageAt(root)]);
  for (const pkg of [packageAt(root, { Module: { Path: 'example.invalid/x' } }), packageAt(root, { Module: moduleAt(other) }), packageAt(root, { CgoFiles: ['c.go'] })]) {
    assert.throws(() => checkPackages(root, [pkg]), /external resolved package|CGo sources/);
  }
});

test('parses Go imports across comments, aliases and platform-excluded sources', t => {
  const source = '//go:build plan9\npackage capture\n// import "ignored.invalid"\nimport (\n _ "context"\n evil `example.invalid/pkg`\n)\n';
  assert.deepEqual(importsOf(source), ['context', 'example.invalid/pkg']);
  const root = fixture(t, { 'internal/cli/capture/hidden.go': source });
  assert.throws(() => checkSources(root, repositoryFiles(root), new Set(['embed', 'context'])), /non-standard Go import/);
  assert.throws(() => importsOf('package x; import "example\\x2einvalid/pkg"'), /Escaped/);
});

test('enforces source ceiling and approved package contexts', t => {
  const oversized = `package capture\n${'// source line\n'.repeat(300)}`;
  let root = fixture(t, { 'internal/cli/capture/large.go': oversized });
  assert.throws(() => checkSources(root, repositoryFiles(root), new Set(['embed'])), /exceeds 300/);
  root = fixture(t, { 'internal/unapproved/app.go': 'package app\n' });
  assert.throws(() => checkSources(root, repositoryFiles(root), new Set(['embed'])), /unapproved Go source context/);
});

test('enforces package dependency direction for assets, entrypoint and nested contexts', () => {
  for (const [from, to] of [['', 'internal/cli'], ['internal/cli/capture', 'internal/cli'], ['internal/cli/input', 'internal/cli/transport'], ['cmd/paint', 'internal/cli/capture']]) {
    assert.throws(() => checkDirection(from, `${MODULE}/${to}`), /cannot import/);
  }
  for (const [from, to] of [['internal/cli', '/internal/cli/capture'], ['cmd/paint', '/internal/cli'], ['internal/cli/capture', ''], ['internal/cli', '']]) checkDirection(from, MODULE + to);
});

test('requires exact canonical renderer and guide embeds', t => {
  const root = fixture(t);
  checkEmbeds(root, [packageAt(root)]);
  for (const patterns of [[], [...embeds, 'copy.mjs'], [guide, 'src/painting/rendering/*']]) {
    assert.throws(() => checkEmbeds(root, [packageAt(root, { EmbedPatterns: patterns })]), /exactly the canonical/);
  }
  const renamed = fixture(t, { 'assets.go': assets.replace('var AgentGuide string', 'var CopiedGuide string') });
  assert.throws(() => checkEmbeds(renamed, [packageAt(renamed)]), /Missing canonical AgentGuide/);
  assert.throws(() => checkEmbeds(root, [packageAt(root), packageAt(root, { ImportPath: `${MODULE}/internal/cli/capture`, EmbedPatterns: ['copied-renderer.mjs'] })]), /unapproved embed/);
  const hidden = fixture(t, { 'internal/cli/capture/hidden.go': '//go:build plan9\npackage capture\nimport _ "embed"\n//go:embed *.mjs\nvar hidden string\n' });
  assert.throws(() => checkSources(hidden, repositoryFiles(hidden), new Set(['embed'])), /unapproved embed/);
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
  const root = fixture(t, { 'internal/cli/input/format.go': 'package input\nfunc Value( )int{return 1}\n' });
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
  const result = verifyJavaScriptFixture(t, 'internal/cli/capture/page.mjs', './rendering/index.mjs');
  assert.equal(result.status, 0, result.stderr);
});

test('embedded route mapping rejects other importers, paths and missing canonical source', t => {
  for (const [importer, spec, canonical] of [
    ['internal/cli/capture/other.mjs', './rendering/index.mjs', true],
    ['internal/cli/capture/page.mjs', './rendering/missing.mjs', true],
    ['internal/cli/capture/page.mjs', './rendering/index.mjs', false],
  ]) {
    const result = verifyJavaScriptFixture(t, importer, spec, canonical);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /does not exist on disk/);
  }
});
