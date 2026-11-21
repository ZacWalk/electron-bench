// Control for the bridge comparison: same loop, but running in an unsandboxed
// preload that talks to ipcRenderer directly instead of through contextBridge.
const { ipcRenderer } = require('electron')
const { registerInvokeLoop } = require('./bench-loop')

registerInvokeLoop({
  invoke: (key, payload) => ipcRenderer.invoke('invoke-message', key, payload),
  onRun: (callback) => ipcRenderer.on('bench-window:run', (_event, request) => callback(request)),
  onCancel: (callback) => ipcRenderer.on('bench-window:cancel', (_event, id) => callback(id)),
  report: (result) => ipcRenderer.send('bench-window:result', result),
})
