const numTests = [100, 1000, 10000]

const scenarioDefinitions = [
  {
    key: 'sync_to_main',
    title: 'Synchronous to main',
    api: 'ipcRenderer.sendSync',
    commentary: 'Lowest raw latency, but it blocks the main process while each message is handled.',
  },
  {
    key: 'async_to_main',
    title: 'Asynchronous to main',
    api: 'ipcRenderer.send',
    commentary: 'A strong default when you already have a reply channel and want low async overhead.',
  },
  {
    key: 'async_invoke_to_main',
    title: 'Request-response to main',
    api: 'ipcRenderer.invoke',
    commentary: 'The ergonomics are good, but the promise-based invoke path typically costs more than send plus a reply event.',
  },
  {
    key: 'async_to_other_renderer',
    title: 'Async to other renderer via main relay',
    api: 'ipcRenderer.send via main relay',
    commentary: 'This is the most expensive cross-renderer route here because every round trip crosses the main process twice.',
  },
  {
    key: 'async_send_to_other_renderer',
    title: 'Async to other renderer via main-routed relay API',
    api: 'Main-routed relay API',
    commentary: 'Still a cross-process hop, so it should be measured against the older relay route in your actual workload rather than assumed to be faster.',
  },
  {
    key: 'async_message_port_to_other_renderer',
    title: 'Direct channel to other renderer',
    api: 'MessagePort',
    commentary: 'Best fit for sustained renderer-to-renderer traffic because setup is separate from the high-volume message loop.',
  },
  {
    key: 'async_to_iframe',
    title: 'Async to iframe',
    api: 'iframe.contentWindow.postMessage',
    commentary: 'Very efficient when communication can stay inside the same renderer process.',
  },
]

module.exports = {
  numTests,
  scenarioDefinitions,
}