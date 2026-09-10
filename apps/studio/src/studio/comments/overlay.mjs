// DOM comment overlay: numbered pins and region highlights rendered above the
// canvas. Pure DOM; never touches canvas pixels.

const DOC_WIDTH = 1000;
const DOC_HEIGHT = 700;

// Whole-canvas comments (null or full-document rect) appear in the comment
// list only; they get no corner pin.
function isWholeCanvas(rect) {
  if (!rect) return true;
  return rect.x <= 0 && rect.y <= 0
    && rect.width >= DOC_WIDTH && rect.height >= DOC_HEIGHT;
}

function pinLabel(comment) {
  const text = comment.text ? `: ${comment.text}` : '';
  const status = comment.status ? ` (${comment.status})` : '';
  return `Comment ${comment.number}${text}${status}`;
}

export class CommentOverlay {
  constructor({ canvas, onSelect }) {
    this.canvas = canvas;
    this.onSelect = onSelect || (() => {});
    this.destroyed = false;
    this.lastSignature = null;

    this.overlay = document.createElement('div');
    this.overlay.className = 'comment-overlay';
    this.overlay.setAttribute('aria-label', 'Comments');
    // The overlay never intercepts painting; only pin buttons are clickable.
    this.overlay.style.pointerEvents = 'none';
    this.overlay.style.position = 'absolute';
    this.overlay.style.inset = '0';
    canvas.parentElement.appendChild(this.overlay);
  }

  // Renders pins for every comment plus highlights for the selected comment,
  // the open composer's anchored rect, and any in-progress draft. All
  // positions are percentages, so overlaying stays correct while the canvas
  // is resized. Identical inputs skip the rebuild so 150ms snapshots cannot
  // disturb a focused pin.
  render(comments, selectedId, draftRect, anchorRect) {
    if (this.destroyed) return;
    const list = comments || [];
    const signature = JSON.stringify([list, selectedId, draftRect, anchorRect]);
    if (signature === this.lastSignature) return;
    const focusedId = this.focusedPinId();
    this.lastSignature = signature;
    this.overlay.replaceChildren();

    const selected = list.find((comment) => comment.id === selectedId);
    if (selected && selected.rect) {
      this.appendRegion(selected.rect, 'comment-region');
    }
    if (anchorRect) {
      this.appendRegion(anchorRect, 'comment-region');
    }
    if (draftRect) {
      this.appendRegion(draftRect, 'comment-region-draft');
    }
    for (const comment of list) {
      if (!isWholeCanvas(comment.rect)) this.appendPin(comment);
    }
    if (focusedId !== null) this.restorePinFocus(focusedId);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.lastSignature = null;
    this.overlay.remove();
    this.overlay = null;
  }

  focusedPinId() {
    const active = document.activeElement;
    if (!(active instanceof Element)) return null;
    const pin = active.closest('.comment-pin');
    return pin && this.overlay.contains(pin) ? pin.dataset.commentId : null;
  }

  restorePinFocus(commentId) {
    const pin = this.overlay.querySelector(`.comment-pin[data-comment-id="${CSS.escape(commentId)}"]`);
    if (pin) pin.focus();
  }

  appendPin(comment) {
    const rect = comment.rect || { x: 0, y: 0 };
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'comment-pin';
    pin.textContent = String(comment.number);
    pin.dataset.commentId = comment.id;
    pin.setAttribute('aria-label', pinLabel(comment));
    pin.style.pointerEvents = 'auto';
    pin.style.left = `${(rect.x / DOC_WIDTH) * 100}%`;
    pin.style.top = `${(rect.y / DOC_HEIGHT) * 100}%`;
    pin.addEventListener('click', () => this.onSelect(comment));
    this.overlay.appendChild(pin);
  }

  appendRegion(rect, className) {
    const region = document.createElement('div');
    region.className = className;
    region.style.left = `${(rect.x / DOC_WIDTH) * 100}%`;
    region.style.top = `${(rect.y / DOC_HEIGHT) * 100}%`;
    region.style.width = `${(rect.width / DOC_WIDTH) * 100}%`;
    region.style.height = `${(rect.height / DOC_HEIGHT) * 100}%`;
    this.overlay.appendChild(region);
  }
}
