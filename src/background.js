const { ipcRenderer } = require('electron')

let backgroundPort

// console.log(ipcRenderer.sendSync('synchronous-message', 'ping')) // prints "pong"

// ipcRenderer.on('asynchronous-reply', (event, arg) => {
//   console.log(arg) // prints "pong"
// })

// ipcRenderer.send('asynchronous-message', 'ping')

ipcRenderer.on('asynchronous-message', (event, ...args) => {
  ipcRenderer.send('asynchronous-reply', ...args)
})

ipcRenderer.on('asynchronous-message-send-to', (event, ...args) => {
  ipcRenderer.send('asynchronous-reply', ...args)
})

ipcRenderer.on('background-port', (event) => {
  if (backgroundPort) {
    backgroundPort.close()
  }

  backgroundPort = event.ports[0]
  backgroundPort.onmessage = (portEvent) => {
    backgroundPort.postMessage(portEvent.data)
  }
  backgroundPort.start()
})
