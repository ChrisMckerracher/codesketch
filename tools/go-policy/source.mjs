import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { studioRuntimeFiles } from './runtime-inventory.mjs';

export const MODULE = 'github.com/ChrisMckerracher/codesketch';
const STUDIO_ASSETS = 'apps/studio/assets.go';
const STUDIO_ASSETS_TEST = 'apps/studio/assets_test.go';
const DOCS_ASSETS = 'docs/assets.go';
const IGNORED = new Set(['.git', '.beads', '.studio', '.playwright-cli', '.dolt', 'node_modules', 'bin', 'artifacts']);
const FORBIDDEN = new Set(['go.sum', 'go.work', 'go.work.sum', 'vendor']);
const STATIC_EMBEDS = {
  [DOCS_ASSETS]: new Set([
    'agent-guide.md', 'artist-skill/SKILL.md',
    'artist-skill/references/season-one-example.md', 'artist-skill/references/cli-craft.md',
  ]),
  'apps/paint/internal/cli/capture/server.go': new Set(['page.html', 'page.mjs']),
};

// The studio asset inventory is derived from the source/public tree so the
// reviewed embed declarations and policy share one canonical expected list.
function embedsFor(root) {
  return { ...STATIC_EMBEDS, [STUDIO_ASSETS]: new Set(studioRuntimeFiles(root)) };
}

export function repositoryFiles(root) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED.has(entry.name)) continue;
      const file = resolve(dir, entry.name), rel = relative(root, file).split(sep).join('/');
      if (FORBIDDEN.has(entry.name)) throw new Error(`${rel}: Go dependency/workspace artifact forbidden`);
      if (entry.isSymbolicLink()) throw new Error(`${rel}: source symlinks forbidden`);
      if (entry.isDirectory()) walk(file);
      else {
        if (entry.name === 'go.mod' && rel !== 'go.mod') throw new Error(`${rel}: nested Go modules forbidden`);
        files.push(file);
      }
    }
  }
  walk(realpathSync(root));
  return files;
}

// Tokenize only what import declarations need, skipping comments and keeping
// strings intact so comment-looking text cannot hide dependency declarations.
function tokens(code) {
  const result = [];
  const pattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|`[^`]*`|'(?:\\.|[^'\\])*'|[A-Za-z_]\w*|[^\s]/g;
  for (const match of code.matchAll(pattern)) {
    if (!match[0].startsWith('//') && !match[0].startsWith('/*')) result.push(match[0]);
  }
  return result;
}

export function importsOf(code) {
  const list = tokens(code), imports = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i] !== 'import') continue;
    const grouped = list[++i] === '(';
    for (; i < list.length; i++) {
      if (grouped && list[i] === ')') break;
      if (/^["`]/.test(list[i])) {
        const spec = list[i].slice(1, -1);
        if (spec.includes('\\') || /\s/.test(spec)) throw new Error('Escaped or whitespace Go imports forbidden');
        imports.push(spec);
        if (!grouped) break;
      }
    }
  }
  return imports;
}

export function checkDirection(from, target) {
  if (target !== MODULE && !target.startsWith(`${MODULE}/`)) return;
  const to = target.slice(MODULE.length).replace(/^\//, '');
  if (from === '' || (from === 'apps/paint/cmd/paint' && to !== 'apps/paint/internal/cli')) {
    throw new Error(`${from || 'assets'} cannot import ${target}`);
  }
  if (from === 'apps/paint/internal/cli') {
    if (to !== 'docs' && to !== 'apps/paint/internal/cli' && !to.startsWith('apps/paint/internal/cli/')) {
      throw new Error(`CLI orchestration cannot import ${target}`);
    }
    return;
  }
  if (from === 'apps/paint/cmd/paint') return;
  const context = from.split('/').slice(0, 5).join('/');
  if (context === 'apps/paint/internal/cli/capture' && to === 'apps/studio') return;
  if (context === 'apps/paint/internal/cli/lifecycle' && to === 'apps/studio') return;
  if (to !== context && !to.startsWith(`${context}/`)) throw new Error(`${from} cannot import ${target}`);
}

export function checkSources(root, files, standard) {
  const sources = files.filter(file => file.endsWith('.go'));
  const embeds = embedsFor(root);
  for (const file of sources) {
    const rel = relative(root, file).split(sep).join('/');
    if (rel !== STUDIO_ASSETS && rel !== STUDIO_ASSETS_TEST && rel !== DOCS_ASSETS &&
        !/^apps\/paint\/(?:cmd\/paint|internal\/cli|internal\/cli\/(?:capture|input|parse|transport|lifecycle)(?:\/[^/]+)*)\/[^/]+\.go$/.test(rel)) {
      throw new Error(`${rel}: unapproved Go source context`);
    }
    const code = readFileSync(file, 'utf8');
    const lines = code.split('\n').length - Number(code.endsWith('\n'));
    if (lines > 300) throw new Error(`${rel}: exceeds 300 Go source lines (${lines})`);
    for (const [, pattern] of code.matchAll(/^\/\/go:embed\s+([^\r\n]+)$/gm)) {
      if (!embeds[rel]?.has(pattern)) throw new Error(`${rel}: unapproved embed ${pattern}`);
    }
    const from = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    for (const spec of importsOf(code)) {
      if (spec === 'C' || (!standard.has(spec) && spec !== MODULE && !spec.startsWith(`${MODULE}/`))) {
        throw new Error(`${rel}: non-standard Go import ${spec} forbidden`);
      }
      checkDirection(from, spec);
    }
  }
  return sources;
}
