function registerCloudSyncHandlers(ipcMain, cloudSync) {
  ipcMain.handle('cloudSync:get', () => cloudSync.getState());
  ipcMain.handle('cloudSync:set', (_event, enabled) => cloudSync.setEnabled(enabled));
  ipcMain.handle('cloudSync:syncNow', () => cloudSync.syncNow());
}

module.exports = {
  registerCloudSyncHandlers
};
