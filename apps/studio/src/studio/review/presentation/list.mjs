const STATUS_LABELS = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  addressed: 'Addressed',
  resolved: 'Resolved',
};

const REOPEN_FROM = new Set(['acknowledged', 'addressed', 'resolved']);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionButton(label, title) {
  const button = element('button', 'review-action', label);
  button.type = 'button';
  if (title) button.title = title;
  return button;
}

function metaLabel(comment) {
  const rect = comment.rect;
  const where = rect
    ? `Region ${rect.x},${rect.y} · ${rect.width}×${rect.height}`
    : 'Whole canvas';
  const at = comment.at ? new Date(comment.at).toLocaleTimeString() : '';
  return at ? `${where} · ${at}` : where;
}

function createItem(comment, handlers) {
  const item = element('li', 'review-item');
  item.dataset.commentId = comment.id;
  const head = element('div', 'review-item-head');
  const number = element('span', 'review-number');
  const status = element('span', 'review-status');
  head.append(number, status);
  const text = element('p', 'review-text');
  const meta = element('p', 'review-meta');
  const actions = element('div', 'review-actions');
  const resolve = actionButton('Resolve', 'Resolve is available once feedback is addressed');
  const reopen = actionButton('Reopen', 'Reopen returns feedback to Open');
  const highlight = actionButton('Highlight', 'Highlight this region on the current artwork');
  resolve.addEventListener('click', () => handlers.onTransition({ type: 'review.transition', id: comment.id, reopen: false }));
  reopen.addEventListener('click', () => handlers.onTransition({ type: 'review.transition', id: comment.id, reopen: true }));
  highlight.addEventListener('click', () => handlers.onSelect(comment.id));
  actions.append(resolve, reopen, highlight);
  item.append(head, text, meta, actions);
  return {
    element: item,
    update(current, state) {
      item.classList.toggle('is-selected', state.selectedId === current.id);
      number.textContent = `#${current.number}`;
      status.textContent = STATUS_LABELS[current.status] ?? current.status;
      status.className = `review-status review-status-${current.status}`;
      text.textContent = current.text;
      meta.textContent = metaLabel(current);
      resolve.hidden = current.status !== 'addressed';
      reopen.hidden = !REOPEN_FROM.has(current.status);
      highlight.disabled = !current.rect;
      const busy = state.pending.has(current.id);
      const ready = state.connection === 'online';
      resolve.disabled = busy || !ready;
      reopen.disabled = busy || !ready;
    },
  };
}

export function createList({ onTransition, onSelect, onBegin }) {
  const root = element('div', 'review-panel');
  root.appendChild(element('h2', 'review-panel-title', 'Feedback'));
  const agentCheck = element('p', 'review-agent-check');
  const errorLine = element('p', 'review-error');
  errorLine.hidden = true;
  const startRow = element('div', 'review-start');
  const startRegion = actionButton('Region feedback', 'Pause and select a region to review');
  const startWhole = actionButton('Whole canvas feedback', 'Pause and review the whole canvas');
  startRegion.addEventListener('click', () => onBegin('region'));
  startWhole.addEventListener('click', () => onBegin('whole'));
  startRow.append(startRegion, startWhole);
  const empty = element('p', 'review-empty',
    'No feedback yet. Use the comment tool to review the artwork.');
  const body = element('ul', 'review-list');
  root.append(agentCheck, errorLine, startRow, empty, body);
  const items = new Map();

  return {
    element: root,
    setError(message) {
      errorLine.textContent = message ?? '';
      errorLine.hidden = !message;
    },
    update(value, state) {
      root.hidden = value.tab !== 'feedback';
      const stamp = value.snapshot?.heartbeat?.lastSeenAt;
      agentCheck.textContent = `Last agent check: ${stamp ? new Date(stamp).toLocaleTimeString() : 'never'}`;
      const comments = value.snapshot?.comments ?? [];
      const seen = new Set();
      let index = 0;
      for (const comment of comments) {
        seen.add(comment.id);
        let item = items.get(comment.id);
        if (!item) {
          item = createItem(comment, { onTransition, onSelect });
          items.set(comment.id, item);
        }
        item.update(comment, state);
        const target = body.children[index];
        if (target !== item.element) body.insertBefore(item.element, target ?? null);
        index += 1;
      }
      for (const [id, item] of items) {
        if (!seen.has(id)) {
          item.element.remove();
          items.delete(id);
        }
      }
      empty.hidden = comments.length > 0;
      startRow.hidden = value.review.phase !== 'closed';
      const startReady = value.connection === 'online' && value.review.phase === 'closed';
      startRegion.disabled = !startReady;
      startWhole.disabled = !startReady;
    },
  };
}
