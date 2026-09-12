import { downloadBlob } from './downloads.mjs';
import { renderCommittedPng } from './exporter.mjs';

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const HANDLED = new Set(['document.new', 'document.demo', 'project.open', 'project.save', 'png.export']);

function validation(message) {
  return Object.assign(new Error(message), { outcome: 'validation' });
}

function stale(message) {
  return Object.assign(new Error(message), { outcome: 'stale' });
}

export function createDocuments({ model, requests }, browser = {}) {
  let destroyed = false;
  const seams = {
    blob: browser.blob || ((parts, type) => new Blob(parts, { type })),
    download: browser.download || downloadBlob,
    createCanvas: browser.createCanvas,
    renderer: browser.renderer,
  };

  const capture = () => {
    const current = model.get()?.snapshot;
    if (!current || typeof current.docGeneration !== 'string' || !current.docGeneration ||
        !current.instanceId) {
      throw validation('Documents need a synchronized session snapshot');
    }
    const modelView = model.get();
    const filename = typeof modelView.filename === 'string' && modelView.filename.trim()
      ? `${modelView.filename.trim()}` : 'codesketch';
    return {
      expectedDocGeneration: current.docGeneration,
      instanceId: current.instanceId,
      filename,
      document: current.document,
    };
  };

  const download = (blob, filename) => {
    seams.download(blob, filename, {
      document: browser.document ?? globalThis.document,
      url: browser.url ?? globalThis.URL,
    });
  };

  async function newDocument() {
    const captured = capture();
    await requests.mutate({
      expectedDocGeneration: captured.expectedDocGeneration,
      run: (api) => api.sendControl('new', { expectedDocGeneration: captured.expectedDocGeneration }),
    });
  }

  async function demo() {
    const captured = capture();
    await requests.mutate({
      expectedDocGeneration: captured.expectedDocGeneration,
      run: (api) => api.loadDemo({ expectedDocGeneration: captured.expectedDocGeneration }),
    });
  }

  async function open(file) {
    if (!file || typeof file.size !== 'number' || typeof file.text !== 'function') {
      throw validation('project.open needs a file');
    }
    if (file.size > MAX_INPUT_BYTES) {
      throw validation(`Project file exceeds the 8 MiB input cap (${file.size} bytes)`);
    }
    const captured = capture();
    const text = await file.text();
    if (destroyed) return;
    const current = model.get()?.snapshot;
    if (!current || current.instanceId !== captured.instanceId) {
      throw stale('The document changed while the project file was read');
    }
    let project;
    try {
      project = JSON.parse(text);
    } catch {
      throw validation('Project file is not valid JSON');
    }
    if (destroyed) return;
    await requests.mutate({
      expectedDocGeneration: captured.expectedDocGeneration,
      run: (api) => api.loadProject(project, { expectedDocGeneration: captured.expectedDocGeneration }),
    });
  }

  async function save() {
    const captured = capture();
    const project = await requests.api.fetchProject({
      expectedInstanceId: captured.instanceId,
      expectedDocGeneration: captured.expectedDocGeneration,
    });
    if (destroyed) return;
    const current = model.get()?.snapshot;
    if (!current || current.instanceId !== captured.instanceId
      || current.docGeneration !== captured.expectedDocGeneration) {
      throw stale('The document changed while the project was read');
    }
    download(seams.blob([JSON.stringify(project)], 'application/json'), `${captured.filename}.json`);
  }

  async function exportPng() {
    const captured = capture();
    const artwork = captured.document;
    if (!artwork) throw validation('Documents need a synchronized session snapshot');
    const blob = await renderCommittedPng(artwork, seams);
    if (destroyed) return;
    download(blob, `${captured.filename}.png`);
  }

  return {
    handle(intent) {
      if (destroyed || !intent || typeof intent !== 'object' || !HANDLED.has(intent.type)) return false;
      if (intent.type === 'document.new') return newDocument();
      if (intent.type === 'document.demo') return demo();
      if (intent.type === 'project.save') return save();
      if (intent.type === 'png.export') return exportPng();
      return open(intent.file);
    },
    destroy() {
      destroyed = true;
    },
  };
}
