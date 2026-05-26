function registerTaskHandlers(ipcMain, store) {
  ipcMain.handle('tasks:list', () => store.listTasks());
  ipcMain.handle('tasks:create', (_event, task) => store.createTask(task));
  ipcMain.handle('tasks:update', (_event, payload) => {
    const { id, ...task } = payload;
    return store.updateTask(id, task);
  });
  ipcMain.handle('tasks:delete', (_event, id) => store.deleteTask(id));
  ipcMain.handle('tasks:reorder', (_event, items) => store.reorderTasks(items));
}

module.exports = {
  registerTaskHandlers
};
