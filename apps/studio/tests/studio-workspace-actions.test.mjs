import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceActions } from "../src/studio/workspace/actions/index.mjs";

function setup() {
  const calls = [];
  const state = {
    tool: "marker", targetLayer: "layer-0", pending: [], draft: null, snapshot: {
      document: { layers: Array.from({ length: 10 }, (_, index) => ({ id: `layer-${index}` })) },
      comments: Array.from({ length: 5 }, (_, index) => ({ id: `comment-${index}`, status: index === 4 ? "resolved" : "open" })),
    }, connection: "online",
  };
  const application = {
    model: { get: () => state },
    requests: { synchronized: true },
    dispatch(intent) { calls.push(intent); return Promise.resolve(intent); },
  };
  return { application, state, calls };
}

test("routes app intents and maps tool opacity from percent", async () => {
  const h = setup();
  const actions = createWorkspaceActions({ application: h.application, ui: {}, changed() {} });
  await actions.dispatch("tool.select", { tool: "pencil" });
  await actions.dispatch("tool.properties", { property: "opacity", value: 25 });
  await actions.dispatch("review.text", { value: "note" });
  assert.deepEqual(h.calls, [
    { type: "tool.select", tool: "pencil" },
    { type: "tool.properties", opacity: 0.25 },
    { type: "review.text", text: "note" },
  ]);
  actions.destroy();
});

test("feedback waits for begin, creates the bounded draft, and cancel restores the tool", async () => {
  const h = setup();
  const ui = { feedbackOpen: false };
  const actions = createWorkspaceActions({ application: h.application, ui, changed() {} });
  await actions.dispatch("feedback.toggle");
  assert.deepEqual(h.calls.slice(0, 2), [
    { type: "review.begin", scope: "region" },
    { type: "review.rect", rect: { x: 120, y: 160, width: 320, height: 190 } },
  ]);
  assert.equal(ui.feedbackOpen, true);
  await actions.dispatch("review.cancel");
  assert.deepEqual(h.calls.slice(-2), [
    { type: "review.cancel" },
    { type: "tool.select", tool: "marker" },
  ]);
  assert.equal(ui.feedbackOpen, false);
});

test("selects only the real comment returned by review submission", async () => {
  const h = setup();
  const ui = { selectedCommentId: null };
  h.application.dispatch = (intent) => intent.type === "review.submit"
    ? Promise.resolve({ comments: [{ id: "real-comment" }] }) : Promise.resolve(intent);
  const actions = createWorkspaceActions({ application: h.application, ui, changed() {} });
  await actions.dispatch("review.submit");
  assert.equal(ui.selectedCommentId, "real-comment");
});

test("selecting a stored comment opens feedback without starting a draft", async () => {
  const h = setup();
  const ui = { feedbackOpen: false, selectedCommentId: null };
  const actions = createWorkspaceActions({ application: h.application, ui, changed() {} });
  await actions.dispatch("comments.select", { id: "comment-1" });
  assert.equal(ui.selectedCommentId, "comment-1");
  assert.equal(ui.feedbackOpen, true);
  assert.equal(h.calls.length, 0);
});

test("rapid feedback toggles share the pending operation", async () => {
  const h = setup();
  const ui = { feedbackOpen: false };
  let resolveBegin;
  h.application.dispatch = (intent) => {
    h.calls.push(intent);
    if (intent.type === "review.begin") return new Promise((resolve) => { resolveBegin = resolve; });
    return Promise.resolve(intent);
  };
  const actions = createWorkspaceActions({ application: h.application, ui, changed() {} });
  const first = actions.dispatch("feedback.toggle");
  const second = actions.dispatch("feedback.toggle");
  assert.equal(first, second);
  assert.deepEqual(h.calls, [{ type: "review.begin", scope: "region" }]);
  resolveBegin({});
  await first;
  assert.equal(ui.feedbackOpen, true);
});

test("local state and save guards prevent a badge on rejected or unsynced saves", async () => {
  const h = setup();
  const ui = {};
  const errors = [];
  const actions = createWorkspaceActions({ application: h.application, ui, changed: (failure) => { if (failure) errors.push(failure); } });
  await actions.dispatch("sidebar.collapse");
  await actions.dispatch("comments.filter", { filter: "active" });
  assert.equal(ui.collapsed, true);
  assert.equal(ui.commentFilter, "active");
  await actions.dispatch("layers.scroll", { deltaY: 999 });
  assert.equal(ui.layerScroll, 120);
  await actions.dispatch("layers.scroll", { value: 30 });
  assert.equal(ui.layerScroll, 30);
  await actions.dispatch("comments.scroll", { deltaY: 999 });
  assert.equal(ui.commentScroll, 12);
  await actions.dispatch("comments.filter", { filter: "active" });
  assert.equal(ui.commentScroll, 0);
  await actions.dispatch("comments.thread.scroll", { id: "comment-1", deltaY: 999, maxScroll: 12 });
  assert.equal(ui.threadScroll["comment-1"], 12);
  await actions.dispatch("comments.thread.scroll", { id: "comment-1", value: 7, maxScroll: 12 });
  assert.equal(ui.threadScroll["comment-1"], 7);
  h.application.requests.synchronized = false;
  await assert.rejects(actions.dispatch("project.save"), /synchronized/);
  h.application.requests.synchronized = true;
  h.application.dispatch = () => Promise.reject(new Error("save failed"));
  await assert.rejects(actions.dispatch("project.save"), /save failed/);
  assert.equal(ui.saved, undefined);
  assert.equal(errors.length, 2);
});

test("destroyed actions do not publish a late save badge", async () => {
  const h = setup();
  const ui = {};
  let resolve;
  h.application.dispatch = () => new Promise((done) => { resolve = done; });
  const actions = createWorkspaceActions({ application: h.application, ui, changed() {} });
  const saving = actions.dispatch("project.save");
  actions.destroy();
  resolve("saved");
  await saving;
  assert.equal(ui.saved, undefined);
});
