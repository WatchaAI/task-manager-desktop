const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskApi', {
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  createTask: (task) => ipcRenderer.invoke('tasks:create', task),
  updateTask: (payload) => ipcRenderer.invoke('tasks:update', payload),
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),
  reorderTasks: (items) => ipcRenderer.invoke('tasks:reorder', items)
});
