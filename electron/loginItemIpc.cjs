function getLoginItemState(electronApp) {
  const settings = electronApp.getLoginItemSettings();
  return {
    openAtLogin: Boolean(settings.openAtLogin),
    status: typeof settings.status === 'string' ? settings.status : null
  };
}

function registerLoginItemHandlers(ipcMain, electronApp) {
  ipcMain.handle('loginItem:get', () => getLoginItemState(electronApp));
  ipcMain.handle('loginItem:set', (_event, openAtLogin) => {
    if (typeof openAtLogin !== 'boolean') {
      throw new TypeError('openAtLogin must be a boolean');
    }

    electronApp.setLoginItemSettings({ openAtLogin });
    return getLoginItemState(electronApp);
  });
}

module.exports = { registerLoginItemHandlers };
