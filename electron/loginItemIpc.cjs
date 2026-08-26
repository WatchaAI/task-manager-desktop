function registerLoginItemHandlers(ipcMain, electronApp) {
  ipcMain.handle('loginItem:get', () => Boolean(electronApp.getLoginItemSettings().openAtLogin));
  ipcMain.handle('loginItem:set', (_event, openAtLogin) => {
    if (typeof openAtLogin !== 'boolean') {
      throw new TypeError('openAtLogin must be a boolean');
    }

    electronApp.setLoginItemSettings({ openAtLogin });
    return Boolean(electronApp.getLoginItemSettings().openAtLogin);
  });
}

module.exports = { registerLoginItemHandlers };
