// Runs in the page main world of a sandboxed renderer, so every call crosses the contextBridge.
globalThis.registerInvokeLoop(window.benchIpc)
