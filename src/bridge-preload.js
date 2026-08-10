// Sandboxed preload: only the contextBridge surface is visible to the page.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('benchIpc', {
  invoke: (key, payload) => ipcRenderer.invoke('invoke-message', key, payload),
  onRun: (callback) => ipcRenderer.on('bench-window:run', (_event, request) => callback(request)),
  report: (result) => ipcRenderer.send('bench-window:result', result),
  ready: () => ipcRenderer.send('bench-window:ready'),
})
