// Comment pause handshake: scopes a pause acknowledgement to its own token
// and only activates when the ack is still the current server state.

export class PauseHandshake {
  constructor({ sendPause, acceptSnapshot }) {
    this.sendPause = sendPause;
    this.acceptSnapshot = acceptSnapshot;
    this.token = 0;
  }

  // A generation rotation supersedes any pending acknowledgement.
  expire() {
    this.token += 1;
  }

  // activate(snapshot) runs only when the ack kept its token and the snapshot
  // was accepted as the current paused state; onStale covers everything else.
  begin({ activate, onStale }) {
    const token = ++this.token;
    this.sendPause().then((snapshot) => {
      if (token !== this.token) return;
      const accepted = this.acceptSnapshot(snapshot);
      // acceptSnapshot may synchronously emit a snapshot that expires us.
      if (token !== this.token) return;
      if (accepted) activate(snapshot);
      else onStale(null);
    }, (error) => {
      if (token === this.token) onStale(error);
    });
  }
}
