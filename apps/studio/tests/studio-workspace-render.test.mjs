import test from "node:test";
import assert from "node:assert/strict";

import { feedbackModel } from "../src/studio/workspace/render.mjs";

test("feedback rendering projects the live selection without mutating model state", () => {
  const comments = [{ id: "stored", rect: { x: 8, y: 9, width: 10, height: 11 } }];
  const snapshot = { comments };
  const model = {
    snapshot,
    review: { phase: "composing", rect: null, text: "draft" },
  };
  const selection = { x: 120, y: 160, width: 320, height: 190 };

  const projected = feedbackModel(model, { selection });

  assert.notEqual(projected, model);
  assert.notEqual(projected.review, model.review);
  assert.deepEqual(projected.review.rect, selection);
  assert.equal(model.review.rect, null);
  assert.strictEqual(projected.snapshot, snapshot);
  assert.strictEqual(projected.snapshot.comments, comments);
});

test("feedback projection is limited to active review phases", () => {
  const selection = { x: 1, y: 2, width: 3, height: 4 };
  const closed = { review: { phase: "closed", rect: null } };
  const composing = { review: { phase: "composing", rect: null } };

  assert.strictEqual(feedbackModel(closed, { selection }), closed);
  assert.strictEqual(feedbackModel(composing, {}), composing);
});
