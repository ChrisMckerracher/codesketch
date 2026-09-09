#!/usr/bin/env node
import { resolve } from 'node:path';
import { verifyGoPolicy } from './go-policy/index.mjs';
import { runGo } from './go-policy/environment.mjs';

const root = resolve(import.meta.dirname, '..');
try {
  if (process.argv.slice(2).some(arg => arg !== '--policy-only')) throw new Error('Usage: node tools/verify-go.mjs [--policy-only]');
  const checked = verifyGoPolicy(root);
  console.log(`Go policy passed: ${checked.sources} source files, ${checked.packages} resolved packages, canonical renderer embeds.`);
  if (!process.argv.includes('--policy-only')) {
    runGo(root, ['vet', './...']);
    process.stdout.write(runGo(root, ['test', '-race', './...'], { CGO_ENABLED: '1' }));
    console.log('Go verification passed: formatting, policy, vet and race tests.');
  }
} catch (error) {
  console.error(`Go verification failed: ${error.message}`);
  process.exitCode = 1;
}
