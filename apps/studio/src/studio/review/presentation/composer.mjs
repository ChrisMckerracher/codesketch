function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionButton(label, onClick) {
  const button = element('button', 'review-action', label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

export function scopeLabel(review) {
  const rect = review.rect;
  return rect
    ? `Region ${rect.x},${rect.y} · ${rect.width}×${rect.height}`
    : 'Whole canvas';
}

export function createComposer(handlers) {
  const root = element('div', 'review-composer');
  const card = element('div', 'review-card');
  const title = element('h3', 'review-card-title', 'Feedback');
  const status = element('p', 'review-status-line');
  const area = document.createElement('textarea');
  area.className = 'review-textarea';
  area.rows = 4;
  area.maxLength = 2000;
  area.placeholder = 'Describe the feedback…';
  area.addEventListener('input', () => handlers.onText(area.value));
  const hold = element('label', 'review-hold');
  const holdBox = document.createElement('input');
  holdBox.type = 'checkbox';
  holdBox.className = 'review-hold-box';
  holdBox.checked = true;
  holdBox.addEventListener('change', () => handlers.onHold(holdBox.checked));
  hold.append(holdBox, element('span', 'review-hold-text', 'Keep paused until continuation is authorized'));
  const consequence = element('p', 'review-consequence',
    'Unchecked discards pending work and authorizes the agent to continue; the studio stays paused until the agent acts.');
  const actions = element('div', 'review-actions');
  const submit = actionButton('Send feedback', handlers.onSubmit);
  const retry = actionButton('Retry same feedback', handlers.onRetry);
  const reselect = actionButton('Reselect region', handlers.onReselect);
  const switchWhole = actionButton('Use whole canvas', () => handlers.onBegin('whole'));
  const cancel = actionButton('Cancel', handlers.onCancel);
  actions.append(submit, retry, reselect, switchWhole, cancel);
  card.append(title, status, area, hold, consequence, actions);
  root.appendChild(card);
  let focusedOnce = false;

  const validText = (value) => {
    const text = typeof value.review.text === 'string' ? value.review.text.trim() : '';
    return text.length >= 1 && text.length <= 2000;
  };

  return {
    element: root,
    update(value) {
      const review = value.review;
      const { phase } = review;
      root.hidden = phase === 'closed';
      title.textContent = phase === 'closed' ? 'Feedback' : scopeLabel(review);
      area.value = document.activeElement === area ? area.value : (review.text ?? '');
      area.disabled = phase !== 'composing';
      holdBox.checked = review.keepPaused !== false;
      holdBox.disabled = phase !== 'composing';
      const lines = {
        pausing: 'Requesting pause…',
        selecting: 'Drag a region on the canvas, or switch to the whole canvas.',
        submitting: 'Sending…',
        uncertain: 'The response was lost. Retry sends the exact same feedback.',
        stale: 'The artwork changed. Reselect the region to continue.',
      };
      status.textContent = lines[phase] ?? '';
      status.hidden = !lines[phase];
      const textVisible = phase === 'composing' || phase === 'submitting' ||
        phase === 'uncertain' || phase === 'stale';
      area.hidden = !textVisible;
      hold.hidden = !textVisible;
      consequence.hidden = !textVisible;
      const ready = value.connection === 'online';
      submit.hidden = phase !== 'composing';
      submit.disabled = !ready || !validText(value);
      retry.hidden = phase !== 'uncertain';
      retry.disabled = !ready;
      reselect.hidden = !(phase === 'stale' || phase === 'composing');
      reselect.disabled = !ready;
      switchWhole.hidden = phase !== 'selecting';
      switchWhole.disabled = !ready;
      cancel.hidden = phase === 'closed';
      if (phase !== 'composing') {
        focusedOnce = false;
      } else if (!focusedOnce) {
        area.focus();
        focusedOnce = true;
      }
    },
  };
}
