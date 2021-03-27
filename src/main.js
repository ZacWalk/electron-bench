// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const url = require('url')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let backgroundWindow

function createWindows() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    title: 'Electron Benchmark!',
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  backgroundWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    }
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
app.on('ready', createWindows)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  app.quit()
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

ipcMain.on('asynchronous-message', (event, ...args) => {
  event.sender.send('asynchronous-reply', ...args)
})

ipcMain.on('asynchronous-reply', (event, ...args) => {
  mainWindow.webContents.send('asynchronous-reply', ...args)
})

ipcMain.on('asynchronous-message-proxy', (event, ...args) => {
  backgroundWindow.webContents.send('asynchronous-message', ...args)
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
