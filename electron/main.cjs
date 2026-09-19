const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const { createTaskStore } = require('./taskStore.cjs');
const { registerTaskHandlers } = require('./taskIpc.cjs');
const { registerLoginItemHandlers } = require('./loginItemIpc.cjs');
const { createCloudSync } = require('./cloudSync.cjs');
const { registerCloudSyncHandlers } = require('./cloudSyncIpc.cjs');
const { createHolidayService } = require('./holidays.cjs');
const { registerHolidayHandlers } = require('./holidayIpc.cjs');
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
    deleteTaskFromCalendar: createMacCalendarDelete(),
    onTasksAutomaticallyCompleted: () => {
      notifyTasksChanged();
      cloudSync?.notifyLocalChange();
    }
  });
  registerLoginItemHandlers(ipcMain, app);
  cloudSync = createCloudSync({
    store,
    userDataPath: app.getPath('userData'),
    onDataChanged: notifyTasksChanged,
    onStateChanged: notifyCloudSyncStateChanged
  });
  registerCloudSyncHandlers(ipcMain, cloudSync);
  const holidayService = createHolidayService({
    userDataPath: app.getPath('userData'),
    dialog,
    getWindow: () => mainWindow,
    onDataChanged: (years) => {
      cloudSync?.writeExtra('holidays.json', years);
    }
  });
  registerHolidayHandlers(ipcMain, holidayService);
  createWindow();
  dbWatcher = createTaskDatabaseWatcher(dbPath, () => {
    notifyTasksChanged();
    cloudSync.notifyLocalChange();
  });
  void cloudSync.start();
  // 首次加载兜底：同步已开启时把完整节假日数据写入 Sync/extras/holidays.json
  try {
    cloudSync.writeExtra('holidays.json', holidayService.getYearData());
  } catch (error) {
    console.error('[holidays:extras] 写入失败', error);
  }

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
