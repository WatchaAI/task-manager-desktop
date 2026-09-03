const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskApi', {
  listTaskTypes: () => ipcRenderer.invoke('taskTypes:list'),
  createTaskType: (taskType) => ipcRenderer.invoke('taskTypes:create', taskType),
  updateTaskType: (payload) => ipcRenderer.invoke('taskTypes:update', payload),
  reorderTaskTypes: (items) => ipcRenderer.invoke('taskTypes:reorder', items),
  deleteTaskType: (id) => ipcRenderer.invoke('taskTypes:delete', id),
  listPeople: () => ipcRenderer.invoke('people:list'),
  openMap: (location) => ipcRenderer.invoke('maps:open', location),
  listTasks: (typeId) => ipcRenderer.invoke('tasks:list', typeId),
  createTask: (task) => ipcRenderer.invoke('tasks:create', task),
  updateTask: (payload) => ipcRenderer.invoke('tasks:update', payload),
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),
  reorderTasks: (items) => ipcRenderer.invoke('tasks:reorder', items),
  getOpenAtLogin: () => ipcRenderer.invoke('loginItem:get'),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke('loginItem:set', enabled),
  getCloudSyncState: () => ipcRenderer.invoke('cloudSync:get'),
  setCloudSyncEnabled: (enabled) => ipcRenderer.invoke('cloudSync:set', enabled),
  syncCloudNow: () => ipcRenderer.invoke('cloudSync:syncNow'),
  onCloudSyncStateChanged: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, state) => callback(state);
    ipcRenderer.on('cloudSync:stateChanged', listener);
    return () => ipcRenderer.removeListener('cloudSync:stateChanged', listener);
  },
  onTasksChanged: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = () => callback();
    ipcRenderer.on('tasks:changed', listener);
    return () => ipcRenderer.removeListener('tasks:changed', listener);
  }
});
