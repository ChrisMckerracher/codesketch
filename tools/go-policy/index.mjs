import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { goEnvironment, jsonObjects, runGo } from './environment.mjs';
import { checkSources, repositoryFiles } from './source.mjs';
import { checkEmbeds, checkManifest, checkModules, checkPackages } from './inventory.mjs';

export function verifyGoPolicy(root) {
	root = realpathSync(root);
  const files = repositoryFiles(root);
  checkManifest(root);
  checkModules(root, jsonObjects(runGo(root, ['list', '-m', '-json', 'all'])));
  const standard = new Set();
  for (const GOOS of ['darwin', 'linux', 'windows']) {
    for (const spec of runGo(root, ['list', 'std'], { GOOS, GOARCH: 'amd64' }).trim().split('\n')) standard.add(spec);
  }
  const sources = checkSources(root, files, standard);
  const goroot = runGo(root, ['env', 'GOROOT']).trim();
  const format = spawnSync(resolve(goroot, 'bin', process.platform === 'win32' ? 'gofmt.exe' : 'gofmt'), ['-l', ...sources], {
    cwd: root, env: goEnvironment(), encoding: 'utf8', timeout: 30_000,
  });
  if (format.error || format.status !== 0 || format.stdout.trim()) {
    throw new Error(`Go formatting failed: ${format.error?.message || format.stderr || format.stdout}`);
  }
  const packages = jsonObjects(runGo(root, ['list', '-deps', '-test', '-json', './...']));
  checkPackages(root, packages);
  checkEmbeds(root, packages);
  return { sources: sources.length, packages: packages.length };
}
