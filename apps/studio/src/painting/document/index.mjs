import { validateCommand, LIMITS } from './validation.mjs';
export { LIMITS, number, label } from './validation.mjs';

export function createDocument() {
  return { version: 1, width: 1000, height: 700, background: '#f7f3e8',
    layers: [{ id: 'paint', name: 'Painting', visible: true, opacity: 1 }], marks: [] };
}

export function applyCommand(document, input) {
  const command = validateCommand(input, document);
  if (command.type === 'fill') return { document: { ...document, background: command.color }, command };
  if (command.type === 'layer.add') return { document: { ...document,
    layers: [...document.layers, { id: command.id, name: command.name, visible: true, opacity: 1 }] }, command };
  if (command.type === 'layer.update') {
    const { type, ...changes } = command;
    return { document: { ...document, layers: document.layers.map(layer => layer.id === command.id ? { ...layer, ...changes } : layer) }, command };
  }
  if (document.marks.length >= LIMITS.commands) throw new Error('Painting command limit reached');
  return { document: { ...document, marks: [...document.marks, command] }, command };
}

export function validateBatch(document, commands) {
  if (!Array.isArray(commands) || commands.length > LIMITS.commands) throw new Error('Expected at most 3000 commands');
  let current = document;
  let points = current.marks.reduce((sum, mark) => sum + (mark.points?.length ?? 0), 0);
  const normalized = commands.map(input => {
    const result = applyCommand(current, input);
    current = result.document;
    points += result.command.points?.length ?? 0;
    if (points > LIMITS.totalPoints) throw new Error('Painting point limit reached');
    return result.command;
  });
  return { document: current, commands: normalized };
}

export function replay(commands) {
  return validateBatch(createDocument(), commands).document;
}
