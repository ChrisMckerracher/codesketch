#!/usr/bin/env node
// Development launcher: starts an ephemeral loopback studio with an
// in-memory session and no persistence. Production port 4317 is rejected
// before listening. The single configuration surface is the PORT
// environment variable; 0 picks an ephemeral port.

import { createStudio } from '../apps/studio/src/transport/index.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const PRODUCTION_PORT = 4317;
const USAGE = 'configure PORT=0 for an ephemeral port, or PORT=1024..65535';

export function parsePort(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return 0;
  if (!/^\d+$/.test(text)) throw new Error(`Invalid port '${raw}': ${USAGE}.`);
  const port = Number(text);
  if (port === 0) return 0;
  if (port < 1024) throw new Error(`Port ${port} is a privileged system port; ${USAGE}.`);
  if (port > 65535) throw new Error(`Port ${port} is above 65535; ${USAGE}.`);
  if (port === PRODUCTION_PORT) {
    throw new Error(`Port ${PRODUCTION_PORT} is reserved for the production studio; development must configure a different PORT.`);
  }
  return port;
}

function describeListenError(port, error) {
  if (error.code === 'EADDRINUSE') {
    return `Port ${port} is already in use. Choose another PORT or use PORT=0 for an ephemeral port.`;
  }
  if (error.code === 'EACCES') {
    return `Port ${port} requires elevated privileges. ${USAGE}.`;
  }
  return error.message;
}

async function start() {
  const extra = process.argv.slice(2);
  if (extra.length > 0) {
    console.error(`studio-dev: unexpected arguments ${JSON.stringify(extra)}; ${USAGE}.`);
    process.exit(2);
  }
  let port;
  try {
    port = parsePort(process.env.PORT);
  } catch (error) {
    console.error(`studio-dev: ${error.message}`);
    process.exit(2);
  }
  const root = fileURLToPath(new URL('../apps/studio', import.meta.url));
  const studio = await createStudio({ root });
  const { server } = studio;
  let stopping = false;
  const stop = signal => {
    if (stopping) return;
    stopping = true;
    studio.shutdown().then(() => {
      console.log(`studio-dev: received ${signal}; studio stopped.`);
      process.exit(0);
    }, error => {
      console.error(`studio-dev: shutdown after ${signal} failed: ${error.message}`);
      process.exit(1);
    });
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  server.on('error', error => {
    console.error(`studio-dev: ${describeListenError(port, error)}`);
    process.exit(1);
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const actual = server.address().port;
  console.log(`Studio running at http://127.0.0.1:${actual} (in-memory session, no persistence)`);
  console.log('Press Ctrl+C to stop.');
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) await start();
