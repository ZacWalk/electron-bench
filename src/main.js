// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, MessageChannelMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let backgroundWindow

const rendererPreload = path.join(__dirname, 'preload.js')
const backgroundPreload = path.join(__dirname, 'background-preload.js')
const webviewPreload = path.join(__dirname, 'webview-preload.js')

function parseAutomationConfig(argv) {
  let outputPath = null

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--bench-output') {
      outputPath = argv[index + 1] || null
      index += 1
      continue
    }

    if (argument.startsWith('--bench-output=')) {
      outputPath = argument.slice('--bench-output='.length)
    }
  }

  return {
    enabled: Boolean(outputPath),
    outputPath: outputPath ? path.resolve(outputPath) : null,
  }
}

const automationConfig = parseAutomationConfig(process.argv)

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

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.preload = webviewPreload
    webPreferences.contextIsolation = true
    webPreferences.nodeIntegration = false
    webPreferences.sandbox = false
  })

  // and load the index.html of the app.
  mainWindow.loadFile('src/render.html')
  backgroundWindow.loadFile('src/background.html')

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
  })

  backgroundWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    backgroundWindow = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindows)

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

  const { port1, port2 } = new MessageChannelMain()
  backgroundWindow.webContents.postMessage('background-port', null, [port1])
  event.senderFrame.postMessage('background-port', null, [port2])
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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
