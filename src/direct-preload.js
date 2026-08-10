// Control for the bridge comparison: same loop, but running in an unsandboxed
// preload that talks to ipcRenderer directly instead of through contextBridge.
const { ipcRenderer } = require('electron')
const { runInvokeLoop } = require('./bench-loop')

const api = {
  invoke: (key, payload) => ipcRenderer.invoke('invoke-message', key, payload),
}

ipcRenderer.on('bench-window:run', async (_event, request) => {
  const result = await runInvokeLoop(api, request)
  ipcRenderer.send('bench-window:result', result)
})

ipcRenderer.send('bench-window:ready')
