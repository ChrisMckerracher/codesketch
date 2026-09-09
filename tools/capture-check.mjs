#!/usr/bin/env node
// Codesketch capture real-browser pixel, layer, eraser, and crop verification.
// Native Node built-ins only.

import { runBrowserIntegrationCheck } from '../tests/capture/browser-integration.mjs';

try {
  await runBrowserIntegrationCheck();
} catch (err) {
  console.error('\nCapture check failed:', err);
  process.exit(1);
}
