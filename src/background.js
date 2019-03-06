const { ipcRenderer } = require('electron')

// console.log(ipcRenderer.sendSync('synchronous-message', 'ping')) // prints "pong"

// ipcRenderer.on('asynchronous-reply', (event, arg) => {
//   console.log(arg) // prints "pong"
// })

// ipcRenderer.send('asynchronous-message', 'ping')

let webContentsId = ipcRenderer.sendSync('get-id', 'main')

ipcRenderer.on('asynchronous-message', (event, ...args) => {
  event.sender.send('asynchronous-reply', ...args)
})

ipcRenderer.on('asynchronous-message-send-to', (event, ...args) => {
  event.sender.sendTo(webContentsId, 'asynchronous-reply', ...args)
})
