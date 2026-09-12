import { focus, selectionAnchor, setSelection, textOffset } from "./pointer.mjs";

export function bindTextArea(record, { vector, scrolls, locate, notify, dispatchValue, bindDrag }) {
  const { el } = record;
  const listeners = [];
  const listen = (type, handler) => { el.addEventListener(type, handler); listeners.push([type, handler]); };

  listen("click", (event) => {
    if (record.skipClick && event.detail !== 0) {
      record.skipClick = false;
      event.preventDefault?.();
    }
  });
  bindDrag(record,
    (event) => setSelection(record.el, record.dragAnchor, textOffset(record, event, vector(), scrolls, locate)),
    (event) => {
      const offset = textOffset(record, event, vector(), scrolls, locate);
      record.dragAnchor = event.shiftKey ? selectionAnchor(record.el) : offset;
      setSelection(record.el, record.dragAnchor, offset);
    });
  bindComposition(record, listen, notify, dispatchValue);
  if (record.descriptor.edit) bindEditor(record, { listen, notify, dispatchValue });
  else listen("input", () => { dispatchValue(record, el.value); notify(); });
  record.textCleanup = () => {
    for (const [type, handler] of listeners) el.removeEventListener?.(type, handler);
  };
}

function bindComposition(record, listen, notify, dispatchValue) {
  listen("compositionstart", () => { record.composing = true; });
  listen("compositionend", () => {
    record.composing = false;
    if (record.descriptor.textAction) dispatchValue(record, record.el.value, record.descriptor.textAction);
    if (record.blurPending) {
      record.blurPending = false;
      commit(record, dispatchValue, notify);
    }
    notify();
  });
}

function bindEditor(record, { listen, notify, dispatchValue }) {
  record.syncText = () => {
    if (record.descriptor.textAction) dispatchValue(record, record.el.value, record.descriptor.textAction);
  };
  listen("input", () => {
    const value = record.el.value.replace(/[\r\n]/g, "");
    if (value !== record.el.value) {
      const end = Math.min(record.el.selectionEnd ?? value.length, value.length);
      record.el.value = value;
      record.el.setSelectionRange?.(end, end);
    }
    record.syncText();
    if (record.descriptor.textAction) queueMicrotask(notify);
    else notify();
  });
  listen("keydown", (event) => {
    if (record.composing || event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault?.();
      commit(record, dispatchValue, notify);
    } else if (event.key === "Escape") {
      event.preventDefault?.();
      cancel(record, notify);
    }
  });
  record.commitRequested = () => commit(record, dispatchValue, notify);
  listen("blur", () => {
    if (record.canceling) return;
    if (record.composing) record.blurPending = true;
    else record.commitRequested();
  });
}

function commit(record, dispatchValue, notify) {
  if (record.committing || record.canceling || record.removed || record.committedValue === record.el.value) return;
  record.committing = true;
  record.committedValue = record.el.value;
  const action = record.descriptor.commitAction;
  const result = dispatchValue(record, record.el.value, action);
  Promise.resolve(result).then(
    () => { record.committing = false; if (!record.removed) notify(); },
    () => { record.committing = false; record.committedValue = null; if (!record.removed) notify(); },
  );
}

function cancel(record, notify) {
  if (record.committing || record.canceling || record.removed) return;
  record.canceling = true;
  const d = record.descriptor;
  const payload = d.payload && typeof d.payload === "object" ? d.payload : {};
  const result = record.dispatch?.(d.cancelAction, { ...payload });
  Promise.resolve(result).catch(() => {}).finally(() => { if (!record.removed) notify(); });
}

export function activateTextArea(record) {
  if (!record.descriptor.edit || record.editing) return;
  record.editing = true;
  focus(record.el);
  record.el.select?.();
  if (!record.el.select) record.el.setSelectionRange?.(0, record.el.value.length);
}
