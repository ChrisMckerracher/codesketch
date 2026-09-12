import test from "node:test";
import assert from "node:assert/strict";

import { feedbackRegions, renderFeedback, THREAD_VIEWPORT, threadViewport } from "../src/studio/workspace/feedback/index.mjs";
import { dashedRect } from "../src/studio/workspace/feedback/paint.mjs";
import { createVector } from "../src/studio/workspace/vector/index.mjs";

function makeComment(id, number, status, text = `Note ${number}`, replies = []) {
  return {
    id, number, seq: number, text, rect: { x: 100, y: 100, width: 40, height: 40 }, status,
    cursor: number, artRevision: 1, at: "2026-09-11T00:00:00.000Z", acknowledgedAt: null,
    addressedAt: null, resolvedAt: null, visibleLayers: [], request: null, replies,
  };
}

function render(comments, review = {}, ui = {}, pending = []) {
  const ctx = { rects: [], saves: 0, restores: 0, clips: 0,
    save() { this.saves += 1; }, restore() { this.restores += 1; }, beginPath() {},
    rect(...args) { this.rects.push(args); }, clip() { this.clips += 1; } };
  const v = vector();
  const descriptors = renderFeedback({ ctx, v, model: {
    snapshot: { comments }, pending,
    review: { phase: "closed", rect: null, text: "", ...review },
  }, ui: {
    collapsed: false, feedbackOpen: true, commentScroll: 0, commentFilter: "all", selectedCommentId: null,
    threadScroll: {}, replyDrafts: {}, replyPending: {}, ...ui,
  } });
  return { ctx, v, descriptors };
}

function vector() {
  const actual = createVector(null);
  return {
    texts: [], wraps: [], rects: [], strokes: [], roundRects: [], ellipses: [],
    text(...args) { this.texts.push(args); },
    wrap(text, width, scale) { this.wraps.push([text, width, scale]); return actual.wrap(text, width, scale); },
    layout(text, width, scale) { return actual.layout(text, width, scale); },
    measure(text, scale = 1) { return actual.measure(text, scale); },
    rect(...args) { this.rects.push(args); }, stroke(...args) { this.strokes.push(args); },
    roundRect(...args) { this.roundRects.push(args); }, ellipse(...args) { this.ellipses.push(args); },
  };
}

test("thread metadata and long content stay bounded while final reply is reachable", () => {
  assert.deepEqual(THREAD_VIEWPORT, { x: 10, y: 44, width: 228, height: 64 });
  assert.deepEqual(threadViewport({ x: 152, y: 96 }), { x: 162, y: 140, width: 228, height: 64 });
  const commentText = "x".repeat(2000);
  const replies = Array.from({ length: 32 }, (_, index) => ({
    author: "human", text: index === 31 ? "final reply" : `reply ${index + 1}`, at: "now",
  }));
  const comment = makeComment("thread-1", 7, "acknowledged", commentText, replies);
  const start = render([comment], {}, { selectedCommentId: comment.id });
  const range = start.descriptors.find((item) => item.action === "comments.thread.scroll");
  assert.equal(range.axis, "y");
  assert.deepEqual(range.payload, { id: "thread-1" });
  assert.ok(range.max > 0);
  assert.equal(start.v.wraps.find(([text]) => text === commentText)[0], commentText);
  assert.deepEqual(start.ctx.rects.at(-1), [162, 140, 228, 64]);

  const end = render([comment], {}, { selectedCommentId: comment.id, threadScroll: { "thread-1": range.max } });
  const final = end.v.texts.find(([text]) => text === "HUMAN: FINAL REPLY [NOW]");
  assert.ok(final, "the last allowed reply is painted at the end of the scroll range");
  assert.ok(final[1] >= 162 && final[1] <= 226, "thread text remains in the card viewport");
  assert.ok(end.descriptors.find((item) => item.action === "comments.thread.scroll").value === range.max);
});

test("reply controls retain each draft and gate only the matching submission", () => {
  const first = makeComment("c1", 4, "open");
  const second = makeComment("c2", 19, "open");
  const value = "  preserve this raw reply  ";
  const rendered = render([first, second], {}, {
    selectedCommentId: first.id, replyDrafts: { c1: value, c2: "other" }, replyPending: { c1: false },
  });
  const text = rendered.descriptors.find((item) => item.id === "feedback.reply.c1.text");
  const submit = rendered.descriptors.find((item) => item.id === "feedback.reply.c1.send");
  assert.equal(text.action, "comments.reply.text");
  assert.equal(text.value, value);
  assert.deepEqual(text.payload, { id: "c1" });
  assert.equal(submit.action, "comments.reply.submit");
  assert.equal(submit.disabled, false);

  const pending = render([first], {}, {
    selectedCommentId: first.id, replyDrafts: { c1: value }, replyPending: { c1: true },
  }).descriptors.find((item) => item.id === "feedback.reply.c1.send");
  assert.equal(pending.disabled, true);
  const blank = render([first], {}, { selectedCommentId: first.id, replyDrafts: { c1: " \n " } })
    .descriptors.find((item) => item.id === "feedback.reply.c1.send");
  assert.equal(blank.disabled, true);
  const switched = render([first, second], {}, { selectedCommentId: second.id, replyDrafts: { c2: "other" } })
    .descriptors.find((item) => item.id === "feedback.reply.c2.text");
  assert.equal(switched.value, "other");
});

test("uncertain and stale drafts expose recovery without editable text", () => {
  for (const [phase, action] of [["uncertain", "review.retry"], ["stale", "review.reselect"]]) {
    const descriptors = render([], { phase, text: "retain me" }).descriptors;
    const text = descriptors.find((item) => item.action === "review.text");
    assert.equal(text.disabled, true);
    assert.ok(descriptors.some((item) => item.action === action));
    assert.equal(descriptors.some((item) => item.action === "review.submit"), false);
  }
  const submitting = render([], { phase: "submitting", text: "sending" }).descriptors;
  assert.equal(submitting.find((item) => item.action === "review.text").disabled, true);
  assert.equal(submitting.find((item) => item.action === "review.submit").disabled, true);
});

test("frame position uses collection order and Resolve is addressed-only and pending-gated", () => {
  const comments = [
    makeComment("open", 4, "open"), makeComment("addressed", 21, "addressed"), makeComment("resolved", 99, "resolved"),
  ];
  const rendered = render(comments, {}, { selectedCommentId: "addressed" });
  assert.ok(rendered.v.texts.some(([text]) => text === "#02/03"));
  const resolve = rendered.descriptors.find((item) => item.action === "review.transition");
  assert.deepEqual(resolve.payload, { id: "addressed" });
  assert.equal(resolve.disabled, false);
  assert.equal(rendered.descriptors.some((item) => item.payload?.id === "open" && item.action === "review.transition"), false);

  const gated = render(comments, {}, { selectedCommentId: "addressed" }, ["review.transition"]);
  assert.equal(gated.descriptors.find((item) => item.action === "review.transition").disabled, true);
});

test("feedbackRegions shares composer anchoring and thread measurement", () => {
  const selected = makeComment("selected", 8, "open", "A long enough body to need the shared layout.");
  const model = { snapshot: { comments: [selected] }, review: { phase: "closed", rect: null, text: "" } };
  const ui = { feedbackOpen: true, collapsed: false, selectedCommentId: selected.id };
  const regions = feedbackRegions({ model, ui, v: vector() });
  assert.deepEqual(regions.composer, { x: 152, y: 96, width: 248, height: 178 });
  assert.deepEqual(regions.thread, { id: "selected", x: 162, y: 140, width: 228, height: 64, maxScroll: 0 });

  const hidden = feedbackRegions({ model, ui: { ...ui, feedbackOpen: false } });
  assert.deepEqual(hidden, { composer: null, thread: null });
  const draft = feedbackRegions({ model: { ...model, review: { phase: "composing", rect: selected.rect, text: "draft" } }, ui });
  assert.deepEqual(draft.thread, null);
  assert.deepEqual(draft.composer, regions.composer);
});

test("selection drawing keeps canonical bounds while the canvas clip hides overflow", () => {
  const selected = makeComment("crossing", 3, "open", "crossing", []);
  selected.rect = { x: 700, y: 100, width: 200, height: 120 };
  const expanded = render([selected], {}, { selectedCommentId: selected.id, collapsed: false });
  const wash = expanded.v.rects.find((item) => item[4] === "#E0F2FE");
  assert.deepEqual(wash.slice(0, 4), [700, 100, 200, 120]);
  assert.ok(expanded.v.strokes.some(([points]) => points.some(([x]) => x === 900)),
    "the canonical right edge remains at x=900 under the expanded clip");

  const collapsed = render([selected], { phase: "composing", rect: selected.rect, text: "draft" }, { collapsed: true });
  const collapsedWash = collapsed.v.rects.find((item) => item[4] === "#0284C7");
  assert.deepEqual(collapsedWash.slice(0, 4), [700, 100, 200, 120]);
  assert.ok(collapsed.v.roundRects.some(([x, y]) => x === 896 && y === 96),
    "the right handle uses the canonical x=900 anchor when visible");
});

test("marquee dashes use two continuous phased passes", () => {
  const strokes = [];
  dashedRect({ stroke(...args) { strokes.push(args); } }, { x: 0, y: 0, width: 20, height: 10 }, "BLUE", "WHITE");
  const second = strokes.findIndex(([, color]) => color === "WHITE");
  assert.ok(second > 0);
  assert.deepEqual(strokes[0], [[[0, 0], [8, 0]], "BLUE", 1.5]);
  assert.deepEqual(strokes[second], [[[0, 0], [1, 0]], "WHITE", 1.5]);
  assert.ok(strokes.slice(0, second).every(([, color]) => color === "BLUE"));
  assert.ok(strokes.slice(second).every(([, color]) => color === "WHITE"));
});

test("ALL keeps its fixed filter box and scales the real total into it", () => {
  const comments = Array.from({ length: 120 }, (_, index) => makeComment(`c${index}`, index + 1, "open"));
  const { v, descriptors } = render(comments, {}, { feedbackOpen: false });
  const all = descriptors.find((item) => item.id === "feedback.filter.all");
  assert.deepEqual({ x: all.x, y: all.y, width: all.width, height: all.height }, { x: 836, y: 488, width: 32, height: 16 });
   const label = v.texts.find(([text]) => text === "120");
   assert.ok(label);
   assert.ok(label[3] === 0.65, "the numeric label keeps the reference scale");
});

test("composer and blocked regions agree during a live drag and stale recovery", () => {
  const selected = makeComment("old", 1, "open");
  const draggingModel = { snapshot: { comments: [selected] }, review: { phase: "composing", rect: { x: 120, y: 160, width: 40, height: 30 }, text: "draft" } };
  const draggingUi = { feedbackOpen: true, collapsed: false, selectedCommentId: selected.id, selection: { x: 140, y: 180, width: 60, height: 40 } };
  const live = render([selected], draggingModel.review, draggingUi);
  assert.equal(live.descriptors.some((item) => item.action === "review.text"), false);
  assert.deepEqual(feedbackRegions({ model: draggingModel, ui: draggingUi }), { composer: null, thread: null });

  const staleModel = { snapshot: { comments: [] }, review: { phase: "stale", rect: null, text: "retain" } };
  const staleUi = { feedbackOpen: true, collapsed: false, selectedCommentId: null, selection: null };
  const staleRender = render([], staleModel.review, staleUi);
  const staleRegions = feedbackRegions({ model: staleModel, ui: staleUi });
  assert.ok(staleRender.descriptors.some((item) => item.action === "review.reselect"));
  assert.deepEqual(staleRegions.composer, { x: 492, y: 0, width: 248, height: 178 });
  assert.ok(staleRender.v.roundRects.some(([x, y, width, height]) =>
    x === staleRegions.composer.x && y === staleRegions.composer.y
      && width === staleRegions.composer.width && height === staleRegions.composer.height));
});
