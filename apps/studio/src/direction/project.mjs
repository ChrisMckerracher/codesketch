import { createDocument, number, LIMITS, validateBatch } from '../painting/index.mjs';
import { normalizeComments } from './feedback/index.mjs';

export const PROJECT_BUDGET_BYTES = 7 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
export const PROJECT_LIMITS = Object.freeze({
  maxBytes: PROJECT_BUDGET_BYTES,
  maxImportBytes: MAX_IMPORT_BYTES,
});

export function validateProject(value) {
  if (!value || value.format !== 'codesketch' || value.version !== 2) {
    throw new Error('Expected a Codesketch v2 project');
  }
  for (const field of ['commands', 'cursor', 'queue', 'comments']) {
    if (value[field] === undefined) throw new Error(`Project is missing the ${field} field`);
  }
  const rawSize = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (rawSize > MAX_IMPORT_BYTES) throw new Error(`Project exceeds 8 MiB import limit (${rawSize} bytes)`);
  if (!Array.isArray(value.commands) || value.commands.length > LIMITS.commands) throw new Error('Invalid project history');
  const historyBatch = validateBatch(createDocument(), value.commands);
  const commands = historyBatch.commands;
  const cursor = number(value.cursor, 'cursor', 0, commands.length);
  if (!Number.isInteger(cursor)) throw new Error('Cursor must be an integer');
  if (!Array.isArray(value.queue)) throw new Error('Invalid project queue');
  if (cursor + value.queue.length > LIMITS.commands) throw new Error('Project command limit reached');
  const cursorDoc = validateBatch(createDocument(), commands.slice(0, cursor)).document;
  const normalizedQueue = validateBatch(cursorDoc, value.queue).commands;
  const comments = normalizeComments(value.comments);
  const project = { format: 'codesketch', version: 2, commands, cursor, queue: normalizedQueue, comments };
  const cleanSize = Buffer.byteLength(JSON.stringify(project), 'utf8');
  if (cleanSize > PROJECT_BUDGET_BYTES) throw new Error(`Project exceeds 7 MiB budget (${cleanSize} bytes)`);
  return project;
}
