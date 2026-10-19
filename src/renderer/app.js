import { LANG_LABEL, keywordWords, languageOf } from '../shared/lang.js';
import { paintScreen } from './screen.js';

const $ = (id) => document.getElementById(id);
const MACHINE_LABEL = { c64: 'C64', apple2: 'Apple II', ti99: 'TI-99/4A' };
const STARTER = `@canvas

print "Hello, MAGIC"
`;

const MENUS = [
  ['File', [
    ['New File', 'file.new'],
    ['Open File…', 'file.open'],
    ['Open Folder…', 'project.open'],
    ['Save', 'file.save'],
    ['Save As…', 'file.saveAs'],
    ['', ''],
    ['RETRO-MAGIC Examples', 'project.examples'],
  ]],
  ['View', [
    ['Command Palette', 'palette'],
    ['Toggle Sidebar', 'view.side'],
    ['Toggle Bottom Panel', 'view.bottom'],
    ['Black / Light', 'view.theme'],
    ['Screen', 'view.screen'],
    ['Listing', 'view.listing'],
  ]],
  ['Run', [
    ['Run', 'run.start'],
    ['Check', 'run.check'],
    ['Stop', 'run.stop'],
  ]],
  ['Help', [
    ['Keyboard Shortcuts', 'help.keys'],
    ['About RETRO Studio', 'help.about'],
  ]],
];

const COMMANDS = [
  ['Run', 'run.start'],
  ['Check', 'run.check'],
  ['Stop', 'run.stop'],
  ['New File', 'file.new'],
  ['Open File', 'file.open'],
  ['Open Folder', 'project.open'],
  ['Save', 'file.save'],
  ['Save As', 'file.saveAs'],
  ['RETRO-MAGIC Examples', 'project.examples'],
  ['Toggle Theme', 'view.theme'],
  ['Toggle Sidebar', 'view.side'],
  ['Show Screen', 'view.screen'],
  ['Show Listing', 'view.listing'],
  ['About', 'help.about'],
];

const state = {
  info: null,
  root: '',
  side: 'explorer',
  sideOpen: true,
  bottom: 'run',
  bottomOpen: true,
  theme: 'black',
  target: 'c64',
  mode: 'host',
  buffers: [],
  active: '',
  nextId: 1,
  editor: null,
  listing: { basic: '', asm: '', note: '' },
  screen: null,
  problems: [],
  paletteItems: [],
  paletteIndex: 0,
};

let runToken = 0;
let menuEl = null;

export async function start() {
  state.info = await window.studio.getInfo();
  state.theme = state.info.settings?.theme === 'light' ? 'light' : 'black';
  state.target = state.info.settings?.target || 'c64';
  state.mode = state.info.settings?.mode || 'host';
  $('target').value = state.target;
  $('run-mode').value = state.mode;
  $('status-machine').textContent = MACHINE_LABEL[state.target] || state.target;
  applyTheme(state.theme);
  registerLanguages(state.info.keywords || {});
  state.editor = createEditor();
  buildMenu();
  bind();
  showSide('explorer');
  showBottom('run');
  renderRecent();
  renderTree();
  if (state.info.launch) await openRoot(state.info.launch);
  $('splash').hidden = true;
  if (new URLSearchParams(location.search).has('smoke')) await smokeProbe();
}

function registerLanguages(keywords) {
  const monaco = window.monaco;
  const define = (id, words, extra) => {
    monaco.languages.register({ id });
    monaco.languages.setMonarchTokensProvider(id, {
      ignoreCase: true,
      keywords: keywordWords(words),
      tokenizer: {
        root: [
          ...(extra || []),
          [/"([^"\\]|\\.)*"/, 'string'],
          [/'([^'\\]|\\.)*'/, 'string'],
          [/\$[0-9A-Fa-f]+/, 'number'],
          [/>[0-9A-Fa-f]+\b/, 'number'],
          [/\b\d[\w]*/, 'number'],
          [/[A-Za-z_][\w$]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        ],
      },
    });
  };
  define('magic', keywords.magic, [
    [/--.*$/, 'comment'],
    [/\/\/.*$/, 'comment'],
    [/@[A-Za-z_]\w*/, 'annotation'],
  ]);
  const basicExtra = [
    [/^\s*\d+/, 'number'],
    [/\bREM\b.*$/i, 'comment'],
  ];
  define('basic-c64', keywords.basic?.c64, basicExtra);
  define('basic-apple', keywords.basic?.apple2, basicExtra);
  define('basic-ti', keywords.basic?.ti99, basicExtra);
  const asmExtra = [
    [/;.*$/, 'comment'],
    [/^\*.*$/, 'comment'],
    [/^[A-Za-z_][\w]*:/, 'type'],
  ];
  define('asm6502', keywords.asm6502, asmExtra);
  define('asm9900', keywords.asm9900, asmExtra);
  monaco.editor.defineTheme('retro-black', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'e7c98a' },
      { token: 'comment', foreground: '6e6e6e' },
      { token: 'string', foreground: '6aab73' },
      { token: 'number', foreground: '9dcaff' },
      { token: 'annotation', foreground: 'f75464' },
    ],
    colors: {
      'editor.background': '#000000',
      'editor.foreground': '#ffffff',
      'editorLineNumber.foreground': '#6e6e6e',
      'editor.selectionBackground': '#214283',
    },
  });
  monaco.editor.defineTheme('retro-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '8a5a00' },
      { token: 'string', foreground: '1d7a32' },
    ],
    colors: {
      'editor.background': '#f7f7f7',
      'editor.foreground': '#1c1c1c',
    },
  });
}

function createEditor() {
  const editor = window.monaco.editor.create($('editor'), {
    value: '',
    language: 'magic',
    theme: state.theme === 'light' ? 'retro-light' : 'retro-black',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: 14,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    renderLineHighlight: 'line',
  });
  editor.onDidChangeCursorPosition((event) => {
    $('status-line').textContent = `${event.position.lineNumber}:${event.position.column}`;
  });
  editor.onDidChangeModelContent(() => {
    const buffer = activeBuffer();
    if (!buffer || buffer.silent) return;
    buffer.dirty = true;
    renderTabs();
    renderOutline();
  });
  return editor;
}

function activeBuffer() {
  return state.buffers.find((item) => item.id === state.active) || null;
}

function syncWelcome() {
  $('welcome').hidden = state.buffers.length > 0;
}

function openBuffer({ path, name, value, lang }) {
  const existing = path ? state.buffers.find((item) => item.path === path) : null;
  if (existing) {
    showBuffer(existing.id);
    return existing;
  }
  const id = `b${state.nextId}`;
  state.nextId += 1;
  const model = window.monaco.editor.createModel(
    value,
    lang || 'plaintext',
    window.monaco.Uri.parse(`inmemory://retro/${id}`),
  );
  const buffer = {
    id,
    path: path || '',
    name,
    lang: lang || 'plaintext',
    model,
    dirty: !path,
  };
  state.buffers.push(buffer);
  showBuffer(id);
  return buffer;
}

function showBuffer(id) {
  const buffer = state.buffers.find((item) => item.id === id);
  if (!buffer) return;
  const dirty = buffer.dirty;
  state.active = id;
  buffer.silent = true;
  state.editor.setModel(buffer.model);
  window.monaco.editor.setModelLanguage(buffer.model, buffer.lang);
  buffer.silent = false;
  buffer.dirty = dirty;
  syncWelcome();
  $('crumb').textContent = buffer.path || buffer.name;
  $('status-lang').textContent = LANG_LABEL[buffer.lang] || buffer.lang;
  window.studio.setTitle(buffer.name);
  renderTabs();
  renderOutline();
}

function newFile() {
  openBuffer({ name: `untitled-${state.nextId}.magic`, value: STARTER, lang: 'magic' });
}

async function closeBuffer(id) {
  const index = state.buffers.findIndex((item) => item.id === id);
  if (index < 0) return;
  const buffer = state.buffers[index];
  if (buffer.dirty) {
    const allow = await modal({
      title: 'Close file',
      body: `${buffer.name} has unsaved changes.`,
      ok: 'Close',
      cancel: 'Stay',
    });
    if (!allow) return;
  }
  buffer.model.dispose();
  state.buffers.splice(index, 1);
  if (state.active === id) {
    const next = state.buffers[index] || state.buffers[index - 1];
    if (next) showBuffer(next.id);
    else {
      state.active = '';
      state.editor.setModel(window.monaco.editor.createModel('', 'plaintext'));
      $('crumb').textContent = '';
      $('status-lang').textContent = '—';
      window.studio.setTitle('');
      syncWelcome();
      renderTabs();
      renderOutline();
    }
  } else {
    renderTabs();
  }
}

async function openFile(file) {
  const result = await window.studio.readFile(file);
  if (!result.ok) {
    toast(result.message || 'Could not read that file.');
    return;
  }
  const name = file.split(/[\\/]/).pop();
  openBuffer({
    path: file,
    name,
    value: result.content,
    lang: languageOf(file, state.target),
  });
}

async function save(forceNew) {
  const buffer = activeBuffer();
  if (!buffer) return;
  let file = forceNew ? '' : buffer.path;
  if (!file) {
    file = await window.studio.saveDialog({ defaultPath: buffer.path || buffer.name });
    if (!file) return;
  }
  const result = await window.studio.writeFile(file, buffer.model.getValue());
  if (!result.ok) {
    toast(result.message || 'Could not save.');
    return;
  }
  buffer.path = file;
  buffer.name = file.split(/[\\/]/).pop();
  buffer.lang = languageOf(file, state.target);
  window.monaco.editor.setModelLanguage(buffer.model, buffer.lang);
  buffer.dirty = false;
  showBuffer(buffer.id);
  if (state.root) renderTree();
}

async function openRoot(dir) {
  state.root = dir;
  showSide('explorer');
  await renderTree();
}

async function renderTree() {
  const host = $('tree');
  host.replaceChildren();
  if (!state.root) {
    const empty = document.createElement('p');
    empty.className = 'side-empty';
    empty.textContent = 'No folder open.';
    host.appendChild(empty);
    return;
  }
  const listed = await window.studio.listDir(state.root);
  if (!listed.ok) {
    const empty = document.createElement('p');
    empty.className = 'side-empty';
    empty.textContent = listed.message || 'Could not list that folder.';
    host.appendChild(empty);
    return;
  }
  const filter = $('tree-filter').value.trim().toLowerCase();
  const rootRow = document.createElement('p');
  rootRow.className = 'side-count';
  rootRow.textContent = state.root;
  host.appendChild(rootRow);
  for (const entry of listed.entries) {
    if (filter && !entry.name.toLowerCase().includes(filter)) continue;
    host.appendChild(treeRow(entry, 0));
  }
}

function treeRow(entry, depth) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'tree-row';
  row.style.paddingLeft = `${8 + depth * 12}px`;
  const twist = document.createElement('span');
  twist.className = 'twist';
  twist.textContent = entry.dir ? '▸' : '';
  const name = document.createElement('span');
  name.className = entry.dir ? 'tree-name dir' : 'tree-name';
  name.textContent = entry.name;
  row.dataset.depth = String(depth);
  row.append(twist, name);
  row.onclick = async () => {
    if (!entry.dir) {
      await openFile(entry.path);
      return;
    }
    const next = row.nextElementSibling;
    if (next && Number(next.dataset.depth) > depth) {
      while (row.nextElementSibling && Number(row.nextElementSibling.dataset.depth) > depth) {
        row.nextElementSibling.remove();
      }
      twist.textContent = '▸';
      return;
    }
    const listed = await window.studio.listDir(entry.path);
    if (!listed.ok) return;
    twist.textContent = '▾';
    let after = row;
    for (const child of listed.entries) {
      const node = treeRow(child, depth + 1);
      after.insertAdjacentElement('afterend', node);
      after = node;
    }
  };
  return row;
}

function renderTabs() {
  const host = $('tabs');
  host.replaceChildren();
  for (const buffer of state.buffers) {
    const tab = document.createElement('div');
    tab.className = `tab${buffer.id === state.active ? ' active' : ''}${buffer.dirty ? ' dirty' : ''}`;
    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = buffer.name;
    const mark = document.createElement('span');
    mark.className = 'tab-mark';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tab-close';
    close.textContent = '×';
    close.onclick = (event) => {
      event.stopPropagation();
      closeBuffer(buffer.id);
    };
    tab.append(name, mark, close);
    tab.onclick = () => showBuffer(buffer.id);
    host.appendChild(tab);
  }
}

function renderOutline() {
  const host = $('outline');
  host.replaceChildren();
  const buffer = activeBuffer();
  if (!buffer) return;
  const lines = buffer.model.getValue().split('\n');
  const items = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    let match = /^(?:fn|function)\s+([A-Za-z_]\w*)/i.exec(trimmed);
    if (!match && buffer.lang.startsWith('asm')) match = /^([A-Za-z_]\w*):/.exec(line);
    if (!match && buffer.lang.startsWith('basic')) match = /^(\d+)\b/.exec(trimmed);
    if (match) items.push({ name: match[1], line: index + 1 });
  });
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'side-empty';
    empty.textContent = 'No structure yet.';
    host.appendChild(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'outline-row';
    row.textContent = item.name;
    row.onclick = () => goLine(item.line, 1);
    host.appendChild(row);
  }
}

function goLine(line, column) {
  state.editor.revealLineInCenter(line);
  state.editor.setPosition({ lineNumber: line, column: column || 1 });
  state.editor.focus();
}

function payloadFor(buffer) {
  const name = buffer.path || buffer.name;
  return {
    source: buffer.model.getValue(),
    filename: name,
    target: state.target,
    lang: languageOf(name, state.target),
    mode: state.mode,
  };
}

async function run() {
  const buffer = activeBuffer();
  if (!buffer) {
    toast('Open a file first.');
    return;
  }
  const token = ++runToken;
  setRun('run', 'running');
  const result = await window.studio.run(payloadFor(buffer));
  if (token !== runToken) return;
  state.listing = {
    basic: result.basic || '',
    asm: result.asm || '',
    note: result.image
      ? `${result.image.format} ${result.image.bytes} bytes at $${result.image.org.toString(16)}  ${result.image.cpu}`
      : (result.asmError || ''),
  };
  state.screen = result.screen || null;
  const lines = [];
  if (result.output) lines.push(String(result.output).replace(/\s+$/, ''));
  if (result.halted && result.halted !== 'host') {
    lines.push(`halted ${result.halted}${result.cycles != null ? `  cycles ${result.cycles}` : ''}`);
  }
  if (result.notes?.length) lines.push(result.notes.join('\n'));
  $('run-log').textContent = lines.filter(Boolean).join('\n\n');
  $('run-title').textContent = `${buffer.name} · ${MACHINE_LABEL[result.target] || result.target || ''} · ${LANG_LABEL[result.language] || result.language || ''}`;
  setProblems(result.problems || [], result.warnings || []);
  renderListing();
  if (result.screen) {
    showBottom('screen');
    $('screen-caption').textContent = result.screen.caption || '';
    paintScreen($('screen-canvas'), result.screen);
  } else {
    showBottom('run');
    $('screen-caption').textContent = result.asmError || 'This run has no screen. Assembly prints on the Run tab.';
  }
  setRun(result.ok ? 'ok' : 'bad', result.ok ? 'ok' : 'failed');
  if (!result.ok) showBottom('problems');
}

async function check() {
  const buffer = activeBuffer();
  if (!buffer) {
    toast('Open a file first.');
    return;
  }
  const result = await window.studio.check(payloadFor(buffer));
  setProblems(result.problems || [], result.warnings || []);
  setRun(result.ok ? 'ok' : 'bad', result.ok ? 'clean' : 'problems');
  if (!result.ok) showBottom('problems');
}

function stop() {
  runToken += 1;
  setRun('idle', 'stopped');
}

function setRun(name, label) {
  const el = $('run-status');
  el.dataset.state = name;
  el.textContent = label;
}

function setProblems(problems, warnings) {
  state.problems = [
    ...problems,
    ...warnings.map((message) => ({
      line: 1,
      column: 1,
      message,
      filename: '',
      severity: 'warning',
    })),
  ];
  const errors = state.problems.filter((item) => item.severity !== 'warning');
  const count = $('problem-count');
  count.hidden = errors.length === 0;
  count.textContent = String(errors.length);
  $('status-problems').textContent = errors.length ? `${errors.length} problem${errors.length === 1 ? '' : 's'}` : 'No problems';
  $('status-problems').classList.toggle('bad', errors.length > 0);
  const host = $('problems-list');
  host.replaceChildren();
  if (!state.problems.length) {
    const empty = document.createElement('p');
    empty.className = 'side-empty';
    empty.textContent = 'No problems.';
    host.appendChild(empty);
    return;
  }
  for (const item of state.problems) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `problem-row${item.severity === 'warning' ? ' warn' : ''}`;
    const where = document.createElement('span');
    where.className = 'where';
    where.textContent = `${item.filename || 'buffer'}:${item.line}:${item.column}`;
    const text = document.createElement('span');
    text.textContent = item.message;
    row.append(where, text);
    row.onclick = () => {
      if (item.line) goLine(item.line, item.column || 1);
    };
    host.appendChild(row);
  }
}

function renderListing() {
  const kind = $('listing-kind').value;
  const text = kind === 'asm' ? state.listing.asm : state.listing.basic;
  $('listing-text').textContent = text || (kind === 'asm' ? 'No assembly yet.' : 'No BASIC yet.');
  $('listing-note').textContent = state.listing.note || '';
}

function editListing() {
  const kind = $('listing-kind').value;
  const text = kind === 'asm' ? state.listing.asm : state.listing.basic;
  if (!text) {
    toast('Run a MAGIC file to emit a listing.');
    return;
  }
  const ext = kind === 'asm' ? (state.target === 'ti99' ? '.a99' : '.asm') : '.bas';
  const name = `listing${ext}`;
  openBuffer({ name, value: text, lang: languageOf(name, state.target) });
}

function applyTheme(theme) {
  state.theme = theme === 'light' ? 'light' : 'black';
  document.documentElement.dataset.theme = state.theme;
  $('status-theme').textContent = state.theme === 'light' ? 'Light' : 'Black';
  if (state.editor) window.monaco.editor.setTheme(state.theme === 'light' ? 'retro-light' : 'retro-black');
}

async function toggleTheme() {
  applyTheme(state.theme === 'black' ? 'light' : 'black');
  await window.studio.setChromeTheme(state.theme);
}

function applySide() {
  $('app').classList.toggle('no-side', !state.sideOpen);
  $('app').style.setProperty('--side', state.sideOpen ? '272px' : '0px');
}

function showSide(name) {
  state.side = name;
  state.sideOpen = true;
  applySide();
  document.querySelectorAll('[data-side]').forEach((button) => {
    button.classList.toggle('active', button.dataset.side === name);
  });
  $('side-explorer').hidden = name !== 'explorer';
  $('side-search').hidden = name !== 'search';
  $('side-outline').hidden = name !== 'outline';
}

function showBottom(name) {
  state.bottom = name;
  state.bottomOpen = true;
  $('bottom').classList.remove('collapsed');
  document.querySelectorAll('[data-bottom]').forEach((button) => {
    button.classList.toggle('active', button.dataset.bottom === name);
  });
  for (const id of ['run', 'screen', 'listing', 'problems', 'terminal']) {
    $(`${id}-view`).hidden = id !== name;
  }
  if (name === 'screen') paintScreen($('screen-canvas'), state.screen);
  state.editor?.layout();
}

function renderRecent() {
  const host = $('recent');
  host.replaceChildren();
  for (const dir of state.info?.settings?.recent || []) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'recent-row';
    row.textContent = dir;
    row.onclick = () => openRoot(dir);
    host.appendChild(row);
  }
}

function buildMenu() {
  const bar = $('menubar');
  for (const [label, items] of MENUS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = (event) => {
      event.stopPropagation();
      openMenu(button, items);
    };
    bar.appendChild(button);
  }
  document.addEventListener('click', closeMenu);
}

function closeMenu() {
  menuEl?.remove();
  menuEl = null;
}

function openMenu(anchor, items) {
  closeMenu();
  const pop = document.createElement('div');
  pop.className = 'menu-pop';
  const rect = anchor.getBoundingClientRect();
  pop.style.left = `${rect.left}px`;
  pop.style.top = `${rect.bottom}px`;
  for (const [label, cmd] of items) {
    if (!cmd) {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      pop.appendChild(sep);
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = (event) => {
      event.stopPropagation();
      closeMenu();
      command(cmd);
    };
    pop.appendChild(button);
  }
  document.body.appendChild(pop);
  menuEl = pop;
}

function openPalette() {
  state.paletteIndex = 0;
  $('palette').hidden = false;
  $('palette-input').value = '';
  renderPalette();
  $('palette-input').focus();
}

function renderPalette() {
  const query = $('palette-input').value.trim().toLowerCase();
  state.paletteItems = COMMANDS.filter(([label]) => label.toLowerCase().includes(query));
  if (state.paletteIndex >= state.paletteItems.length) state.paletteIndex = 0;
  const host = $('palette-list');
  host.replaceChildren();
  state.paletteItems.forEach(([label], index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `palette-row${index === state.paletteIndex ? ' active' : ''}`;
    row.textContent = label;
    row.onclick = () => {
      $('palette').hidden = true;
      command(state.paletteItems[index][1]);
    };
    host.appendChild(row);
  });
}

async function command(cmd) {
  if (cmd === 'file.new') newFile();
  else if (cmd === 'file.open') {
    const file = await window.studio.openFileDialog();
    if (file) await openFile(file);
  } else if (cmd === 'file.save') await save(false);
  else if (cmd === 'file.saveAs') await save(true);
  else if (cmd === 'project.open') {
    const dir = await window.studio.openFolder();
    if (dir) await openRoot(dir);
  } else if (cmd === 'project.examples') {
    if (!state.info.examples) toast('RETRO-MAGIC examples were not found.');
    else await openRoot(state.info.examples);
  } else if (cmd === 'run.start') await run();
  else if (cmd === 'run.check') await check();
  else if (cmd === 'run.stop') stop();
  else if (cmd === 'view.theme') await toggleTheme();
  else if (cmd === 'view.side') {
    state.sideOpen = !state.sideOpen;
    applySide();
  } else if (cmd === 'view.bottom') {
    state.bottomOpen = !state.bottomOpen;
    $('bottom').classList.toggle('collapsed', !state.bottomOpen);
    state.editor?.layout();
  } else if (cmd === 'view.screen') showBottom('screen');
  else if (cmd === 'view.listing') showBottom('listing');
  else if (cmd === 'palette') openPalette();
  else if (cmd === 'help.keys') {
    await modal({
      title: 'Keys',
      body: 'Ctrl+N new file\nCtrl+O open folder\nCtrl+S save\nCtrl+P commands\nCtrl+B sidebar\nShift+F10 run\nCtrl+F9 check\nCtrl+F2 stop',
      ok: 'Close',
    });
  } else if (cmd === 'help.about') {
    await modal({
      title: 'RETRO Studio',
      body: 'Alpha. Mira, The White Witch.\n\nMAGIC, BASIC, and assembly for the Commodore 64, the Apple II, and the TI-99/4A.\nAn emoji compiles to a sprite. The Apple II has no sprite chip, so the same picture is lo-res.\n@3d does not fit these machines.',
      ok: 'Close',
    });
  } else if (cmd === 'app.quit') await window.studio.quit();
}

function bind() {
  document.body.addEventListener('click', (event) => {
    const cmd = event.target.closest('[data-cmd]')?.dataset.cmd;
    if (cmd) command(cmd);
    const side = event.target.closest('[data-side]')?.dataset.side;
    if (side) showSide(side);
    const bottom = event.target.closest('[data-bottom]')?.dataset.bottom;
    if (bottom) showBottom(bottom);
  });
  $('target').addEventListener('change', async () => {
    state.target = $('target').value;
    $('status-machine').textContent = MACHINE_LABEL[state.target] || state.target;
    await window.studio.settingsSet({ target: state.target });
    for (const buffer of state.buffers) {
      const lang = languageOf(buffer.path || buffer.name, state.target);
      if (lang !== 'plaintext' && lang !== buffer.lang) {
        buffer.lang = lang;
        window.monaco.editor.setModelLanguage(buffer.model, lang);
      }
    }
    const buffer = activeBuffer();
    if (buffer) $('status-lang').textContent = LANG_LABEL[buffer.lang] || buffer.lang;
  });
  $('run-mode').addEventListener('change', () => {
    state.mode = $('run-mode').value;
    window.studio.settingsSet({ mode: state.mode });
  });
  $('tree-filter').addEventListener('input', () => renderTree());
  $('listing-kind').addEventListener('change', renderListing);
  $('listing-edit').addEventListener('click', editListing);
  $('run-clear').addEventListener('click', () => { $('run-log').textContent = ''; });
  $('status-problems').addEventListener('click', () => showBottom('problems'));
  let searchTimer = 0;
  $('search-query').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 180);
  });
  $('term-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('term-input');
    const line = input.value;
    input.value = '';
    const log = $('term-log');
    log.textContent += `$ ${line}\n`;
    const result = await window.studio.termLine({ cwd: state.root, line });
    if (result?.output) log.textContent += result.output.endsWith('\n') ? result.output : `${result.output}\n`;
    log.scrollTop = log.scrollHeight;
  });
  $('palette-input').addEventListener('input', renderPalette);
  $('palette-input').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      state.paletteIndex = Math.min(state.paletteItems.length - 1, state.paletteIndex + 1);
      renderPalette();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      state.paletteIndex = Math.max(0, state.paletteIndex - 1);
      renderPalette();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = state.paletteItems[state.paletteIndex];
      $('palette').hidden = true;
      if (item) command(item[1]);
    } else if (event.key === 'Escape') {
      $('palette').hidden = true;
    }
  });
  $('split-side').addEventListener('mousedown', (event) => dragSplit(event, (point) => {
    const width = Math.min(480, Math.max(180, point.clientX - 48));
    $('app').style.setProperty('--side', `${width}px`);
  }));
  $('split-bottom').addEventListener('mousedown', (event) => dragSplit(event, (point) => {
    const height = Math.min(520, Math.max(120, window.innerHeight - point.clientY - 26));
    document.documentElement.style.setProperty('--bottom', `${height}px`);
  }));
  new ResizeObserver(() => {
    if (state.bottom === 'screen') paintScreen($('screen-canvas'), state.screen);
  }).observe($('screen-stage'));
  window.studio.on('menu:command', (cmd) => command(cmd));
  window.studio.on('app:requestClose', () => requestClose());
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      $('palette').hidden = true;
      closeMenu();
    }
    if (event.altKey && event.key === '1') { event.preventDefault(); showSide('explorer'); }
    if (event.altKey && event.key === '3') { event.preventDefault(); showSide('search'); }
    if (event.altKey && event.key === '7') { event.preventDefault(); showSide('outline'); }
  });
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    for (const file of event.dataTransfer.files) {
      const dropped = window.studio.pathForFile(file);
      if (dropped) openFile(dropped);
    }
  });
}

function dragSplit(event, apply) {
  event.preventDefault();
  const move = (point) => apply(point);
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    state.editor?.layout();
    if (state.bottom === 'screen') paintScreen($('screen-canvas'), state.screen);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

async function runSearch() {
  const host = $('search-results');
  host.replaceChildren();
  const query = $('search-query').value.trim();
  if (!state.root || !query) return;
  const hits = await window.studio.search({ root: state.root, query });
  if (!hits.length) {
    const empty = document.createElement('p');
    empty.className = 'side-empty';
    empty.textContent = 'No matches.';
    host.appendChild(empty);
    return;
  }
  for (const hit of hits) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'search-row';
    const file = document.createElement('span');
    file.className = 'search-file';
    file.textContent = `${hit.file.split(/[\\/]/).pop()}:${hit.line}`;
    const text = document.createElement('span');
    text.className = 'search-text';
    text.textContent = hit.text;
    row.append(file, text);
    row.onclick = async () => {
      await openFile(hit.file);
      goLine(hit.line, 1);
    };
    host.appendChild(row);
  }
}

function modal({ title, body, ok = 'OK', cancel }) {
  return new Promise((resolve) => {
    const host = $('modal');
    host.hidden = false;
    host.replaceChildren();
    const card = document.createElement('div');
    card.className = 'modal-card';
    const heading = document.createElement('h2');
    heading.textContent = title;
    const copy = document.createElement('p');
    copy.textContent = body || '';
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const finish = (value) => {
      host.hidden = true;
      resolve(value);
    };
    if (cancel) {
      const no = document.createElement('button');
      no.type = 'button';
      no.textContent = cancel;
      no.onclick = () => finish(false);
      actions.appendChild(no);
    }
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'primary';
    yes.textContent = ok;
    yes.onclick = () => finish(true);
    actions.appendChild(yes);
    card.append(heading, copy, actions);
    host.appendChild(card);
  });
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

async function requestClose() {
  const dirty = state.buffers.filter((item) => item.dirty);
  if (dirty.length) {
    const allow = await modal({
      title: 'Unsaved files',
      body: `${dirty.map((item) => item.name).join(', ')} changed. Close anyway?`,
      ok: 'Close',
      cancel: 'Stay',
    });
    if (!allow) {
      await window.studio.closeResult(false);
      return;
    }
  }
  await window.studio.closeResult(true);
}

async function smokeProbe() {
  try {
    openBuffer({ name: 'smoke.magic', value: 'print "studio"\n', lang: 'magic' });
    const buffer = activeBuffer();
    buffer.dirty = false;
    renderTabs();
    const result = await window.studio.run({
      source: 'print "studio"\n',
      filename: 'smoke.magic',
      target: 'c64',
      lang: 'magic',
      mode: 'host',
    });
    if (!result.ok || !String(result.output).includes('studio')) {
      throw new Error(result.problems?.[0]?.message || `smoke run failed: ${result.output}`);
    }
    if (!$('app').classList.contains('no-grok')) throw new Error('missing no-grok');
    if (document.getElementById('grok')) throw new Error('grok panel is present');
    const sceneFile = `${state.info.examples}/scene.magic`;
    const sceneText = await window.studio.readFile(sceneFile);
    if (!sceneText.ok) throw new Error(sceneText.message || 'missing scene');
    const apple = await window.studio.run({
      source: sceneText.content,
      filename: sceneFile,
      target: 'apple2',
      lang: 'magic',
      mode: 'host',
    });
    if (!apple.ok || !apple.screen?.caption?.includes('no sprite chip')) {
      throw new Error(apple.problems?.[0]?.message || 'apple screen missing');
    }
    if (!apple.screen.sprites.some((sprite) => sprite.emoji === '✦' && sprite.bits?.length === 8)) {
      throw new Error('apple emoji bits missing');
    }
    const c64 = await window.studio.run({
      source: sceneText.content,
      filename: sceneFile,
      target: 'c64',
      lang: 'magic',
      mode: 'host',
    });
    if (!c64.screen?.sprites?.some((sprite) => sprite.emoji === '✦' && sprite.hardware)) {
      throw new Error('c64 sprite missing');
    }
    state.screen = c64.screen;
    showBottom('screen');
    paintScreen($('screen-canvas'), c64.screen);
    if ($('screen-canvas').width < 10) throw new Error('canvas did not paint');
    $('screen-caption').textContent = c64.screen.caption;
    window.studio.smokeReady();
  } catch (error) {
    window.studio.smokeFail(error?.stack || error);
  }
}
