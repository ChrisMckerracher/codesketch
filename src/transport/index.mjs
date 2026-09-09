import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createStudio } from './server.mjs';
export { createStudio } from './server.mjs';
export { attachPersistence } from './persistence.mjs';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const port = Number(process.env.PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be 1024–65535');
  const { server, flush } = await createStudio({ root, persistence: resolve(root, '.studio/session.json') });
  server.on('error', error => { console.error(error.message); process.exit(1); });
  server.listen(port, '127.0.0.1', () => console.log(`Codesketch studio → http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    server.close(async () => { await flush(); process.exit(0); });
    server.closeIdleConnections();
  });
}
