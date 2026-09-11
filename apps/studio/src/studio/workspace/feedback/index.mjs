// Public feedback workspace entrypoint. Rendering is canvas-only; callers use
// the returned descriptors to mount invisible semantic controls separately.

export { renderFeedback } from "./render.mjs";
export { feedbackRegions } from "./regions.mjs";
export { THREAD_VIEWPORT, threadViewport } from "./thread.mjs";
