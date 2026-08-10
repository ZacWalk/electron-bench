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
    const data = portEvent.data

    // Echo transferables back by transfer, otherwise the reply leg would be a copy.
    if (data && data.transfer && data.payload instanceof ArrayBuffer) {
      backgroundPort.postMessage(data, [data.payload])
      return
    }

    backgroundPort.postMessage(data)
  }
  backgroundPort.start()
})
