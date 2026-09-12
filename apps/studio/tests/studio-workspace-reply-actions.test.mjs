import test from "node:test";
import assert from "node:assert/strict";
import { createReplyActions } from "../src/studio/workspace/actions/replies.mjs";

function harness() {
  let value = { snapshot: snapshot("i1", "g1", 4) };
  const listeners = new Set();
  const calls = [];
  const requests = { mutate: ({ run }) => new Promise((resolve, reject) => calls.push({ run, resolve, reject })), readState: async () => {} };
  const application = { model: { get: () => value, subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)) }, requests };
  return { application, calls, rotate(instanceId, docGeneration, seq = 4, replies = [], extra = []) {
    value = { snapshot: snapshot(instanceId, docGeneration, seq, replies, extra) };
    for (const fn of listeners) fn(value);
  }, snapshot: () => value.snapshot };
}

function snapshot(instanceId, docGeneration, seq, replies = [], extra = []) {
  return { instanceId, docGeneration, revision: 1,
    comments: [{ id: "c1", seq, status: "open", replies }, ...extra] };
}

test("stores raw drafts and clears only an unchanged draft after acknowledgement", async () => {
  const h = harness(); const ui = { replyDrafts: {}, replyPending: {} }; const actions = createReplyActions({ application: h.application, ui });
  await actions.handle("comments.reply.text", { id: "c1", value: "  hi  " });
  const sent = actions.handle("comments.reply.submit", { id: "c1" });
  assert.equal(ui.replyPending.c1, true); assert.equal(h.calls.length, 1);
  const payload = await h.calls[0].run({ replyComment: (body) => { assert.equal(body.text, "  hi  "); assert.equal(body.expectedSeq, 4); return h.snapshot(); } });
  h.calls[0].resolve(payload); await sent;
  assert.equal(ui.replyDrafts.c1, undefined); assert.equal(ui.replyPending.c1, undefined);
});

test("validates, gates concurrent submits, and preserves draft on validation", async () => {
  const h = harness(); const ui = { replyDrafts: { c1: "x" }, replyPending: {} }; const actions = createReplyActions({ application: h.application, ui });
  const first = actions.handle("comments.reply.submit", { id: "c1" });
  await assert.rejects(actions.handle("comments.reply.submit", { id: "c1" }), /already pending/);
  h.calls[0].reject(Object.assign(new Error("bad"), { outcome: "validation" })); await assert.rejects(first, /bad/);
  assert.equal(ui.replyDrafts.c1, "x");
  ui.replyDrafts.c1 = " "; await assert.rejects(actions.handle("comments.reply.submit", { id: "c1" }), /required/);
});

test("uncertain failures retry with the original request after a state read", async () => {
  const h = harness(); const ui = { replyDrafts: { c1: "original" }, replyPending: {} }; const actions = createReplyActions({ application: h.application, ui });
  const first = actions.handle("comments.reply.submit", { id: "c1" }); const original = h.calls[0];
  original.reject(Object.assign(new Error("timeout"), { outcome: "uncertain" })); await assert.rejects(first, /timeout/);
  const second = actions.handle("comments.reply.submit", { id: "c1" }); assert.equal(h.calls.length, 1);
  await Promise.resolve(); assert.equal(h.calls.length, 2);
  const retryCall = h.calls[1]; const result = await retryCall.run({ replyComment: (body) => { assert.equal(body.text, "original"); return h.snapshot(); } }); retryCall.resolve(result); await second;
});

test("reconciles a lost acknowledgement without sending a duplicate", async () => {
  const h = harness(); const ui = { replyDrafts: { c1: "  original  " }, replyPending: {} };
  const actions = createReplyActions({ application: h.application, ui });
  const first = actions.handle("comments.reply.submit", { id: "c1" });
  let sent;
  await h.calls[0].run({ replyComment: (body) => { sent = body; return h.snapshot(); } });
  h.calls[0].reject(Object.assign(new Error("timeout"), { outcome: "uncertain" }));
  await assert.rejects(first, /timeout/);
  h.rotate("i1", "g1", 4, [{ requestId: sent.requestId, author: "human", text: sent.text }]);
  await actions.handle("comments.reply.submit", { id: "c1" });
  assert.equal(h.calls.length, 1);
  assert.equal(ui.replyDrafts.c1, undefined);
});

test("refresh network failure preserves the original retry request", async () => {
  const h = harness(); const ui = { replyDrafts: { c1: "original" }, replyPending: {} };
  const actions = createReplyActions({ application: h.application, ui });
  const first = actions.handle("comments.reply.submit", { id: "c1" });
  let originalRequest;
  await h.calls[0].run({ replyComment: (body) => { originalRequest = body; return h.snapshot(); } });
  h.calls[0].reject(Object.assign(new Error("timeout"), { outcome: "uncertain" }));
  await assert.rejects(first, /timeout/);
  h.application.requests.readState = () => Promise.reject(new TypeError("refresh failed"));
  await assert.rejects(actions.handle("comments.reply.submit", { id: "c1" }), /refresh failed/);
  h.application.requests.readState = async () => {};
  const reused = actions.handle("comments.reply.submit", { id: "c1" });
  await Promise.resolve();
  assert.equal(h.calls.length, 2);
  let retryRequest;
  const result = await h.calls[1].run({ replyComment: (body) => { retryRequest = body; return h.snapshot(); } });
  h.calls[1].resolve(result);
  await reused;
  assert.equal(retryRequest.requestId, originalRequest.requestId);
  assert.equal(retryRequest.text, originalRequest.text);
});

test("retires a definitively stale retry and permits deliberate fresh submits", async () => {
  const h = harness(); const ui = { replyDrafts: { c1: "original" }, replyPending: {} };
  const actions = createReplyActions({ application: h.application, ui });
  const first = actions.handle("comments.reply.submit", { id: "c1" });
  const original = h.calls[0];
  original.reject(Object.assign(new Error("timeout"), { outcome: "uncertain" }));
  await assert.rejects(first, /timeout/);
  const retrying = actions.handle("comments.reply.submit", { id: "c1" });
  await Promise.resolve();
  h.calls[1].reject(Object.assign(new Error("stale"), { outcome: "stale" }));
  await assert.rejects(retrying, /stale/);
  h.rotate("i1", "g1", 5, [], [{ id: "c2", seq: 2, status: "open" }]);
  ui.replyDrafts.c2 = "other";
  const other = actions.handle("comments.reply.submit", { id: "c2" });
  assert.equal(h.calls.length, 3);
  h.calls[2].reject(Object.assign(new Error("stale"), { outcome: "stale" }));
  await assert.rejects(other, /stale/);
  const fresh = actions.handle("comments.reply.submit", { id: "c1" });
  assert.equal(h.calls.length, 4);
  h.calls[3].reject(Object.assign(new Error("uncertain"), { outcome: "uncertain" }));
  await assert.rejects(fresh, /uncertain/);
  assert.equal(ui.replyDrafts.c1, "original");
});

test("rotation retires the retry marker while retaining the raw draft", async () => {
  const h = harness(); const ui = { replyDrafts: { c1: "keep raw" }, replyPending: {} };
  const actions = createReplyActions({ application: h.application, ui });
  const first = actions.handle("comments.reply.submit", { id: "c1" });
  h.calls[0].reject(Object.assign(new Error("timeout"), { outcome: "uncertain" }));
  await assert.rejects(first, /timeout/);
  h.rotate("i2", "g2");
  const fresh = actions.handle("comments.reply.submit", { id: "c1" });
  assert.equal(h.calls.length, 2);
  h.calls[1].reject(Object.assign(new Error("uncertain"), { outcome: "uncertain" }));
  await assert.rejects(fresh, /uncertain/);
  assert.equal(ui.replyDrafts.c1, "keep raw");
});

test("drops pending work on rotation and ignores actions after destroy", async () => {
  const h = harness(); const ui = { replyDrafts: { c1: "x" }, replyPending: {} }; const actions = createReplyActions({ application: h.application, ui });
  const pending = actions.handle("comments.reply.submit", { id: "c1" }); h.rotate("i2", "g2"); await assert.rejects(pending, { outcome: "stale" });
  actions.destroy(); await assert.rejects(actions.handle("comments.reply.submit", { id: "c1" }), { outcome: "stale" }); assert.equal(actions.handle("other"), false);
});
