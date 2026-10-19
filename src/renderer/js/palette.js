import { state, listCommands, run, relativePath, baseName } from './state.js';
import { fuzzyScore } from '../../shared/text.js';

let mode = 'commands';
let items = [];
let selected = 0;

export function initPalette() {
  const input = document.getElementById('palette-input');
  input.addEventListener('input', () => render());
  input.addEventListener('keydown', onKey);
  document.getElementById('palette').addEventListener('mousedown', (event) => {
    if (event.target.id === 'palette') closePalette();
  });
}

export function openPalette() {
  mode = 'commands';
  items = listCommands();
  open('Type a command');
}

export async function openQuick() {
  mode = 'files';
  if (!state.project) {
    openPalette();
    return;
  }
  if (!state.fileIndex) {
    const result = await window.studio.quickList(state.project);
    state.fileIndex = result.files || [];
  }
  items = state.fileIndex.map((file) => ({
    id: file,
    title: baseName(file),
    detail: relativePath(file),
    file,
  }));
  open('Open file');
}

export function openRecent() {
  mode = 'recent';
  const paths = [];
  for (const tab of state.tabs) if (tab.path) paths.push(tab.path);
  for (const file of state.recentJump) if (!paths.includes(file)) paths.push(file);
  items = paths.map((file) => ({ id: file, title: baseName(file), detail: relativePath(file), file }));
  open('Recent files');
}

export function openChoices(title, choices, onPick) {
  mode = 'choices';
  items = choices.map((choice, index) => ({ ...choice, id: String(index), onPick }));
  open(title);
}

export function openHelp() {
  mode = 'help';
  items = listCommands().filter((command) => command.shortcut);
  open('Keyboard shortcuts');
}

export function closePalette() {
  const host = document.getElementById('palette');
  host.hidden = true;
  document.getElementById('palette-input').value = '';
}

function open(placeholder) {
  const host = document.getElementById('palette');
  host.hidden = false;
  const input = document.getElementById('palette-input');
  input.placeholder = placeholder;
  input.value = '';
  selected = 0;
  render();
  input.focus();
}

function render() {
  const query = document.getElementById('palette-input').value.trim();
  const list = document.getElementById('palette-list');
  let rows = items;
  if (mode === 'files' || mode === 'recent' || mode === 'commands' || mode === 'help' || mode === 'choices') {
    rows = items
      .map((item) => ({ item, score: fuzzyScore(query, `${item.title} ${item.detail || ''} ${item.group || ''}`) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((row) => row.item);
  }
  if (selected >= rows.length) selected = 0;
  list.innerHTML = '';
  rows.slice(0, 80).forEach((item, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `palette-row${index === selected ? ' active' : ''}`;
    row.innerHTML = `<span>${escapeText(item.title)}</span><span class="palette-meta">${escapeText(item.shortcut || item.detail || item.group || '')}</span>`;
    row.addEventListener('mousemove', () => {
      selected = index;
      renderActive(list);
    });
    row.addEventListener('click', () => choose(item));
    list.appendChild(row);
  });
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'side-empty';
    empty.textContent = 'Nothing matches.';
    list.appendChild(empty);
  }
  list.dataset.count = String(Math.min(rows.length, 80));
}

function renderActive(list) {
  const rows = [...list.querySelectorAll('.palette-row')];
  rows.forEach((row, index) => row.classList.toggle('active', index === selected));
  rows[selected]?.scrollIntoView({ block: 'nearest' });
}

function onKey(event) {
  const list = document.getElementById('palette-list');
  const count = Number(list.dataset.count || 0);
  if (event.key === 'Escape') {
    event.preventDefault();
    closePalette();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selected = Math.min(count - 1, selected + 1);
    renderActive(list);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    selected = Math.max(0, selected - 1);
    renderActive(list);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const row = itemsForQuery()[selected];
    if (row) choose(row);
  }
}

function itemsForQuery() {
  const query = document.getElementById('palette-input').value.trim();
  return items
    .map((item) => ({ item, score: fuzzyScore(query, `${item.title} ${item.detail || ''} ${item.group || ''}`) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.item)
    .slice(0, 80);
}

function choose(item) {
  closePalette();
  if (mode === 'choices') {
    if (item.onPick) item.onPick(item);
    else if (item.file) run('file.openPath', item.file);
    return;
  }
  if (mode === 'commands' || mode === 'help') run(item.id);
  else if (item.file) run('file.openPath', item.file);
}

function escapeText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
