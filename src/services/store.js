import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULTS = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: 'off',
  minimap: true,
  theme: 'black',
  inlineComplete: false,
  target: 'c64',
  mode: 'host',
  autoCheck: true,
  strict: false,
  reopenLast: true,
  showHidden: false,
  recent: [],
  lastProject: '',
  bounds: null,
};

export function loadJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (fallback && typeof fallback === 'object' && !Array.isArray(fallback) && parsed && typeof parsed === 'object') {
      return { ...fallback, ...parsed };
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = `${JSON.stringify(data, null, 2)}\n`;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, next);
  fs.renameSync(tmp, file);
}

export function workspacePath(dir, project) {
  const hash = crypto.createHash('sha1').update(project).digest('hex').slice(0, 20);
  return path.join(dir, 'workspaces', `${hash}.json`);
}
