const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskApi', {
  listTaskTypes: () => ipcRenderer.invoke('taskTypes:list'),
  createTaskType: (taskType) => ipcRenderer.invoke('taskTypes:create', taskType),
  updateTaskType: (payload) => ipcRenderer.invoke('taskTypes:update', payload),
  deleteTaskType: (id) => ipcRenderer.invoke('taskTypes:delete', id),
  listTasks: (typeId) => ipcRenderer.invoke('tasks:list', typeId),
  createTask: (task) => ipcRenderer.invoke('tasks:create', task),
  updateTask: (payload) => ipcRenderer.invoke('tasks:update', payload),
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),
  reorderTasks: (items) => ipcRenderer.invoke('tasks:reorder', items)
});
