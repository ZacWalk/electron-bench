const { ipcRenderer } = require('electron')

// console.log(ipcRenderer.sendSync('synchronous-message', 'ping')) // prints "pong"

// ipcRenderer.on('asynchronous-reply', (event, arg) => {
//   console.log(arg) // prints "pong"
// })

// ipcRenderer.send('asynchronous-message', 'ping')

let webContentsId = ipcRenderer.sendSync('get-id', 'main')


ipcRenderer.on('synchronous-message', (event, arg) => {  
  event.returnValue = arg
})

ipcRenderer.on('asynchronous-message', (event, arg) => {  
  event.sender.send('asynchronous-reply', arg)
})

ipcRenderer.on('asynchronous-message-send-to', (event, arg) => {  
  event.sender.sendTo(webContentsId, 'asynchronous-reply', arg)
})