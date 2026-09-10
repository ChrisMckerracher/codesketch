import { number } from '../painting/index.mjs';
import { validateProject, MAX_IMPORT_BYTES } from './project.mjs';

const RECOVERY_KEYS = ['active', 'format', 'project', 'speed', 'version'];

export function validateRecovery(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid recovery: expected a recovery envelope object');
  }
  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size > MAX_IMPORT_BYTES) throw new Error(`Recovery exceeds 8 MiB budget (${size} bytes)`);
  const keys = Object.keys(value).sort();
  if (keys.length !== RECOVERY_KEYS.length || keys.some((key, index) => key !== RECOVERY_KEYS[index])) {
    throw new Error('Invalid recovery: envelope requires exactly format, version, project, active, and speed');
  }
  if (value.format !== 'codesketch-recovery') throw new Error('Invalid recovery: unknown recovery format');
  if (value.version !== 1) throw new Error('Invalid recovery: unsupported recovery version');
  if (value.active !== null && (!value.active || typeof value.active !== 'object' || Array.isArray(value.active))) {
    throw new Error('Invalid recovery: active must be null or a progress object');
  }
  const activeKeys = value.active === null ? [] : Object.keys(value.active).sort();
  if (value.active !== null && (activeKeys.length !== 1 || activeKeys[0] !== 'progress')) {
    throw new Error('Invalid recovery: active requires exactly a progress field');
  }
  if (value.active !== null
      && (!Number.isFinite(value.active.progress) || value.active.progress < 0 || value.active.progress >= 1)) {
    throw new Error('Invalid recovery: active progress must be a finite number in [0, 1)');
  }
  const speed = number(value.speed, 'speed', 0.25, 8);
  const project = validateProject(value.project);
  if (value.active !== null && !project.queue.length) {
    throw new Error('Invalid recovery: active progress requires a queued command');
  }
  return { project, active: value.active === null ? null : { progress: value.active.progress }, speed };
}
