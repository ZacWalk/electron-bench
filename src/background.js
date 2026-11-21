const { ipcRenderer } = require('electron')

let backgroundPort

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
  backgroundPort.postMessage({ ready: true })
})
