const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { createTaskStore } = require('./taskStore.cjs');
const { registerTaskHandlers } = require('./taskIpc.cjs');
const { registerLoginItemHandlers } = require('./loginItemIpc.cjs');
const { createCloudSync } = require('./cloudSync.cjs');
const { registerCloudSyncHandlers } = require('./cloudSyncIpc.cjs');
const { createTaskDatabaseWatcher } = require('./taskDatabaseWatcher.cjs');
const { createMacCalendarDelete, createMacCalendarSync } = require('./macCalendar.cjs');

let mainWindow;
let store;
let dbWatcher;
let cloudSync;

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

function notifyCloudSyncStateChanged(state) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('cloudSync:stateChanged', state);
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'tasks.sqlite');
  store = createTaskStore(dbPath);
  registerTaskHandlers(ipcMain, store, {
    openExternal: (url) => shell.openExternal(url),
    syncTaskToCalendar: createMacCalendarSync(),
    deleteTaskFromCalendar: createMacCalendarDelete()
  });
  registerLoginItemHandlers(ipcMain, app);
  cloudSync = createCloudSync({
    store,
    userDataPath: app.getPath('userData'),
    onDataChanged: notifyTasksChanged,
    onStateChanged: notifyCloudSyncStateChanged
  });
  registerCloudSyncHandlers(ipcMain, cloudSync);
  createWindow();
  dbWatcher = createTaskDatabaseWatcher(dbPath, () => {
    notifyTasksChanged();
    cloudSync.notifyLocalChange();
  });
  void cloudSync.start();

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
  if (cloudSync) {
    cloudSync.close();
  }
  if (dbWatcher) {
    dbWatcher.close();
  }
  if (store) {
    store.close();
  }
});
