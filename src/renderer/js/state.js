export const state = {
  info: null,
  settings: null,
  project: null,
  tabs: [],
  active: null,
  editor: null,
  problems: [],
  symbols: [],
  symbolsFresh: false,
  expanded: new Set(),
  sidebar: 'explorer',
  sideOpen: true,
  grokOpen: false,
  bottomOpen: true,
  bottomTab: 'run',
  sideW: 272,
  bottomH: 150,
  grokW: 360,
  runConfig: 'current',
  customCommand: '',
  running: false,
  screen: null,
  lastRun: null,
  commands: new Map(),
  nav: { back: [], forward: [], lock: false },
  recentJump: [],
  hooks: {},
  fileIndex: null,
};

export function register(id, fn, meta = {}) {
  state.commands.set(id, {
    id,
    fn,
    title: meta.title || id,
    shortcut: meta.shortcut || '',
    group: meta.group || 'Other',
    menu: meta.menu !== false,
  });
}

export function run(id, payload) {
  const command = state.commands.get(id);
  if (!command) return undefined;
  return command.fn(payload);
}

export function listCommands() {
  return [...state.commands.values()];
}

export function baseName(file) {
  if (!file) return '';
  const index = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
  return file.slice(index + 1);
}

export function dirName(file) {
  if (!file) return '';
  const index = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
  if (index <= 0) return file.startsWith('/') ? '/' : '';
  return file.slice(0, index);
}

export function joinPath(dir, name) {
  if (!dir || dir === '/') return `/${name}`.replace(/^\/\//, '/');
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

export function relativePath(file) {
  if (!file) return '';
  const root = state.project;
  if (root && (file === root || file.startsWith(`${root}/`))) {
    return file.slice(root.length + 1) || baseName(file);
  }
  return file;
}

export function languageOf(file) {
  const name = baseName(file).toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot) : '';
  if (ext === '.magic') return 'magic';
  if (ext === '.bas' || ext === '.basic') {
    let target = 'c64';
    try {
      target = document.getElementById('target')?.value || 'c64';
    } catch {
      target = 'c64';
    }
    if (target === 'apple2') return 'basic-apple';
    if (target === 'ti99') return 'basic-ti';
    return 'basic-c64';
  }
  if (ext === '.a99') return 'asm9900';
  if (ext === '.asm' || ext === '.s' || ext === '.a65') return 'asm6502';
  const map = {
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.mts': 'typescript',
    '.json': 'json',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.md': 'markdown',
    '.py': 'python',
    '.sh': 'shell',
    '.bash': 'shell',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.xml': 'xml',
    '.svg': 'xml',
    '.sql': 'sql',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.toml': 'ini',
    '.ini': 'ini',
    '.txt': 'plaintext',
  };
  return map[ext] || 'plaintext';
}
