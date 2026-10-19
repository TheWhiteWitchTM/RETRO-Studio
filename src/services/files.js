import fs from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['node_modules', 'dist', '.git']);

export function listDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((entry) => !SKIP.has(entry.name) && !entry.name.startsWith('.'))
    .map((entry) => ({
      name: entry.name,
      path: path.join(dir, entry.name),
      dir: entry.isDirectory(),
    }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
}

export function readText(file) {
  const stat = fs.statSync(file);
  if (stat.isDirectory()) throw new Error('that path is a folder');
  if (stat.size > 1_000_000) throw new Error('file is too large for the editor');
  return fs.readFileSync(file, 'utf8');
}

export function writeText(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(content));
  return true;
}

export function searchText(root, query, limit = 80) {
  const hits = [];
  const needle = String(query || '').trim().toLowerCase();
  if (!needle || !root) return hits;
  const walk = (dir, depth) => {
    if (depth > 6 || hits.length >= limit) return;
    let entries = [];
    try {
      entries = listDir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (hits.length >= limit) return;
      if (entry.dir) {
        walk(entry.path, depth + 1);
        continue;
      }
      if (!/\.(magic|bas|basic|asm|s|a65|a99|txt|md)$/i.test(entry.name)) continue;
      let text = '';
      try {
        text = fs.readFileSync(entry.path, 'utf8');
      } catch {
        continue;
      }
      const lines = text.split(/\n/);
      for (let i = 0; i < lines.length && hits.length < limit; i += 1) {
        if (lines[i].toLowerCase().includes(needle)) {
          hits.push({ file: entry.path, line: i + 1, text: lines[i].trim().slice(0, 180) });
        }
      }
    }
  };
  walk(root, 0);
  return hits;
}
