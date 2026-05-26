const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { createTaskStore } = require('./taskStore.cjs');
const { registerTaskHandlers } = require('./taskIpc.cjs');

let mainWindow;
let store;

function isDev() {
  return !app.isPackaged;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'Task Manager',
    backgroundColor: '#f7f8fb',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev()) {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'tasks.sqlite');
  store = createTaskStore(dbPath);
  registerTaskHandlers(ipcMain, store);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (store) {
    store.close();
  }
});
