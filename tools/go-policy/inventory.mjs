import { readFileSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { MODULE, checkDirection } from './source.mjs';
import { studioRuntimeFiles } from './runtime-inventory.mjs';

export function checkManifest(root) {
  const text = readFileSync(resolve(root, 'go.mod'), 'utf8').replace(/\/\/[^\n]*/g, '').trim();
  if (text !== `module ${MODULE}\n\ngo 1.25.7` && !new RegExp(`^module\\s+${MODULE.replaceAll('.', '\\.')}\\s+go\\s+1\\.25\\.7\\s*$`).test(text)) {
    throw new Error('go.mod must declare the approved module and Go 1.25.7 only; dependencies, replacements and toolchain directives forbidden');
  }
}

export function checkModules(root, modules) {
  if (modules.length !== 1 || modules[0].Path !== MODULE || !modules[0].Main || modules[0].Replace || realpathSync(modules[0].Dir) !== realpathSync(root)) {
    throw new Error('Resolved module inventory must contain only the local root module');
  }
}

export function checkPackages(root, packages) {
  if (!packages.length) throw new Error('Empty Go package inventory');
  for (const pkg of packages) {
    if (pkg.Error || pkg.DepsErrors?.length) throw new Error(`${pkg.ImportPath}: invalid resolved package`);
    if (pkg.Standard) continue;
    if (pkg.Module?.Path !== MODULE || pkg.Module.Replace || !pkg.Module.Main || realpathSync(pkg.Module.Dir) !== realpathSync(root)) {
      throw new Error(`${pkg.ImportPath}: external resolved package forbidden`);
    }
    if (pkg.CgoFiles?.length) throw new Error(`${pkg.ImportPath}: shipped CGo sources forbidden`);
    if (pkg.ImportPath.endsWith('.test')) continue;
    const from = relative(root, realpathSync(pkg.Dir)).split(sep).join('/');
    for (const spec of [...pkg.Imports ?? [], ...pkg.TestImports ?? [], ...pkg.XTestImports ?? []]) {
      checkDirection(from, spec.replace(/ \[.*\]$/, ''));
    }
  }
}

export function checkEmbeds(root, packages) {
  const runtime = studioRuntimeFiles(root);
  const owners = [
    ['apps/studio/assets.go', `${MODULE}/apps/studio`, 'Studio runtime assets', [
      ['RendererIndex', 'src/painting/rendering/index.mjs'],
      ['RendererStroke', 'src/painting/rendering/stroke.mjs'],
    ], runtime],
    ['docs/assets.go', `${MODULE}/docs`, 'Docs assets', [
      ['AgentGuide', 'agent-guide.md'],
      ['ArtistSkill', 'artist-skill/SKILL.md'],
      ['ArtistSkillReferenceStudy', 'artist-skill/references/season-one-example.md'],
      ['ArtistSkillCLICraft', 'artist-skill/references/cli-craft.md'],
    ], null],
  ];
  for (const [file, importPath, label, declarations, exact] of owners) {
    const expected = [...new Set(exact ?? declarations.map(([, path]) => path))].sort();
    const assets = packages.find(pkg => pkg.ImportPath === importPath);
    if (!assets) throw new Error(`${label} must embed exactly the canonical assets bundle`);
    const patterns = [...new Set(assets.EmbedPatterns ?? [])].sort();
    const files = [...new Set(assets.EmbedFiles ?? [])].sort();
    if (JSON.stringify(patterns) !== JSON.stringify(expected) || JSON.stringify(files) !== JSON.stringify(expected)) {
      const missing = expected.filter(path => !patterns.includes(path) || !files.includes(path));
      const unexpected = [...new Set([...patterns, ...files])].filter(path => !expected.includes(path));
      throw new Error(`${label} must embed exactly the canonical assets bundle (missing [${missing.join(', ')}], unexpected [${unexpected.join(', ')}])`);
    }
    const code = readFileSync(resolve(root, file), 'utf8');
    for (const [name, path] of declarations) {
      if (!code.includes(`//go:embed ${path}\nvar ${name} string`)) throw new Error(`Missing canonical ${name} embed declaration`);
    }
  }
  const allowed = new Map([
    ...owners.map(([, importPath, , declarations, exact]) => [importPath, exact ?? declarations.map(([, path]) => path)]),
    [`${MODULE}/apps/paint/internal/cli/capture`, ['page.html', 'page.mjs']],
  ]);
  for (const pkg of packages.filter(pkg => pkg.Module?.Path === MODULE && !pkg.ForTest && !pkg.ImportPath.endsWith('.test'))) {
    const permitted = allowed.get(pkg.ImportPath) ?? [];
    for (const pattern of pkg.EmbedPatterns ?? []) {
      if (!permitted.includes(pattern)) throw new Error(`${pkg.ImportPath}: unapproved embed ${pattern}`);
    }
    for (const file of pkg.EmbedFiles ?? []) {
      if (!permitted.includes(file)) throw new Error(`${pkg.ImportPath}: unapproved embedded file ${file}`);
    }
  }
}
