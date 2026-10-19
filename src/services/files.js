import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'target',
  '.cache',
  'vendor',
]);

const IMAGE = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.ico', 'image/x-icon'],
]);

export async function listDir(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const rows = [];
  for (const entry of entries) {
    if (entry.name.includes('.magic-studio-check')) continue;
    const full = path.join(dir, entry.name);
    let kind = 'file';
    if (entry.isDirectory()) kind = 'dir';
    else if (entry.isSymbolicLink()) {
      try {
        const stat = await fs.promises.stat(full);
        kind = stat.isDirectory() ? 'dir' : 'file';
      } catch {
        kind = 'file';
      }
    }
    rows.push({
      name: entry.name,
      path: full,
      kind,
      hidden: entry.name.startsWith('.'),
    });
  }
  rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return rows;
}

export async function readFile(file, { force = false } = {}) {
  let stat;
  try {
    stat = await fs.promises.stat(file);
  } catch {
    return { missing: true, file };
  }
  if (stat.isDirectory()) return { directory: true, file };
  const ext = path.extname(file).toLowerCase();
  const mime = IMAGE.get(ext);
  if (mime) {
    const buf = await fs.promises.readFile(file);
    return {
      image: `data:${mime};base64,${buf.toString('base64')}`,
      binary: true,
      size: buf.length,
      mtime: stat.mtimeMs,
    };
  }
  if (!force && stat.size > 2_000_000) {
    return { tooLarge: true, size: stat.size, mtime: stat.mtimeMs };
  }
  const buf = await fs.promises.readFile(file);
  if (buf.subarray(0, 8000).includes(0)) {
    return { binary: true, size: buf.length, mtime: stat.mtimeMs };
  }
  const content = buf.toString('utf8');
  return {
    content,
    size: buf.length,
    mtime: stat.mtimeMs,
    eol: content.includes('\r\n') ? 'CRLF' : 'LF',
  };
}

export async function writeFile(file, content) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content);
  const stat = await fs.promises.stat(file);
  return { mtime: stat.mtimeMs };
}

export async function createEntry(parent, name, kind) {
  const full = path.join(parent, name);
  if (fs.existsSync(full)) {
    throw new Error(`${name} already exists`);
  }
  if (kind === 'dir') {
    await fs.promises.mkdir(full);
    return full;
  }
  const starter = starterFor(name);
  await fs.promises.writeFile(full, starter);
  return full;
}

export async function renamePath(from, to) {
  if (fs.existsSync(to)) throw new Error(`${path.basename(to)} already exists`);
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await fs.promises.rename(from, to);
}

export async function removePath(file) {
  await fs.promises.rm(file, { recursive: true, force: false });
}

export async function walkFiles(root, { max = 8000, ext = '' } = {}) {
  const files = [];
  let truncated = false;
  const want = ext.toLowerCase();

  async function visit(dir, depth) {
    if (files.length >= max) {
      truncated = true;
      return;
    }
    if (depth > 14) return;
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= max) {
        truncated = true;
        return;
      }
      if (entry.name.includes('.magic-studio-check')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
        await visit(full, depth + 1);
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith('.')) continue;
      if (want && !entry.name.toLowerCase().endsWith(want)) continue;
      files.push(full);
    }
  }

  await visit(root, 0);
  return { files, truncated };
}

export function searchText({ root, query, caseSensitive = false, regex = false, include = '' }) {
  return new Promise((resolve) => {
    if (!query) {
      resolve({ matches: [] });
      return;
    }
    const args = [
      '-R',
      '-n',
      '-I',
      '--binary-files=without-match',
      '--exclude-dir=node_modules',
      '--exclude-dir=.git',
      '--exclude-dir=dist',
      '--exclude-dir=build',
      '--exclude-dir=coverage',
      '--exclude-dir=.next',
      '--exclude-dir=out',
      '--exclude-dir=target',
    ];
    if (!caseSensitive) args.push('-i');
    for (const part of String(include || '').split(',')) {
      const item = part.trim();
      if (item) args.push(`--include=${item}`);
    }
    args.push(regex ? '-E' : '-F', '-e', query, '--', root);
    const child = spawn('grep', args, { cwd: root });
    let out = '';
    let error = '';
    child.stdout.on('data', (chunk) => {
      if (out.length < 400_000) out += chunk.toString();
      else child.kill();
    });
    child.stderr.on('data', (chunk) => {
      error += chunk.toString();
    });
    child.on('close', () => {
      const matches = [];
      for (const line of out.split('\n')) {
        if (!line) continue;
        const match = line.match(/^(.*?):(\d+):(.*)$/);
        if (!match) continue;
        matches.push({ file: match[1], line: Number(match[2]), text: match[3] });
        if (matches.length >= 400) break;
      }
      resolve({ matches, truncated: matches.length >= 400, error: error.trim() });
    });
    child.on('error', (err) => resolve({ matches: [], error: err.message }));
  });
}

const SYMBOL = /^\s*(?:(?:public|private|protected)\s+)?(?:async\s+)?(fn|class)\s+([A-Za-z_][A-Za-z0-9_]*)/i;

export async function indexSymbols(root) {
  const { files, truncated } = await walkFiles(root, { ext: '.magic', max: 4000 });
  const symbols = [];
  for (const file of files) {
    let text = '';
    try {
      const buf = await fs.promises.readFile(file);
      if (buf.length > 500_000 || buf.subarray(0, 2000).includes(0)) continue;
      text = buf.toString('utf8');
    } catch {
      continue;
    }
    const lines = text.split(/\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const match = SYMBOL.exec(lines[i]);
      if (!match) continue;
      symbols.push({
        kind: match[1].toLowerCase(),
        name: match[2],
        file,
        line: i + 1,
      });
    }
  }
  return { symbols, truncated };
}

export async function gitInfo(root) {
  try {
    const branch = (await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: root,
      timeout: 2000,
    })).stdout.trim();
    const status = (await execFileAsync('git', ['status', '--porcelain'], {
      cwd: root,
      timeout: 4000,
    })).stdout;
    const dirty = status.split('\n').filter(Boolean).length;
    return { branch, dirty };
  } catch {
    return null;
  }
}

export function readScripts(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? Object.keys(pkg.scripts) : [];
    return scripts;
  } catch {
    return [];
  }
}

function starterFor(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.magic')) return '@target("c64")\n\nprint "hello"\n';
  if (lower.endsWith('.bas') || lower.endsWith('.basic')) return '10 PRINT "HELLO"\n20 END\n';
  if (lower.endsWith('.a99')) return 'AORG >A000\nLWPI >8300\nLI R1,20\nLI R2,22\nA R2,R1\nJMP $\n';
  if (lower.endsWith('.asm') || lower.endsWith('.s') || lower.endsWith('.a65')) {
    return '.org $0900\nlda #20\nclc\nadc #22\nsta $0400\nbrk\n';
  }
  return '';
}

export const HELLO_MAGIC = `@target("c64")
@canvas

fn greet(name)
  return "Hello, " .. name
end

print greet("RETRO")

let engine = new Engine({ width: 320, height: 200 })
let spark = engine.sprite("✦", 40, 90, 28)
engine.motion(spark, 8, 0)
`;

export const HELLO_BAS = `10 PRINT "HELLO"
20 END
`;

export const HELLO_ASM = `.org $0900
lda #20
clc
adc #22
sta $0400
brk
`;

export async function createProject(parent, name) {
  const safe = name.trim();
  if (!safe || safe.includes('/') || safe.includes('\\') || safe === '.' || safe === '..') {
    throw new Error('Use a folder name without slashes');
  }
  const dir = path.join(parent, safe);
  if (fs.existsSync(dir)) throw new Error(`${safe} already exists`);
  await fs.promises.mkdir(dir);
  const file = path.join(dir, 'hello.magic');
  await fs.promises.writeFile(file, HELLO_MAGIC);
  await fs.promises.writeFile(path.join(dir, 'hello.bas'), HELLO_BAS);
  await fs.promises.writeFile(path.join(dir, 'hello.asm'), HELLO_ASM);
  await fs.promises.writeFile(path.join(dir, 'hello.a99'), starterFor('hello.a99'));
  return { dir, file };
}
