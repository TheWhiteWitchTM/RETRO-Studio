import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  protocol,
  shell,
} from 'electron';
import { appRoot } from './paths.js';
import { listDir, readText, searchText, writeText } from './services/files.js';
import { checkBuffer, KEYWORDS, MACHINE, runSource } from './services/run.js';

app.setName('retro-studio');
nativeTheme.themeSource = 'dark';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'studio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

const smoke = process.env.RETRO_STUDIO_SMOKE === '1';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

const DEFAULTS = {
  theme: 'black',
  target: 'c64',
  mode: 'host',
  recent: [],
  lastProject: '',
  bounds: null,
};

let win = null;
let settings = { ...DEFAULTS };
let settingsFile = '';
let allowClose = false;
let termCwd = '';

function examplesDir() {
  const dir = path.resolve(appRoot, '../RETRO-MAGIC/examples');
  return fs.existsSync(dir) ? dir : '';
}

function fromStudioUrl(requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.hostname !== 'app') return null;
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..')) return null;
  const file = path.resolve(appRoot, rel);
  if (file !== appRoot && !file.startsWith(`${appRoot}${path.sep}`)) return null;
  return file;
}

function loadJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { ...fallback };
  }
}

function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function persistSettings() {
  if (!settingsFile || smoke) return;
  saveJson(settingsFile, settings);
}

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function chromeIsDark() {
  return settings.theme !== 'light';
}

function applyChromeTheme(theme) {
  settings.theme = theme === 'light' ? 'light' : 'black';
  nativeTheme.themeSource = settings.theme === 'light' ? 'light' : 'dark';
  if (win && !win.isDestroyed()) win.setBackgroundColor(chromeIsDark() ? '#000000' : '#f7f7f7');
}

function rememberProject(project) {
  if (!project) return;
  const recent = [project, ...(settings.recent || []).filter((item) => item !== project)].slice(0, 8);
  settings = { ...settings, recent, lastProject: project };
  persistSettings();
}

function projectFromArgv(argv) {
  for (const arg of argv) {
    if (!arg || arg.startsWith('-') || arg.includes('electron')) continue;
    try {
      const resolved = path.resolve(arg);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved;
    } catch {
      /* skip */
    }
  }
  return '';
}

function buildMenu() {
  const sendCommand = (command) => () => send('menu:command', command);
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New File', accelerator: 'CmdOrCtrl+N', click: sendCommand('file.new') },
        { label: 'Open File…', click: sendCommand('file.open') },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: sendCommand('project.open') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: sendCommand('file.save') },
        { label: 'Save As…', click: sendCommand('file.saveAs') },
        { type: 'separator' },
        { label: 'RETRO-MAGIC Examples', click: sendCommand('project.examples') },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: sendCommand('app.quit') },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+P', click: sendCommand('palette') },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: sendCommand('view.side') },
        { label: 'Toggle Black / Light', click: sendCommand('view.theme') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { label: 'Reload Window', click: () => win?.webContents.reload() },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Run',
      submenu: [
        { label: 'Run', accelerator: 'Shift+F10', click: sendCommand('run.start') },
        { label: 'Check', accelerator: 'CmdOrCtrl+F9', click: sendCommand('run.check') },
        { label: 'Stop', accelerator: 'CmdOrCtrl+F2', click: sendCommand('run.stop') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: sendCommand('help.keys') },
        { label: 'About RETRO Studio', click: sendCommand('help.about') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  if (win && !win.isDestroyed()) win.setMenuBarVisibility(false);
}

function createWindow() {
  const bounds = settings.bounds || { width: 1440, height: 920 };
  win = new BrowserWindow({
    width: bounds.width || 1440,
    height: bounds.height || 920,
    x: Number.isFinite(bounds.x) ? bounds.x : undefined,
    y: Number.isFinite(bounds.y) ? bounds.y : undefined,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: chromeIsDark() ? '#000000' : '#f7f7f7',
    darkTheme: chromeIsDark(),
    autoHideMenuBar: false,
    title: 'RETRO Studio',
    webPreferences: {
      preload: path.join(appRoot, 'src', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  if (bounds.maximized) win.maximize();
  win.once('ready-to-show', () => {
    win.setMenuBarVisibility(false);
    if (!smoke) win.show();
  });
  win.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    send('app:requestClose');
  });
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  const query = smoke ? '?smoke=1' : '';
  win.loadURL(`studio://app/src/renderer/index.html${query}`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('studio://app/')) event.preventDefault();
  });
  if (smoke) {
    win.webContents.on('did-fail-load', (_event, code, description) => {
      console.error(`fail-load ${code} ${description}`);
      app.exit(1);
    });
    win.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) console.error(message);
    });
  }
}

function saveBounds() {
  if (!win || win.isDestroyed() || smoke) return;
  const maximized = win.isMaximized();
  const normal = maximized ? settings.bounds : win.getBounds();
  settings = {
    ...settings,
    bounds: { ...(normal || win.getBounds()), maximized },
  };
  persistSettings();
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: '0.1.0',
    settings,
    home: app.getPath('home'),
    examples: examplesDir(),
    keywords: KEYWORDS,
    machines: MACHINE,
    launch: smoke ? '' : (settings.lastProject && fs.existsSync(settings.lastProject) ? settings.lastProject : ''),
  }));

  ipcMain.handle('app:closeResult', (_event, allow) => {
    if (!allow) return false;
    allowClose = true;
    saveBounds();
    win.close();
    return true;
  });

  ipcMain.handle('app:quit', () => {
    if (win && !win.isDestroyed()) win.close();
    return true;
  });

  ipcMain.handle('app:title', (_event, title) => {
    if (win && !win.isDestroyed()) win.setTitle(title ? `${title} — RETRO Studio` : 'RETRO Studio');
  });

  ipcMain.handle('window:theme', (_event, theme) => {
    applyChromeTheme(theme);
    persistSettings();
    return settings.theme;
  });

  ipcMain.handle('dialog:folder', async (_event, title) => {
    const result = await dialog.showOpenDialog(win, {
      title: title || 'Open Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    rememberProject(result.filePaths[0]);
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:file', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Open File',
      properties: ['openFile'],
      filters: [
        { name: 'RETRO sources', extensions: ['magic', 'bas', 'basic', 'asm', 's', 'a65', 'a99'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:save', async (_event, options) => {
    const result = await dialog.showSaveDialog(win, {
      title: options?.title || 'Save',
      defaultPath: options?.defaultPath,
      filters: [
        { name: 'RETRO sources', extensions: ['magic', 'bas', 'asm', 'a99'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('settings:set', (_event, patch) => {
    settings = { ...settings, ...(patch || {}) };
    if (patch?.theme) applyChromeTheme(patch.theme);
    persistSettings();
    return settings;
  });

  ipcMain.handle('fs:list', (_event, dir) => {
    try {
      return { ok: true, entries: listDir(dir) };
    } catch (error) {
      return { ok: false, entries: [], message: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('fs:read', (_event, file) => {
    try {
      return { ok: true, content: readText(file) };
    } catch (error) {
      return { ok: false, content: '', message: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('fs:write', (_event, payload) => {
    try {
      writeText(payload.file, payload.content ?? '');
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('fs:search', (_event, payload) => searchText(payload.root, payload.query));

  ipcMain.handle('shell:reveal', (_event, file) => {
    if (file) shell.showItemInFolder(file);
    return true;
  });

  ipcMain.handle('shell:open', (_event, url) => {
    if (url) shell.openExternal(url);
    return true;
  });

  ipcMain.handle('retro:run', (_event, payload) => runSource(payload || {}));
  ipcMain.handle('retro:check', (_event, payload) => checkBuffer(payload || {}));

  ipcMain.handle('term:line', (_event, payload) => runShellLine(payload || {}));

  ipcMain.on('smoke:ready', () => {
    if (smoke) app.exit(0);
  });
  ipcMain.on('smoke:fail', (_event, message) => {
    console.error(message);
    if (smoke) app.exit(1);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    const userData = app.getPath('userData');
    settingsFile = path.join(userData, 'settings.json');
    settings = loadJson(settingsFile, DEFAULTS);
    if (settings.theme !== 'light') settings.theme = 'black';
    applyChromeTheme(settings.theme);
    const opened = smoke ? '' : projectFromArgv(process.argv);
    if (opened) settings.lastProject = opened;
    protocol.handle('studio', async (request) => {
      const file = fromStudioUrl(request.url);
      if (!file) return new Response('forbidden', { status: 403 });
      try {
        const data = await fs.promises.readFile(file);
        const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        return new Response(data, { headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
      } catch {
        return new Response('missing', { status: 404 });
      }
    });
    registerIpc();
    buildMenu();
    createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    allowClose = true;
  });
}

function runShellLine(payload) {
  const line = String(payload.line || '');
  if (!termCwd) {
    termCwd = payload.cwd && fs.existsSync(payload.cwd) ? payload.cwd : app.getPath('home');
  }
  const trimmed = line.trim();
  if (/^cd(\s|$)/.test(trimmed)) {
    const arg = trimmed.slice(2).trim().replace(/^['"]|['"]$/g, '') || app.getPath('home');
    const next = path.resolve(termCwd, arg);
    if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) {
      return Promise.resolve({ output: `cd: no such directory: ${arg}\n`, code: 1, cwd: termCwd });
    }
    termCwd = next;
    return Promise.resolve({ output: '', code: 0, cwd: termCwd });
  }
  return new Promise((resolve) => {
    const child = spawn('bash', ['--noprofile', '--norc', '-c', line], {
      cwd: termCwd,
      env: process.env,
    });
    let output = '';
    child.stdout.on('data', (buf) => { output += String(buf); });
    child.stderr.on('data', (buf) => { output += String(buf); });
    child.on('error', (error) => resolve({ output: `${error.message}\n`, code: 1, cwd: termCwd }));
    child.on('exit', (code) => resolve({ output, code: code ?? 0, cwd: termCwd }));
  });
}
