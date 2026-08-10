// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, MessageChannelMain, utilityProcess } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { monitorEventLoopDelay } = require('node:perf_hooks')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let backgroundWindow
let bridgeWindow
let directWindow

const rendererPreload = path.join(__dirname, 'preload.js')
const backgroundPreload = path.join(__dirname, 'background-preload.js')
const webviewPreload = path.join(__dirname, 'webview-preload.js')
const bridgePreload = path.join(__dirname, 'bridge-preload.js')
const directPreload = path.join(__dirname, 'direct-preload.js')

const DEFAULT_AUTOMATION_TIMEOUT_MS = 10 * 60 * 1000
const MAIN_LOOP_PROBE_RESOLUTION_MS = 1
const BENCH_WINDOW_TIMEOUT_MS = 5 * 60 * 1000

function parseCounts(value) {
  const counts = String(value || '')
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((count) => Number.isFinite(count) && count > 0)

  return counts.length > 0 ? counts : null
}

function parseAutomationConfig(argv) {
  let outputPath = null
  let counts = null
  let timeoutMs = DEFAULT_AUTOMATION_TIMEOUT_MS

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--bench-output') {
      outputPath = argv[index + 1] || null
      index += 1
      continue
    }

    if (argument.startsWith('--bench-output=')) {
      outputPath = argument.slice('--bench-output='.length)
      continue
    }

    if (argument === '--bench-counts') {
      counts = parseCounts(argv[index + 1])
      index += 1
      continue
    }

    if (argument.startsWith('--bench-counts=')) {
      counts = parseCounts(argument.slice('--bench-counts='.length))
      continue
    }

    if (argument.startsWith('--bench-timeout=')) {
      const parsed = Number.parseInt(argument.slice('--bench-timeout='.length), 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        timeoutMs = parsed
      }
    }
  }

  return {
    enabled: Boolean(outputPath),
    outputPath: outputPath ? path.resolve(outputPath) : null,
    counts,
    timeoutMs,
  }
}

const automationConfig = parseAutomationConfig(process.argv)

if (automationConfig.enabled) {
  // Guarantees a non-zero exit instead of a hung CI job if the run stalls.
  const watchdog = setTimeout(() => {
    console.error(`Automated benchmark run exceeded ${automationConfig.timeoutMs} ms.`)
    app.exit(1)
  }, automationConfig.timeoutMs)
  watchdog.unref()
}

async function writeAutomationResults(results) {
  if (!automationConfig.outputPath) {
    return null
  }

  await fs.mkdir(path.dirname(automationConfig.outputPath), { recursive: true })
  await fs.writeFile(automationConfig.outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8')
  return automationConfig.outputPath
}

function exitAfterReply(code) {
  setTimeout(() => {
    app.exit(code)
  }, 0)
}

function createWindows() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    title: 'Electron Benchmark!',
    show: !automationConfig.enabled,
    width: 1400,
    height: 900,
    webPreferences: {
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: rendererPreload
    }
  })

  backgroundWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: backgroundPreload,
    }
  })

  // The pair below exists only to price the contextBridge hop: same loop, same
  // channel, the only difference is the sandbox and bridge configuration.
  bridgeWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: bridgePreload,
    }
  })

  directWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: directPreload,
    }
  })

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.preload = webviewPreload
    webPreferences.contextIsolation = true
    webPreferences.nodeIntegration = false
    webPreferences.sandbox = false
  })

  // and load the index.html of the app.
  mainWindow.loadFile('src/render.html')
  backgroundWindow.loadFile('src/background.html')
  bridgeWindow.loadFile('src/bridge.html')
  directWindow.loadFile('src/direct.html')

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null

    if (backgroundWindow) {
      backgroundWindow.close()
    }

    if (bridgeWindow) {
      bridgeWindow.close()
    }

    if (directWindow) {
      directWindow.close()
    }

    stopUtilityProcess()
  })

  backgroundWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    backgroundWindow = null
  })

  bridgeWindow.on('closed', function () {
    bridgeWindow = null
  })

  directWindow.on('closed', function () {
    directWindow = null
  })
}

let mainLoopHistogram = null
let mainCpuStart = null
let mainWallStart = 0

function startMainLoopProbe() {
  stopMainLoopProbe()
  mainLoopHistogram = monitorEventLoopDelay({ resolution: MAIN_LOOP_PROBE_RESOLUTION_MS })
  mainLoopHistogram.enable()
  mainCpuStart = process.cpuUsage()
  mainWallStart = Date.now()
}

function stopMainLoopProbe() {
  if (!mainLoopHistogram) {
    return null
  }

  const histogram = mainLoopHistogram
  const cpuStart = mainCpuStart
  const wallStart = mainWallStart
  mainLoopHistogram = null
  mainCpuStart = null
  histogram.disable()

  const cpu = process.cpuUsage(cpuStart)
  const wallMs = Date.now() - wallStart
  const round = (value) => Math.round(value * 1000) / 1000
  const toMs = (nanoseconds) => round(nanoseconds / 1e6)

  return {
    // CPU burned in the main process while the scenario ran. No timer floor, so this
    // is the number that actually separates routes that use main from ones that skip it.
    cpuMs: round((cpu.user + cpu.system) / 1000),
    wallMs,
    // Secondary: worst single stall. Has a platform-dependent idle floor (~16 ms on
    // Windows) because a sleeping loop only wakes on the OS timer tick.
    loopDelayMaxMs: Number.isFinite(histogram.max) ? toMs(histogram.max) : null,
    loopDelayMinMs: Number.isFinite(histogram.min) ? toMs(histogram.min) : null,
  }
}

let utilityProcessReady = null

function ensureUtilityProcess() {
  if (utilityProcessReady) {
    return utilityProcessReady
  }

  utilityProcessReady = new Promise((resolve, reject) => {
    const child = utilityProcess.fork(path.join(__dirname, 'utility-worker.js'))

    // Waiting for 'spawn' is not enough: the worker script has not loaded yet, and
    // messages posted before it attaches its listener queue up and skew the first run.
    child.on('message', (message) => {
      if (message && message.type === 'ready') {
        resolve(child)
      }
    })

    child.once('exit', (code) => {
      utilityProcessReady = null
      reject(new Error(`Utility process exited with code ${code}.`))
    })
  })

  return utilityProcessReady
}

function stopUtilityProcess() {
  if (!utilityProcessReady) {
    return
  }

  const pending = utilityProcessReady
  utilityProcessReady = null
  pending.then((child) => child.kill(), () => {})
}

const benchWindowReadyResolvers = new Map()
const benchWindowReady = new Set()

/** @param {BrowserWindow | null} window */
function whenBenchWindowReady(window) {
  if (!window) {
    return Promise.reject(new Error('Benchmark window is not available.'))
  }

  const id = window.webContents.id

  if (benchWindowReady.has(id)) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const waiters = benchWindowReadyResolvers.get(id) || []
    waiters.push(resolve)
    benchWindowReadyResolvers.set(id, waiters)
  })
}

const benchWindowResultResolvers = new Map()

/** @param {BrowserWindow | null} window @param {object} request */
async function runInBenchWindow(window, request) {
  if (!window) {
    throw new Error('Benchmark window is not available.')
  }

  await whenBenchWindowReady(window)

  const id = window.webContents.id

  if (benchWindowResultResolvers.has(id)) {
    throw new Error('Benchmark window is already running a loop.')
  }

  return new Promise((resolve, reject) => {
    // Without these the promise could never settle, and the map entry would block every later run.
    const settle = (callback, value) => {
      clearTimeout(timer)
      window.webContents.off('render-process-gone', onGone)
      benchWindowResultResolvers.delete(id)
      callback(value)
    }

    const onGone = (_event, details) => {
      settle(reject, new Error(`Benchmark window crashed: ${details.reason}`))
    }

    const timer = setTimeout(() => {
      settle(reject, new Error('Benchmark window did not report a result in time.'))
    }, BENCH_WINDOW_TIMEOUT_MS)

    benchWindowResultResolvers.set(id, {
      resolve: (value) => settle(resolve, value),
      reject: (error) => settle(reject, error),
    })

    window.webContents.once('render-process-gone', onGone)
    window.webContents.send('bench-window:run', request)
  })
}

ipcMain.on('bench-window:ready', (event) => {
  const id = event.sender.id
  benchWindowReady.add(id)

  const waiters = benchWindowReadyResolvers.get(id) || []
  benchWindowReadyResolvers.delete(id)
  waiters.forEach((resolve) => resolve())
})

ipcMain.on('bench-window:result', (event, result) => {
  const pending = benchWindowResultResolvers.get(event.sender.id)

  if (!pending) {
    return
  }

  benchWindowResultResolvers.delete(event.sender.id)
  pending.resolve(result)
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindows()
  // Pay the utility process cold start before any scenario runs.
  ensureUtilityProcess().catch(() => {})
})

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindows()
  }
})

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.on('get-id', (event, arg) => {
  if ('background' === arg) {
    event.returnValue = backgroundWindow.webContents.id
  }
  else if ('main' === arg) {
    event.returnValue = mainWindow.webContents.id
  }
  else
  {
    event.returnValue = 0;
  }
})

ipcMain.on('synchronous-message', (event, ...args) => {
  event.returnValue = args
})

ipcMain.handle('invoke-message', async (_event, ...args) => args)

ipcMain.on('asynchronous-message', (event, ...args) => {
  event.sender.send('asynchronous-reply', ...args)
})

ipcMain.on('asynchronous-reply', (event, ...args) => {
  mainWindow.webContents.send('asynchronous-reply', ...args)
})

ipcMain.on('asynchronous-message-proxy', (event, ...args) => {
  backgroundWindow.webContents.send('asynchronous-message', ...args)
})

ipcMain.on('asynchronous-message-send-to', (event, ...args) => {
  backgroundWindow.webContents.send('asynchronous-message-send-to', ...args)
})

ipcMain.on('request-background-port', (event) => {
  if (!backgroundWindow || backgroundWindow.webContents.isLoading()) {
    event.sender.send('background-port-error', 'Background renderer is not ready yet.')
    return
  }

  // Since Electron 33 senderFrame can be null when the sending frame is detached.
  const senderFrame = event.senderFrame
  if (!senderFrame) {
    event.sender.send('background-port-error', 'Requesting frame is no longer available.')
    return
  }

  const { port1, port2 } = new MessageChannelMain()
  backgroundWindow.webContents.postMessage('background-port', null, [port1])
  senderFrame.postMessage('background-port', null, [port2])
})

ipcMain.on('request-utility-port', async (event) => {
  // event.sender stays valid across the await; event.senderFrame would not.
  const sender = event.sender

  try {
    const child = await ensureUtilityProcess()
    const { port1, port2 } = new MessageChannelMain()

    const attached = new Promise((resolve) => {
      const onMessage = (message) => {
        if (message && message.type === 'port-ready') {
          child.off('message', onMessage)
          resolve()
        }
      }
      child.on('message', onMessage)
    })

    child.postMessage({ type: 'bench-port' }, [port1])
    await attached

    sender.postMessage('utility-port', null, [port2])
  } catch (error) {
    sender.send('utility-port-error', error instanceof Error ? error.message : String(error))
  }
})

ipcMain.handle('mainloop:begin', () => {
  startMainLoopProbe()
  return true
})

ipcMain.handle('mainloop:end', () => stopMainLoopProbe())

ipcMain.handle('bench-window:run', async (_event, request) => {
  const target = request && request.target === 'bridge' ? bridgeWindow : directWindow
  return runInBenchWindow(target, request)
})

ipcMain.handle('automation:get-config', () => automationConfig)

ipcMain.handle('automation:complete', async (_event, results) => {
  const writtenPath = await writeAutomationResults(results)
  exitAfterReply(0)
  return { writtenPath }
})

ipcMain.handle('automation:fail', async (_event, error) => {
  console.error('Automated benchmark run failed.', error)
  exitAfterReply(1)
  return { ok: false }
})

if (automationConfig.enabled) {
  app.on('render-process-gone', (_event, _webContents, details) => {
    console.error('Renderer process gone during automated run.', details)
    app.exit(1)
  })
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
