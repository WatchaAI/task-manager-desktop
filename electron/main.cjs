const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { createTaskStore } = require('./taskStore.cjs');
const { registerTaskHandlers } = require('./taskIpc.cjs');
const { createTaskDatabaseWatcher } = require('./taskDatabaseWatcher.cjs');
const { createMacCalendarSync } = require('./macCalendar.cjs');

let mainWindow;
let store;
let dbWatcher;

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
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[renderer:load-failed] ${errorCode} ${errorDescription} ${validatedURL}`);
    });
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('[renderer:loaded] http://127.0.0.1:5173');
    });
    mainWindow.loadURL('http://127.0.0.1:5173').catch((error) => {
      console.error('[renderer:loadURL-failed]', error);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function notifyTasksChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (isDev()) {
    console.log('[tasks:changed] reloading board data');
  }
  mainWindow.webContents.send('tasks:changed');
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'tasks.sqlite');
  store = createTaskStore(dbPath);
  registerTaskHandlers(ipcMain, store, {
    openExternal: (url) => shell.openExternal(url),
    syncTaskToCalendar: createMacCalendarSync()
  });
  createWindow();
  dbWatcher = createTaskDatabaseWatcher(dbPath, notifyTasksChanged);

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
  if (dbWatcher) {
    dbWatcher.close();
  }
  if (store) {
    store.close();
  }
});
