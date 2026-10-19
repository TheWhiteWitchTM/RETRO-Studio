import { state, baseName, dirName, joinPath, relativePath, run } from './state.js';
import { forgetPaths, retargetTab } from './editor.js';
import { contextMenu, toast, ask } from './ui.js';

let rootEntries = [];

export function initTree() {
  const filter = document.getElementById('tree-filter');
  filter.addEventListener('input', () => {
    state.treeQuery = filter.value.trim();
    renderTree();
  });
  document.getElementById('tree').addEventListener('click', onClick);
  document.getElementById('tree').addEventListener('contextmenu', onContext);
  document.getElementById('tree').addEventListener('keydown', onKey);
  document.getElementById('hidden-toggle').addEventListener('change', () => {
    state.settings.showHidden = document.getElementById('hidden-toggle').checked;
    window.studio.settingsSet({ showHidden: state.settings.showHidden });
    renderTree();
  });
}

export async function setRoot(dir) {
  state.project = dir;
  state.expanded = new Set([dir]);
  state.treeQuery = '';
  const filter = document.getElementById('tree-filter');
  if (filter) filter.value = '';
  document.getElementById('hidden-toggle').checked = Boolean(state.settings.showHidden);
  await load(dir);
  renderTree();
}

export async function refreshTree(hint) {
  if (!state.project) return;
  if (hint && hint !== state.project && !hint.startsWith(`${state.project}/`)) return;
  const dir = hint ? (hint.endsWith('/') ? hint : dirName(hint)) : state.project;
  if (state.expanded.has(dir) || dir === state.project) await load(dir);
  if (state.treeQuery) state.fileIndex = null;
  renderTree();
}

async function load(dir) {
  try {
    const rows = await window.studio.listDir(dir);
    state.expanded.add(dir);
    cache(dir, rows);
  } catch (error) {
    toast(error.message || 'Could not read the folder');
  }
}

function cache(dir, rows) {
  if (!state.dirCache) state.dirCache = new Map();
  state.dirCache.set(dir, rows);
  if (dir === state.project) rootEntries = rows;
}

function rowsOf(dir) {
  return state.dirCache?.get(dir) || [];
}

export function renderTree() {
  const host = document.getElementById('tree');
  host.innerHTML = '';
  if (!state.project) {
    host.innerHTML = '<p class="side-empty">Open a folder to begin.</p>';
    return;
  }
  if (state.treeQuery) {
    renderFlat(host, state.treeQuery.toLowerCase());
    return;
  }
  const fragment = document.createDocumentFragment();
  drawDir(fragment, state.project, 0);
  host.appendChild(fragment);
}

function drawDir(fragment, dir, depth) {
  for (const row of rowsOf(dir)) {
    if (row.hidden && !state.settings.showHidden) continue;
    fragment.appendChild(rowEl(row, depth));
    if (row.kind === 'dir' && state.expanded.has(row.path)) drawDir(fragment, row.path, depth + 1);
  }
}

function renderFlat(host, query) {
  const matches = [];
  const walk = (dir) => {
    for (const row of rowsOf(dir)) {
      if (row.hidden && !state.settings.showHidden) continue;
      if (row.name.toLowerCase().includes(query)) matches.push(row);
      if (row.kind === 'dir' && state.expanded.has(row.path)) walk(row.path);
    }
  };
  walk(state.project);
  if (!matches.length) {
    host.innerHTML = '<p class="side-empty">No matching names in the open folders.</p>';
    return;
  }
  for (const row of matches.slice(0, 200)) host.appendChild(rowEl(row, 0, true));
}

function rowEl(row, depth, flat = false) {
  const el = document.createElement('div');
  const active = state.active?.path === row.path;
  el.className = `tree-row${active ? ' active' : ''}`;
  el.style.paddingLeft = `${8 + depth * 14}px`;
  el.dataset.path = row.path;
  el.dataset.kind = row.kind;
  el.tabIndex = -1;
  const twist = document.createElement('span');
  twist.className = 'twist';
  twist.textContent = row.kind === 'dir' ? (state.expanded.has(row.path) ? '▾' : '▸') : '';
  const name = document.createElement('span');
  name.className = `tree-name ${row.kind}`;
  name.textContent = flat ? relativePath(row.path) : row.name;
  el.append(twist, name);
  return el;
}

async function onClick(event) {
  const row = event.target.closest('.tree-row');
  if (!row) return;
  const { path, kind } = row.dataset;
  if (kind === 'dir') {
    if (state.expanded.has(path)) state.expanded.delete(path);
    else await load(path);
    renderTree();
    return;
  }
  run('file.openPath', path);
}

function onContext(event) {
  const row = event.target.closest('.tree-row');
  event.preventDefault();
  const path = row?.dataset.path || state.project;
  const kind = row?.dataset.kind || 'dir';
  const parent = kind === 'dir' ? path : dirName(path);
  const items = [
    { label: 'New MAGIC file', run: () => createEntry(parent, 'file', 'untitled.magic') },
    { label: 'New BASIC file', run: () => createEntry(parent, 'file', 'untitled.bas') },
    { label: 'New 6502 file', run: () => createEntry(parent, 'file', 'untitled.asm') },
    { label: 'New TMS9900 file', run: () => createEntry(parent, 'file', 'untitled.a99') },
    { label: 'New folder', run: () => createEntry(parent, 'dir') },
  ];
  if (row && path !== state.project) {
    items.push({ separator: true });
    items.push({ label: 'Rename', run: () => renameEntry(path) });
    items.push({ label: 'Delete', run: () => deleteEntry(path, kind) });
    items.push({ separator: true });
    items.push({ label: 'Copy path', run: () => copy(path) });
    items.push({ label: 'Copy relative path', run: () => copy(relativePath(path)) });
    items.push({ label: 'Reveal in file manager', run: () => window.studio.reveal(path) });
  }
  contextMenu(event.clientX, event.clientY, items);
}

async function onKey(event) {
  const row = document.activeElement?.closest?.('.tree-row') || document.querySelector('.tree-row.active');
  if (!row) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    row.click();
  } else if (event.key === 'F2') {
    event.preventDefault();
    renameEntry(row.dataset.path);
  } else if (event.key === 'Delete') {
    event.preventDefault();
    deleteEntry(row.dataset.path, row.dataset.kind);
  }
}

async function createEntry(parent, kind, suggested) {
  const answer = await ask({
    title: kind === 'dir' ? 'New folder' : 'New file',
    input: true,
    value: kind === 'dir' ? 'folder' : (suggested || 'untitled.magic'),
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'ok', label: 'Create', primary: true },
    ],
  });
  if (!answer || !answer.value.trim()) return;
  try {
    const created = await window.studio.createEntry(parent, answer.value.trim(), kind);
    state.expanded.add(parent);
    await load(parent);
    renderTree();
    if (kind === 'file') run('file.openPath', created);
  } catch (error) {
    toast(error.message || 'Could not create that');
  }
}

async function renameEntry(file) {
  const answer = await ask({
    title: 'Rename',
    input: true,
    value: baseName(file),
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'ok', label: 'Rename', primary: true },
    ],
  });
  if (!answer || !answer.value.trim() || answer.value.trim() === baseName(file)) return;
  const next = joinPath(dirName(file), answer.value.trim());
  try {
    await window.studio.renamePath(file, next);
    retargetTab(file, next);
    await load(dirName(next));
    renderTree();
    state.hooks.onTabs?.();
  } catch (error) {
    toast(error.message || 'Rename failed');
  }
}

async function deleteEntry(file, kind) {
  if (!file || file === state.project) return;
  const answer = await ask({
    title: kind === 'dir' ? 'Delete folder?' : 'Delete file?',
    message: baseName(file),
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'ok', label: 'Delete', danger: true },
    ],
  });
  if (!answer) return;
  try {
    await window.studio.removePath(file);
    await forgetPaths((item) => item === file || (kind === 'dir' && item.startsWith(`${file}/`)));
    await load(dirName(file));
    renderTree();
    state.hooks.onTabs?.();
  } catch (error) {
    toast(error.message || 'Delete failed');
  }
}

function copy(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copied')).catch(() => toast(text));
}

export function revealInTree(file) {
  if (!file || !state.project) return;
  let dir = dirName(file);
  const chain = [];
  while (dir && dir.startsWith(state.project)) {
    chain.push(dir);
    if (dir === state.project) break;
    dir = dirName(dir);
  }
  return (async () => {
    for (const folder of chain.reverse()) {
      if (!state.dirCache?.has(folder)) await load(folder);
      state.expanded.add(folder);
    }
    renderTree();
    const row = document.querySelector(`.tree-row[data-path="${cssEscape(file)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  })();
}

function cssEscape(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
