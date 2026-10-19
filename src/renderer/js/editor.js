import { state, baseName, dirName, languageOf, relativePath } from './state.js';
import { defineStudioThemes, editorThemeId } from './theme.js';
import { ask, toast } from './ui.js';

const KEYWORDS = [
  'import', 'from', 'class', 'fn', 'end', 'if', 'then', 'else', 'elseif', 'for', 'while',
  'repeat', 'until', 'return', 'break', 'continue', 'let', 'print', 'and', 'or', 'not',
  'true', 'false', 'nil', 'new', 'self', 'super', 'try', 'catch', 'finally', 'throw',
  'await', 'use', 'do', 'to', 'step', 'in', 'as', 'is', 'mod', 'async', 'public', 'private', 'protected',
];
const CONSTANTS = ['true', 'false', 'nil'];
const BUILTINS = ['len', 'str', 'num', 'int', 'type', 'keys', 'values', 'push', 'pop', 'time', 'error', 'sleep', 'load'];
const MODULES = [
  ['canvas', 'Canvas, Engine, and Utilities'],
  ['terminal', 'Terminal and Utilities'],
  ['2d', 'The 2D canvas and terminal together'],
  ['3d', 'Dropped. These machines have no 3D'],
  ['c64', 'Keep this statement on the Commodore 64'],
  ['apple2', 'Keep this statement on the Apple II'],
  ['ti99', 'Keep this statement on the TI-99/4A'],
  ['target', 'Name the machine for this file'],
  ['ui', 'Windows, buttons, and menus'],
  ['sound', 'Tones and notes'],
  ['hex', 'Hex grids'],
  ['games', 'Loops, keys, scenes, and scores'],
  ['strict', 'Check the types and the visibility you wrote'],
  ['normal', 'Turn the strict check off for this file'],
];
const DOCS = {
  fn: 'A function. `end` closes it.',
  class: 'A class. Call it, or use `new`, to build an instance.',
  end: 'Closes `fn`, `class`, `if`, `while`, `for`, `repeat`, and `try`.',
  let: 'Declares a local. The name ends with the block.',
  print: 'Prints values.',
  self: 'The current instance.',
  nil: 'The empty value. It is false.',
  import: 'Loads a module and names what you take.',
  use: 'Loads a module. `use "./words"` brings in a file you wrote.',
  for: '`for i = 1 to 3` or `for item in bag`.',
  if: 'A choice. `then` is optional. `end` closes it.',
};

let untitledCount = 1;
let checkTimer = 0;
let registered = false;

export function initEditor(hooks) {
  Object.assign(state.hooks, hooks);
  registerMagic();
  state.editor = monaco.editor.create($editor(), {
    theme: editorThemeId(),
    fontFamily: '"JetBrains Mono", "Fira Mono", "DejaVu Sans Mono", monospace',
    fontSize: state.settings.fontSize || 14,
    tabSize: state.settings.tabSize || 2,
    insertSpaces: true,
    wordWrap: state.settings.wordWrap || 'off',
    minimap: { enabled: state.settings.minimap !== false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    fontLigatures: true,
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    stickyScroll: { enabled: true },
    renderWhitespace: 'selection',
    padding: { top: 8, bottom: 12 },
    mouseWheelZoom: true,
    linkedEditing: true,
    quickSuggestions: { other: true, comments: false, strings: true },
    quickSuggestionsDelay: 60,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    inlineSuggest: { enabled: state.settings.inlineComplete !== false, mode: 'subword' },
    suggest: { preview: true, showKeywords: true, showWords: true, showSnippets: true },
    detectIndentation: true,
    trimAutoWhitespace: true,
    dragAndDrop: true,
    multiCursorModifier: 'alt',
    occurrencesHighlight: 'singleFile',
    selectionHighlight: true,
    renderLineHighlight: 'line',
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    overviewRulerLanes: 2,
    folding: true,
    showFoldingControls: 'mouseover',
    matchBrackets: 'always',
  });

  state.editor.onDidChangeCursorPosition(() => {
    const pos = state.editor.getPosition();
    hooks.onCursor?.(pos);
    hooks.onOutline?.();
  });
  state.editor.onDidChangeConfiguration((event) => {
    if (event.hasChanged(monaco.editor.EditorOption.fontSize)) {
      const fontSize = state.editor.getOption(monaco.editor.EditorOption.fontSize);
      state.settings.fontSize = fontSize;
      window.studio.settingsSet({ fontSize });
    }
  });
  state.editor.onMouseDown((event) => {
    const mouse = event.event;
    if (!(mouse.ctrlKey || mouse.metaKey)) return;
    if (event.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT) return;
    mouse.preventDefault();
    goToDefinition();
  });

  document.getElementById('tabs').addEventListener('click', (event) => {
    const close = event.target.closest('[data-close]');
    const tabEl = event.target.closest('[data-tab]');
    if (!tabEl) return;
    const tab = state.tabs.find((item) => item.id === tabEl.dataset.tab);
    if (!tab) return;
    if (close) closeTab(tab);
    else activate(tab);
  });
  document.getElementById('tabs').addEventListener('auxclick', (event) => {
    if (event.button !== 1) return;
    const tabEl = event.target.closest('[data-tab]');
    const tab = tabEl && state.tabs.find((item) => item.id === tabEl.dataset.tab);
    if (tab) closeTab(tab);
  });
  bindTabDrag();
  renderTabs();
}

function $editor() {
  return document.getElementById('editor');
}

function registerMagic() {
  if (registered) return;
  registered = true;
  defineStudioThemes();
  monaco.editor.setTheme(editorThemeId());
  registerMachineLanguages();

  monaco.languages.register({ id: 'magic', extensions: ['.magic'], aliases: ['MAGIC', 'magic'] });
  monaco.languages.setLanguageConfiguration('magic', {
    comments: { lineComment: '--' },
    brackets: [['(', ')'], ['[', ']'], ['{', '}']],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string'] },
    ],
    surroundingPairs: [['(', ')'], ['[', ']'], ['{', '}'], ['"', '"'], ["'", "'"]],
    indentationRules: {
      increaseIndentPattern: /^\s*(fn|class|if|elseif|else|while|for|repeat|try|catch|finally)\b.*$/i,
      decreaseIndentPattern: /^\s*(end|else|elseif|catch|finally|until)\b/i,
    },
    onEnterRules: [
      {
        beforeText: /^\s*(fn|class|if|elseif|else|while|for|repeat|try|catch|finally)\b.*$/i,
        action: { indentAction: monaco.languages.IndentAction.Indent },
      },
    ],
    wordPattern: /(-?\d*\.\d\w*)|([^\s`~!@#$%^&*()-=+[{\]}\\|;:'",.<>/?]+)/g,
  });
  monaco.languages.setMonarchTokensProvider('magic', {
    ignoreCase: true,
    keywords: KEYWORDS,
    constants: CONSTANTS,
    builtins: BUILTINS,
    tokenizer: {
      root: [
        [/--.*$/, 'comment'],
        [/^[ \t]*rem\b.*$/, 'comment'],
        [/@[A-Za-z_][A-Za-z0-9_]*|@[23][Dd]/, 'annotation'],
        [/\$"""/, { token: 'string', next: '@tpl3' }],
        [/\$"/, { token: 'string', next: '@tpld' }],
        [/\$'/, { token: 'string', next: '@tpls' }],
        [/"""/, { token: 'string', next: '@str3' }],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
        [/\b(async)(\s+)(fn)(\s+)([A-Za-z_][\w]*)/, ['keyword', 'white', 'keyword', 'white', 'function']],
        [/\b(fn)(\s+)([A-Za-z_][\w]*)/, ['keyword', 'white', 'function']],
        [/\b(class)(\s+)([A-Za-z_][\w]*)/, ['keyword', 'white', 'type']],
        [/[A-Za-z_][\w]*/, {
          cases: {
            '@constants': 'constant',
            '@keywords': 'keyword',
            '@builtins': 'predefined',
            '@default': 'identifier',
          },
        }],
        [/==|!=|<>|<=|>=|\+=|-=|\*=|\/=|\.\.|[+\-*/%^=<>#&]/, 'operator'],
      ],
      str3: [
        [/"""/, 'string', '@pop'],
        [/\\./, 'string.escape'],
        [/./, 'string'],
      ],
      tpl3: [
        [/"""/, 'string', '@pop'],
        [/\\./, 'string.escape'],
        [/\{\{|\}\}/, 'string.escape'],
        [/\{/, { token: 'delimiter.interpolation', next: '@hole' }],
        [/./, 'string'],
      ],
      tpld: [
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
        [/\{\{|\}\}/, 'string.escape'],
        [/\{/, { token: 'delimiter.interpolation', next: '@hole' }],
        [/./, 'string'],
      ],
      tpls: [
        [/\\./, 'string.escape'],
        [/'/, 'string', '@pop'],
        [/\{\{|\}\}/, 'string.escape'],
        [/\{/, { token: 'delimiter.interpolation', next: '@hole' }],
        [/./, 'string'],
      ],
      hole: [
        [/\}/, 'delimiter.interpolation', '@pop'],
        { include: 'root' },
      ],
    },
  });
  monaco.languages.registerFoldingRangeProvider('magic', {
    provideFoldingRanges(model) {
      const ranges = [];
      const stack = [];
      const start = /^\s*(fn|class|if|while|for|repeat|try)\b/i;
      const end = /^\s*end\b/i;
      for (let line = 1; line <= model.getLineCount(); line += 1) {
        const text = model.getLineContent(line);
        if (start.test(text)) stack.push(line);
        else if (end.test(text) && stack.length) {
          const from = stack.pop();
          if (line > from) ranges.push({ start: from, end: line, kind: monaco.languages.FoldingRangeKind.Region });
        }
      }
      return ranges;
    },
  });
  monaco.languages.registerCompletionItemProvider('magic', {
    triggerCharacters: ['@', '.'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const suggestions = [];
      const snippet = (label, insertText, detail) => suggestions.push({
        label,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail,
        range,
      });
      if (/@[A-Za-z0-9_]*$/.test(before)) {
        const at = before.lastIndexOf('@');
        const atRange = { ...range, startColumn: at + 1 };
        for (const [name, detail] of MODULES) {
          suggestions.push({
            label: `@${name}`,
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: `@${name}`,
            detail,
            range: atRange,
          });
        }
        return { suggestions };
      }
      for (const keyword of KEYWORDS) {
        suggestions.push({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          sortText: `0${keyword}`,
          range,
        });
      }
      for (const name of BUILTINS) {
        suggestions.push({
          label: name,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${name}($0)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Built-in',
          sortText: `1${name}`,
          range,
        });
      }
      snippet('fn … end', 'fn ${1:name}(${2:})\n\t$0\nend', 'Function');
      snippet('class … end', 'class ${1:Name}\n\t$0\nend', 'Class');
      snippet('if … end', 'if ${1:cond} then\n\t$0\nend', 'If');
      snippet('for … end', 'for ${1:i} = ${2:1} to ${3:10}\n\t$0\nend', 'Counted loop');
      snippet('while … end', 'while ${1:cond}\n\t$0\nend', 'While');
      snippet('try … end', 'try\n\t$0\ncatch err\n\t\nend', 'Try');
      for (const item of wordSuggestions(model, position, new Set(KEYWORDS.map((word) => word.toLowerCase())))) {
        suggestions.push(item);
      }
      return { suggestions };
    },
  });
  for (const language of ['javascript', 'typescript', 'python', 'html', 'css', 'json', 'markdown', 'yaml', 'shell', 'plaintext']) {
    monaco.languages.registerCompletionItemProvider(language, {
      provideCompletionItems(model, position) {
        return { suggestions: wordSuggestions(model, position) };
      },
    });
  }
  const inlineLanguages = ['magic', 'javascript', 'typescript', 'python', 'html', 'css', 'json', 'markdown', 'yaml', 'shell', 'plaintext'];
  for (const language of inlineLanguages) {
    monaco.languages.registerInlineCompletionsProvider(language, {
      provideInlineCompletions(model, position, context, token) {
        return inlineCompletion(model, position, context, token);
      },
      freeInlineCompletions() {},
    });
  }
  monaco.languages.registerHoverProvider('magic', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const key = word.word.toLowerCase();
      const text = DOCS[key] || MODULES.find((item) => item[0] === key)?.[1];
      if (!text) return null;
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [{ value: `**${word.word}**\n\n${text}` }],
      };
    },
  });
  monaco.languages.registerDefinitionProvider('magic', {
    provideDefinition: (model, position) => definitionAt(model, position),
  });
  monaco.languages.registerRenameProvider('magic', {
    provideRenameEdits(model, position, newName) {
      const word = model.getWordAtPosition(position);
      if (!word) return { edits: [] };
      if (!/^[_A-Za-z][_A-Za-z0-9]*$/.test(newName)) {
        return { rejectReason: 'A name starts with a letter or _, then letters, digits, and _.' };
      }
      const edits = renameEdits(model, word.word, newName);
      return {
        edits: edits.map((textEdit) => ({
          resource: model.uri,
          versionId: model.getVersionId(),
          textEdit,
        })),
      };
    },
  });
}

function registerMachineLanguages() {
  const words = state.info?.keywords || {};
  const keywordList = (list) => (list || []).filter((word) => /^[A-Za-z][\w$]*$/.test(word));
  const basic = (id, list) => {
    monaco.languages.register({ id });
    monaco.languages.setLanguageConfiguration(id, {
      comments: { lineComment: 'REM' },
      brackets: [['(', ')']],
      autoClosingPairs: [{ open: '(', close: ')' }, { open: '"', close: '"' }],
    });
    monaco.languages.setMonarchTokensProvider(id, {
      ignoreCase: true,
      keywords: keywordList(list),
      tokenizer: {
        root: [
          [/^\s*\d+/, 'number'],
          [/\bREM\b.*$/i, 'comment'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/\b\d[\w.]*/, 'number'],
          [/[A-Za-z_][\w$]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        ],
      },
    });
    monaco.languages.registerCompletionItemProvider(id, {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        return {
          suggestions: keywordList(list).map((keyword) => ({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            range,
          })),
        };
      },
    });
  };
  basic('basic-c64', words.basic?.c64);
  basic('basic-apple', words.basic?.apple2);
  basic('basic-ti', words.basic?.ti99);

  const asm = (id, list) => {
    monaco.languages.register({ id });
    monaco.languages.setLanguageConfiguration(id, {
      comments: { lineComment: ';' },
      brackets: [['(', ')']],
    });
    monaco.languages.setMonarchTokensProvider(id, {
      ignoreCase: true,
      keywords: list || [],
      tokenizer: {
        root: [
          [/;.*$/, 'comment'],
          [/^\*.*$/, 'comment'],
          [/^[A-Za-z_@][\w]*:/, 'type'],
          [/\$[0-9A-Fa-f]+/, 'number'],
          [/>[0-9A-Fa-f]+\b/, 'number'],
          [/[A-Za-z_][\w]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        ],
      },
    });
    monaco.languages.registerCompletionItemProvider(id, {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        return {
          suggestions: (list || []).map((keyword) => ({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            range,
          })),
        };
      },
    });
  };
  asm('asm6502', words.asm6502);
  asm('asm9900', words.asm9900);
}

export function retargetBasicModels() {
  for (const tab of state.tabs) {
    if (!tab.model || !tab.path) continue;
    const next = languageOf(tab.path);
    if (next.startsWith('basic') && tab.model.getLanguageId() !== next) {
      monaco.editor.setModelLanguage(tab.model, next);
    }
  }
}

function wordSuggestions(model, position, skip = new Set()) {
  const word = model.getWordUntilPosition(position);
  const range = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
  const seen = new Set(skip);
  const suggestions = [];
  const add = (label, kind, detail, sort) => {
    const key = String(label || '').toLowerCase();
    if (!key || seen.has(key) || key === word.word.toLowerCase()) return;
    seen.add(key);
    suggestions.push({
      label,
      kind,
      insertText: label,
      detail,
      sortText: `${sort}${label}`,
      range,
    });
  };
  for (const symbol of scanSymbols(model)) {
    add(symbol.name, monaco.languages.CompletionItemKind.Function, symbol.kind, '2');
  }
  for (const symbol of state.symbols || []) {
    add(symbol.name, monaco.languages.CompletionItemKind.Function, symbol.kind || 'symbol', '2');
  }
  for (const name of collectWords(model)) {
    add(name, monaco.languages.CompletionItemKind.Text, 'In this file', '3');
  }
  return suggestions;
}

function collectWords(model) {
  const found = [];
  const seen = new Set();
  const re = /[A-Za-z_][A-Za-z0-9_]{2,}/g;
  const text = model.getValue();
  const slice = text.length > 120000 ? text.slice(0, 120000) : text;
  let match = re.exec(slice);
  while (match) {
    const key = match[0].toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      found.push(match[0]);
      if (found.length >= 120) break;
    }
    match = re.exec(slice);
  }
  return found;
}

let inlineProbeAt = 0;

function inlineCompletion(model, position, context, token) {
  if (state.settings?.inlineComplete === false) return { items: [] };
  if (typeof window.studio?.ollamaComplete !== 'function') return { items: [] };
  const line = model.getLineContent(position.lineNumber);
  const before = line.slice(0, Math.max(0, position.column - 1));
  if (before.trim().startsWith('--')) return { items: [] };
  const prefix = model.getValue().slice(0, model.getOffsetAt(position));
  if (!prefix.trim()) return { items: [] };
  const delay = context?.triggerKind === 1 ? 0 : 380;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(async () => {
      if (token.isCancellationRequested) {
        finish({ items: [] });
        return;
      }
      const readyName = () => {
        const info = state.info?.ollama;
        if (!info?.ok) return '';
        if (info.completeModel) return info.completeModel;
        if (info.chatModel && (info.loaded || []).includes(info.chatModel)) return info.chatModel;
        return '';
      };
      let modelName = readyName();
      if (!modelName && Date.now() - inlineProbeAt > 15000) {
        inlineProbeAt = Date.now();
        try {
          const status = await window.studio.ollamaStatus();
          if (state.info) state.info.ollama = status;
          modelName = readyName();
        } catch {
          modelName = '';
        }
      }
      if (!modelName || token.isCancellationRequested) {
        finish({ items: [] });
        return;
      }
      const offset = model.getOffsetAt(position);
      const value = model.getValue();
      const prefix = value.slice(Math.max(0, offset - 2000), offset);
      const suffix = value.slice(offset, offset + 800);
      let result = null;
      try {
        result = await window.studio.ollamaComplete({ prefix, suffix, model: modelName });
      } catch {
        result = null;
      }
      if (token.isCancellationRequested || !result?.text) {
        finish({ items: [] });
        return;
      }
      // A zero-width range inserts at the cursor. Monaco's default range
      // rewrites the rest of the line and then hides a middle that does not match it.
      const range = new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);
      finish({ items: [{ insertText: result.text, range }] });
    }, delay);
    token.onCancellationRequested(() => {
      clearTimeout(timer);
      finish({ items: [] });
    });
  });
}

function renameEdits(model, name, newName) {
  const edits = [];
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  for (let line = 1; line <= model.getLineCount(); line += 1) {
    const text = model.getLineContent(line);
    const commentAt = text.indexOf('--');
    const head = commentAt >= 0 ? text.slice(0, commentAt) : text;
    const masked = head.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (chunk) => ' '.repeat(chunk.length));
    re.lastIndex = 0;
    let match = re.exec(masked);
    while (match) {
      edits.push({
        range: new monaco.Range(line, match.index + 1, line, match.index + 1 + name.length),
        text: newName,
      });
      match = re.exec(masked);
    }
  }
  return edits;
}

export function scanSymbols(model) {
  if (!model) return [];
  const symbols = [];
  const lang = model.getLanguageId();
  for (let line = 1; line <= model.getLineCount(); line += 1) {
    const text = model.getLineContent(line);
    let match = null;
    if (lang === 'magic') {
      match = /^\s*(?:(?:public|private|protected)\s+)?(?:async\s+)?(fn|class)\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(text);
      if (match) symbols.push({ kind: match[1].toLowerCase(), name: match[2], line, column: text.indexOf(match[2]) + 1 });
      continue;
    }
    if (lang === 'markdown') {
      match = /^(#{1,4})\s+(.+)$/.exec(text);
      if (match) symbols.push({ kind: 'heading', name: match[2].trim(), line, column: 1 });
      continue;
    }
    match = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/.exec(text)
      || /^\s*(?:export\s+)?class\s+([A-Za-z0-9_]+)/.exec(text)
      || /^\s*(?:const|let|var|fn)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:function|\()/.exec(text);
    if (match) symbols.push({ kind: 'symbol', name: match[1], line, column: text.indexOf(match[1]) + 1 });
  }
  return symbols;
}

async function definitionAt(model, position) {
  const word = model.getWordAtPosition(position);
  if (!word) return [];
  const local = scanSymbols(model)
    .filter((item) => item.name === word.word)
    .map((item) => ({ file: fileForModel(model), line: item.line, column: item.column || 1 }));
  let indexed = [];
  if (state.project) {
    if (!state.symbolsFresh) {
      try {
        const result = await window.studio.symbols(state.project);
        state.symbols = result.symbols || [];
        state.symbolsFresh = true;
      } catch {
        state.symbols = [];
      }
    }
    indexed = state.symbols.filter((item) => item.name === word.word);
  }
  const seen = new Set();
  const hits = [];
  for (const hit of [...local, ...indexed]) {
    if (!hit.file) continue;
    const key = `${hit.file}:${hit.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(hit);
  }
  return hits.map((hit) => ({
    uri: monaco.Uri.file(hit.file),
    range: new monaco.Range(hit.line, hit.column || 1, hit.line, (hit.column || 1) + word.word.length),
  }));
}

function fileForModel(model) {
  const tab = state.tabs.find((item) => item.model === model);
  if (tab?.path) return tab.path;
  return model.uri.fsPath || '';
}

export function activeTab() {
  return state.active;
}

export function selectionText() {
  const tab = state.active;
  if (!tab?.model || !state.editor) return '';
  const selection = state.editor.getSelection();
  if (!selection || selection.isEmpty()) return '';
  return tab.model.getValueInRange(selection);
}

export function trigger(action) {
  state.editor?.trigger('magic', action, null);
  state.editor?.focus();
}

export async function openPath(file, options = {}) {
  if (!file) return null;
  const existing = state.tabs.find((tab) => tab.path === file);
  if (existing) {
    activate(existing, options);
    return existing;
  }
  let data;
  try {
    data = await window.studio.readFile(file, Boolean(options.force));
  } catch (error) {
    toast(error.message || 'Could not read that file');
    return null;
  }
  if (data.missing) {
    toast(`${baseName(file)} is not on disk`);
    return null;
  }
  if (data.directory) {
    toast('That path is a folder');
    return null;
  }
  if (data.tooLarge && !options.force) {
    const answer = await ask({
      title: 'Large file',
      message: `${baseName(file)} is ${Math.ceil(data.size / 1000000)} MB. Open it anyway?`,
      buttons: [
        { id: 'cancel', label: 'Cancel' },
        { id: 'ok', label: 'Open', primary: true },
      ],
    });
    if (!answer) return null;
    return openPath(file, { ...options, force: true });
  }
  if (data.binary && !data.image) {
    toast(`${baseName(file)} is not a text file`);
    return null;
  }
  const tab = {
    id: file,
    path: file,
    name: baseName(file),
    dirty: false,
    untitled: false,
    image: data.image || '',
    eol: data.eol || 'LF',
    model: null,
    saved: data.content || '',
    suppress: false,
  };
  if (!data.image) {
    const uri = monaco.Uri.file(file);
    let model = monaco.editor.getModel(uri);
    if (!model) model = monaco.editor.createModel(data.content, languageOf(file), uri);
    else if (model.getValue() !== data.content) {
      model.setValue(data.content);
    }
    model.updateOptions({ tabSize: state.settings.tabSize || 2, insertSpaces: true });
    tab.model = model;
    tab.saved = data.content;
    model.onDidChangeContent(() => markDirty(tab));
  }
  state.tabs.push(tab);
  if (!state.recentJump.includes(file)) state.recentJump.unshift(file);
  state.recentJump = state.recentJump.filter((item, index) => state.recentJump.indexOf(item) === index).slice(0, 20);
  activate(tab, options);
  if (tab.model && isCheckable(languageOf(file))) scheduleCheck(tab);
  return tab;
}

export function openUntitled() {
  const name = `untitled-${untitledCount}.magic`;
  untitledCount += 1;
  const id = `untitled:${name}`;
  const model = monaco.editor.createModel(starter(), 'magic', monaco.Uri.parse(`untitled:///${name}`));
  const tab = {
    id,
    path: null,
    name,
    dirty: true,
    untitled: true,
    image: '',
    eol: 'LF',
    model,
    saved: '',
    suppress: false,
  };
  model.onDidChangeContent(() => markDirty(tab));
  state.tabs.push(tab);
  activate(tab);
  return tab;
}

function starter() {
  return '@target("c64")\n\nprint "hello"\n';
}

export function openBufferText(name, value, language) {
  const id = `listing:${name}:${untitledCount}`;
  untitledCount += 1;
  const model = monaco.editor.createModel(value, language, monaco.Uri.parse(`untitled:///${id}/${name}`));
  const tab = {
    id,
    path: null,
    name,
    dirty: true,
    untitled: true,
    image: '',
    eol: 'LF',
    model,
    saved: '',
    suppress: false,
  };
  model.onDidChangeContent(() => markDirty(tab));
  state.tabs.push(tab);
  activate(tab);
  return tab;
}

function isCheckable(lang) {
  return lang === 'magic' || lang === 'json' || String(lang).startsWith('basic') || String(lang).startsWith('asm');
}

function markDirty(tab) {
  if (tab.suppress || !tab.model) return;
  const dirty = tab.model.getValue() !== tab.saved;
  if (dirty !== tab.dirty) {
    tab.dirty = dirty;
    renderTabs();
    state.hooks.onTabs?.();
  }
  scheduleCheck(tab);
  state.hooks.onOutline?.();
}

function scheduleCheck(tab) {
  if (!state.settings.autoCheck) return;
  if (!tab?.model || tab.image) return;
  const lang = tab.model.getLanguageId();
  if (!isCheckable(lang)) return;
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => checkTab(tab, { quiet: true }), 700);
}

export async function checkTab(tab = state.active, { quiet = false } = {}) {
  if (!tab?.model || !tab.path) {
    if (!quiet) toast('Save the file before checking it');
    return;
  }
  const lang = tab.model.getLanguageId();
  if (!isCheckable(lang)) {
    if (!quiet) toast('Check supports MAGIC, BASIC, and assembly');
    return;
  }
  try {
    if (lang === 'json') {
      try {
        JSON.parse(tab.model.getValue());
        mergeProblems(tab.path, []);
        if (!quiet) toast('No problems');
      } catch (error) {
        mergeProblems(tab.path, [{ file: tab.path, line: 1, column: 1, message: error.message }]);
        if (!quiet) state.hooks.focusBottom?.('problems');
      }
      return;
    }
    const result = await window.studio.check({
      file: tab.path,
      filename: tab.path,
      source: tab.model.getValue(),
      content: tab.model.getValue(),
      target: document.getElementById('target')?.value || state.settings?.target || 'c64',
      lang,
    });
    mergeProblems(tab.path, (result.problems || []).map((item) => ({
      ...item,
      file: item.file || item.filename || tab.path,
    })));
    if (!quiet && result.ok) toast('No problems');
    if (!quiet && !result.ok) {
      state.hooks.onProblems?.();
      state.hooks.focusBottom?.('problems');
    }
  } catch (error) {
    if (!quiet) toast(error.message || 'Check failed');
  }
}

export function mergeProblems(owner, problems) {
  state.problems = state.problems
    .filter((item) => item.owner !== owner)
    .concat(problems.map((item) => ({ ...item, owner })));
  paintProblems();
  state.hooks.onProblems?.();
}

function paintProblems() {
  const groups = new Map();
  for (const problem of state.problems) {
    if (!groups.has(problem.file)) groups.set(problem.file, []);
    groups.get(problem.file).push(problem);
  }
  const seen = new Set();
  for (const tab of state.tabs) {
    if (!tab.model) continue;
    seen.add(tab.path);
    const list = groups.get(tab.path) || [];
    const maxLine = tab.model.getLineCount();
    monaco.editor.setModelMarkers(tab.model, 'magic', list.map((problem) => {
      const line = Math.min(Math.max(problem.line || 1, 1), maxLine);
      const column = Math.max(problem.column || 1, 1);
      return {
        severity: monaco.MarkerSeverity.Error,
        message: problem.message,
        startLineNumber: line,
        startColumn: column,
        endLineNumber: line,
        endColumn: Math.max(column + 1, tab.model.getLineMaxColumn(line)),
      };
    }));
  }
}

export function problems() {
  return state.problems;
}

function activate(tab, options = {}) {
  if (!tab) return;
  if (options.record !== false && state.active && state.active !== tab) pushNav();
  state.active = tab;
  const image = document.getElementById('image-view');
  const empty = document.getElementById('empty');
  if (tab.image) {
    state.editor.setModel(null);
    image.hidden = false;
    image.innerHTML = '';
    const img = document.createElement('img');
    img.src = tab.image;
    img.alt = tab.name;
    image.appendChild(img);
  } else {
    image.hidden = true;
    state.editor.setModel(tab.model);
    if (options.line) {
      const line = options.line;
      const column = options.column || 1;
      state.editor.setPosition({ lineNumber: line, column });
      state.editor.revealLineInCenter(line);
      if (options.focus !== false) state.editor.focus();
    } else if (options.focus !== false) {
      state.editor.focus();
    }
  }
  empty.hidden = true;
  renderTabs();
  state.hooks.onTabs?.();
  state.hooks.onOutline?.();
  state.hooks.onCursor?.(state.editor.getPosition());
}

export function renderTabs() {
  const host = document.getElementById('tabs');
  host.innerHTML = '';
  for (const tab of state.tabs) {
    const el = document.createElement('div');
    el.className = `tab${tab === state.active ? ' active' : ''}${tab.dirty ? ' dirty' : ''}`;
    el.dataset.tab = tab.id;
    el.draggable = true;
    el.title = tab.path || tab.name;
    const label = document.createElement('span');
    label.className = 'tab-name';
    label.textContent = tab.name;
    const mark = document.createElement('span');
    mark.className = 'tab-mark';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tab-close';
    close.dataset.close = '1';
    close.textContent = '×';
    close.title = 'Close';
    el.append(label, mark, close);
    host.appendChild(el);
  }
}

function bindTabDrag() {
  const host = document.getElementById('tabs');
  let from = '';
  host.addEventListener('dragstart', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (!tab) return;
    from = tab.dataset.tab;
  });
  host.addEventListener('dragover', (event) => {
    if (from) event.preventDefault();
  });
  host.addEventListener('drop', (event) => {
    const target = event.target.closest('[data-tab]');
    if (!from || !target || target.dataset.tab === from) return;
    const next = state.tabs.slice();
    const fromIndex = next.findIndex((tab) => tab.id === from);
    const toIndex = next.findIndex((tab) => tab.id === target.dataset.tab);
    if (fromIndex < 0 || toIndex < 0) return;
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    state.tabs = next;
    renderTabs();
    from = '';
  });
}

export async function closeTab(tab) {
  if (!tab) return false;
  if (tab.dirty) {
    const answer = await ask({
      title: 'Save changes?',
      message: `${tab.name} has unsaved changes.`,
      buttons: [
        { id: 'cancel', label: 'Cancel' },
        { id: 'discard', label: "Don't save", danger: true },
        { id: 'save', label: 'Save', primary: true },
      ],
    });
    if (!answer) return false;
    if (answer.id === 'save') {
      const saved = await saveTab(tab);
      if (!saved) return false;
    }
  }
  const index = state.tabs.indexOf(tab);
  state.tabs.splice(index, 1);
  if (tab.model) tab.model.dispose();
  if (state.active === tab) {
    const neighbor = state.tabs[index] || state.tabs[index - 1] || null;
    state.active = null;
    if (neighbor) activate(neighbor, { record: false });
    else showEmpty();
  }
  renderTabs();
  state.hooks.onTabs?.();
  return true;
}

function showEmpty() {
  state.editor?.setModel(null);
  document.getElementById('image-view').hidden = true;
  const empty = document.getElementById('empty');
  empty.hidden = !state.project;
  renderTabs();
}

export function closeActive() {
  return closeTab(state.active);
}

export async function saveTab(tab = state.active) {
  if (!tab) return false;
  if (tab.image) return true;
  let target = tab.path;
  if (!target) {
    const picked = await window.studio.saveDialog({
      title: 'Save',
      defaultPath: state.project ? `${state.project}/${tab.name}` : tab.name,
    });
    if (!picked) return false;
    target = picked;
  }
  const content = tab.eol === 'CRLF'
    ? tab.model.getValue().replace(/\r?\n/g, '\r\n')
    : tab.model.getValue().replace(/\r\n/g, '\n');
  try {
    await window.studio.writeFile(target, content);
  } catch (error) {
    toast(error.message || 'Save failed');
    return false;
  }
  tab.suppress = true;
  if (content !== tab.model.getValue()) tab.model.setValue(content);
  tab.suppress = false;
  tab.saved = tab.model.getValue();
  tab.dirty = false;
  if (!tab.path) {
    const value = tab.model.getValue();
    tab.model.dispose();
    tab.path = target;
    tab.id = target;
    tab.name = baseName(target);
    tab.untitled = false;
    tab.model = monaco.editor.createModel(value, languageOf(target), monaco.Uri.file(target));
    tab.model.onDidChangeContent(() => markDirty(tab));
    tab.saved = value;
    if (state.active === tab) state.editor.setModel(tab.model);
  }
  state.symbolsFresh = false;
  state.fileIndex = null;
  renderTabs();
  state.hooks.onTabs?.();
  scheduleCheck(tab);
  return true;
}

export async function saveAll() {
  for (const tab of state.tabs.slice()) {
    if (!tab.dirty) continue;
    const ok = await saveTab(tab);
    if (!ok) return false;
  }
  return true;
}

export function dirtyTabs() {
  return state.tabs.filter((tab) => tab.dirty);
}

export function retargetTab(file, next) {
  const tab = state.tabs.find((item) => item.path === file);
  if (!tab) return;
  const language = tab.model?.getLanguageId() || languageOf(next);
  const value = tab.model?.getValue() ?? '';
  const view = state.editor?.saveViewState();
  tab.model?.dispose();
  tab.path = next;
  tab.id = next;
  tab.name = baseName(next);
  if (!tab.image) {
    tab.model = monaco.editor.createModel(value, language, monaco.Uri.file(next));
    tab.model.onDidChangeContent(() => markDirty(tab));
    tab.saved = value;
    tab.dirty = false;
    if (state.active === tab) {
      state.editor.setModel(tab.model);
      if (view) state.editor.restoreViewState(view);
    }
  }
  renderTabs();
  state.hooks.onTabs?.();
}

export async function forgetPaths(match) {
  for (const tab of state.tabs.filter((item) => item.path && match(item.path))) {
    tab.dirty = false;
    await closeTab(tab);
  }
}

export async function closeAll() {
  for (const tab of state.tabs.slice()) {
    const ok = await closeTab(tab);
    if (!ok) return false;
  }
  return true;
}

export function nextTab(step) {
  if (!state.tabs.length) return;
  const index = Math.max(0, state.tabs.indexOf(state.active));
  const next = state.tabs[(index + step + state.tabs.length) % state.tabs.length];
  activate(next);
}

export function applySettings() {
  if (!state.editor) return;
  state.editor.updateOptions({
    fontSize: state.settings.fontSize || 14,
    wordWrap: state.settings.wordWrap || 'off',
    minimap: { enabled: state.settings.minimap !== false },
    tabSize: state.settings.tabSize || 2,
    inlineSuggest: { enabled: state.settings.inlineComplete !== false },
  });
  for (const tab of state.tabs) {
    tab.model?.updateOptions({ tabSize: state.settings.tabSize || 2, insertSpaces: true });
  }
}

export function toggleWrap() {
  state.settings.wordWrap = state.settings.wordWrap === 'on' ? 'off' : 'on';
  applySettings();
  window.studio.settingsSet({ wordWrap: state.settings.wordWrap });
  toast(state.settings.wordWrap === 'on' ? 'Word wrap on' : 'Word wrap off');
}

export function toggleMinimap() {
  state.settings.minimap = state.settings.minimap === false;
  applySettings();
  window.studio.settingsSet({ minimap: state.settings.minimap });
}

export function cycleIndent() {
  const order = [2, 4, 8];
  const current = state.settings.tabSize || 2;
  const next = order[(order.indexOf(current) + 1) % order.length];
  state.settings.tabSize = next;
  applySettings();
  window.studio.settingsSet({ tabSize: next });
  state.hooks.onCursor?.(state.editor.getPosition());
}

export function toggleEol() {
  const tab = state.active;
  if (!tab) return;
  tab.eol = tab.eol === 'CRLF' ? 'LF' : 'CRLF';
  tab.dirty = true;
  renderTabs();
  state.hooks.onTabs?.();
  state.hooks.onCursor?.(state.editor.getPosition());
}

export async function goToDefinition() {
  const tab = state.active;
  if (!tab?.model) return;
  const position = state.editor.getPosition();
  const hits = await definitionAt(tab.model, position);
  if (!hits.length) {
    toast('No declaration found');
    return;
  }
  if (hits.length === 1) {
    const hit = hits[0];
    await openPath(hit.uri.fsPath, { line: hit.range.startLineNumber, column: hit.range.startColumn });
    return;
  }
  state.hooks.pickDefinition?.(hits.map((hit) => ({
    label: `${baseName(hit.uri.fsPath)}:${hit.range.startLineNumber}`,
    detail: relativePath(hit.uri.fsPath),
    file: hit.uri.fsPath,
    line: hit.range.startLineNumber,
    column: hit.range.startColumn,
  })));
}

function pushNav() {
  if (state.nav.lock || !state.active) return;
  const position = state.editor.getPosition() || { lineNumber: 1, column: 1 };
  state.nav.back.push({
    path: state.active.path,
    id: state.active.id,
    line: position.lineNumber,
    column: position.column,
  });
  if (state.nav.back.length > 60) state.nav.back.shift();
  state.nav.forward = [];
}

export async function jumpBack() {
  const point = state.nav.back.pop();
  if (!point) return;
  const position = state.editor.getPosition() || { lineNumber: 1, column: 1 };
  if (state.active) {
    state.nav.forward.push({
      path: state.active.path,
      id: state.active.id,
      line: position.lineNumber,
      column: position.column,
    });
  }
  await jumpTo(point);
}

export async function jumpForward() {
  const point = state.nav.forward.pop();
  if (!point) return;
  const position = state.editor.getPosition() || { lineNumber: 1, column: 1 };
  if (state.active) {
    state.nav.back.push({
      path: state.active.path,
      id: state.active.id,
      line: position.lineNumber,
      column: position.column,
    });
  }
  await jumpTo(point);
}

async function jumpTo(point) {
  state.nav.lock = true;
  try {
    if (point.path) await openPath(point.path, { line: point.line, column: point.column, record: false });
    else {
      const tab = state.tabs.find((item) => item.id === point.id);
      if (tab) activate(tab, { line: point.line, column: point.column, record: false });
    }
  } finally {
    state.nav.lock = false;
  }
}

export async function noteDisk(file) {
  const tab = state.tabs.find((item) => item.path === file);
  if (!tab || tab.untitled || tab.image) return;
  let data;
  try {
    data = await window.studio.readFile(file);
  } catch {
    return;
  }
  if (data.missing) {
    toast(`${tab.name} was removed on disk`);
    tab.dirty = true;
    renderTabs();
    return;
  }
  if (typeof data.content !== 'string' || !tab.model) return;
  if (data.content === tab.model.getValue()) {
    tab.saved = data.content;
    tab.dirty = false;
    renderTabs();
    return;
  }
  if (!tab.dirty) {
    tab.suppress = true;
    tab.model.setValue(data.content);
    tab.suppress = false;
    tab.saved = data.content;
    tab.dirty = false;
    renderTabs();
    scheduleCheck(tab);
    return;
  }
  toast(`${tab.name} changed on disk and also has unsaved edits`);
}

export async function refreshOpenFromDisk() {
  for (const tab of state.tabs) {
    if (tab.path) await noteDisk(tab.path);
  }
  state.symbolsFresh = false;
  state.fileIndex = null;
}

export function cursorLabel() {
  const tab = state.active;
  const position = state.editor?.getPosition();
  return {
    line: position?.lineNumber || 1,
    column: position?.column || 1,
    language: tab?.model?.getLanguageId() || (tab?.image ? 'image' : ''),
    eol: tab?.eol || 'LF',
    indent: state.settings.tabSize || 2,
  };
}

export function currentFileLabel() {
  const tab = state.active;
  if (!tab) return state.project ? baseName(state.project) : '';
  return relativePath(tab.path || tab.name);
}

export function runWorkingDirectory(file) {
  if (state.project && file && (file === state.project || file.startsWith(`${state.project}/`))) return state.project;
  if (file) return dirName(file);
  return state.project || '';
}
