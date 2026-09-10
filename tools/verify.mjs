#!/usr/bin/env node
// Codesketch policy and architectural integrity verifier. Native Node builtins only.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, basename, sep } from 'node:path';
import { isBuiltin } from 'node:module';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const SELF = resolve(import.meta.dirname, 'verify.mjs');
const IGNORED = new Set(['.git', '.beads', '.studio', '.playwright-cli', 'artifacts', 'bin', 'node_modules']);
const SOURCE_EXTENSIONS = ['.mjs', '.js', '.cjs'];
const DEPENDENCY_KEYS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies',
  'bundledDependencies', 'bundleDependencies'];
const ALTERNATE_LOCKFILES = ['yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock', 'shrinkwrap.yaml', 'npm-shrinkwrap.json'];
const errors = [];

function fail(msg) { errors.push(msg); }

function checkSupplyChain(files) {
  for (const file of files) {
    const name = basename(file);
    const rel = relative(ROOT, file).split(sep).join('/');
    if (name === 'package.json') {
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      for (const key of DEPENDENCY_KEYS) {
        if (pkg[key] && Object.keys(pkg[key]).length > 0) fail(`${rel}: ${key} entries forbidden`);
      }
      if (pkg.workspaces) fail(`${rel}: npm workspaces forbidden`);
    } else if (name === 'package-lock.json') {
      if (file !== resolve(ROOT, 'package-lock.json')) {
        fail(`${rel}: nested lockfile forbidden`);
        continue;
      }
      const lock = JSON.parse(readFileSync(file, 'utf8'));
      const pkgs = Object.keys(lock.packages || {}).filter((k) => k !== '');
      if (pkgs.length > 0) fail(`${rel}: third-party packages forbidden beyond root`);
      if (lock.dependencies && Object.keys(lock.dependencies).length > 0) fail(`${rel}: dependencies forbidden`);
    } else if (ALTERNATE_LOCKFILES.includes(name)) {
      fail(`${rel}: Alternate lockfile '${name}' forbidden`);
    }
  }
}

function walk(dir, fileList = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(full, fileList);
    else fileList.push(full);
  }
  return fileList;
}

function extractImports(code) {
  const specifiers = [];
  const fromRe = /(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g;
  const bareRe = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = fromRe.exec(code)) !== null) specifiers.push(match[1]);
  while ((match = bareRe.exec(code)) !== null) specifiers.push(match[1]);
  while ((match = dynRe.exec(code)) !== null) specifiers.push(match[1]);
  while ((match = requireRe.exec(code)) !== null) specifiers.push(match[1]);
  return specifiers;
}

// Bounded context of a path under src: top-level folder name, extended with
// intermediate directory segments so nested contexts (painting/document,
// painting/rendering) are distinct from their parent context and each other.
function contextOf(srcDir, target) {
  const segments = relative(srcDir, target).split(sep);
  if (segments.length === 1) return '';
  let context = segments[0];
  for (let i = 1; i < segments.length - 1; i++) context = `${context}/${segments[i]}`;
  return context;
}

function checkSourceFile(file, code, rel, srcDir) {
  const lines = code.split('\n').length;
  if (lines > 300) fail(`${rel}: Exceeds 300 line hard limit (${lines} lines)`);

  if (resolve(file) !== SELF) {
    if (new RegExp('\\b' + 'eval\\s*\\(').test(code)) fail(`${rel}: eval() is forbidden`);
    if (new RegExp('\\bnew\\s+' + 'Function\\s*\\(').test(code)) fail(`${rel}: new Function() is forbidden`);
  }

  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) fail(`${rel}: Syntax error: ${syntax.stderr.trim()}`);

  const inSrc = file.startsWith(srcDir + sep);
  const fromContext = inSrc ? contextOf(srcDir, file) : null;

  for (const spec of extractImports(code)) {
    if (/^https?:|^\/\//i.test(spec)) {
      fail(`${rel}: Remote import '${spec}' forbidden`);
      continue;
    }
    if (spec.startsWith('node:') || isBuiltin(spec)) continue;

    if (!spec.startsWith('./') && !spec.startsWith('../')) {
      fail(`${rel}: Bare third-party import '${spec}' forbidden`);
      continue;
    }

    // This embedded page serves the canonical module through its local route.
    // Match both the importer and specifier; all other imports resolve on disk.
    const targetPath = rel.split(sep).join('/') === 'apps/paint/internal/cli/capture/page.mjs' && spec === './rendering/index.mjs'
      ? resolve(ROOT, 'apps', 'studio', 'src/painting/rendering/index.mjs') : resolve(dirname(file), spec);
    if (!existsSync(targetPath)) {
      fail(`${rel}: Target '${spec}' does not exist on disk`);
      continue;
    }

    if (inSrc && targetPath.startsWith(srcDir + sep)) {
      const toContext = contextOf(srcDir, targetPath);
      if (fromContext !== toContext) {
        if (basename(targetPath) !== 'index.mjs') {
          fail(`${rel}: Cross-context import '${spec}' must target an index.mjs entrypoint`);
        }
        const fromPainting = fromContext === 'painting' || fromContext.startsWith('painting/');
        const fromDirection = fromContext === 'direction' || fromContext.startsWith('direction/');
        if (fromPainting && ['direction', 'studio', 'transport'].includes(toContext)) {
          fail(`${rel}: painting context cannot import from ${toContext}`);
        }
        if (fromDirection && ['studio', 'transport'].includes(toContext)) {
          fail(`${rel}: direction context cannot import from ${toContext}`);
        }
      }
    }
  }
}

function checkAssetFile(file, code, rel) {
  const lines = code.split('\n').length;
  if (lines > 300) fail(`${rel}: Exceeds 300 line limit (${lines} lines)`);

  const remoteRe = /(?:\b(?:href|src|url)\s*[:=(]|@import\b)\s*['"]?\s*(?:https?:|\/\/)(?!\/(?:127\.0\.0\.1|localhost|www\.w3\.org\/2000\/svg))/i;
  if (remoteRe.test(code)) fail(`${rel}: Remote external asset reference forbidden`);
}

function main() {
  const srcDir = resolve(ROOT, 'apps', 'studio', 'src');
  const files = walk(ROOT);
  checkSupplyChain(files);
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (SOURCE_EXTENSIONS.some(ext => file.endsWith(ext))) {
      checkSourceFile(file, readFileSync(file, 'utf8'), rel, srcDir);
    } else if (file.endsWith('.html') || file.endsWith('.css')) {
      checkAssetFile(file, readFileSync(file, 'utf8'), rel);
    }
  }

  if (errors.length > 0) {
    console.error(`Verification failed with ${errors.length} error(s):\n`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log('Verification passed: architecture, supply chain, and syntax clean.');
}

main();
