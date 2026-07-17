import { describe, expect, it, vi } from 'vitest';
import { registerTaskHandlers } from '../electron/taskIpc.cjs';

function createFakeIpcMain() {
  const handlers = new Map();
  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    invoke(channel, payload) {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return handler({}, payload);
    },
    handlers
  };
}

describe('task IPC handlers', () => {
  it('registers CRUD and reorder channels', async () => {
    const ipcMain = createFakeIpcMain();
    const openExternal = vi.fn(() => Promise.resolve());
    const store = {
      listTaskTypes: vi.fn(() => [{ id: 1, name: '工作', sortOrder: 0 }]),
      createTaskType: vi.fn((taskType) => ({ id: 2, sortOrder: 1, ...taskType })),
      updateTaskType: vi.fn((id, taskType) => ({ id, sortOrder: 0, ...taskType })),
      deleteTaskType: vi.fn((id) => ({ ok: true, id })),
      listPeople: vi.fn(() => [{ id: 1, name: '王洋' }]),
      listTasks: vi.fn(() => [{ id: 1, typeId: 1, title: '任务', status: 'todo', sortOrder: 0 }]),
      createTask: vi.fn((task) => ({ id: 2, ...task })),
      updateTask: vi.fn((id, task) => ({ id, ...task })),
      deleteTask: vi.fn((id) => ({ ok: true, id })),
      reorderTasks: vi.fn((items) => items)
    };

    registerTaskHandlers(ipcMain, store, { openExternal });

    expect(await ipcMain.invoke('taskTypes:list')).toEqual([{ id: 1, name: '工作', sortOrder: 0 }]);
    expect(await ipcMain.invoke('taskTypes:create', { name: '副业' })).toEqual({
      id: 2,
      sortOrder: 1,
      name: '副业'
    });
    expect(await ipcMain.invoke('taskTypes:update', { id: 1, name: '项目' })).toEqual({
      id: 1,
      sortOrder: 0,
      name: '项目'
    });
    expect(await ipcMain.invoke('taskTypes:delete', 1)).toEqual({ ok: true, id: 1 });
    expect(await ipcMain.invoke('people:list')).toEqual([{ id: 1, name: '王洋' }]);
    const mapUrl = 'https://maps.apple.com/?q=%E6%9D%AD%E5%B7%9E%E8%A5%BF%E7%AB%99';
    expect(await ipcMain.invoke('maps:open', mapUrl)).toEqual({ ok: true });
    expect(openExternal).toHaveBeenCalledWith(
      mapUrl
    );
    expect(await ipcMain.invoke('tasks:list', 1)).toEqual([
      { id: 1, typeId: 1, title: '任务', status: 'todo', sortOrder: 0 }
    ]);
    expect(store.listTasks).toHaveBeenCalledWith(1);
    expect(await ipcMain.invoke('tasks:create', { title: '新任务', status: 'todo' })).toEqual({
      id: 2,
      title: '新任务',
      status: 'todo'
    });
    expect(await ipcMain.invoke('tasks:update', { id: 2, title: '更新', status: 'done' })).toEqual({
      id: 2,
      title: '更新',
      status: 'done'
    });
    expect(await ipcMain.invoke('tasks:delete', 2)).toEqual({ ok: true, id: 2 });
    expect(await ipcMain.invoke('tasks:reorder', [{ id: 2, status: 'done', sortOrder: 0 }])).toEqual([
      { id: 2, status: 'done', sortOrder: 0 }
    ]);
  });
});
