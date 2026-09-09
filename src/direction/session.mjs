import { validateBatch, number, label, LIMITS } from '../painting/index.mjs';
import { History } from './history.mjs';
import { validateProject, PROJECT_BUDGET_BYTES } from './project.mjs';

export class Session {
  instanceId = globalThis.crypto.randomUUID();
  history = new History();
  queue = [];
  active = null;
  feedback = [];
  status = 'idle';
  speed = 1;
  revision = 0;
  artRevision = 0;
  storageError = null;
  playbackError = null;
  onChange = () => {};

  changed(art = false, persist = true) {
    this.revision++;
    if (art) this.artRevision++;
    if (persist) this.onChange();
  }

  get document() { return this.history.document; }

  snapshot() {
    return { instanceId: this.instanceId, revision: this.revision, artRevision: this.artRevision, document: this.document,
      playback: { status: this.status, speed: this.speed, remaining: this.queue.length + Number(!!this.active),
        active: this.active && { command: this.active.command, progress: this.active.progress } },
      history: { cursor: this.history.cursor, total: this.history.commands.length }, feedback: this.feedback,
      storageError: this.storageError, playbackError: this.playbackError };
  }

  pending() { return [...(this.active ? [this.active.command] : []), ...this.queue]; }

  submit({ commands, replace = false, play = true, immediate = false }) {
    if (![replace, play, immediate].every(value => typeof value === 'boolean')) throw new Error('Command options must be boolean');
    if (!Array.isArray(commands) || !commands.length) throw new Error('Provide drawing commands');
    const pending = replace ? [] : this.pending();
    const proposed = immediate ? [...commands, ...pending] : [...pending, ...commands];
    if (this.history.cursor + proposed.length > LIMITS.commands) throw new Error('Session command limit reached');
    const checked = validateBatch(this.document, proposed).commands;
    const candidateCommands = immediate
      ? [...this.history.commands.slice(0, this.history.cursor), ...checked.slice(0, commands.length)]
      : this.history.commands;
    const candidateCursor = immediate
      ? this.history.cursor + commands.length
      : this.history.cursor;
    const candidateQueue = immediate
      ? checked.slice(commands.length)
      : checked;
    const candidateProject = {
      format: 'codesketch',
      version: 1,
      commands: candidateCommands,
      cursor: candidateCursor,
      queue: candidateQueue,
      feedback: this.feedback,
    };
    const size = Buffer.byteLength(JSON.stringify(candidateProject), 'utf8');
    if (size > PROJECT_BUDGET_BYTES) throw new Error(`Project exceeds 7 MiB budget (${size} bytes)`);
    if (immediate) {
      const count = commands.length;
      checked.slice(0, count).forEach(command => this.history.commit(command));
      this.queue = checked.slice(count);
      this.active = null;
      this.status = 'paused';
    } else {
      if (replace) this.active = null;
      this.queue = this.active ? checked.slice(1) : checked;
      // Feedback and an explicit pause are sticky until the human/agent resumes.
      if (play && this.status !== 'paused') this.status = 'playing';
      if (!play) this.status = 'paused';
    }
    this.changed(true);
  }

  control(action, speed) {
    this.playbackError = null;
    if (action === 'speed') this.speed = number(speed, 'speed', 0.25, 8);
    else if (action === 'pause') this.status = 'paused';
    else if (action === 'resume') this.status = this.pending().length ? 'playing' : 'idle';
    else if (action === 'clear') { this.queue = []; this.active = null; this.status = 'paused'; }
    else if (action === 'step') {
      this.status = 'paused';
      const command = this.active?.command ?? this.queue.shift();
      this.active = null;
      if (command) this.history.commit(command);
    } else if (action === 'undo' || action === 'redo') {
      this.queue = []; this.active = null; this.status = 'paused';
      this.history.move(action === 'undo' ? -1 : 1);
    } else if (action === 'new') {
      this.history = new History(); this.queue = []; this.active = null;
      this.feedback = []; this.status = 'idle';
    } else throw new Error('Unknown playback action');
    this.changed(true);
  }

  tick(milliseconds = 40) {
    if (this.status !== 'playing') return;
    if (this.playbackError) this.playbackError = null;
    if (!this.active) {
      const command = this.queue.shift();
      if (!command) { this.status = 'idle'; this.changed(); return; }
      let distance = 0;
      command.points?.forEach((point, i, points) => {
        if (i) distance += Math.hypot(point[0] - points[i - 1][0], point[1] - points[i - 1][1]);
      });
      this.active = { command, progress: 0, duration: Math.max(120, distance / 0.55) };
    }
    this.active.progress = Math.min(1, this.active.progress + milliseconds * this.speed / this.active.duration);
    if (this.active.progress >= 1) {
      this.history.commit(this.active.command);
      this.active = null;
      if (!this.queue.length) this.status = 'idle';
      this.changed(true);
    } else this.changed(true, false);
  }

  addFeedback(text) {
    const clean = label(text, 'feedback', 2000);
    if (this.feedback.length >= 100) {
      this.status = 'paused';
      this.changed();
      throw new Error('Feedback limit reached; save this project and start a new one');
    }
    const candidateItem = { id: globalThis.crypto.randomUUID(), text: clean,
      at: new Date().toISOString(), cursor: this.history.cursor };
    const candidateProject = { format: 'codesketch', version: 1, commands: this.history.commands,
      cursor: this.history.cursor, queue: this.pending(), feedback: [...this.feedback, candidateItem] };
    const size = Buffer.byteLength(JSON.stringify(candidateProject), 'utf8');
    if (size > PROJECT_BUDGET_BYTES) {
      this.status = 'paused';
      this.changed();
      throw new Error(`Project exceeds 7 MiB budget (${size} bytes)`);
    }
    this.status = 'paused';
    this.feedback.push(candidateItem);
    this.changed();
  }

  project() {
    return { format: 'codesketch', version: 1, commands: this.history.commands,
      cursor: this.history.cursor, queue: this.pending(), feedback: this.feedback };
  }

  load(value) {
    const project = validateProject(value);
    const history = new History();
    history.restore(project.commands, project.cursor);
    this.history = history; this.queue = project.queue; this.active = null;
    this.feedback = project.feedback; this.status = 'paused';
    this.changed(true);
  }
}
