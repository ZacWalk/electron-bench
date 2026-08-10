// Utility process echo worker: the modern replacement for a hidden background window.
let benchPort

process.parentPort.on('message', (event) => {
  const [port] = event.ports

  if (!port) {
    return
  }

  if (benchPort) {
    benchPort.close()
  }

  benchPort = port
  benchPort.on('message', (portEvent) => {
    benchPort.postMessage(portEvent.data)
  })
  benchPort.start()

  process.parentPort.postMessage({ type: 'port-ready' })
})

// 'spawn' only means the process exists; this says the script is loaded and listening.
process.parentPort.postMessage({ type: 'ready' })
