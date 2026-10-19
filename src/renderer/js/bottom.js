import { state, baseName, dirName, joinPath } from './state.js';
import { openPath } from './editor.js';

const TERM_THEME = {
  background: '#000000',
  foreground: '#ffffff',
  cursor: '#ffffff',
  cursorAccent: '#000000',
  selectionBackground: '#1a3a6e',
  black: '#000000',
  red: '#f75464',
  green: '#6aab73',
  yellow: '#d5b778',
  blue: '#57a4f0',
  magenta: '#c77dbb',
  cyan: '#2aacb8',
  white: '#ffffff',
  brightBlack: '#6e6e6e',
  brightRed: '#ff7a86',
  brightGreen: '#8fd396',
  brightYellow: '#e7c98a',
  brightBlue: '#79b8ff',
  brightMagenta: '#d7a1d7',
  brightCyan: '#5fd0d0',
  brightWhite: '#ffffff',
};

const TERM_LIGHT = {
  background: '#f7f7f7',
  foreground: '#1c1c1c',
  cursor: '#1c1c1c',
  cursorAccent: '#f7f7f7',
  selectionBackground: '#c6ddff',
  black: '#1c1c1c',
  red: '#c42736',
  green: '#1d7a32',
  yellow: '#8a5a00',
  blue: '#1864d2',
  magenta: '#8a3d8a',
  cyan: '#0b6e75',
  white: '#f7f7f7',
  brightBlack: '#5c5c5c',
  brightRed: '#d24a58',
  brightGreen: '#2e8d42',
  brightYellow: '#a56b10',
  brightBlue: '#3c7ed6',
  brightMagenta: '#a45aa4',
  brightCyan: '#1a8a92',
  brightWhite: '#ffffff',
};

const terms = new Map();
const pending = new Map();
let runTerm = null;
let runFit = null;
let activeTerm = '';

export function initBottom() {
  runTerm = createXterm(document.getElementById('run-term'), (data) => window.studio.runWrite(data));
  runFit = runTerm.fit;
  window.studio.on('run:data', (data) => runTerm.term.write(data));
  window.studio.on('run:exit', ({ code }) => {
    state.running = false;
    const tone = code === 0 ? '32' : '31';
    runTerm.term.write(`\r\n\x1b[${tone}m[exited ${code}]\x1b[0m\r\n`);
    setRunStatus(code === 0 ? 'finished' : `failed (${code})`);
    document.getElementById('run-stop').disabled = true;
  });
  window.studio.on('term:data', ({ id, data }) => {
    const item = terms.get(id);
    if (item) item.term.write(data);
    else {
      const list = pending.get(id) || [];
      list.push(data);
      pending.set(id, list);
    }
  });
  window.studio.on('term:exit', ({ id, code }) => {
    const item = terms.get(id);
    item?.term.write(`\r\n\x1b[2m[exited ${code}]\x1b[0m\r\n`);
  });
  document.getElementById('run-clear').addEventListener('click', () => runTerm.term.clear());
  document.getElementById('term-new').addEventListener('click', () => openTerminal());
  new ResizeObserver(() => fitAll()).observe(document.getElementById('bottom'));
}

function createXterm(parent, onData) {
  const Terminal = globalThis.Terminal;
  const FitAddon = globalThis.FitAddon?.FitAddon || globalThis.FitAddon;
  const WebLinksAddon = globalThis.WebLinksAddon?.WebLinksAddon || globalThis.WebLinksAddon;
  const term = new Terminal({
    fontFamily: '"JetBrains Mono", "Fira Mono", monospace',
    fontSize: 13,
    theme: document.documentElement.dataset.theme === 'light' ? TERM_LIGHT : TERM_THEME,
    cursorBlink: true,
    scrollback: 5000,
    convertEol: false,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon((_event, uri) => {
    window.studio.openExternal(uri);
  }));
  term.registerLinkProvider({
    provideLinks(lineNumber, callback) {
      const line = term.buffer.active.getLine(lineNumber - 1);
      if (!line) {
        callback([]);
        return;
      }
      const text = line.translateToString(true);
      const links = [];
      const re = /([^\s:'"`<>]+):(\d+)(?::(\d+))?/g;
      let match = re.exec(text);
      while (match) {
        const raw = match[1];
        if (looksLikeFile(raw)) {
          const start = match.index + 1;
          const file = raw;
          const lineNo = Number(match[2]);
          const column = Number(match[3] || 1);
          links.push({
            range: { start: { x: start, y: lineNumber }, end: { x: start + match[0].length, y: lineNumber } },
            text: file,
            activate() {
              openLinked(file, lineNo, column);
            },
          });
        }
        match = re.exec(text);
      }
      callback(links);
    },
  });
  term.open(parent);
  if (onData) term.onData(onData);
  try { fit.fit(); } catch { /* hidden */ }
  return { term, fit };
}

export function setTermTheme(name) {
  const theme = name === 'light' ? TERM_LIGHT : TERM_THEME;
  if (runTerm?.term) runTerm.term.options.theme = theme;
  for (const item of terms.values()) item.term.options.theme = theme;
}

function looksLikeFile(text) {
  if (!text || text.length > 240) return false;
  if (text.includes('://')) return false;
  return text.startsWith('/') || text.startsWith('./') || text.startsWith('../') || /\.[A-Za-z0-9]+$/.test(text);
}

function openLinked(raw, line, column) {
  const cleaned = raw.replace(/^\.\//, '');
  const candidates = [];
  if (raw.startsWith('/')) candidates.push(raw);
  if (state.project) candidates.push(joinPath(state.project, cleaned));
  if (state.active?.path) candidates.push(joinPath(dirName(state.active.path), cleaned));
  const file = candidates[0];
  if (file) openPath(file, { line, column });
}

export function focusBottom(tab) {
  state.bottomTab = tab;
  state.bottomOpen = true;
  if (state.hooks.layout) state.hooks.layout();
  else applyBottom();
  fitAll();
}

export function writeRun(text) {
  const value = String(text ?? '').replace(/\r?\n/g, '\r\n');
  runTerm?.term.write(value);
}

export function endRun(code) {
  state.running = false;
  const tone = code === 0 ? '32' : '31';
  runTerm?.term.write(`\r\n\x1b[${tone}m[exited ${code}]\x1b[0m\r\n`);
  setRunStatus(code === 0 ? 'finished' : `failed (${code})`);
  document.getElementById('run-stop').disabled = true;
}

export function applyBottom() {
  const bottom = document.getElementById('bottom');
  bottom.classList.toggle('collapsed', !state.bottomOpen);
  for (const name of ['run', 'screen', 'listing', 'problems', 'terminal']) {
    document.getElementById(`${name}-view`).hidden = state.bottomTab !== name;
    document.querySelector(`[data-bottom="${name}"]`).classList.toggle('active', state.bottomTab === name);
  }
  const badge = document.getElementById('problem-count');
  badge.textContent = state.problems.length ? String(state.problems.length) : '';
  badge.hidden = state.problems.length === 0;
}

export function beginRun(label) {
  state.running = true;
  state.bottomOpen = true;
  state.bottomTab = 'run';
  if (state.hooks.layout) state.hooks.layout();
  else applyBottom();
  runTerm.term.clear();
  runTerm.term.write(`\x1b[2m$ ${label}\x1b[0m\r\n`);
  document.getElementById('run-title').textContent = label;
  setRunStatus('running');
  document.getElementById('run-stop').disabled = false;
  fitAll();
  runTerm.term.focus();
}

export function runFailedToStart(message) {
  state.running = false;
  focusBottom('run');
  runTerm.term.write(`\x1b[31m${message}\x1b[0m\r\n`);
  setRunStatus('not started');
  document.getElementById('run-stop').disabled = true;
}

function setRunStatus(text) {
  const el = document.getElementById('run-status');
  el.textContent = text;
  el.dataset.state = text.startsWith('fail') ? 'bad' : text === 'running' ? 'run' : 'ok';
}

export function renderProblems() {
  const host = document.getElementById('problems-list');
  host.innerHTML = '';
  if (!state.problems.length) {
    host.innerHTML = '<p class="side-empty">No problems.</p>';
    applyBottom();
    return;
  }
  for (const problem of state.problems) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'problem-row';
    row.innerHTML = `<span class="problem-where">${baseName(problem.file)}:${problem.line}:${problem.column}</span><span>${escapeText(problem.message)}</span>`;
    row.addEventListener('click', () => openPath(problem.file, { line: problem.line, column: problem.column }));
    host.appendChild(row);
  }
  applyBottom();
}

function escapeText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

export async function openTerminal(cwd) {
  const folder = cwd || state.project || state.info?.home || undefined;
  focusBottom('terminal');
  const size = measure(document.getElementById('term-host'));
  const created = await window.studio.termCreate({ cwd: folder, cols: size.cols, rows: size.rows });
  mountTerm(created.id, 'terminal', folder);
  return created.id;
}

export function mountTerm(id, title, cwd) {
  const host = document.getElementById('term-host');
  const el = document.createElement('div');
  el.className = 'term-screen';
  host.appendChild(el);
  const made = createXterm(el, (data) => window.studio.termWrite(id, data));
  const queued = pending.get(id) || [];
  pending.delete(id);
  for (const chunk of queued) made.term.write(chunk);
  terms.set(id, { ...made, title, cwd, el });
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'term-tab';
  tab.dataset.term = id;
  tab.textContent = title;
  tab.addEventListener('click', () => showTerm(id));
  tab.addEventListener('auxclick', (event) => {
    if (event.button === 1) killTerm(id);
  });
  document.getElementById('term-tabs').appendChild(tab);
  showTerm(id);
  state.bottomOpen = true;
  state.bottomTab = 'terminal';
  applyBottom();
  fitAll();
}

function showTerm(id) {
  activeTerm = id;
  for (const [key, item] of terms) item.el.hidden = key !== id;
  for (const tab of document.querySelectorAll('.term-tab')) {
    tab.classList.toggle('active', tab.dataset.term === id);
  }
  const item = terms.get(id);
  if (item) {
    try { item.fit.fit(); } catch { /* hidden */ }
    window.studio.termResize(id, item.term.cols, item.term.rows);
    item.term.focus();
  }
}

async function killTerm(id) {
  await window.studio.termKill(id);
  const item = terms.get(id);
  item?.term.dispose();
  item?.el.remove();
  terms.delete(id);
  document.querySelector(`.term-tab[data-term="${id}"]`)?.remove();
  const next = terms.keys().next();
  if (!next.done) showTerm(next.value);
}

export function fitAll() {
  try { runFit?.fit(); } catch { /* hidden */ }
  if (runTerm) window.studio.runResize(runTerm.term.cols, runTerm.term.rows);
  const item = terms.get(activeTerm);
  if (item && state.bottomTab === 'terminal' && state.bottomOpen) {
    try { item.fit.fit(); } catch { /* hidden */ }
    window.studio.termResize(activeTerm, item.term.cols, item.term.rows);
  }
}

export function runSize() {
  try { runFit?.fit(); } catch { /* hidden */ }
  return { cols: runTerm?.term.cols || 80, rows: runTerm?.term.rows || 24 };
}

function measure(el) {
  const width = Math.max(el.clientWidth || 640, 200);
  const height = Math.max(el.clientHeight || 180, 80);
  return { cols: Math.max(20, Math.floor(width / 8.4)), rows: Math.max(4, Math.floor(height / 17)) };
}

export function terminalSize() {
  const item = terms.get(activeTerm);
  if (!item) return measure(document.getElementById('term-host'));
  try { item.fit.fit(); } catch { /* hidden */ }
  return { cols: item.term.cols, rows: item.term.rows };
}
