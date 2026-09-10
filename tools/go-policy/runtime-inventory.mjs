import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const STUDIO = 'apps/studio';
const PATH_PATTERN = /^[A-Za-z0-9._\-/]+$/;
const GUIDANCE = new Set(['README.md', 'AGENTS.md']);

function collectFiles(root, context, files) {
  let entries;
  try {
    entries = readdirSync(join(root, context), { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const path = `${context}/${entry.name}`;
    if (entry.isDirectory()) collectFiles(root, path, files);
    else if (entry.isFile()) files.push(path);
    else throw new Error(`${STUDIO}/${path}: runtime inventory supports regular files only`);
  }
}

// Single canonical expected runtime inventory for apps/studio: every
// src/*.mjs module descendant plus every public static asset, derived from
// the source/public tree so embed policy, embed declarations and tests share
// one exact file list instead of duplicated long constants. Runtime paths
// must already satisfy the manifest-safe path contract. Guidance markdown
// (README.md, AGENTS.md) is developer documentation at any depth and is
// never shipped: it is neither embedded nor rejected.
export function studioRuntimeFiles(root) {
  const files = [];
  collectFiles(join(root, STUDIO), 'src', files);
  collectFiles(join(root, STUDIO), 'public', files);
  const guidance = new Set(files.filter(path => GUIDANCE.has(path.split('/').pop())));
  const modules = files.filter(path => path.startsWith('src/') && path.endsWith('.mjs'));
  const stray = files.filter(path => !guidance.has(path) && path.startsWith('src/') && !path.endsWith('.mjs'));
  if (stray.length) throw new Error(`${STUDIO} src runtime tree contains non-module files: ${stray.join(', ')}`);
  const inventory = [...modules, ...files.filter(path => path.startsWith('public/') && !guidance.has(path))].sort();
  for (const path of inventory) {
    if (!PATH_PATTERN.test(path) || path.includes('//') ||
        path.split('/').some(segment => segment === '.' || segment === '..')) {
      throw new Error(`${STUDIO}/${path}: runtime path violates the manifest-safe path contract`);
    }
  }
  return inventory;
}
