// Feedback panel: collects human direction for external agents and renders history

export class FeedbackUI {
  constructor(state, api) {
    this.state = state;
    this.api = api;

    this.form = document.getElementById('form-feedback');
    this.input = document.getElementById('input-feedback');
    this.counter = document.getElementById('feedback-counter');
    this.list = document.getElementById('feedback-list');

    this.bindEvents();
    this.subscribeState();
  }

  bindEvents() {
    this.input.addEventListener('input', () => {
      const len = this.input.value.length;
      this.counter.textContent = `${len}/2000`;
    });

    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;

      try {
        const snap = await this.api.sendFeedback(text);
        this.input.value = '';
        this.counter.textContent = '0/2000';
        this.state.setSnapshot(snap);
      } catch (err) {
        this.state.showNotification(`Failed to send feedback: ${err.message}`);
      }
    });
  }

  subscribeState() {
    this.state.on('snapshot', (snap) => this.renderFeedbackList(snap?.feedback || []));
  }

  renderFeedbackList(feedbackItems) {
    this.list.replaceChildren();

    if (!feedbackItems.length) {
      const empty = document.createElement('div');
      empty.className = 'feedback-empty';
      empty.textContent = 'No feedback recorded yet.';
      this.list.appendChild(empty);
      return;
    }

    // Render most recent feedback first
    const sorted = [...feedbackItems].reverse();
    for (const item of sorted) {
      const card = document.createElement('div');
      card.className = 'feedback-card';

      const header = document.createElement('div');
      header.className = 'feedback-card-header';

      const timeSpan = document.createElement('span');
      let timeText = '';
      try {
        timeText = new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch {
        timeText = item.at || '';
      }
      timeSpan.textContent = timeText;

      const cursorSpan = document.createElement('span');
      cursorSpan.textContent = `mark #${item.cursor ?? 0}`;

      header.appendChild(timeSpan);
      header.appendChild(cursorSpan);

      const textPara = document.createElement('div');
      textPara.className = 'feedback-card-text';
      // Secure textContent rendering
      textPara.textContent = item.text;

      card.appendChild(header);
      card.appendChild(textPara);
      this.list.appendChild(card);
    }
  }
}
