// Anchored comment composer rendered inside .canvas-shadow above the canvas.

const TEXT_MAX = 2000;

export class CommentComposer {
  constructor({ canvas, onSend, onCancel, onReselect }) {
    this.canvas = canvas;
    this.onSend = onSend || (() => {});
    this.onCancel = onCancel || (() => {});
    this.onReselect = onReselect || (() => {});
    this.rect = null;
    this.open_ = false;

    this.onWindowResize = this.position.bind(this);

    this.root = document.createElement('form');
    this.root.className = 'comment-composer';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'New comment');

    this.label = document.createElement('label');
    this.label.className = 'comment-composer-label';
    this.label.textContent = 'Comment';
    this.label.setAttribute('for', 'comment-composer-input');
    this.root.appendChild(this.label);

    this.input = document.createElement('textarea');
    this.input.id = 'comment-composer-input';
    this.input.className = 'comment-composer-input';
    this.input.maxLength = TEXT_MAX;
    this.input.rows = 3;
    this.input.placeholder = 'Describe what to change in this area...';
    this.input.addEventListener('input', () => this.updateCounter());
    this.input.addEventListener('keydown', (e) => {
      // Cmd/Ctrl+Enter sends; Shift adds continuePlayback.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.send(e.shiftKey);
      }
    });
    this.root.appendChild(this.input);

    this.error = document.createElement('div');
    this.error.className = 'comment-composer-error';
    this.error.hidden = true;
    this.root.appendChild(this.error);

    this.errorActions = document.createElement('div');
    this.errorActions.className = 'comment-composer-error-actions';
    this.errorActions.hidden = true;
    this.reselectButton = this.buildButton('Reselect area', 'btn-secondary', () => this.onReselect());
    this.errorActions.appendChild(this.reselectButton);
    this.root.appendChild(this.errorActions);

    this.footer = document.createElement('div');
    this.footer.className = 'comment-composer-footer';
    this.counter = document.createElement('span');
    this.counter.className = 'char-counter';
    this.counter.textContent = `0/${TEXT_MAX}`;
    this.footer.appendChild(this.counter);

    this.cancelButton = this.buildButton('Cancel', 'btn-secondary', () => this.onCancel());
    this.sendButton = this.buildButton('Send', 'btn-secondary', () => this.send(false));
    this.continueButton = this.buildButton('Apply & continue', 'btn-accent', () => this.send(true));
    this.footer.appendChild(this.cancelButton);
    this.footer.appendChild(this.sendButton);
    this.footer.appendChild(this.continueButton);
    this.root.appendChild(this.footer);

    // Escape cancels from anywhere inside the composer, buttons included.
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.onCancel();
      }
    });
    this.root.addEventListener('submit', (e) => e.preventDefault());
    canvas.parentElement.appendChild(this.root);
    window.addEventListener('resize', this.onWindowResize);
  }

  buildButton(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn-small ${className}`;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  get isOpen() {
    return this.open_;
  }

  get text() {
    return this.input.value.trim();
  }

  set text(value) {
    this.input.value = value || '';
    this.updateCounter();
  }

  open(rect, text = '') {
    this.rect = rect;
    this.clearError();
    this.setPending(false);
    if (!this.open_) {
      this.text = text;
      this.root.hidden = false;
      this.open_ = true;
    } else if (text) {
      this.text = text;
    }
    this.position();
    this.input.focus();
  }

  close() {
    this.root.hidden = true;
    this.open_ = false;
    this.rect = null;
    this.clearError();
    this.setPending(false);
  }

  reset() {
    this.close();
    this.text = '';
  }

  setPending(pending) {
    this.input.disabled = pending;
    this.cancelButton.disabled = pending;
    this.sendButton.disabled = pending;
    this.continueButton.disabled = pending;
    this.reselectButton.disabled = pending;
  }

  showError(message, { stale = false } = {}) {
    this.error.textContent = message;
    this.error.hidden = false;
    this.errorActions.hidden = !stale;
    this.position();
  }

  clearError() {
    this.error.textContent = '';
    this.error.hidden = true;
    this.errorActions.hidden = true;
    this.position();
  }

  send(continuePlayback) {
    if (!this.text) return;
    this.onSend({ text: this.text, continuePlayback });
  }

  // Anchors near the region corner (or top-center for whole canvas) and
  // clamps inside the visible canvas so the form never leaves the paper.
  position() {
    if (!this.open_) return;
    const shadow = this.canvas.parentElement.getBoundingClientRect();
    const box = this.root.getBoundingClientRect();
    let anchorX;
    let anchorY;
    if (this.rect) {
      anchorX = (this.rect.x / 1000) * shadow.width;
      anchorY = (this.rect.y / 700) * shadow.height;
    } else {
      anchorX = shadow.width / 2;
      anchorY = 24;
    }
    const margin = 8;
    let left = anchorX - box.width / 2;
    left = Math.max(margin, Math.min(left, shadow.width - box.width - margin));
    let top = anchorY + 14;
    if (top + box.height > shadow.height - margin) {
      top = Math.max(margin, anchorY - box.height - 14);
    }
    this.root.style.left = `${Math.round(left)}px`;
    this.root.style.top = `${Math.round(top)}px`;
  }

  updateCounter() {
    this.counter.textContent = `${this.input.value.length}/${TEXT_MAX}`;
  }
}
