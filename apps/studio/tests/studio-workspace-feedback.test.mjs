import test from "node:test";
import assert from "node:assert/strict";

import { renderFeedback } from "../src/studio/workspace/feedback/index.mjs";
import { createVector } from "../src/studio/workspace/vector/index.mjs";

function comment(id, number, status, rect, text = `Note ${number}`, replies = []) {
  return {
    id,
    number,
    seq: number,
    text,
    rect,
    status,
    cursor: number,
    artRevision: 1,
    at: "2026-09-11T00:00:00.000Z",
    acknowledgedAt: null,
    addressedAt: null,
    resolvedAt: null,
    visibleLayers: [{ id: "paint", opacity: 1 }],
    request: null,
    replies,
  };
}

function model(comments, review = {}) {
  return {
    snapshot: { comments },
    review: {
      phase: "closed",
      rect: null,
      text: "",
      ...review,
    },
  };
}

function render(value, ui = {}) {
  const ctx = context();
  const v = vector();
  const descriptors = renderFeedback({
    ctx,
    v,
    model: value,
    ui: { collapsed: false, feedbackOpen: false, commentScroll: 0, commentFilter: "all", selectedCommentId: null, ...ui },
  });
  return { ctx, v, descriptors };
}

function context() {
  return {
    saves: 0,
    restores: 0,
    clips: 0,
    save() { this.saves += 1; },
    restore() { this.restores += 1; },
    beginPath() {},
    rect() {},
    clip() { this.clips += 1; },
  };
}

function vector() {
  const actual = createVector(null);
  return {
    texts: [],
    wraps: [],
    rects: [],
    strokes: [],
    roundRects: [],
    ellipses: [],
    text(...args) { this.texts.push(args); },
    wrap(text, maxWidth, scale) {
      this.wraps.push([text, maxWidth, scale]);
      return actual.wrap(text, maxWidth, scale);
    },
    layout(text, maxWidth, scale) { return actual.layout(text, maxWidth, scale); },
    measure(text, scale = 1) { return actual.measure(text, scale); },
    rect(...args) { this.rects.push(args); },
    stroke(...args) { this.strokes.push(args); },
    roundRect(...args) { this.roundRects.push(args); },
    ellipse(...args) { this.ellipses.push(args); },
  };
}

test("expanded comments use real counts, unresolved filtering, fixed cards, and the gutter range", () => {
  const comments = [
    comment("c1", 1, "open", { x: 20, y: 40, width: 60, height: 50 }, "Ridge edges", [
      { author: "agent", text: "Will soften", at: "now" },
      { author: "human", text: "Keep texture", at: "later" },
    ]),
    comment("c2", 2, "acknowledged", { x: 140, y: 80, width: 60, height: 50 }),
    comment("c3", 3, "addressed", { x: 260, y: 120, width: 60, height: 50 }),
    comment("c4", 4, "resolved", { x: 380, y: 160, width: 60, height: 50 }),
    comment("c5", 5, "open", { x: 500, y: 200, width: 60, height: 50 }),
    comment("c6", 6, "resolved", { x: 620, y: 240, width: 60, height: 50 }),
  ];
  const all = render(model(comments));
  const allFilter = all.descriptors.find((item) => item.id === "feedback.filter.all");
  const activeFilter = all.descriptors.find((item) => item.id === "feedback.filter.active");
  const scroll = all.descriptors.find((item) => item.action === "comments.scroll");
  const cards = all.descriptors.filter((item) => item.id.startsWith("feedback.comment."));

  assert.deepEqual(allFilter.payload, { filter: "all" });
  assert.deepEqual(activeFilter.payload, { filter: "active" });
  assert.ok(all.v.texts.some(([text]) => text === "ALL 6"));
  assert.ok(all.v.texts.some(([text]) => text === "4 ACTIVE"));
  assert.ok(all.v.wraps.some(([text]) => text === "AGENT: Will soften [NOW] | HUMAN: Keep texture [LATER]"));
  assert.equal(scroll.kind, "range");
  assert.equal(scroll.axis, "y");
  assert.deepEqual({ x: scroll.x, y: scroll.y, width: scroll.width, height: scroll.height },
    { x: 980, y: 514, width: 20, height: 140 });
  assert.equal(scroll.max, 88);
  for (const card of cards) {
    assert.equal(card.x, 752);
    assert.equal(card.width, 216);
    assert.ok(card.y >= 514 && card.y + card.height <= 654);
  }
  const thumb = all.v.strokes.find(([points]) => points[0][0] === 994);
  assert.deepEqual(thumb.slice(1, 3), ["#94A3B8", 4]);
  assert.ok(thumb[0][0][1] >= 518 && thumb[0][1][1] <= 650);

  const active = render(model(comments), { commentFilter: "active" });
  const activeCards = active.descriptors.filter((item) => item.id.startsWith("feedback.comment."));
  assert.deepEqual(activeCards.map((item) => item.payload.id), ["c1", "c2", "c3", "c5"]);
  assert.deepEqual(active.descriptors.find((item) => item.id === "feedback.filter.active").payload, { filter: "active" });
});

test("a draft renders a canonical selection and only draft submission controls", () => {
  const rawText = "  soften the ridge\nkeep the wash  ";
  const { ctx, v, descriptors } = render(model([], {
    phase: "composing",
    rect: { x: 120, y: 160, width: 320, height: 190 },
    text: rawText,
  }), { feedbackOpen: true });
  const text = descriptors.find((item) => item.action === "review.text");
  const send = descriptors.find((item) => item.action === "review.submit");

  assert.equal(ctx.clips, 2);
  assert.equal(text.kind, "textarea");
  assert.equal(text.value, rawText);
  assert.equal(text.payload, null);
  assert.equal(send.disabled, false);
  assert.equal(descriptors.some((item) => item.action === "comments.reply"), false);
  assert.ok(v.rects.some(([x, y, width, height, color, opacity]) =>
    x === 120 && y === 160 && width === 320 && height === 190 && color === "#0284C7" && opacity === 0.14));
  assert.ok(v.texts.some(([textValue]) => textValue === "320 X 190 PX"));
  assert.deepEqual({ x: text.x, y: text.y, width: text.width, height: text.height },
    { x: 462, y: 216, width: 228, height: 76 });
  assert.ok(descriptors.filter((item) => item.id.startsWith("feedback.composer.")).every((item) =>
    item.x >= 0 && item.x + item.width <= 740));
});

test("stored comments preserve document bounds, show replies, and navigate actual neighbors", () => {
  const comments = [
    comment("c1", 1, "acknowledged", { x: 800, y: 100, width: 150, height: 120 }, "Inspect far edge", [
      { author: "agent", text: "Updated rev 4", at: "now" },
      { author: "human", text: "Thanks", at: "later" },
    ]),
    comment("c2", 2, "open", { x: 100, y: 100, width: 40, height: 40 }),
  ];
  const expanded = render(model(comments), { feedbackOpen: true, selectedCommentId: "c1" });
  const bounds = expanded.v.texts.find(([text]) => String(text).startsWith("BOUNDS:"));
  const reply = expanded.descriptors.find((item) => item.id === "feedback.reply.c1.text");
  const next = expanded.descriptors.find((item) => item.id === "feedback.comment.c2.next");

  assert.equal(bounds[0], "BOUNDS: 800,100 -> 950,220");
  assert.ok(expanded.v.texts.some(([text]) => text === "AGENT: UPDATED REV 4 [NOW]"));
  assert.ok(expanded.v.texts.some(([text]) => text === "HUMAN: THANKS [LATER]"));
  assert.deepEqual(reply.payload, { id: "c1" });
  assert.equal(reply.kind, "textarea");
  assert.deepEqual(next.payload, { id: "c2" });
  assert.equal(next.action, "comments.select");
  assert.ok(expanded.descriptors.some((item) => item.action === "comments.reply.submit" && item.kind === "button"));

  const collapsed = render(model(comments), { collapsed: true, feedbackOpen: true, selectedCommentId: "c1" });
  const pin = collapsed.descriptors.find((item) => item.id === "feedback.pin.c1");
  assert.ok(pin);
  assert.ok(collapsed.v.rects.some(([x, y, width, height]) => x === 800 && y === 100 && width === 150 && height === 120));
  assert.equal(collapsed.descriptors.some((item) => item.action === "review.text"), false);
});

test("nearby stored regions form a real cluster and edge pin hitboxes are clipped", () => {
  const comments = [
    comment("c1", 1, "open", { x: 0, y: 0, width: 10, height: 10 }),
    comment("c2", 2, "resolved", { x: 20, y: 4, width: 10, height: 10 }),
    comment("c3", 3, "open", { x: 500, y: 500, width: 20, height: 20 }),
  ];
  const { v, descriptors } = render(model(comments), { feedbackOpen: true });
  const cluster = descriptors.find((item) => item.id === "feedback.cluster.c1");
  const pin = descriptors.find((item) => item.id === "feedback.pin.c3");

  assert.ok(cluster);
  assert.equal(cluster.action, "comments.select");
  assert.deepEqual(cluster.payload, { id: "c1" });
  assert.equal(descriptors.some((item) => item.id === "feedback.pin.c1"), false);
  assert.equal(v.texts.some(([text]) => text === "2 NOTES"), true);
  for (const item of [cluster, pin]) {
    assert.ok(item.x >= 0 && item.y >= 0);
    assert.ok(item.x + item.width <= 740 && item.y + item.height <= 700);
  }
});
