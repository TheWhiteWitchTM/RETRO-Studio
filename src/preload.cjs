const { contextBridge, ipcRenderer, webUtils } = require('electron');

const channels = new Set([
  'menu:command',
  'fs:event',
  'run:data',
  'run:exit',
  'term:data',
  'term:exit',
  'app:requestClose',
  'app:open',
]);

contextBridge.exposeInMainWorld('studio', {
  getInfo: () => ipcRenderer.invoke('app:info'),
  closeResult: (allow) => ipcRenderer.invoke('app:closeResult', Boolean(allow)),
  quit: () => ipcRenderer.invoke('app:quit'),
  setTitle: (title) => ipcRenderer.invoke('app:title', title || ''),
  openFolder: (title) => ipcRenderer.invoke('dialog:folder', title || ''),
  openFileDialog: () => ipcRenderer.invoke('dialog:file'),
  saveDialog: (options) => ipcRenderer.invoke('dialog:save', options || {}),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch || {}),
  workspaceLoad: (root) => ipcRenderer.invoke('workspace:load', root),
  workspaceSave: (root, data) => ipcRenderer.invoke('workspace:save', { root, data }),
  remember: (project) => ipcRenderer.invoke('project:remember', project),
  unwatch: () => ipcRenderer.invoke('project:unwatch'),
  listDir: (dir) => ipcRenderer.invoke('fs:list', dir),
  readFile: (file, force) => ipcRenderer.invoke('fs:read', { file, force: Boolean(force) }),
  writeFile: (file, content) => ipcRenderer.invoke('fs:write', { file, content }),
  createEntry: (parent, name, kind) => ipcRenderer.invoke('fs:create', { parent, name, kind }),
  renamePath: (from, to) => ipcRenderer.invoke('fs:rename', { from, to }),
  removePath: (file) => ipcRenderer.invoke('fs:remove', file),
  search: (payload) => ipcRenderer.invoke('fs:search', payload),
  quickList: (root) => ipcRenderer.invoke('fs:quickList', root),
  symbols: (root) => ipcRenderer.invoke('fs:symbols', root),
  gitInfo: (root) => ipcRenderer.invoke('git:info', root),
  npmScripts: (root) => ipcRenderer.invoke('npm:scripts', root),
  createProject: (parent, name) => ipcRenderer.invoke('project:create', { parent, name }),
  reveal: (file) => ipcRenderer.invoke('shell:reveal', file),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  run: (payload) => ipcRenderer.invoke('retro:run', payload || {}),
  check: (payload) => ipcRenderer.invoke('retro:check', payload || {}),
  runStart: (payload) => ipcRenderer.invoke('run:start', payload),
  runWrite: (data) => ipcRenderer.invoke('run:write', data),
  runResize: (cols, rows) => ipcRenderer.invoke('run:resize', { cols, rows }),
  runStop: () => ipcRenderer.invoke('run:stop'),
  termCreate: (options) => ipcRenderer.invoke('term:create', options || {}),
  termWrite: (id, data) => ipcRenderer.invoke('term:write', { id, data }),
  termResize: (id, cols, rows) => ipcRenderer.invoke('term:resize', { id, cols, rows }),
  termKill: (id) => ipcRenderer.invoke('term:kill', id),
  setChromeTheme: (theme) => ipcRenderer.invoke('window:theme', theme || 'black'),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  on: (channel, callback) => {
    if (!channels.has(channel)) throw new Error(`blocked channel ${channel}`);
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  smokeReady: () => ipcRenderer.send('smoke:ready'),
  smokeFail: (message) => ipcRenderer.send('smoke:fail', String(message || 'smoke failed')),
});
