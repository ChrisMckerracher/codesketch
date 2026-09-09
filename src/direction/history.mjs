import { createDocument, replay, applyCommand, LIMITS } from '../painting/index.mjs';

export class History {
  commands = [];
  cursor = 0;
  document = createDocument();

  commit(command) {
    if (this.cursor >= LIMITS.commands) throw new Error('History limit reached; start a new project');
    const result = applyCommand(this.document, command);
    this.commands = [...this.commands.slice(0, this.cursor), result.command];
    this.cursor++;
    this.document = result.document;
  }

  move(delta) {
    this.cursor = Math.max(0, Math.min(this.commands.length, this.cursor + delta));
    this.document = replay(this.commands.slice(0, this.cursor));
  }

  restore(commands, cursor) {
    replay(commands);
    this.commands = structuredClone(commands);
    this.cursor = cursor;
    this.document = replay(commands.slice(0, cursor));
  }
}
