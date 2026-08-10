// Runs in the page main world of a sandboxed renderer, so every call crosses the contextBridge.
window.benchIpc.onRun(async (request) => {
  const result = await globalThis.__benchRunInvokeLoop(window.benchIpc, request)
  window.benchIpc.report(result)
})

window.benchIpc.ready()
