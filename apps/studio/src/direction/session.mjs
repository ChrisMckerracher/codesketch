import { validateBatch, number, LIMITS } from '../painting/index.mjs';
import { History } from './history.mjs';
import { validateProject, PROJECT_BUDGET_BYTES } from './project.mjs';
import { ControlGrant } from './feedback/index.mjs';
import { planControl } from './playback-control.mjs';
import { playbackDuration } from './playback-duration.mjs';
import { validateRecovery } from './recovery.mjs';
import { addComment, updateComment, pollComments } from './session-comments.mjs';
import { finishPending } from './finish.mjs';

export class Session {
  instanceId = globalThis.crypto.randomUUID();
  controlGrant = new ControlGrant();
  history = new History();
  queue = [];
  active = null;
  comments = [];
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
      ...this.controlGrant.snapshot(),
      playback: { status: this.status, speed: this.speed, remaining: this.queue.length + Number(!!this.active),
        active: this.active && { command: this.active.command, progress: this.active.progress } },
      history: { cursor: this.history.cursor, total: this.history.commands.length },
      comments: this.comments,
      storageError: this.storageError, playbackError: this.playbackError };
  }

  pending() { return [...(this.active ? [this.active.command] : []), ...this.queue]; }

  submit(options) {
    const { commands, replace = false, play = true, immediate = false } = options;
    this.controlGrant.check(options, { execute: immediate === true || play !== false });
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
      version: 2,
      commands: candidateCommands,
      cursor: candidateCursor,
      queue: candidateQueue,
      comments: this.comments,
    };
    const size = Buffer.byteLength(JSON.stringify(candidateProject), 'utf8');
    if (size > PROJECT_BUDGET_BYTES) throw new Error(`Project exceeds 7 MiB budget (${size} bytes)`);
    const priorActive = !!this.active;
    let art;
    if (immediate) {
      const count = commands.length;
      checked.slice(0, count).forEach(command => this.history.commit(command));
      this.queue = checked.slice(count);
      this.active = null;
      this.status = 'paused';
      art = true;
    } else {
      const removedPreview = replace && priorActive;
      if (replace) this.active = null;
      this.queue = this.active ? checked.slice(1) : checked;
      // Human pause and feedback stay sticky; an authorized agent batch with
      // play continues even from paused.
      if (play && (options.source !== 'human' || this.status !== 'paused')) this.status = 'playing';
      if (!play) this.status = 'paused';
      art = removedPreview;
    }
    if (options.source === 'human') this.controlGrant.invalidate();
    this.changed(art);
  }

  control(action, speed, options = {}) {
    if (action === 'finish') return finishPending(this, options);
    const plan = planControl(this.controlGrant, action, options);
    this.playbackError = null;
    let art = false;
    if (action === 'speed') this.speed = number(speed, 'speed', 0.25, 8);
    else if (action === 'pause') this.status = 'paused';
    else if (action === 'resume') this.status = this.pending().length ? 'playing' : 'idle';
    else if (action === 'clear') {
      art = !!this.active;
      this.queue = []; this.active = null; this.status = 'paused';
    } else if (action === 'step') {
      const command = this.active?.command ?? this.queue[0];
      if (command) validateBatch(this.document, [command]);
      this.status = 'paused';
      if (this.active) this.active = null;
      else if (command) this.queue.shift();
      if (command) this.history.commit(command);
      art = !!command;
    } else if (action === 'undo' || action === 'redo') {
      art = !!this.active;
      this.queue = []; this.active = null; this.status = 'paused';
      const cursor = this.history.cursor;
      this.history.move(action === 'undo' ? -1 : 1);
      art = art || this.history.cursor !== cursor;
    } else if (action === 'new') {
      this.history = new History(); this.queue = []; this.active = null;
      this.comments = []; this.status = 'idle';
      this.controlGrant.reset();
      art = true;
    } else throw new Error('Unknown playback action');
    if (plan.authorize) this.controlGrant.authorize();
    if (plan.invalidate) this.controlGrant.invalidate();
    this.changed(art);
  }

  tick(milliseconds = 40) {
    if (this.status !== 'playing') return;
    if (this.playbackError) this.playbackError = null;
    if (!this.active) {
      const command = this.queue.shift();
      if (!command) { this.status = 'idle'; this.changed(); return; }
      this.active = { command, progress: 0, duration: playbackDuration(command) };
    }
    this.active.progress = Math.min(1, this.active.progress + milliseconds * this.speed / this.active.duration);
    if (this.active.progress >= 1) {
      this.history.commit(this.active.command);
      this.active = null;
      if (!this.queue.length) this.status = 'idle';
      this.changed(true);
    } else this.changed(true, false);
  }

  addComment(input) { return addComment(this, input); }

  updateComment(action, input) { return updateComment(this, action, input); }

  pollComments(since) { return pollComments(this, since); }

  project() {
    return { format: 'codesketch', version: 2, commands: this.history.commands,
      cursor: this.history.cursor, queue: this.pending(), comments: this.comments };
  }

  load(value, options = {}) {
    this.controlGrant.check(options, { execute: true });
    const project = validateProject(value);
    const history = new History();
    history.restore(project.commands, project.cursor);
    this.history = history; this.queue = project.queue; this.active = null;
    this.comments = project.comments.map(item => ({ ...item, request: null }));
    this.status = 'paused';
    this.controlGrant.reset({ paused: true });
    this.changed(true);
  }

  recovery() {
    return structuredClone({
      format: 'codesketch-recovery', version: 1, project: this.project(),
      active: this.active ? { progress: this.active.progress } : null, speed: this.speed,
    });
  }

  restoreRecovery(value) {
    const recovery = validateRecovery(value);
    const history = new History();
    history.restore(recovery.project.commands, recovery.project.cursor);
    const head = recovery.active ? recovery.project.queue[0] : null;
    const active = head
      ? { command: head, progress: recovery.active.progress, duration: playbackDuration(head) }
      : null;
    const queue = head ? recovery.project.queue.slice(1) : recovery.project.queue;
    const comments = recovery.project.comments.map(item => ({ ...item, request: null }));
    this.history = history;
    this.queue = queue;
    this.active = active;
    this.comments = comments;
    this.speed = recovery.speed;
    this.status = 'paused';
    this.controlGrant.reset({ paused: true });
    this.playbackError = null;
    this.storageError = null;
    this.changed(true);
  }
}
