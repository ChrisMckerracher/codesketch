import { spawnSync } from 'node:child_process';

export function goEnvironment(extra = {}) {
  return {
    ...process.env, ...extra,
    GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off', GOWORK: 'off',
    GOFLAGS: '', GOENV: 'off', CGO_ENABLED: extra.CGO_ENABLED ?? '0',
  };
}

export function runGo(root, args, extra = {}) {
  const result = spawnSync('go', args, {
    cwd: root, env: goEnvironment(extra), encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024, timeout: 120_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`go ${args.join(' ')} failed: ${result.error?.message || result.stderr.trim() || result.stdout.trim()}`);
  }
  return result.stdout;
}

// go list emits a sequence of JSON objects rather than one JSON array.
export function jsonObjects(text) {
  const values = [];
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') { if (depth++ === 0) start = i; }
    else if (char === '}') {
      if (--depth === 0) { values.push(JSON.parse(text.slice(start, i + 1))); start = -1; }
    } else if (depth === 0 && !/\s/.test(char)) throw new Error('Invalid Go JSON inventory');
  }
  if (depth !== 0 || quoted || start !== -1) throw new Error('Incomplete Go JSON inventory');
  return values;
}
