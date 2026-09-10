// Global comment keyboard shortcuts: C enters comment mode, Esc cancels.

function dialogOpen() {
  return !!document.querySelector('dialog[open]');
}

export class CommentShortcuts {
  constructor({ onComment, onCancel }) {
    this.onComment = onComment || (() => {});
    this.onCancel = onCancel || (() => {});
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  onKeyDown(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') {
      if (!dialogOpen()) {
        event.preventDefault();
        this.onCancel();
      }
      return;
    }
    if (event.key.toLowerCase() !== 'c') return;
    const target = event.target;
    const blocked = target instanceof Element && (
      target.isContentEditable ||
      !!target.closest('input, textarea, select, button, a, [role="radio"], [contenteditable]') ||
      dialogOpen()
    );
    if (!blocked) this.onComment();
  }
}
