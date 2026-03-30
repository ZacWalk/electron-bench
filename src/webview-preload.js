const { ipcRenderer } = require('electron')

ipcRenderer.on('asynchronous-message', (_event, arg) => {
  ipcRenderer.sendToHost('asynchronous-reply', arg)
})