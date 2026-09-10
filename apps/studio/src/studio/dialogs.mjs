// Dialogs, confirmations, project save/load, PNG export, and error notifications

export class Dialogs {
  constructor(state, api, renderer) {
    this.state = state;
    this.api = api;
    this.renderer = renderer;

    this.banner = document.getElementById('notification-banner');
    this.bannerMessage = document.getElementById('notification-message');
    this.bannerDismiss = document.getElementById('btn-dismiss-notification');
    this.bannerTimeout = null;

    this.modal = document.getElementById('modal-dialog');
    this.modalTitle = document.getElementById('modal-title');
    this.modalMessage = document.getElementById('modal-message');
    this.modalInputWrap = document.getElementById('modal-input-wrap');
    this.modalInputField = document.getElementById('modal-input-field');
    this.modalBtnCancel = document.getElementById('modal-btn-cancel');
    this.modalBtnConfirm = document.getElementById('modal-btn-confirm');

    this.btnNew = document.getElementById('btn-new');
    this.btnDemo = document.getElementById('btn-demo');
    this.btnWelcomeDemo = document.getElementById('btn-welcome-demo');
    this.btnSave = document.getElementById('btn-save');
    this.btnLoadTrigger = document.getElementById('btn-load-trigger');
    this.fileInputProject = document.getElementById('file-input-project');
    this.btnExport = document.getElementById('btn-export');

    this.bindEvents();
    this.subscribeState();
  }

  bindEvents() {
    this.bannerDismiss.addEventListener('click', () => this.state.clearNotification());

    this.btnNew.addEventListener('click', () => this.handleNewProject());
    this.btnDemo.addEventListener('click', () => this.handleLoadDemo());
    if (this.btnWelcomeDemo) {
      this.btnWelcomeDemo.addEventListener('click', () => this.handleLoadDemo());
    }
    this.btnSave.addEventListener('click', () => this.handleSaveProject());
    this.btnLoadTrigger.addEventListener('click', () => this.fileInputProject.click());
    this.fileInputProject.addEventListener('change', (e) => this.handleLoadFile(e));
    this.btnExport.addEventListener('click', () => this.handleExportPng());
  }

  subscribeState() {
    this.state.on('notification', (payload) => {
      if (payload) {
        const msg = typeof payload === 'string' ? payload : payload.message;
        const persistent = typeof payload === 'object' && payload.options?.persistent;
        this.showBanner(msg, { persistent });
      } else {
        this.hideBanner();
      }
    });
  }

  showBanner(message, { persistent = false } = {}) {
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    this.bannerMessage.textContent = message;
    this.banner.hidden = false;
    if (!persistent) {
      this.bannerTimeout = setTimeout(() => this.hideBanner(), 6000);
    }
  }

  hideBanner() {
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    this.banner.hidden = true;
  }

  async confirm(title, message) {
    return new Promise((resolve) => {
      this.modalTitle.textContent = title;
      this.modalMessage.textContent = message;
      this.modalInputWrap.hidden = true;

      let finished = false;
      const cleanup = () => {
        this.modalBtnConfirm.removeEventListener('click', onConfirm);
        this.modalBtnCancel.removeEventListener('click', onCancel);
        this.modal.removeEventListener('cancel', onCancelEvent);
        if (this.modal.open) this.modal.close();
      };

      const finish = (val) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(val);
      };

      const onConfirm = () => finish(true);
      const onCancel = () => finish(false);
      const onCancelEvent = (e) => {
        e.preventDefault();
        finish(false);
      };

      this.modalBtnConfirm.addEventListener('click', onConfirm);
      this.modalBtnCancel.addEventListener('click', onCancel);
      this.modal.addEventListener('cancel', onCancelEvent);
      this.modal.showModal();
    });
  }

  async promptInput(title, message, defaultValue = '') {
    return new Promise((resolve) => {
      this.modalTitle.textContent = title;
      this.modalMessage.textContent = message;
      this.modalInputWrap.hidden = false;
      this.modalInputField.value = defaultValue;

      let finished = false;
      const cleanup = () => {
        this.modalBtnConfirm.removeEventListener('click', onConfirm);
        this.modalBtnCancel.removeEventListener('click', onCancel);
        this.modal.removeEventListener('cancel', onCancelEvent);
        if (this.modal.open) this.modal.close();
      };

      const finish = (val) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(val);
      };

      const onConfirm = () => {
        const val = this.modalInputField.value.trim();
        finish(val);
      };
      const onCancel = () => finish(null);
      const onCancelEvent = (e) => {
        e.preventDefault();
        finish(null);
      };

      this.modalBtnConfirm.addEventListener('click', onConfirm);
      this.modalBtnCancel.addEventListener('click', onCancel);
      this.modal.addEventListener('cancel', onCancelEvent);
      this.modal.showModal();
      this.modalInputField.focus();
    });
  }

  hasExistingArtwork() {
    const marks = this.state.snapshot?.document?.marks || [];
    const total = this.state.snapshot?.history?.total || 0;
    return marks.length > 0 || total > 0;
  }

  async handleNewProject() {
    if (this.hasExistingArtwork()) {
      const ok = await this.confirm('Start New Project', 'Start a new project? Existing canvas marks and history will be cleared.');
      if (!ok) return;
    }
    try {
      const snap = await this.api.sendControl('new');
      this.state.setSnapshot(snap);
    } catch (err) {
      this.state.showNotification(`New project failed: ${err.message}`);
    }
  }

  async handleLoadDemo() {
    if (this.hasExistingArtwork()) {
      const ok = await this.confirm('Load Landscape Demo', 'Load the landscape demo? Current artwork and history will be replaced.');
      if (!ok) return;
    }
    try {
      const snap = await this.api.loadDemo();
      this.state.setSnapshot(snap);
      this.state.showNotification('Demo loaded (paused). Press Play to watch strokes.');
    } catch (err) {
      this.state.showNotification(`Failed to load demo: ${err.message}`);
    }
  }

  async handleSaveProject() {
    try {
      const project = await this.api.fetchProject();
      // Compact serialization to maintain 7 MiB project budget under 8 MiB limit
      const json = JSON.stringify(project);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `codesketch-project-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.state.showNotification(`Save project failed: ${err.message}`);
    }
  }

  async handleLoadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      this.state.showNotification('Project file exceeds 8 MiB limit.');
      return;
    }

    try {
      const text = await file.text();
      const projectData = JSON.parse(text);

      if (this.hasExistingArtwork()) {
        const ok = await this.confirm('Replace Project', 'Load project and replace existing canvas artwork?');
        if (!ok) return;
      }

      const snap = await this.api.loadProject(projectData);
      this.state.setSnapshot(snap);

      const layers = snap?.document?.layers || [];
      const topVisible = [...layers].reverse().find((l) => l.visible) || layers[layers.length - 1];
      if (topVisible) this.state.setTargetLayer(topVisible.id);

      this.state.showNotification('Project loaded successfully (paused).');
    } catch (err) {
      this.state.showNotification(`Failed to load project: ${err.message}`);
    }
  }

  async handleExportPng() {
    try {
      const blob = await this.renderer.exportPngBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `codesketch-artwork-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.state.showNotification(`Export PNG failed: ${err.message}`);
    }
  }
}
