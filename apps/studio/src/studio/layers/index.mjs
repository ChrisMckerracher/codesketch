function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter(Boolean));
  return node;
}

const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="cs-eye-open" d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle class="cs-eye-open" cx="12" cy="12" r="2.5"/><path class="cs-eye-closed" d="m4 4 16 16"/><path class="cs-eye-closed" d="M9.5 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-2.9 3.4M6.2 6.9A15.6 15.6 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.2-.9"/></svg>';

function formatOpacity(value) {
  const opacity = Number(value);
  return `${Math.round((Number.isFinite(opacity) ? opacity : 0) * 100)}%`;
}

function findLayer(value, id) {
  return value.snapshot?.document?.layers?.find((layer) => layer?.id === id) ?? null;
}

export function mount({ root, model, dispatch }) {
  root.classList.add('cs-layers');
  let current = model;
  let destroyed = false;
  let addPending = false;
  let lastOrder = '';
  const rows = new Map();
  const options = new AbortController();

  const addButton = el('button', { type: 'button', class: 'cs-layers-add' }, '+ Add Layer');
  const head = el('div', { class: 'cs-layers-head' }, el('span', { class: 'cs-layers-title' }, 'Layer Stack'), addButton);
  const list = el('ul', { class: 'cs-layers-list' });
  const emptyHint = el('p', { class: 'cs-layers-empty', hidden: true }, 'No layers');
  root.append(head, list, emptyHint);

  function editContext() {
    return {
      instanceId: current.snapshot?.instanceId ?? null,
      generation: current.snapshot?.docGeneration ?? null,
    };
  }

  function serverAvailable() {
    return Boolean(current.snapshot)
      && current.connection !== 'offline'
      && current.connection !== 'uncertain';
  }

  function contextMatches(edit) {
    const now = editContext();
    return now.instanceId === edit.instanceId && now.generation === edit.generation;
  }

  function nextName() {
    const layers = current.snapshot?.document?.layers ?? [];
    const names = new Set(layers.map((layer) => layer?.name));
    let count = layers.length + 1;
    while (names.has(`Layer ${count}`)) count += 1;
    return `Layer ${count}`;
  }

  addButton.addEventListener('click', () => {
    if (addPending) return;
    addPending = true;
    render();
    dispatch({ type: 'layer.add', name: nextName() }).catch(() => {}).finally(() => {
      addPending = false;
      render();
    });
  }, { signal: options.signal });

  const sidebar = root.closest('#left-sidebar') ?? document;
  for (const button of sidebar.querySelectorAll('.sidebar-tab')) {
    button.addEventListener('click', () => {
      dispatch({ type: 'tab.select', tab: button.dataset.tab }).catch(() => {});
    }, { signal: options.signal });
  }

  function beginRename(row, initial) {
    if (destroyed || row.edit) return;
    const id = row.li.dataset.layerId;
    const layer = findLayer(current, id);
    if (!layer || !serverAvailable()) return;
    const edit = editContext();
    const input = el('input', {
      type: 'text', class: 'cs-layer-rename', value: initial ?? layer.name,
      spellcheck: 'false', 'aria-label': `Rename ${layer.name}`,
    });
    let done = false;
    const finish = (commit, refocus) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      row.edit = null;
      input.replaceWith(row.nameButton);
      if (refocus) row.nameButton.focus();
      if (!commit || !value) return;
      const stillThere = findLayer(current, id);
      if (!stillThere || stillThere.name === value || !contextMatches(edit) || !serverAvailable()) return;
      dispatch({ type: 'layer.update', id, name: value, generation: edit.generation }).catch(() => {
        if (destroyed || rows.get(id) !== row || !findLayer(current, id) || !contextMatches(edit) || !serverAvailable()) return;
        beginRename(row, value);
      });
    };
    row.edit = {
      input,
      ...edit,
      cancel() {
        finish(false, true);
      },
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(true, true);
      else if (event.key === 'Escape') finish(false, true);
    });
    input.addEventListener('blur', () => finish(true, false), { once: true });
    row.nameButton.replaceWith(input);
    input.focus();
    input.select();
  }

  function validateEdits() {
    for (const row of rows.values()) {
      if (!row.edit) continue;
      const id = row.li.dataset.layerId;
      if (!contextMatches(row.edit) || !findLayer(current, id) || !serverAvailable()) {
        row.edit.cancel();
      }
    }
  }

  function buildRow(id) {
    const li = el('li', { class: 'cs-layer-row' });
    li.dataset.layerId = id;
    const visButton = el('button', { type: 'button', class: 'cs-layer-vis', 'aria-pressed': 'true' });
    visButton.innerHTML = EYE;
    const nameButton = el('button', { type: 'button', class: 'cs-layer-name' });
    const badge = el('span', { class: 'cs-layer-opacity' });
    li.append(visButton, nameButton, badge);
    visButton.addEventListener('click', () => {
      const layer = findLayer(current, id);
      if (layer) dispatch({ type: 'layer.update', id, visible: !layer.visible }).catch(() => {});
    }, { signal: options.signal });
    nameButton.addEventListener('click', () => {
      dispatch({ type: 'layer.inspect', id }).catch(() => {});
    }, { signal: options.signal });
    nameButton.addEventListener('dblclick', () => beginRename(rows.get(id)), { signal: options.signal });
    nameButton.addEventListener('keydown', (event) => {
      if (event.key === 'F2') {
        event.preventDefault();
        beginRename(rows.get(id));
      }
    }, { signal: options.signal });
    return { li, visButton, nameButton, badge, edit: null };
  }

  function updateRow(row, layer, selected, canServer) {
    row.li.setAttribute('aria-current', selected ? 'true' : 'false');
    row.li.classList.toggle('cs-layer-hidden', !layer.visible);
    row.visButton.disabled = !canServer;
    row.visButton.setAttribute('aria-pressed', layer.visible ? 'true' : 'false');
    row.visButton.setAttribute('aria-label', `${layer.visible ? 'Hide' : 'Show'} ${layer.name}`);
    if (!row.li.querySelector('.cs-layer-rename') && row.nameButton.textContent !== layer.name) {
      row.nameButton.textContent = layer.name;
    }
    const badge = formatOpacity(layer.opacity);
    if (row.badge.textContent !== badge) row.badge.textContent = badge;
  }

  function render() {
    if (destroyed) return;
    const layers = current.snapshot?.document?.layers ?? [];
    const inspected = current.context === 'layer' ? current.targetLayer : null;
    const canServer = serverAvailable();
    const seen = new Set();
    const ordered = [];
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const layer = layers[index];
      if (!layer || typeof layer.id !== 'string' || seen.has(layer.id)) continue;
      seen.add(layer.id);
      let row = rows.get(layer.id);
      if (!row) {
        row = buildRow(layer.id);
        rows.set(layer.id, row);
      }
      updateRow(row, layer, layer.id === inspected, canServer);
      ordered.push(row.li);
    }
    for (const [id, row] of [...rows]) {
      if (!seen.has(id)) {
        if (row.edit) row.edit.cancel();
        row.li.remove();
        rows.delete(id);
      }
    }
    validateEdits();
    const orderKey = ordered.map((li) => li.dataset.layerId).join('\n');
    if (orderKey !== lastOrder) {
      lastOrder = orderKey;
      for (const li of ordered) list.append(li);
    }
    emptyHint.hidden = !current.snapshot || layers.length > 0;
    addButton.disabled = addPending || !canServer;
    const sidebar = root.closest('#left-sidebar');
    if (sidebar) {
      for (const button of sidebar.querySelectorAll('.sidebar-tab')) {
        button.setAttribute('aria-pressed', button.dataset.tab === current.tab ? 'true' : 'false');
      }
    }
    root.hidden = current.tab === 'feedback';
  }

  render();

  return {
    update(next) {
      if (destroyed) return;
      current = next;
      render();
    },
    destroy() {
      destroyed = true;
      options.abort();
      rows.clear();
      root.classList.remove('cs-layers');
      root.hidden = false;
      root.replaceChildren();
    },
  };
}
