const { createMapUrl } = require('./mapUrl.cjs');

function calendarFailureResult(error) {
  const detail = String(error?.message || error || '');
  const permissionDenied = /-1743|not authorized|not permitted|permission|权限/i.test(detail);
  return {
    status: 'failed',
    reason: 'calendar-access-failed',
    message: permissionDenied
      ? '事项已保存，但无法同步到 macOS 日历。请在“系统设置 → 隐私与安全性 → 自动化”中允许 Task Manager Desktop 控制“日历”。'
      : '事项已保存，但同步到 macOS 日历失败。请确认系统“日历”中至少有一个可写日历，并检查自动化权限。'
  };
}

function registerTaskHandlers(ipcMain, store, { openExternal, syncTaskToCalendar } = {}) {
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
  ipcMain.handle('tasks:create', async (_event, task) => {
    const createdTask = store.createTask(task);
    if (typeof syncTaskToCalendar !== 'function') {
      return createdTask;
    }

    try {
      const calendarSync = await syncTaskToCalendar(createdTask);
      return { ...createdTask, calendarSync };
    } catch (error) {
      console.error('[calendar:sync-failed]', error);
      return { ...createdTask, calendarSync: calendarFailureResult(error) };
    }
  });
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
