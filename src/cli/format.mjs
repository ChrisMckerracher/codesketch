export function formatStatus(snapshot) {
  const p = snapshot.playback ?? {};
  const h = snapshot.history ?? {};
  const activeDesc = p.active
    ? `, active: ${p.active.command?.type} @ ${Math.round((p.active.progress ?? 0) * 100)}%`
    : "";
  const lines = [
    `Instance: ${snapshot.instanceId} (revision ${snapshot.revision}, artRevision ${snapshot.artRevision})`,
    `Playback: ${p.status ?? "idle"} (speed: ${p.speed ?? 1}x, remaining: ${p.remaining ?? 0}${activeDesc})`,
    `History:  cursor ${h.cursor ?? 0} / ${h.total ?? 0} marks`,
    `Layers:   ${(snapshot.document?.layers ?? []).length} layer(s)`,
    `Feedback: ${(snapshot.feedback ?? []).length} note(s)`,
  ];
  if (snapshot.playbackError) lines.push(`Playback Error: ${snapshot.playbackError}`);
  if (snapshot.storageError) lines.push(`Storage Error:  ${snapshot.storageError}`);
  return lines.join("\n");
}

export function formatLayers(layers = []) {
  if (!layers.length) return "No layers registered.";
  const lines = [`Layers (${layers.length}):`];
  for (const l of layers) {
    const vis = l.visible ? "visible" : "hidden";
    lines.push(`  ${l.id}: "${l.name}" (${vis}, opacity: ${l.opacity})`);
  }
  return lines.join("\n");
}

export function formatFeedback(notes = []) {
  if (!notes.length) return "No feedback notes.";
  const lines = [`Feedback notes (${notes.length}):`];
  notes.forEach((note, index) => {
    lines.push(`  [${index + 1}] (cursor ${note.cursor}, at ${note.at}) ${note.text}`);
  });
  return lines.join("\n");
}

export function formatView(res, playback) {
  return `Captured view: ${res.path} (${res.mimeType}, ${res.width}x${res.height}, revision ${res.revision}, instance ${res.instanceId}, playback: ${playback})`;
}

export function formatExport(res) {
  return `Exported artwork: ${res.path} (${res.mimeType}, ${res.width}x${res.height}, revision ${res.revision}, instance ${res.instanceId})`;
}
