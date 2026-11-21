const { app, BrowserWindow, ipcMain, MessageChannelMain, utilityProcess } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { performance, monitorEventLoopDelay } = require('node:perf_hooks')
const { parseAutomationConfig } = require('./automation-config')
const { validate } = require('../scripts/validate-results')

let automationConfig
try {
  automationConfig = parseAutomationConfig(process.argv)
} catch (error) {
  console.error(error.message)
  app.exit(1)
}

if (automationConfig) {
  if (automationConfig.enabled) {
    const watchdog = setTimeout(() => {
      console.error(`Automated benchmark run exceeded ${automationConfig.timeoutMs} ms.`)
      app.exit(1)
    }, automationConfig.timeoutMs)
    watchdog.unref()
  }
  startApp()
}

function startApp() {
  let mainWindow
  let background
  let worker
  let probe
  const targets = new Map()
  const remoteRuns = new Map()
  const portRequests = new Set()

  function createWindow(page, preload, options = {}) {
    const window = new BrowserWindow({
      show: false,
      ...options,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        sandbox: page === 'bridge',
        preload: path.join(__dirname, preload),
      },
    })
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const loaded = window.loadFile(path.join(__dirname, `${page}.html`))
    loaded.catch((error) => console.error(`Could not load ${page}:`, error.message))
    return { window, loaded }
  }

  function getBackground() {
    if (!background || background.window.isDestroyed() || background.window.webContents.isCrashed()) {
      if (background && !background.window.isDestroyed()) background.window.destroy()
      background = createWindow('background', 'background-preload.js')
    }
    return background
  }

  function getTarget(name) {
    const existing = targets.get(name)
    if (existing && !existing.window.isDestroyed() && !existing.window.webContents.isCrashed()) return existing
    if (existing && !existing.window.isDestroyed()) existing.window.destroy()
    // A completed load ensures the hidden page and its preload installed their IPC listeners.
    const target = createWindow(name, `${name}-preload.js`)
    targets.set(name, target)
    return target
  }

  function getWorker() {
    if (!worker) {
      const child = utilityProcess.fork(path.join(__dirname, 'utility-worker.js'))
      const ready = new Promise((resolve, reject) => {
        const onMessage = (message) => {
          if (message?.type === 'ready') {
            child.off('message', onMessage)
            clearTimeout(timer)
            resolve()
          }
        }
        const timer = setTimeout(() => {
          if (worker?.child === child) worker = null
          child.kill()
          reject(new Error('Utility process did not start in time.'))
        }, 10000)
        child.on('message', onMessage)
        child.once('exit', (code) => {
          child.off('message', onMessage)
          clearTimeout(timer)
          if (worker?.child === child) worker = null
          reject(new Error(`Utility process exited with code ${code}.`))
        })
      })
      worker = { child, ready }
    }
    return worker
  }

  function openApp() {
    const { window, loaded } = createWindow('render', 'preload.js', {
      title: 'Electron IPC Benchmark',
      width: 1220,
      height: 900,
    })
    mainWindow = window
    getBackground()
    getTarget('bridge')
    getTarget('direct')
    getWorker().ready.catch((error) => console.error(error.message))
    loaded.then(() => {
      if (!automationConfig.enabled && !window.isDestroyed()) window.show()
    }, () => app.exit(1))
    window.on('closed', () => {
      mainWindow = null
      portRequests.clear()
      endProbe()
      if (background && !background.window.isDestroyed()) background.window.destroy()
      background = null
      for (const target of targets.values()) {
        if (!target.window.isDestroyed()) target.window.destroy()
      }
      targets.clear()
      worker?.child.kill()
      worker = null
    })
  }

  const isMain = (event) => mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents
    && event.senderFrame === event.sender.mainFrame
  function handleMain(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
      if (!isMain(event)) throw new Error(`Unexpected sender for ${channel}.`)
      return handler(event, ...args)
    })
  }

  function endProbe() {
    if (!probe) return null
    const { histogram, cpuStart, wallStart } = probe
    probe = null
    histogram.disable()
    const { user, system } = process.cpuUsage(cpuStart)
    return {
      cpuMs: (user + system) / 1000,
      wallMs: Math.round(performance.now() - wallStart),
      loopDelayMinMs: histogram.count ? histogram.min / 1e6 : null,
      loopDelayMaxMs: histogram.count ? histogram.max / 1e6 : null,
    }
  }

  handleMain('mainloop:begin', () => {
    endProbe()
    const histogram = monitorEventLoopDelay({ resolution: 1 })
    histogram.enable()
    probe = { histogram, cpuStart: process.cpuUsage(), wallStart: performance.now() }
  })
  handleMain('mainloop:end', endProbe)

  ipcMain.on('synchronous-message', (event, ...args) => {
    event.returnValue = isMain(event) ? args : null
  })
  ipcMain.handle('invoke-message', (event, ...args) => {
    if (!isMain(event)) {
      const isTarget = [...targets.values()].some(({ window }) => !window.isDestroyed() && event.sender === window.webContents)
      if (!isTarget) throw new Error('Unexpected sender for invoke-message.')
    }
    return args
  })
  ipcMain.on('asynchronous-message', (event, ...args) => {
    if (isMain(event)) event.reply('asynchronous-reply', ...args)
  })
  handleMain('background:ready', () => getBackground().loaded)
  for (const [channel, replyChannel] of [
    ['asynchronous-message-proxy', 'asynchronous-message'],
    ['asynchronous-message-send-to', 'asynchronous-message-send-to'],
  ]) {
    ipcMain.on(channel, (event, ...args) => {
      if (isMain(event) && background && !background.window.isDestroyed() && !background.window.webContents.isCrashed()) {
        background.window.webContents.send(replyChannel, ...args)
      }
    })
  }
  ipcMain.on('asynchronous-reply', (event, ...args) => {
    if (background && !background.window.isDestroyed() && event.sender === background.window.webContents &&
        mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('asynchronous-reply', ...args)
    }
  })

  for (const kind of ['background', 'utility']) {
    const channel = `${kind}-port`
    ipcMain.on(`request-${channel}`, async (event, id) => {
      if (!isMain(event)) return
      const sender = event.sender
      portRequests.add(id)
      try {
        const target = kind === 'background' ? getBackground() : getWorker()
        await (target.loaded || target.ready)
        if (!portRequests.has(id) || sender.isDestroyed()) return
        const { port1, port2 } = new MessageChannelMain()
        try {
          if (target.window) target.window.webContents.postMessage(channel, null, [port1])
          else target.child.postMessage({ type: 'bench-port' }, [port1])
          sender.postMessage(channel, id, [port2])
        } catch (error) {
          port1.close()
          port2.close()
          throw error
        }
      } catch (error) {
        if (portRequests.has(id) && !sender.isDestroyed()) {
          // Keep the request ID and error together in the response body.
          sender.send(channel, id, error.message)
        }
      } finally {
        portRequests.delete(id)
      }
    })
  }
  ipcMain.on('cancel-port-request', (event, id) => {
    if (isMain(event)) portRequests.delete(id)
  })

  handleMain('bench-window:run', (_event, request) => {
    if (!['bridge', 'direct'].includes(request.target)) throw new Error('Unknown benchmark window.')
    const { window, loaded } = getTarget(request.target)
    const contents = window.webContents
    if ([...remoteRuns.values()].some((run) => run.contents === contents)) {
      throw new Error('Benchmark window is already running.')
    }
    return new Promise((resolve, reject) => {
      let sent = false
      let cancelTimer
      const settle = (result, error) => {
        if (!remoteRuns.delete(request.id)) return
        clearTimeout(cancelTimer)
        contents.removeListener('render-process-gone', onGone)
        contents.removeListener('destroyed', onGone)
        if (error) reject(new Error(error))
        else resolve(result)
      }
      const onGone = () => settle(null, 'Benchmark window closed unexpectedly.')
      remoteRuns.set(request.id, {
        contents,
        settle,
        cancel() {
          if (!sent) {
            settle({ cancelled: true })
          } else {
            contents.send('bench-window:cancel', request.id)
            cancelTimer = setTimeout(() => {
              settle(null, 'Benchmark window did not acknowledge cancellation.')
              if (!window.isDestroyed()) window.destroy()
            }, 2000)
          }
        },
      })
      contents.once('render-process-gone', onGone)
      contents.once('destroyed', onGone)
      loaded.then(() => {
        if (!remoteRuns.has(request.id)) return
        contents.send('bench-window:run', request)
        sent = true
      }).catch((error) => settle(null, error.message))
    })
  })
  ipcMain.on('bench-window:cancel', (event, id) => {
    if (isMain(event)) remoteRuns.get(id)?.cancel()
  })
  ipcMain.on('bench-window:result', (event, result) => {
    const pending = remoteRuns.get(result?.id)
    if (pending?.contents === event.sender) pending.settle(result, result.error)
  })

  handleMain('automation:get-config', () => ({
    ...automationConfig,
    chromiumSandboxDisabled: app.commandLine.hasSwitch('no-sandbox'),
  }))
  handleMain('automation:complete', async (_event, results) => {
    if (!automationConfig.enabled) throw new Error('Automation is not enabled.')
    const { outputPath } = automationConfig
    const errors = validate(results)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`)
    if (errors.length) console.error(`Benchmark results saved to ${outputPath}; validation failed:\n${errors.join('\n')}`)
    else console.log(`Benchmark results saved to ${outputPath}.`)
    app.exit(errors.length ? 1 : 0)
  })
  handleMain('automation:fail', (_event, message) => {
    console.error('Automated benchmark run failed:', message)
    if (automationConfig.enabled) app.exit(1)
  })

  app.whenReady().then(openApp).catch((error) => {
    console.error('Could not start Electron IPC Benchmark:', error)
    app.exit(1)
  })
  app.on('activate', () => {
    if (!mainWindow && !automationConfig.enabled) openApp()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  if (automationConfig.enabled) {
    app.on('render-process-gone', (_event, _contents, details) => {
      console.error('Renderer process gone during automated run:', details.reason)
      app.exit(1)
    })
  }
}
