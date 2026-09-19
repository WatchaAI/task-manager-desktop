function registerHolidayHandlers(ipcMain, holidayService) {
  ipcMain.handle('holidays:get', () => holidayService.getState());
  ipcMain.handle('holidays:update', (_event, year) => holidayService.updateYear(year));
  ipcMain.handle('holidays:import', () => holidayService.importFromFile());
}

module.exports = {
  registerHolidayHandlers
};
