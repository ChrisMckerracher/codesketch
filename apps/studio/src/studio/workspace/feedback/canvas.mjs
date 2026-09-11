import { clipControl, control, reviewDraft, validRect, statusLabel } from "./data.mjs";
import { dashedRect, textWidth } from "./paint.mjs";

export function renderCanvas({ ctx, v, model, ui, comments, descriptors, drawable }) {
  const selected = comments.find((item) => item?.id === ui.selectedCommentId) ?? null;
  const draft = reviewDraft(model);
  const canonicalDraft = draft?.canonicalRect ?? null;

  ctx.save();
  ctx.beginPath();
  ctx.rect(drawable.x, drawable.y, drawable.width, drawable.height);
  ctx.clip();
   renderPins(v, comments, ui.selectedCommentId, drawable, descriptors);
  if (selected?.rect && !draft) drawStoredSelection(v, selected.rect);
  if (canonicalDraft) drawDraftSelection(v, canonicalDraft);
  ctx.restore();

  return {
    selected: selected && !draft ? selected : null,
    draft: draft ? { ...draft, comment: model.review, rect: canonicalDraft } : null,
  };
}

function renderPins(v, comments, selectedId, drawable, descriptors) {
  const groups = cluster(comments.filter((item) => validRect(item?.rect)));
  for (const group of groups) {
    if (group.length > 1) drawCluster(v, group, drawable, descriptors);
    else drawPin(v, group[0], selectedId === group[0].id, drawable, descriptors);
  }
}

function drawPin(v, comment, selected, drawable, descriptors) {
  const rect = validRect(comment.rect);
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const hit = clipControl({ x: center.x - 14, y: center.y - 14, width: 28, height: 28 }, drawable);
  if (!hit) return;
  v.ellipse(center.x, center.y, selected ? 20 : 16, selected ? 20 : 16, "#0284C7");
  v.ellipse(center.x, center.y, selected ? 16 : 12, selected ? 16 : 12, "#FFFFFF");
  v.ellipse(center.x, center.y, selected ? 10 : 8, selected ? 10 : 8, "#0284C7");
  const label = `#${comment.number} ${statusLabel(comment.status)}`;
  const width = Math.min(110, Math.max(38, textWidth(v, label, 0.45) + 10));
  v.roundRect(center.x + 10, center.y - 8, width, 15, 2, comment.status === "acknowledged" ? "#F1F5F9" : "#E0F2FE");
  v.text(label, center.x + 14, center.y - 4, 0.45, comment.status === "acknowledged" ? "#64748B" : "#0284C7", 1);
  descriptors.push(control("button", `feedback.pin.${comment.id}`, hit, `Select comment ${comment.number}`, "comments.select", { id: comment.id }));
}

function drawCluster(v, group, drawable, descriptors) {
  const center = group.reduce((point, comment) => {
    const rect = validRect(comment.rect);
    return { x: point.x + rect.x + rect.width / 2, y: point.y + rect.y + rect.height / 2 };
  }, { x: 0, y: 0 });
  center.x /= group.length;
  center.y /= group.length;
  const label = `${group.length} NOTES`;
  const width = Math.max(68, textWidth(v, label, 0.5) + 22);
  const hit = clipControl({ x: center.x - width / 2, y: center.y - 12, width, height: 24 }, drawable);
  if (!hit) return;
  v.roundRect(hit.x, hit.y, width, 24, 4, "#1E293B");
  v.ellipse(hit.x + 12, center.y, 8, 8, "#38BDF8");
  v.text(label, hit.x + 22, center.y - 5, 0.5, "#FFFFFF", 1);
  descriptors.push(control("button", `feedback.cluster.${group[0].id}`, hit, label, "comments.select", { id: group[0].id }));
}

function drawStoredSelection(v, source) {
  const canonical = validRect(source);
  if (!canonical) return;
  v.rect(canonical.x, canonical.y, canonical.width, canonical.height, "#E0F2FE", 0.14);
  dashedRect(v, canonical, "#64748B", "#FFFFFF");
}

function drawDraftSelection(v, source) {
  const canonical = validRect(source);
  if (!canonical) return;
  v.rect(canonical.x, canonical.y, canonical.width, canonical.height, "#0284C7", 0.14);
  dashedRect(v, canonical);
  const handles = [[canonical.x, canonical.y], [canonical.x + canonical.width, canonical.y], [canonical.x, canonical.y + canonical.height], [canonical.x + canonical.width, canonical.y + canonical.height]];
  for (const [x, y] of handles) {
    v.roundRect(x - 4, y - 4, 8, 8, 1, "#FFFFFF");
    v.stroke([[x - 4, y - 4], [x + 4, y - 4], [x + 4, y + 4], [x - 4, y + 4], [x - 4, y - 4]], "#0284C7", 1);
  }
  const label = `${canonical.width} X ${canonical.height} PX`;
  const width = Math.max(92, textWidth(v, label, 0.55) + 12);
  v.roundRect(canonical.x, canonical.y - 22, width, 18, 3, "#1E293B");
  v.text(label, canonical.x + 6, canonical.y - 17, 0.55, "#FFFFFF", 1);
}

function cluster(comments) {
  const groups = [];
  for (const comment of comments) {
    const rect = validRect(comment.rect);
    const group = groups.find((items) => items.some((item) => close(rect, validRect(item.rect))));
    if (group) group.push(comment);
    else groups.push([comment]);
  }
  return groups;
}

function close(first, second) {
  return first.x <= second.x + second.width + 24 &&
    first.x + first.width + 24 >= second.x &&
    first.y <= second.y + second.height + 24 &&
    first.y + first.height + 24 >= second.y;
}
