// Comment list inspector: keyed, focus-stable cards with resolve/reopen.

const REOPENABLE = new Set(['acknowledged', 'addressed', 'resolved']);

function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export class CommentList {
  constructor({ root, onSelect, onResolve }) {
    this.root = root;
    this.onSelect = onSelect || (() => {});
    this.onResolve = onResolve || (() => {});
    this.lastSignature = null;
  }

  // Rebuilds only when the visible content changes; restores focus to the
  // same card action, falling back to the card's select button when the
  // action disappeared (e.g. after a resolve).
  render(comments, selectedId, currentArtRevision) {
    const list = comments || [];
    const signature = JSON.stringify([
      list.map((c) => [
        c.id,
        c.number,
        c.seq,
        c.status,
        c.text,
        c.artRevision !== currentArtRevision,
      ]),
      selectedId,
    ]);
    if (signature === this.lastSignature) return;
    const focus = this.focusedTarget();
    this.lastSignature = signature;
    this.root.replaceChildren();

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'comment-empty';
      empty.textContent = 'No comments yet.';
      this.root.appendChild(empty);
      return;
    }

    for (const comment of list) {
      this.root.appendChild(this.buildCard(comment, comment.id === selectedId, currentArtRevision));
    }
    this.restoreFocus(focus);
  }

  focusedTarget() {
    const active = document.activeElement;
    if (!(active instanceof Element) || !this.root.contains(active)) return null;
    const card = active.closest('[data-comment-id]');
    if (!card) return null;
    return { id: card.dataset.commentId, action: active.dataset.action || 'select' };
  }

  restoreFocus(focus) {
    if (!focus) return;
    const id = CSS.escape(focus.id);
    let target = this.root.querySelector(`[data-comment-id="${id}"] [data-action="${focus.action}"]`);
    if (!target) {
      target = this.root.querySelector(`[data-comment-id="${id}"] [data-action="select"]`);
    }
    if (target) target.focus();
  }

  buildCard(comment, selected, currentArtRevision) {
    const card = document.createElement('div');
    card.className = selected ? 'comment-card comment-card-selected' : 'comment-card';
    card.dataset.commentId = comment.id;
    card.setAttribute('role', 'listitem');

    const header = document.createElement('div');
    header.className = 'comment-card-header';

    const number = document.createElement('button');
    number.type = 'button';
    number.className = 'comment-card-num';
    number.dataset.action = 'select';
    number.textContent = `#${comment.number}`;
    number.setAttribute('aria-label', `Show comment ${comment.number} on canvas`);
    number.setAttribute('aria-pressed', selected ? 'true' : 'false');
    number.addEventListener('click', () => this.onSelect(comment));
    header.appendChild(number);

    const status = document.createElement('span');
    status.className = 'comment-card-status';
    status.textContent = statusLabel(comment.status);
    header.appendChild(status);
    card.appendChild(header);

    const text = document.createElement('div');
    text.className = 'comment-card-text';
    text.textContent = comment.text;
    card.appendChild(text);

    if (currentArtRevision !== comment.artRevision) {
      const badge = document.createElement('span');
      badge.className = 'comment-card-changed';
      badge.textContent = 'Artwork changed';
      card.appendChild(badge);
    }

    const actions = this.buildActions(comment);
    if (actions) card.appendChild(actions);
    return card;
  }

  buildActions(comment) {
    const canResolve = comment.status === 'addressed';
    const canReopen = REOPENABLE.has(comment.status);
    if (!canResolve && !canReopen) return null;

    const row = document.createElement('div');
    row.className = 'comment-card-actions';
    if (canResolve) row.appendChild(this.actionButton(comment, 'Resolve', false));
    if (canReopen) row.appendChild(this.actionButton(comment, 'Reopen', true));
    return row;
  }

  actionButton(comment, label, reopen) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-small btn-secondary comment-card-action';
    button.dataset.action = reopen ? 'reopen' : 'resolve';
    button.textContent = label;
    button.setAttribute('aria-label', `${label} comment ${comment.number}`);
    button.addEventListener('click', () => this.onResolve(comment, reopen));
    return button;
  }
}
