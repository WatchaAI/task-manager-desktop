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
    const store = {
      listTasks: vi.fn(() => [{ id: 1, title: '任务', status: 'todo', sortOrder: 0 }]),
      createTask: vi.fn((task) => ({ id: 2, ...task })),
      updateTask: vi.fn((id, task) => ({ id, ...task })),
      deleteTask: vi.fn((id) => ({ ok: true, id })),
      reorderTasks: vi.fn((items) => items)
    };

    registerTaskHandlers(ipcMain, store);

    expect(await ipcMain.invoke('tasks:list')).toEqual([
      { id: 1, title: '任务', status: 'todo', sortOrder: 0 }
    ]);
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
