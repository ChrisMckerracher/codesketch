import { openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';

export const MAX_IMPORT_BYTES = 8 * 1024 * 1024; // 8 MiB

const BOOLEAN_FLAGS = new Set(['paused', 'replace', 'json', 'help', 'h']);

export function parseArgs(argv, allowedFlags = []) {
  const allowedSet = new Set(allowedFlags);
  const flags = {};
  const positionals = [];
  const seenFlags = new Set();

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      let name;
      let val;
      if (eqIdx !== -1) {
        name = arg.slice(2, eqIdx);
        val = arg.slice(eqIdx + 1);
      } else {
        name = arg.slice(2);
      }

      if (!allowedSet.has(name)) {
        throw new Error(`unknown flag "--${name}"`);
      }
      if (seenFlags.has(name)) {
        throw new Error(`duplicate flag "--${name}"`);
      }
      seenFlags.add(name);

      if (BOOLEAN_FLAGS.has(name)) {
        if (eqIdx !== -1) {
          throw new Error(`flag "--${name}" does not accept a value`);
        }
        flags[name] = true;
        i++;
      } else {
        if (val === undefined) {
          i++;
          if (i >= argv.length || argv[i].startsWith('--')) {
            throw new Error(`flag "--${name}" requires a value`);
          }
          val = argv[i];
        }
        flags[name] = val;
        i++;
      }
    } else if (arg.startsWith('-') && arg !== '-') {
      const eqIdx = arg.indexOf('=');
      let name;
      let val;
      if (eqIdx !== -1) {
        name = arg.slice(1, eqIdx);
        val = arg.slice(eqIdx + 1);
      } else {
        name = arg.slice(1);
      }

      if (!allowedSet.has(name)) {
        throw new Error(`unknown flag "-${name}"`);
      }
      if (seenFlags.has(name)) {
        throw new Error(`duplicate flag "-${name}"`);
      }
      seenFlags.add(name);

      if (BOOLEAN_FLAGS.has(name)) {
        if (eqIdx !== -1) {
          throw new Error(`flag "-${name}" does not accept a value`);
        }
        flags[name] = true;
      } else {
        i++;
        if (i >= argv.length || (argv[i].startsWith('-') && argv[i] !== '-')) {
          throw new Error(`flag "-${name}" requires a value`);
        }
        flags[name] = argv[i];
      }
      i++;
    } else {
      positionals.push(arg);
      i++;
    }
  }

  return { flags, positionals };
}

export function parseFiniteNumber(val, name, min, max) {
  if (val === undefined || val === null || val === '') {
    throw new Error(`missing value for ${name}`);
  }
  const n = Number(val);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a valid finite number, got "${val}"`);
  }
  if (min !== undefined && n < min) {
    throw new Error(`${name} must be >= ${min}, got ${n}`);
  }
  if (max !== undefined && n > max) {
    throw new Error(`${name} must be <= ${max}, got ${n}`);
  }
  return n;
}

export function parseColor(val) {
  if (typeof val !== 'string' || !/^#[\da-f]{6}$/i.test(val)) {
    throw new Error(`color must be #rrggbb, got "${val}"`);
  }
  return val.toLowerCase();
}

export function parseIdentifier(val) {
  if (typeof val !== 'string' || !/^[a-zA-Z][\w-]{0,39}$/.test(val)) {
    throw new Error(`invalid identifier "${val}"`);
  }
  return val;
}

export function parsePoints(str) {
  if (!str || typeof str !== 'string') {
    throw new Error('points string required');
  }
  const trimmed = str.trim();
  if (!trimmed) {
    throw new Error('points cannot be empty');
  }
  const chunks = trimmed.split(/\s+/);
  const points = [];
  for (const chunk of chunks) {
    const parts = chunk.split(',');
    if (parts.length !== 2) {
      throw new Error(`points must be coordinate pairs like "10,20", got "${chunk}"`);
    }
    const x = parseFiniteNumber(parts[0], 'point x', 0, 1000);
    const y = parseFiniteNumber(parts[1], 'point y', 0, 700);
    points.push([x, y]);
  }
  if (points.length === 0) {
    throw new Error('stroke requires at least one point');
  }
  return points;
}

export function parseCrop(str) {
  if (!str || typeof str !== 'string') {
    throw new Error('crop string required');
  }
  const parts = str.trim().split(/[,\s]+/);
  if (parts.length !== 4) {
    throw new Error(`--crop requires 4 numbers "x,y,w,h", got "${str}"`);
  }
  return {
    x: parseFiniteNumber(parts[0], 'crop x', 0, 1000),
    y: parseFiniteNumber(parts[1], 'crop y', 0, 700),
    width: parseFiniteNumber(parts[2], 'crop width', 1, 1000),
    height: parseFiniteNumber(parts[3], 'crop height', 1, 700),
  };
}

export function parseBoolean(val, name) {
  if (val === 'true' || val === true) return true;
  if (val === 'false' || val === false) return false;
  throw new Error(`${name} must be boolean (true or false), got "${val}"`);
}

export async function readStdin(maxBytes = MAX_IMPORT_BYTES, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let done = false;

    const timer = setTimeout(() => {
      cleanup();
      process.stdin.destroy();
      reject(new Error(`standard input read timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onError);
    }

    function onData(chunk) {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) {
        done = true;
        cleanup();
        process.stdin.destroy();
        reject(new Error(`standard input exceeds limit of ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    }

    function onEnd() {
      if (done) return;
      done = true;
      cleanup();
      if (chunks.length === 0) {
        reject(new Error('standard input was empty'));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    }

    function onError(err) {
      if (done) return;
      done = true;
      cleanup();
      process.stdin.destroy();
      reject(err);
    }

    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
    process.stdin.resume();
  });
}

export function readBoundedFile(filePath, maxBytes = MAX_IMPORT_BYTES) {
  let fd;
  try {
    const flags = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);
    fd = openSync(filePath, flags);
  } catch (err) {
    throw new Error(`cannot open "${filePath}": ${err.code ?? err.message}`);
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      throw new Error(`"${filePath}" is not a regular file`);
    }
    if (stat.size > maxBytes) {
      throw new Error(`file exceeds limit of ${maxBytes} bytes (${stat.size} bytes)`);
    }
    const buf = Buffer.alloc(maxBytes + 1);
    const bytesRead = readSync(fd, buf, 0, maxBytes + 1, 0);
    if (bytesRead > maxBytes) {
      throw new Error(`file exceeds limit of ${maxBytes} bytes`);
    }
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    try { closeSync(fd); } catch {}
  }
}
