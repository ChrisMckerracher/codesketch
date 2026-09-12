import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStudio } from '../src/transport/index.mjs';

const realRoot = fileURLToPath(new URL('../', import.meta.url));

async function startStudio(root) {
  const { server } = await createStudio({ root });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const request = path => new Promise((resolveRequest, rejectRequest) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolveRequest({ status: response.statusCode,
        headers: response.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('client timeout')));
    req.on('error', rejectRequest);
    req.end();
  });
  return {
    request,
    close: () => new Promise(resolve => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}

test('root and public entrypoint serve the canonical shell with security headers', async t => {
  const studio = await startStudio(realRoot);
  t.after(() => studio.close());
  const root = await studio.request('/');
  assert.equal(root.status, 200);
  assert.match(root.headers['content-type'], /^text\/html; charset=utf-8$/);
  assert.ok(root.text.includes('id="studio-app"'), 'root serves the canonical studio shell');
  assert.ok(root.text.includes('/src/studio/index.mjs'), 'shell links the studio entrypoint');
  assert.ok(root.text.includes('href="/public/icon.svg"'), 'shell links the explicit SVG application icon');
  const entry = await studio.request('/public/index.html');
  assert.equal(entry.status, 200);
  assert.equal(entry.text, root.text, 'public/index.html is the same explicitly allowed file');
  const csp = root.headers['content-security-policy'];
  for (const directive of ["default-src 'self'", "script-src 'self'", "style-src 'self'",
    "img-src 'self' blob: data:", "connect-src 'self'", "object-src 'none'",
    "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"]) {
    assert.ok(csp.includes(directive), `CSP must include ${directive}`);
  }
  assert.equal(root.headers['x-content-type-options'], 'nosniff');
  assert.equal(root.headers['referrer-policy'], 'no-referrer');
  assert.equal(root.headers['cache-control'], 'no-store');
  assert.equal(root.headers['cross-origin-resource-policy'], 'same-origin');
});

test('the application icon serves as the one explicit SVG with no favicon alias', async t => {
  const studio = await startStudio(realRoot);
  t.after(() => studio.close());
  const icon = await studio.request('/public/icon.svg');
  assert.equal(icon.status, 200);
  assert.match(icon.headers['content-type'], /^image\/svg\+xml; charset=utf-8$/);
  assert.ok(icon.text.startsWith('<svg'), 'the icon is a code-native SVG document');
  assert.ok(icon.text.includes('#3b82f6') && icon.text.includes('#8b5cf6'),
    'the icon carries the canonical blue-violet brand gradient');
  assert.equal(icon.headers['x-content-type-options'], 'nosniff');
});

test('query strings are stripped from static request targets', async t => {
  const studio = await startStudio(realRoot);
  t.after(() => studio.close());
  const stylesheet = await studio.request('/public/workspace.css?cachebust=123');
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers['content-type'], /^text\/css; charset=utf-8$/);
  const shell = await studio.request('/?edition=compact');
  assert.equal(shell.status, 200);
  assert.match(shell.headers['content-type'], /^text\/html/);
});

test('existing allowlisted stylesheets serve as CSS and retained modules still serve', async t => {
  const studio = await startStudio(realRoot);
  t.after(() => studio.close());
  for (const name of ['workspace']) {
    const response = await studio.request(`/public/${name}.css`);
    assert.equal(response.status, 200, `${name}.css must serve`);
    assert.match(response.headers['content-type'], /^text\/css; charset=utf-8$/);
    assert.ok(response.text.length > 0, `${name}.css must not be empty`);
  }
  const retained = await studio.request('/src/studio/api.mjs');
  assert.equal(retained.status, 200, 'retained studio logic modules still serve');
  assert.match(retained.headers['content-type'], /^text\/javascript/);
});

test('unknown public files and non-allowlisted names return JSON 404', async t => {
  const studio = await startStudio(realRoot);
  t.after(() => studio.close());
  for (const path of ['/public/README.md', '/public/base.css', '/public/tokens.cssx',
    '/public/tokens.css', '/public/controls.css', '/public/layers.css',
    '/public/inspector.css', '/public/stage.css', '/public/feedback.css',
    '/public/tokens', '/public/', '/public/index.html/', '/index.html', '/favicon.ico',
    '/public/workspace.css/extra', '/PUBLIC/INDEX.HTML']) {
    const response = await studio.request(path);
    assert.equal(response.status, 404, `${path} must not be served`);
    assert.equal(response.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(response.text), { error: 'Not found' });
  }
});

test('forbidden paths, traversal, encoded escapes, and NUL bytes never serve', async t => {
  const studio = await startStudio(realRoot);
  t.after(() => studio.close());
  for (const path of ['/.git/config', '/src/transport/server.mjs', '/src/painting/index.mjs/../../transport/http.mjs',
    '/..%2fpublic%2findex.html', '/public/..%2fsrc%2ftransport%2fserver.mjs',
    '/src/studio/..%2f..%2ftransport%2fhttp.mjs', '/public/index.html%00.css',
    '/%00', '/public/..%2fpublic%2findex.html', '/public/%2e%2e/public/index.html',
    '/public/./tokens.css', '/public/..%5ctokens.css', '/public\\tokens.css',
    '/src/studio/../../../etc/passwd']) {
    const response = await studio.request(path);
    assert.equal(response.status, 404, `${path} must not be served`);
    assert.equal(response.headers['content-type'], 'application/json');
  }
});

test('disposable fixtures prove allowlist behavior and reject escaping symlinks', async t => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'static-ui-'));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  mkdirSync(join(fixtureRoot, 'public'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'src', 'studio'), { recursive: true });
  writeFileSync(join(fixtureRoot, 'public', 'index.html'),
    '<!doctype html><html><body id="studio-app">fixture shell</body></html>');
  writeFileSync(join(fixtureRoot, 'public', 'workspace.css'), '.fixture { color: currentColor; }\n');
  writeFileSync(join(fixtureRoot, 'src', 'studio', 'fixture.mjs'), 'export const fixture = 1;\n');
  symlinkSync('/etc/hostname', join(fixtureRoot, 'src', 'studio', 'escape.mjs'));
  const studio = await startStudio(fixtureRoot);
  t.after(() => studio.close());
  const entry = await studio.request('/');
  assert.equal(entry.status, 200);
  assert.ok(entry.text.includes('fixture shell'), 'fixture entrypoint serves from the disposable root');
  const stylesheet = await studio.request('/public/workspace.css');
  assert.equal(stylesheet.status, 200, 'allowlisted fixture stylesheet serves');
  assert.match(stylesheet.headers['content-type'], /^text\/css/);
  const module = await studio.request('/src/studio/fixture.mjs');
  assert.equal(module.status, 200, 'retained module fixture serves');
  const missing = await studio.request('/public/inspector.css');
  assert.equal(missing.status, 404, 'allowlisted name with no file still returns 404');
  rmSync(join(fixtureRoot, 'public', 'workspace.css'));
  symlinkSync('/etc/hostname', join(fixtureRoot, 'public', 'workspace.css'));
  const escapedStylesheet = await studio.request('/public/workspace.css');
  assert.equal(escapedStylesheet.status, 404, 'symlinked stylesheet escaping public must 404');
  const escapedModule = await studio.request('/src/studio/escape.mjs');
  assert.equal(escapedModule.status, 404, 'symlinked module escaping src must 404');
});

test('a public or module directory symlink escaping the canonical root serves nothing', async t => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'static-ui-escape-'));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  mkdirSync(join(fixtureRoot, 'outside'), { recursive: true });
  writeFileSync(join(fixtureRoot, 'outside', 'index.html'), '<!doctype html>external shell');
   writeFileSync(join(fixtureRoot, 'outside', 'workspace.css'), '.external {}\n');
  writeFileSync(join(fixtureRoot, 'outside', 'fixture.mjs'), 'export const external = 1;\n');
  mkdirSync(join(fixtureRoot, 'src'), { recursive: true });
  symlinkSync(join(fixtureRoot, 'outside'), join(fixtureRoot, 'public'));
  symlinkSync(join(fixtureRoot, 'outside'), join(fixtureRoot, 'src', 'studio'));
  const studio = await startStudio(fixtureRoot);
  t.after(() => studio.close());
  for (const path of ['/', '/public/index.html', '/public/workspace.css', '/src/studio/fixture.mjs']) {
    const response = await studio.request(path);
    assert.equal(response.status, 404, `${path} through an escaping directory symlink must 404`);
    assert.equal(response.headers['content-type'], 'application/json');
  }
});
