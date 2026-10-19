const { contextBridge, ipcRenderer, webUtils } = require('electron');

const channels = new Set([
  'menu:command',
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
  listDir: (dir) => ipcRenderer.invoke('fs:list', dir),
  readFile: (file) => ipcRenderer.invoke('fs:read', file),
  writeFile: (file, content) => ipcRenderer.invoke('fs:write', { file, content }),
  search: (payload) => ipcRenderer.invoke('fs:search', payload || {}),
  reveal: (file) => ipcRenderer.invoke('shell:reveal', file),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  run: (payload) => ipcRenderer.invoke('retro:run', payload || {}),
  check: (payload) => ipcRenderer.invoke('retro:check', payload || {}),
  termLine: (payload) => ipcRenderer.invoke('term:line', payload || {}),
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
