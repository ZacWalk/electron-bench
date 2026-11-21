// Sandboxed preload: only the contextBridge surface is visible to the page.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('benchIpc', {
  invoke: (key, payload) => ipcRenderer.invoke('invoke-message', key, payload),
  onRun: (callback) => { ipcRenderer.on('bench-window:run', (_event, request) => callback(request)) },
  onCancel: (callback) => { ipcRenderer.on('bench-window:cancel', (_event, id) => callback(id)) },
  report: (result) => ipcRenderer.send('bench-window:result', result),
})
