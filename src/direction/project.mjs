import { createDocument, number, label, LIMITS, validateBatch } from '../painting/index.mjs';

export const PROJECT_BUDGET_BYTES = 7 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
export const PROJECT_LIMITS = Object.freeze({
  maxBytes: PROJECT_BUDGET_BYTES,
  maxImportBytes: MAX_IMPORT_BYTES,
});

export function validateProject(value) {
  if (!value || value.format !== 'codesketch' || value.version !== 1) throw new Error('Expected a Codesketch v1 project');
  const rawSize = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (rawSize > MAX_IMPORT_BYTES) throw new Error(`Project exceeds 8 MiB import limit (${rawSize} bytes)`);
  if (!Array.isArray(value.commands) || value.commands.length > LIMITS.commands) throw new Error('Invalid project history');
  const historyBatch = validateBatch(createDocument(), value.commands);
  const commands = historyBatch.commands;
  const cursor = number(value.cursor, 'cursor', 0, commands.length, commands.length);
  if (!Number.isInteger(cursor)) throw new Error('Cursor must be an integer');
  const queue = value.queue ?? [];
  if (!Array.isArray(queue)) throw new Error('Invalid project queue');
  if (cursor + queue.length > LIMITS.commands) throw new Error('Project command limit reached');
  const cursorDoc = validateBatch(createDocument(), commands.slice(0, cursor)).document;
  const queueBatch = validateBatch(cursorDoc, queue);
  const normalizedQueue = queueBatch.commands;
  const feedback = value.feedback ?? [];
  if (!Array.isArray(feedback) || feedback.length > 100) throw new Error('Invalid feedback list');
  const cleanFeedback = feedback.map(item => ({ id: label(item.id, 'feedback id'),
    text: label(item.text, 'feedback', 2000), at: label(item.at, 'timestamp'),
    cursor: number(item.cursor, 'feedback cursor', 0, LIMITS.commands) }));
  const project = { format: 'codesketch', version: 1, commands, cursor, queue: normalizedQueue, feedback: cleanFeedback };
  const cleanSize = Buffer.byteLength(JSON.stringify(project), 'utf8');
  if (cleanSize > PROJECT_BUDGET_BYTES) throw new Error(`Project exceeds 7 MiB budget (${cleanSize} bytes)`);
  return project;
}
