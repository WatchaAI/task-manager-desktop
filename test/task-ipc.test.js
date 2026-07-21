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
      reorderTaskTypes: vi.fn((items) => items),
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
    expect(await ipcMain.invoke('taskTypes:reorder', [{ id: 2, sortOrder: 0 }])).toEqual([
      { id: 2, sortOrder: 0 }
    ]);
    expect(await ipcMain.invoke('taskTypes:delete', 1)).toEqual({ ok: true, id: 1 });
    expect(await ipcMain.invoke('people:list')).toEqual([{ id: 1, name: '王洋' }]);
    const mapUrl = 'https://maps.apple.com/?q=%E6%9D%AD%E5%B7%9E%E8%A5%BF%E7%AB%99';
    expect(await ipcMain.invoke('maps:open', ' 杭州西站 ')).toEqual({ ok: true });
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

  it('syncs a newly stored task to Calendar and returns the sync result', async () => {
    const ipcMain = createFakeIpcMain();
    const createdTask = {
      id: 9,
      title: '客户会议',
      startTime: '2026-07-22T10:00',
      endTime: '2026-07-22T11:00'
    };
    const store = {
      createTask: vi.fn(() => createdTask)
    };
    const syncTaskToCalendar = vi.fn(() =>
      Promise.resolve({ status: 'synced', calendarName: '工作', eventId: 'calendar-9' })
    );
    registerTaskHandlers(ipcMain, store, { syncTaskToCalendar });

    const result = await ipcMain.invoke('tasks:create', { title: '客户会议' });

    expect(store.createTask).toHaveBeenCalledWith({ title: '客户会议' });
    expect(syncTaskToCalendar).toHaveBeenCalledWith(createdTask);
    expect(result).toEqual({
      ...createdTask,
      calendarSync: { status: 'synced', calendarName: '工作', eventId: 'calendar-9' }
    });
  });

  it('keeps the new task saved when Calendar access fails', async () => {
    const ipcMain = createFakeIpcMain();
    const createdTask = {
      id: 10,
      title: '时间块',
      startTime: '2026-07-22T14:00',
      endTime: '2026-07-22T15:00'
    };
    const store = {
      createTask: vi.fn(() => createdTask)
    };
    const syncTaskToCalendar = vi.fn(() => Promise.reject(new Error('Not authorized (-1743)')));
    registerTaskHandlers(ipcMain, store, { syncTaskToCalendar });

    await expect(ipcMain.invoke('tasks:create', { title: '时间块' })).resolves.toEqual({
      ...createdTask,
      calendarSync: {
        status: 'failed',
        reason: 'calendar-access-failed',
        message: '事项已保存，但无法同步到 macOS 日历。请在“系统设置 → 隐私与安全性 → 自动化”中允许 Task Manager Desktop 控制“日历”。'
      }
    });
    expect(store.createTask).toHaveBeenCalledTimes(1);
  });
});
