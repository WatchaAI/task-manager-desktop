const { createMapUrl } = require('./mapUrl.cjs');

function registerTaskHandlers(ipcMain, store, { openExternal } = {}) {
  ipcMain.handle('taskTypes:list', () => store.listTaskTypes());
  ipcMain.handle('taskTypes:create', (_event, taskType) => store.createTaskType(taskType));
  ipcMain.handle('taskTypes:update', (_event, payload) => {
    const { id, ...taskType } = payload;
    return store.updateTaskType(id, taskType);
  });
  ipcMain.handle('taskTypes:reorder', (_event, items) => store.reorderTaskTypes(items));
  ipcMain.handle('taskTypes:delete', (_event, id) => store.deleteTaskType(id));
  ipcMain.handle('people:list', () => store.listPeople());
  ipcMain.handle('maps:open', async (_event, location) => {
    const url = createMapUrl(location);
    if (!url) {
      throw new Error('Task location is required');
    }
    if (typeof openExternal !== 'function') {
      throw new Error('Map integration is unavailable');
    }
    await openExternal(url);
    return { ok: true };
  });
  ipcMain.handle('tasks:list', (_event, typeId) => store.listTasks(typeId));
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
