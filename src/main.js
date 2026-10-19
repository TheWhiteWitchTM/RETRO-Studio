import { spawnSync } from 'node:child_process';
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
import {
  createEntry,
  createProject,
  gitInfo,
  indexSymbols,
  listDir,
  readFile,
  readScripts,
  removePath,
  renamePath,
  searchText,
  walkFiles,
  writeFile,
} from './services/files.js';
import { hasPty, loadPty, startProcess } from './services/pty.js';
import { DEFAULTS, loadJson, saveJson, workspacePath } from './services/store.js';
import { KEYWORDS, MACHINE, checkBuffer, runSource } from './services/run.js';

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
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

let win = null;
let settings = { ...DEFAULTS };
let settingsFile = '';
let userData = '';
let runtime = { nodePath: '', pty: false, retroCli: '', examples: '' };
let launch = { project: null, file: null };
let allowClose = smoke;
let runProc = null;
const terms = new Map();
let watchTimer = null;
let watcher = null;

function version() {
  try {
    return JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function findNode() {
  const found = [];
  if (process.env.npm_node_execpath) found.push(process.env.npm_node_execpath);
  const which = spawnSync('which', ['node'], { encoding: 'utf8' });
  if (which.status === 0) found.push(...which.stdout.trim().split('\n'));
  found.push('/usr/local/bin/node', '/usr/bin/node');
  for (const item of found) {
    if (!item || item.includes('electron')) continue;
    try {
      if (fs.existsSync(item) && fs.statSync(item).isFile()) return item;
    } catch {
      /* keep looking */
    }
  }
  return process.execPath;
}

function findRetro() {
  const cli = path.resolve(appRoot, '../RETRO-MAGIC/dist/cli.js');
  const examples = path.resolve(appRoot, '../RETRO-MAGIC/examples');
  return {
    cli: fs.existsSync(cli) ? cli : '',
    examples: fs.existsSync(examples) ? examples : '',
  };
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

function persistSettings() {
  if (!settingsFile || smoke) return;
  saveJson(settingsFile, settings);
}

function rememberProject(project) {
  if (!project) return;
  const recent = [project, ...(settings.recent || []).filter((item) => item !== project)].slice(0, 12);
  settings = { ...settings, recent, lastProject: project };
  persistSettings();
}

function projectFromArgv(argv) {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue;
    const abs = path.resolve(arg);
    if (abs === appRoot) continue;
    if (abs.endsWith(`${path.sep}src${path.sep}main.js`)) continue;
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) return { project: abs, file: null };
    if (stat.isFile()) return { project: path.dirname(abs), file: abs };
  }
  return { project: null, file: null };
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function watchProject(root) {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (!root) return;
  try {
    watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const name = String(filename);
      if (name.includes('node_modules') || name.includes(`${path.sep}.git`) || name.startsWith('.git')) return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        send('fs:event', { path: path.join(root, name) });
      }, 120);
    });
  } catch {
    watcher = null;
  }
}

function stopRun() {
  if (!runProc) return;
  const proc = runProc;
  runProc = null;
  try { proc.kill(); } catch { /* already gone */ }
  setTimeout(() => {
    try {
      if (proc.pid) process.kill(proc.pid, 'SIGKILL');
    } catch { /* already gone */ }
  }, 1200);
}

function chromeIsDark() {
  return settings.theme !== 'light';
}

function applyChromeTheme(theme) {
  const dark = theme !== 'light';
  nativeTheme.themeSource = dark ? 'dark' : 'light';
  settings = { ...settings, theme: dark ? 'black' : 'light' };
  if (win && !win.isDestroyed()) win.setBackgroundColor(dark ? '#000000' : '#f7f7f7');
}

function killTerms() {
  for (const proc of terms.values()) {
    try { proc.kill(); } catch { /* already gone */ }
  }
  terms.clear();
}

function withFiles(result) {
  if (!result?.problems) return result;
  return {
    ...result,
    problems: result.problems.map((item) => ({
      ...item,
      file: item.file || item.filename || '',
    })),
  };
}

function shellSpec(file, cwd) {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file);
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return { cmd: runtime.nodePath, args: [file], cwd, label: `node ${base}` };
  }
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
    return { cmd: runtime.nodePath, args: ['--experimental-strip-types', file], cwd, label: `node ${base}` };
  }
  if (ext === '.py') return { cmd: 'python3', args: [file], cwd, label: `python3 ${base}` };
  if (ext === '.sh' || ext === '.bash') return { cmd: 'bash', args: [file], cwd, label: `bash ${base}` };
  throw new Error(`RETRO Studio runs MAGIC, BASIC, and assembly. ${ext || 'This file'} needs the custom command.`);
}

function buildMenu() {
  const sendCommand = (id) => () => send('menu:command', id);
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: sendCommand('project.open') },
        { label: 'New Project…', click: sendCommand('project.create') },
        { label: 'Open File…', accelerator: 'CmdOrCtrl+Shift+O', click: sendCommand('file.open') },
        { type: 'separator' },
        { label: 'New File', accelerator: 'Alt+Insert', click: sendCommand('file.new') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: sendCommand('file.save') },
        { label: 'Save All', accelerator: 'CmdOrCtrl+Shift+S', click: sendCommand('file.saveAll') },
        { type: 'separator' },
        { label: 'RETRO-MAGIC Examples', click: sendCommand('project.examples') },
        { type: 'separator' },
        { label: 'Close Editor', accelerator: 'CmdOrCtrl+W', click: sendCommand('file.close') },
        { label: 'Close Folder', accelerator: 'CmdOrCtrl+Shift+W', click: sendCommand('project.close') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: sendCommand('edit.find') },
        { label: 'Replace', accelerator: 'CmdOrCtrl+R', click: sendCommand('edit.replace') },
        { label: 'Find in Files', accelerator: 'CmdOrCtrl+Shift+F', click: sendCommand('search.open') },
        { type: 'separator' },
        { label: 'Duplicate Line', accelerator: 'CmdOrCtrl+D', click: sendCommand('edit.duplicate') },
        { label: 'Delete Line', accelerator: 'CmdOrCtrl+Y', click: sendCommand('edit.deleteLine') },
        { label: 'Comment Line', accelerator: 'CmdOrCtrl+/', click: sendCommand('edit.comment') },
        { label: 'Rename', accelerator: 'Shift+F6', click: sendCommand('edit.rename') },
        { label: 'Go to Declaration', accelerator: 'CmdOrCtrl+B', click: sendCommand('edit.definition') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+Shift+A', click: sendCommand('palette.open') },
        { label: 'Quick Open', accelerator: 'CmdOrCtrl+P', click: sendCommand('quick.open') },
        { label: 'Recent Files', accelerator: 'CmdOrCtrl+E', click: sendCommand('quick.recent') },
        { type: 'separator' },
        { label: 'Explorer', accelerator: 'Alt+1', click: sendCommand('sidebar.explorer') },
        { label: 'Search', accelerator: 'Alt+3', click: sendCommand('sidebar.search') },
        { label: 'Structure', accelerator: 'Alt+7', click: sendCommand('sidebar.outline') },
        { type: 'separator' },
        { label: 'Terminal', accelerator: 'Alt+F12', click: sendCommand('terminal.toggle') },
        { label: 'Machine Screen', accelerator: 'Ctrl+Shift+F10', click: sendCommand('run.screen') },
        { label: 'Word Wrap', accelerator: 'Alt+Z', click: sendCommand('view.wrap') },
        { label: 'Toggle Minimap', click: sendCommand('view.minimap') },
        { label: 'Toggle Theme', click: sendCommand('view.theme') },
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
        { label: 'Screen', accelerator: 'Ctrl+Shift+F10', click: sendCommand('run.screen') },
        { label: 'Stop', accelerator: 'Ctrl+F2', click: sendCommand('run.stop') },
        { label: 'Check', accelerator: 'Ctrl+F9', click: sendCommand('run.check') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+Shift+/', click: sendCommand('help.keys') },
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
    icon: path.join(appRoot, 'assets', 'icon.png'),
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
    win.show();
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
    version: version(),
    nodePath: runtime.nodePath,
    retroCli: runtime.retroCli,
    pty: runtime.pty,
    settings,
    home: app.getPath('home'),
    launch: smoke ? { project: null, file: null } : launch,
    examples: runtime.examples,
    keywords: KEYWORDS,
    machines: MACHINE,
    licenseFile: path.join(appRoot, 'LICENSE'),
  }));

  ipcMain.handle('app:closeResult', (_event, allow) => {
    if (!allow) return false;
    allowClose = true;
    saveBounds();
    win.close();
    return true;
  });

  ipcMain.handle('app:quit', () => {
    allowClose = true;
    win?.close();
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

  ipcMain.handle('workspace:load', (_event, root) => {
    if (!root) return null;
    return loadJson(workspacePath(userData, root), null);
  });

  ipcMain.handle('workspace:save', (_event, payload) => {
    if (!payload?.root || smoke) return false;
    saveJson(workspacePath(userData, payload.root), payload.data || {});
    return true;
  });

  ipcMain.handle('project:remember', (_event, project) => {
    rememberProject(project);
    watchProject(project);
    return settings.recent;
  });

  ipcMain.handle('project:unwatch', () => {
    watchProject('');
    return true;
  });

  ipcMain.handle('fs:list', (_event, dir) => listDir(dir));
  ipcMain.handle('fs:read', (_event, payload) => readFile(payload.file, { force: payload.force }));
  ipcMain.handle('fs:write', (_event, payload) => writeFile(payload.file, payload.content ?? ''));
  ipcMain.handle('fs:create', async (_event, payload) => createEntry(payload.parent, payload.name, payload.kind));
  ipcMain.handle('fs:rename', (_event, payload) => renamePath(payload.from, payload.to));
  ipcMain.handle('fs:remove', (_event, file) => removePath(file));
  ipcMain.handle('fs:search', (_event, payload) => searchText(payload));
  ipcMain.handle('fs:quickList', (_event, root) => walkFiles(root));
  ipcMain.handle('fs:symbols', (_event, root) => indexSymbols(root));
  ipcMain.handle('git:info', (_event, root) => gitInfo(root));
  ipcMain.handle('npm:scripts', (_event, root) => readScripts(root));
  ipcMain.handle('project:create', (_event, payload) => createProject(payload.parent, payload.name));

  ipcMain.handle('shell:reveal', (_event, file) => {
    if (file) shell.showItemInFolder(file);
    return true;
  });
  ipcMain.handle('shell:open', (_event, url) => {
    if (url) shell.openExternal(url);
    return true;
  });

  ipcMain.handle('retro:run', (_event, payload) => withFiles(runSource(payload || {})));
  ipcMain.handle('retro:check', (_event, payload) => withFiles(checkBuffer({
    source: payload?.source ?? payload?.content ?? '',
    filename: payload?.filename || payload?.file || '',
    target: payload?.target,
    lang: payload?.lang,
  })));

  ipcMain.handle('run:start', (_event, payload) => {
    stopRun();
    const cwd = payload.cwd || payload.root || app.getPath('home');
    let spec;
    try {
      if (payload.kind === 'npm') {
        spec = { cmd: 'npm', args: ['run', payload.script], cwd, label: `npm run ${payload.script}` };
      } else if (payload.kind === 'custom') {
        const command = String(payload.command || '').trim();
        if (!command) throw new Error('The custom run command is empty.');
        spec = { cmd: 'bash', args: ['-lc', command], cwd, label: command };
      } else if (payload.kind === 'retro-cli' && runtime.retroCli) {
        spec = {
          cmd: runtime.nodePath,
          args: [runtime.retroCli, ...payload.args],
          cwd,
          label: `retro ${payload.args.join(' ')}`,
        };
      } else {
        spec = shellSpec(payload.file, cwd);
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
    const proc = startProcess(spec.cmd, spec.args, {
      cwd: spec.cwd,
      cols: payload.cols || 80,
      rows: payload.rows || 24,
      env: { ELECTRON_RUN_AS_NODE: '1' },
    });
    runProc = proc;
    proc.onData((data) => send('run:data', data));
    proc.onExit((code) => {
      if (runProc === proc) runProc = null;
      send('run:exit', { code });
    });
    return { ok: true, label: spec.label, pty: proc.pty };
  });

  ipcMain.handle('run:write', (_event, data) => {
    if (runProc) runProc.write(data);
    return true;
  });
  ipcMain.handle('run:resize', (_event, payload) => {
    if (runProc) runProc.resize(payload.cols, payload.rows);
    return true;
  });
  ipcMain.handle('run:stop', () => {
    stopRun();
    return true;
  });

  ipcMain.handle('term:create', (_event, payload) => {
    const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const shellName = process.env.SHELL || 'bash';
    const proc = startProcess(shellName, ['-l'], {
      cwd: payload.cwd || app.getPath('home'),
      cols: payload.cols || 80,
      rows: payload.rows || 24,
    });
    terms.set(id, proc);
    proc.onData((data) => send('term:data', { id, data }));
    proc.onExit((code) => {
      terms.delete(id);
      send('term:exit', { id, code });
    });
    return { id, pty: proc.pty || hasPty() };
  });
  ipcMain.handle('term:write', (_event, payload) => {
    terms.get(payload.id)?.write(payload.data);
    return true;
  });
  ipcMain.handle('term:resize', (_event, payload) => {
    terms.get(payload.id)?.resize(payload.cols, payload.rows);
    return true;
  });
  ipcMain.handle('term:kill', (_event, id) => {
    const proc = terms.get(id);
    if (proc) {
      proc.kill();
      terms.delete(id);
    }
    return true;
  });

  ipcMain.on('smoke:ready', async () => {
    if (!smoke || !win) return;
    try {
      const image = await win.webContents.capturePage();
      fs.writeFileSync('/tmp/retro-studio-smoke.png', image.toPNG());
    } catch (error) {
      console.error(error);
    }
    app.exit(0);
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
  app.on('second-instance', (_event, argv) => {
    const next = projectFromArgv(argv);
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    if (next.project) send('app:open', next);
  });

  app.whenReady().then(async () => {
    userData = app.getPath('userData');
    settingsFile = path.join(userData, 'settings.json');
    settings = loadJson(settingsFile, DEFAULTS);
    if (settings.theme !== 'light') settings.theme = 'black';
    applyChromeTheme(settings.theme);
    runtime.nodePath = findNode();
    runtime.pty = await loadPty();
    const retro = findRetro();
    runtime.retroCli = retro.cli;
    runtime.examples = retro.examples;
    if (!smoke) launch = projectFromArgv(process.argv);
    if (!smoke && !launch.project && settings.reopenLast && settings.lastProject && fs.existsSync(settings.lastProject)) {
      launch = { project: settings.lastProject, file: null };
    }

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
    stopRun();
    killTerms();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    allowClose = true;
    stopRun();
    killTerms();
  });
}

