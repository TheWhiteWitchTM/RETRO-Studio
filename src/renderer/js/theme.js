import { state } from './state.js';
import { toast } from './ui.js';

const DARK_COLORS = {
  'editor.background': '#000000',
  'editor.foreground': '#ffffff',
  'editor.lineHighlightBackground': '#141414',
  'editor.selectionBackground': '#1a3a6e',
  'editor.inactiveSelectionBackground': '#14283f',
  'editorCursor.foreground': '#ffffff',
  'editorLineNumber.foreground': '#5c5c5c',
  'editorLineNumber.activeForeground': '#ffffff',
  'editorIndentGuide.background1': '#2a2a2a',
  'editorIndentGuide.activeBackground1': '#5c5c5c',
  'editorWidget.background': '#000000',
  'editorWidget.foreground': '#ffffff',
  'editorWidget.border': '#2a2a2a',
  'editorSuggestWidget.background': '#000000',
  'editorSuggestWidget.foreground': '#ffffff',
  'editorSuggestWidget.border': '#2a2a2a',
  'editorSuggestWidget.selectedBackground': '#1a3a6e',
  'editorHoverWidget.background': '#000000',
  'editorHoverWidget.foreground': '#ffffff',
  'editorHoverWidget.border': '#2a2a2a',
  'editorGhostText.foreground': '#6a6a6a',
  'minimap.background': '#000000',
  'editorGutter.background': '#000000',
  'scrollbarSlider.background': '#2a2a2a88',
  'scrollbarSlider.hoverBackground': '#3a3a3a88',
  'editorStickyScroll.background': '#000000',
  'input.background': '#000000',
  'input.foreground': '#ffffff',
  'input.border': '#2a2a2a',
  'dropdown.background': '#000000',
  'dropdown.foreground': '#ffffff',
  'list.background': '#000000',
  'list.foreground': '#ffffff',
  'list.hoverBackground': '#161616',
  'list.highlightForeground': '#e7c98a',
  'menu.background': '#000000',
  'menu.foreground': '#ffffff',
  'menu.selectionBackground': '#1a3a6e',
  'menu.selectionForeground': '#ffffff',
  'quickInput.background': '#000000',
  'quickInput.foreground': '#ffffff',
  'peekView.background': '#000000',
  'peekViewEditor.background': '#000000',
  'peekViewResult.background': '#0a0a0a',
  'focusBorder': '#3574f0',
};

const DARK_RULES = [
  { token: 'keyword', foreground: 'CF8E6D' },
  { token: 'constant', foreground: 'CF8E6D' },
  { token: 'string', foreground: '6AAB73' },
  { token: 'comment', foreground: '7A7E85', fontStyle: 'italic' },
  { token: 'number', foreground: '2AACB8' },
  { token: 'annotation', foreground: 'E7C98A' },
  { token: 'function', foreground: 'FFC66D' },
  { token: 'type', foreground: 'B5B6E3' },
  { token: 'predefined', foreground: 'FFC66D' },
  { token: 'operator', foreground: 'FFFFFF' },
  { token: 'identifier', foreground: 'FFFFFF' },
  { token: 'delimiter.interpolation', foreground: 'E7C98A' },
];

const LIGHT_RULES = [
  { token: 'keyword', foreground: '9A3D12' },
  { token: 'constant', foreground: '9A3D12' },
  { token: 'string', foreground: '1D7A32' },
  { token: 'comment', foreground: '6A6A6A', fontStyle: 'italic' },
  { token: 'number', foreground: '0B6E75' },
  { token: 'annotation', foreground: '8A5A00' },
  { token: 'function', foreground: '8A4B08' },
  { token: 'type', foreground: '3C3489' },
  { token: 'predefined', foreground: '8A4B08' },
  { token: 'operator', foreground: '1C1C1C' },
  { token: 'identifier', foreground: '1C1C1C' },
  { token: 'delimiter.interpolation', foreground: '8A5A00' },
];

let defined = false;

export function themeName(value = state.settings?.theme) {
  return value === 'light' ? 'light' : 'black';
}

export function editorThemeId(value) {
  return themeName(value) === 'light' ? 'magic-light' : 'magic-black';
}

export function defineStudioThemes() {
  if (defined || !globalThis.monaco) return;
  defined = true;
  monaco.editor.defineTheme('magic-black', {
    base: 'vs-dark',
    inherit: true,
    rules: DARK_RULES,
    colors: DARK_COLORS,
  });
  monaco.editor.defineTheme('magic-light', {
    base: 'vs',
    inherit: true,
    rules: LIGHT_RULES,
    colors: {
      'editor.background': '#f7f7f7',
      'editor.foreground': '#1c1c1c',
      'editor.lineHighlightBackground': '#ececec',
      'editor.selectionBackground': '#c6ddff',
      'editorCursor.foreground': '#1c1c1c',
      'editorLineNumber.foreground': '#8a8a8a',
      'editorLineNumber.activeForeground': '#1c1c1c',
      'editorWidget.background': '#ffffff',
      'editorWidget.foreground': '#1c1c1c',
      'editorWidget.border': '#d0d0d0',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.foreground': '#1c1c1c',
      'editorSuggestWidget.selectedBackground': '#d6e6ff',
      'editorHoverWidget.background': '#ffffff',
      'editorGhostText.foreground': '#8a8a8a',
      'minimap.background': '#f7f7f7',
      'editorGutter.background': '#f7f7f7',
      'dropdown.background': '#ffffff',
      'dropdown.foreground': '#1c1c1c',
      'menu.background': '#ffffff',
      'menu.foreground': '#1c1c1c',
      'input.background': '#ffffff',
      'input.foreground': '#1c1c1c',
      'focusBorder': '#1864d2',
    },
  });
}

export function applyTheme(value) {
  const name = themeName(value);
  document.documentElement.dataset.theme = name;
  if (state.settings) state.settings.theme = name;
  if (globalThis.monaco) monaco.editor.setTheme(editorThemeId(name));
  state.hooks.onTheme?.(name);
  const button = document.getElementById('status-theme');
  if (button) button.textContent = name === 'light' ? 'Light' : 'Black';
  return name;
}

export async function toggleTheme() {
  const next = themeName() === 'light' ? 'black' : 'light';
  applyTheme(next);
  try {
    await window.studio.setChromeTheme(next);
  } catch {
    window.studio.settingsSet({ theme: next });
  }
  toast(next === 'black' ? 'Black theme' : 'Light theme');
}
