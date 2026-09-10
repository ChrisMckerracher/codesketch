// Agent listening pill: heartbeat TTL with offline awareness and 1s refresh.

const LISTEN_TTL_MS = 5000;

export class ListeningStatus {
  constructor({ element, state }) {
    this.element = element;
    this.state = state;
    this.lastSeenAt = null;

    this.state.on('heartbeat', (heartbeat) => this.ingest(heartbeat));
    this.state.on('snapshot', (snap) => this.ingest(snap?.heartbeat ?? null));
    this.state.on('offline', () => this.update());
    setInterval(() => this.update(), 1000);
    this.update();
  }

  // A null or missing heartbeat clears the timestamp after a server change.
  ingest(heartbeat) {
    this.lastSeenAt = heartbeat?.lastSeenAt ?? null;
    this.update();
  }

  update() {
    if (!this.element) return;
    const seen = this.lastSeenAt ? Date.parse(this.lastSeenAt) : NaN;
    const listening = !this.state.isOffline
      && Number.isFinite(seen)
      && Date.now() - seen <= LISTEN_TTL_MS;
    this.element.textContent = listening ? 'Listening' : 'Not listening';
    this.element.classList.toggle('is-listening', listening);
  }
}
