// Public entrypoint for workspace controls. Validates renderer-supplied
// descriptors, mounts persistent invisible semantic DOM elements, and paints
// their vector presentation on the workspace canvas.

import { createFields } from "./fields.mjs";
import { paint } from "./presentation.mjs";

const KINDS = new Set(["button", "range", "textarea", "plane"]);

// root is a positioned design-space overlay: children are absolutely
// positioned at descriptor bounds in design units. vector is the same public
// vector context used by the workspace renderer. dispatch(action, values)
// fires on input and activation; changed() fires on focus, selection, and
// edit; point(event) supplies design coordinates for track and text hit tests.
export function createControls({ root, dispatch, changed, point, vector } = {}) {
  assertVector(vector);
  const scrolls = new Map();
  const fields = createFields({ root, dispatch, changed, point, vector, scrolls });
  return {
    update(descriptors) {
      fields.sync(validate(descriptors));
    },
    destroy() {
      fields.destroy();
      scrolls.clear();
    },
    draw(ctx, v = vector) {
      assertVector(v);
      fields.setVector(v);
      paint(ctx, v, fields.state(), scrolls);
    },
    inputState(id) {
      return fields.inputState(id);
    },
  };
}

function assertVector(vector) {
  if (!vector || typeof vector.layout !== "function" || typeof vector.measure !== "function") {
    throw new TypeError("controls require the current vector layout and measure APIs");
  }
}

// Renderers clip their own descriptors to visible bounds before supplying
// them; only well-formed descriptors of the supported kinds are mounted.
function validate(descriptors) {
  const valid = [];
  for (const descriptor of Array.isArray(descriptors) ? descriptors : []) {
    if (isControl(descriptor)) valid.push(descriptor);
  }
  return valid;
}

function isControl(descriptor) {
  return Boolean(descriptor)
    && KINDS.has(descriptor.kind)
    && typeof descriptor.id === "string"
    && descriptor.id.length > 0
    && Number.isFinite(descriptor.x)
    && Number.isFinite(descriptor.y)
    && Number.isFinite(descriptor.width)
    && Number.isFinite(descriptor.height)
    && descriptor.width > 0
    && descriptor.height > 0;
}
