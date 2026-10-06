const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  setLanguage: (language) => ipcRenderer.send('app:language', language),
  updateStatus: () => ipcRenderer.invoke('updates:status'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateState: (cb) => ipcRenderer.on('updates:state', (_e, state) => cb(state)),
  loadPdfiumWasm: () => ipcRenderer.invoke('pdfium:wasm'),
  appVersion: () => ipcRenderer.invoke('app:version'),
  openExternal: (url) => ipcRenderer.invoke('support:open', url),
  setDocumentEdited: (edited) => ipcRenderer.send('document:edited', edited),
  confirmLeave: () => ipcRenderer.invoke('document:confirm-leave'),
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  imageDialog: () => ipcRenderer.invoke('dialog:image'),
  readFile: (file) => ipcRenderer.invoke('file:read', file),
  saveDialog: (defaultPath, bytes, sourcePath) => ipcRenderer.invoke('dialog:save', defaultPath, bytes, sourcePath),
  writeFile: (file, bytes) => ipcRenderer.invoke('file:write', file, bytes),
  loadFont: (family,style) => ipcRenderer.invoke('font:load', family,style),
  pathInfo: (file) => ipcRenderer.invoke('path:info', file),
  pathForFile: (f) => webUtils.getPathForFile(f),
  onOpenFile: (cb) => ipcRenderer.on('open-file', (_e, file) => cb(file))
});
