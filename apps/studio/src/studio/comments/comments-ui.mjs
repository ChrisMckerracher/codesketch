// Comments controller: pause handshake, region selection, composer, overlay,
// and inspector list. Async results are scoped to the activation token that
// owns them so stale responses never disturb a newer draft.

import { RegionSelection } from './selection.mjs';
import { CommentOverlay } from './overlay.mjs';
import { CommentList } from './comments-list.mjs';
import { CommentComposer } from './composer.mjs';
import { ListeningStatus } from './listening-status.mjs';
import { CommentShortcuts } from './comment-shortcuts.mjs';
import { PauseHandshake } from './handshake.mjs';

const PAINT_TOOLS = new Set(['brush', 'pencil', 'marker', 'eraser']);

export class CommentsUI {
  constructor({ canvas, state, api }) {
    this.canvas = canvas;
    this.state = state;
    this.api = api;

    this.mode = 'idle'; // idle | awaiting | ready | composing
    this.priorTool = 'brush';
    this.pendingWhole = false;
    this.activationToken = 0;
    this.expectations = null;
    this.lastSubmit = null;
    this.draftRect = null;
    this.selectedCommentId = null;
    this.preservedText = '';

    // The canvas must be focusable before any comment-mode focus, including
    // the whole-canvas flow that never activates region selection.
    canvas.setAttribute('tabindex', '0');

    this.overlay = new CommentOverlay({ canvas, onSelect: (c) => this.toggleSelect(c) });
    this.selection = new RegionSelection({
      canvas,
      onSelect: (rect) => this.onRegionSelect(rect),
      onCancel: () => this.cancelComment(),
      onDraft: (rect) => this.onRegionDraft(rect),
    });
    this.list = new CommentList({
      root: document.getElementById('comment-list'),
      onSelect: (c) => this.toggleSelect(c),
      onResolve: (c, reopen) => this.resolveComment(c, reopen),
    });
    this.composer = new CommentComposer({
      canvas,
      onSend: ({ text, continuePlayback }) => this.submitComment(text, continuePlayback),
      onCancel: () => this.cancelComment(),
      onReselect: () => this.reselectArea(),
    });
    this.listening = new ListeningStatus({
      element: document.getElementById('comment-listening'),
      state,
    });
    // The ack activates only when state.setSnapshot accepts it as the
    // current paused snapshot; a superseded ack expires instead.
    this.handshake = new PauseHandshake({
      sendPause: () => this.api.sendControl('pause'),
      acceptSnapshot: (snap) => this.state.setSnapshot(snap)
        && this.state.snapshot === snap && snap.playback?.status === 'paused',
    });
    this.handshakeGeneration = null;

    this.buttonCanvas = document.getElementById('btn-comment-canvas');
    this.buttonRegion = document.getElementById('btn-comment-region');
    this.instructionEl = this.buildInstruction();

    this.buttonCanvas?.addEventListener('click', () => this.beginComment(true));
    this.buttonRegion?.addEventListener('click', () => this.beginComment(false));
    this.state.on('snapshot', () => this.onSnapshot());
    this.state.on('tool', (tool) => this.onToolChanged(tool));
    this.shortcuts = new CommentShortcuts({
      onComment: () => this.beginComment(false),
      onCancel: () => this.cancelComment(),
    });
  }

  get comments() { return this.state.snapshot?.comments || []; }

  buildInstruction() {
    const hint = document.createElement('div');
    hint.className = 'comment-instruction';
    hint.hidden = true;
    hint.setAttribute('aria-live', 'polite');
    hint.textContent = 'Drag to select a region · Enter = whole canvas · Esc = cancel';
    this.canvas.parentElement.appendChild(hint);
    return hint;
  }

  // -- Entry points ------

  beginComment(wholeCanvas) {
    if (this.mode !== 'idle') return;
    this.pendingWhole = wholeCanvas;
    if (this.state.tool === 'comment') {
      this.startHandshake(wholeCanvas);
    } else {
      this.state.setTool('comment');
    }
  }

  startHandshake(wholeCanvas) {
    this.mode = 'awaiting';
    const token = ++this.activationToken;
    this.handshakeGeneration = this.state.snapshot?.docGeneration ?? null;
    this.handshake.begin({
      activate: (snapshot) => {
        if (token !== this.activationToken || this.mode !== 'awaiting') return;
        this.expectations = { docGeneration: snapshot.docGeneration ?? null,
          artRevision: snapshot.artRevision ?? null };
        this.canvas.focus();
        if (wholeCanvas) this.openComposer(null);
        else {
          this.mode = 'ready';
          this.selection.activate();
          this.instructionEl.hidden = false;
        }
      },
      onStale: (error) => {
        if (token !== this.activationToken || this.mode !== 'awaiting') return;
        this.mode = 'idle';
        this.expectations = null;
        this.state.setTool(this.priorTool);
        this.canvas.focus();
        this.state.showNotification(error
          ? `Could not pause for comment: ${error.message}`
          : 'Comment pause expired; select the area again.');
      },
    });
  }

  onToolChanged(tool) {
    if (PAINT_TOOLS.has(tool)) this.priorTool = tool;
    if (tool === 'comment') {
      if (this.mode === 'idle') this.startHandshake(this.pendingWhole);
      this.pendingWhole = false;
      return;
    }
    // Leaving comment mode aborts any pending handshake or active session.
    if (this.mode !== 'idle') this.abortSession();
  }

  abortSession() {
    this.activationToken++;
    this.handshake.expire();
    this.selection.deactivate();
    this.composer.close();
    this.preservedText = '';
    this.instructionEl.hidden = true;
    this.draftRect = null;
    this.mode = 'idle';
    this.renderOverlay();
  }

  // -- Region selection
  onRegionSelect(rect) {
    if (this.mode !== 'ready' && this.mode !== 'composing') return;
    this.draftRect = null;
    this.openComposer(rect);
  }
  onRegionDraft(rect) { this.draftRect = rect; this.renderOverlay(); }

  cancelComment() {
    if (this.mode === 'idle') return;
    this.abortSession();
    this.composer.text = '';
    // Cancel preserves the pause; only the tool and focus are restored.
    this.state.setTool(this.priorTool);
    this.canvas.focus();
  }

  // -- Composer and submission
  openComposer(rect) {
    this.mode = 'composing';
    this.instructionEl.hidden = true;
    this.composer.open(rect, this.preservedText);
    this.preservedText = '';
    this.renderOverlay();
  }

  requestIdFor(payload) {
    const fingerprint = JSON.stringify(payload);
    if (this.lastSubmit && this.lastSubmit.fingerprint === fingerprint) return this.lastSubmit.requestId;
    const requestId = crypto.randomUUID();
    this.lastSubmit = { fingerprint, requestId };
    return requestId;
  }

  async submitComment(text, continuePlayback) {
    if (this.mode !== 'composing') return;
    const ownerToken = this.activationToken;
    const payload = {
      text,
      rect: this.composer.rect,
      continuePlayback,
      expectedDocGeneration: this.expectations?.docGeneration ?? null,
      expectedArtRevision: this.expectations?.artRevision ?? null,
    };
    payload.requestId = this.requestIdFor(payload);
    this.composer.setPending(true);
    this.composer.clearError();
    // No new drags while the request is in flight; the anchor stays visible.
    this.selection.deactivate();
    this.draftRect = null;
    this.renderOverlay();
    try {
      const snap = await this.api.createComment(payload);
      // The created comment is always committed to state; local cleanup only
      // happens when this response still owns the current composer session.
      if (this.activationToken === ownerToken) {
        this.lastSubmit = null;
        this.expectations = null;
      }
      this.state.setSnapshot(snap);
      if (this.activationToken !== ownerToken || this.mode !== 'composing') return;
      this.composer.reset();
      this.mode = 'idle';
      this.state.setTool(this.priorTool);
      this.canvas.focus();
      this.renderOverlay();
    } catch (err) {
      if (this.activationToken !== ownerToken || this.mode !== 'composing') return;
      // Text, rect, and expectations stay intact; an unchanged retry keeps
      // the same requestId so the server can deduplicate.
      this.composer.setPending(false);
      if (err.status === 409) {
        this.composer.showError('The artwork changed since you paused.', { stale: true });
      } else {
        this.composer.showError(`Could not send comment: ${err.message}`);
        this.selection.activate();
      }
    }
  }

  // Stale 409: tear down the old selection, re-pause for fresh expectations,
  // and keep the typed text for the reopened composer.
  reselectArea() {
    this.preservedText = this.composer.text;
    this.composer.close();
    this.selection.deactivate();
    this.expectations = null;
    this.draftRect = null;
    this.renderOverlay();
    this.mode = 'idle';
    this.activationToken++;
    if (this.state.tool === 'comment') {
      this.startHandshake(false);
    } else {
      this.state.setTool('comment');
    }
  }

  // -- Inspector list
  async resolveComment(comment, reopen) {
    try {
      const snap = await this.api.resolveComment({ id: comment.id, reopen,
        expectedDocGeneration: this.state.snapshot?.docGeneration ?? null,
        expectedSeq: comment.seq ?? null });
      this.state.setSnapshot(snap);
    } catch (err) {
      this.state.showNotification(`Could not ${reopen ? 'reopen' : 'resolve'} comment: ${err.message}`);
    }
  }

  toggleSelect(comment) {
    this.selectedCommentId = this.selectedCommentId === comment.id ? null : comment.id;
    this.renderOverlay();
    this.renderList();
  }

  // -- Snapshot/rendering
  onSnapshot() {
    // A rotated generation supersedes the pending pause acknowledgement.
    if (this.mode === 'awaiting' && this.handshakeGeneration !== null
      && this.state.snapshot?.docGeneration !== this.handshakeGeneration) {
      this.handshake.expire();
      this.mode = 'idle';
      this.expectations = null;
      this.instructionEl.hidden = true;
      this.state.setTool(this.priorTool);
      this.canvas.focus();
      this.state.showNotification('Comment pause expired; select the area again.');
    }
    this.renderOverlay();
    this.renderList();
  }

  renderOverlay() {
    // The open composer keeps its region outlined; a ready selection shows the transient drag.
    const anchor = this.mode === 'composing' ? this.composer.rect : null;
    this.overlay.render(this.comments, this.selectedCommentId, this.draftRect, anchor);
  }

  renderList() {
    this.list.render(this.comments, this.selectedCommentId, this.state.snapshot?.artRevision);
  }
}
