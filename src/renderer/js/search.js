import { state, relativePath } from './state.js';
import { openPath } from './editor.js';
import { toast } from './ui.js';

let timer = 0;

export function initSearch() {
  const query = document.getElementById('search-query');
  const include = document.getElementById('search-include');
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(() => findInFiles(), 180);
  };
  query.addEventListener('input', run);
  include.addEventListener('input', run);
  document.getElementById('search-case').addEventListener('change', () => findInFiles());
  document.getElementById('search-regex').addEventListener('change', () => findInFiles());
  query.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      findInFiles();
    }
  });
}

export function focusSearch(query) {
  state.sidebar = 'search';
  state.sideOpen = true;
  document.getElementById('search-query').focus();
  if (typeof query === 'string' && query) {
    document.getElementById('search-query').value = query;
    findInFiles();
  }
}

export async function findInFiles() {
  const host = document.getElementById('search-results');
  if (!state.project) {
    host.innerHTML = '<p class="side-empty">Open a folder first.</p>';
    return;
  }
  const query = document.getElementById('search-query').value;
  if (!query.trim()) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = '<p class="side-empty">Searching…</p>';
  try {
    const result = await window.studio.search({
      root: state.project,
      query,
      caseSensitive: document.getElementById('search-case').checked,
      regex: document.getElementById('search-regex').checked,
      include: document.getElementById('search-include').value,
    });
    host.innerHTML = '';
    if (result.error && !result.matches?.length) {
      host.innerHTML = `<p class="side-empty">${escapeText(result.error)}</p>`;
      return;
    }
    if (!result.matches?.length) {
      host.innerHTML = '<p class="side-empty">No matches.</p>';
      return;
    }
    const note = document.createElement('p');
    note.className = 'side-count';
    note.textContent = result.truncated ? `${result.matches.length}+ matches` : `${result.matches.length} matches`;
    host.appendChild(note);
    for (const match of result.matches) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'search-row';
      row.innerHTML = `<span class="search-file">${escapeText(relativePath(match.file))}:${match.line}</span><span class="search-text">${escapeText(match.text.trim())}</span>`;
      row.addEventListener('click', () => openPath(match.file, { line: match.line, column: 1 }));
      host.appendChild(row);
    }
  } catch (error) {
    toast(error.message || 'Search failed');
  }
}

function escapeText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
