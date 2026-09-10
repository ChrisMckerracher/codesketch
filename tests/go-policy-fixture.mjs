import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MODULE } from '../tools/go-policy/source.mjs';

export const studioDeclarations = [
  ['RendererIndex', 'src/painting/rendering/index.mjs'],
  ['RendererStroke', 'src/painting/rendering/stroke.mjs'],
];
export const docsDeclarations = [
  ['AgentGuide', 'agent-guide.md'],
  ['ArtistSkill', 'artist-skill/SKILL.md'],
  ['ArtistSkillReferenceStudy', 'artist-skill/references/season-one-example.md'],
  ['ArtistSkillCLICraft', 'artist-skill/references/cli-craft.md'],
];
export const studioEmbeds = studioDeclarations.map(([, path]) => path);
export const docsEmbeds = docsDeclarations.map(([, path]) => path);
export const STUDIO_ASSETS = `// Package studio embeds the canonical renderer modules for the studio.
package studio

import _ "embed"

${studioDeclarations.map(([name, path]) => `//go:embed ${path}\nvar ${name} string`).join('\n\n')}
`;
export const DOCS_ASSETS = `// Package docs embeds the agent guide and artist skill bundle.
package docs

import _ "embed"

${docsDeclarations.map(([name, path]) => `//go:embed ${path}\nvar ${name} string`).join('\n\n')}
`;
export const renderer = studioDeclarations.map(([, path]) => `apps/studio/${path}`);
export const guide = 'docs/agent-guide.md';
export const artistSkill = docsEmbeds.filter(path => path !== 'agent-guide.md').map(path => `docs/${path}`);

export function fixture(t, changes = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'codesketch-go-policy-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    'go.mod': `module ${MODULE}\n\ngo 1.25.7\n`,
    'apps/studio/assets.go': STUDIO_ASSETS, 'docs/assets.go': DOCS_ASSETS,
    [renderer[0]]: 'export const fixture = true;\n', [renderer[1]]: 'export const fixture = true;\n',
    [guide]: 'Fixture instructions.\n',
    ...Object.fromEntries(artistSkill.map(path => [path, `Fixture ${path}.\n`])), ...changes,
  };
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

export function moduleAt(root) { return { Path: MODULE, Main: true, Dir: root }; }
export function packageAt(root, importPath, embeds, extra = {}) {
  return Object.assign({ ImportPath: importPath, Module: moduleAt(root), Dir: join(root, importPath.slice(MODULE.length + 1)) }, embeds ? { EmbedPatterns: embeds, EmbedFiles: embeds } : {}, extra);
}
export const studioPackage = (root, extra = {}) => packageAt(root, `${MODULE}/apps/studio`, studioEmbeds, extra);
export const docsPackage = (root, extra = {}) => packageAt(root, `${MODULE}/docs`, docsEmbeds, extra);
