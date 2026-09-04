import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerTaskHandlers } from '../electron/taskIpc.cjs';
import { createTaskStore } from '../electron/taskStore.cjs';

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
  it('completes old unfinished tasks before returning task data for user activity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4, 12, 0, 0));
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-manager-ipc-'));
    const store = createTaskStore(path.join(tempDir, 'tasks.sqlite'));

    try {
      store.createTask({
        title: '前天未完成的任务',
        startTime: '2026-09-02T00:00',
        endTime: '2026-09-02T23:59',
        status: 'todo'
      });
      const ipcMain = createFakeIpcMain();
      registerTaskHandlers(ipcMain, store);

      expect(ipcMain.invoke('tasks:list')).toMatchObject([
        { title: '前天未完成的任务', status: 'done' }
      ]);
    } finally {
      store.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
      vi.useRealTimers();
    }
  });

  it('keeps an old task completed when the same activity submits a stale unfinished status', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4, 12, 0, 0));
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-manager-ipc-'));
    const store = createTaskStore(path.join(tempDir, 'tasks.sqlite'));

    try {
      const oldTask = store.createTask({
        title: '前天未完成的任务',
        startTime: '2026-09-02T00:00',
        endTime: '2026-09-02T23:59',
        status: 'todo'
      });
      const ipcMain = createFakeIpcMain();
      registerTaskHandlers(ipcMain, store);

      await expect(
        ipcMain.invoke('tasks:update', { id: oldTask.id, title: '补充说明后保存', status: 'todo' })
      ).resolves.toMatchObject({
        id: oldTask.id,
        title: '补充说明后保存',
        status: 'done'
      });
      expect(store.getTask(oldTask.id).status).toBe('done');
    } finally {
      store.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
      vi.useRealTimers();
    }
  });

  it('checks old tasks through the general application activity channel', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4, 12, 0, 0));
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-manager-ipc-'));
    const store = createTaskStore(path.join(tempDir, 'tasks.sqlite'));

    try {
      store.createTask({
        title: '等待界面操作触发',
        startTime: '2026-09-02T00:00',
        endTime: '2026-09-02T23:59',
        status: 'in_progress'
      });
      const ipcMain = createFakeIpcMain();
      registerTaskHandlers(ipcMain, store);

      expect(ipcMain.invoke('tasks:completeOld')).toMatchObject([
        { title: '等待界面操作触发', status: 'done' }
      ]);
    } finally {
      store.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
      vi.useRealTimers();
    }
  });

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

  it('stores one task when the same create request is triggered twice rapidly', async () => {
    const ipcMain = createFakeIpcMain();
    const createdTask = {
      id: 11,
      title: '明天复盘',
      startTime: '2026-07-23T09:00',
      endTime: '2026-07-23T10:00'
    };
    const store = {
      createTask: vi.fn(() => createdTask)
    };
    const syncTaskToCalendar = vi.fn(() =>
      Promise.resolve({ status: 'synced', calendarName: '工作', eventId: 'calendar-11' })
    );
    registerTaskHandlers(ipcMain, store, { syncTaskToCalendar });

    const task = {
      requestId: 'create-task-request-11',
      title: '明天复盘',
      startTime: '2026-07-23T09:00',
      endTime: '2026-07-23T10:00'
    };
    const [first, second] = await Promise.all([
      ipcMain.invoke('tasks:create', task),
      ipcMain.invoke('tasks:create', task)
    ]);

    expect(first).toEqual(second);
    expect(store.createTask).toHaveBeenCalledTimes(1);
    expect(store.createTask).toHaveBeenCalledWith({
      title: '明天复盘',
      startTime: '2026-07-23T09:00',
      endTime: '2026-07-23T10:00'
    });
    expect(syncTaskToCalendar).toHaveBeenCalledTimes(1);
  });

  it('keeps a create request idempotent while a slow Calendar sync is still running', async () => {
    vi.useFakeTimers();
    try {
      const ipcMain = createFakeIpcMain();
      const createdTask = {
        id: 15,
        title: '同步较慢的会议',
        startTime: '2026-07-23T09:00',
        endTime: '2026-07-23T10:00'
      };
      let finishCalendarSync;
      const calendarSyncRequest = new Promise((resolve) => {
        finishCalendarSync = resolve;
      });
      const store = {
        createTask: vi.fn(() => createdTask)
      };
      const syncTaskToCalendar = vi.fn(() => calendarSyncRequest);
      registerTaskHandlers(ipcMain, store, { syncTaskToCalendar });
      const task = { requestId: 'slow-calendar-request', title: '同步较慢的会议' };

      const first = ipcMain.invoke('tasks:create', task);
      await vi.advanceTimersByTimeAsync(5_000);
      const second = ipcMain.invoke('tasks:create', task);
      finishCalendarSync({ status: 'synced', eventId: 'calendar-15' });

      await expect(Promise.all([first, second])).resolves.toEqual([
        { ...createdTask, calendarSync: { status: 'synced', eventId: 'calendar-15' } },
        { ...createdTask, calendarSync: { status: 'synced', eventId: 'calendar-15' } }
      ]);
      expect(store.createTask).toHaveBeenCalledTimes(1);
      expect(syncTaskToCalendar).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates the linked Calendar event after a task is edited', async () => {
    const ipcMain = createFakeIpcMain();
    const updatedTask = {
      id: 12,
      title: '改期后的会议',
      startTime: '2026-07-23T15:00',
      endTime: '2026-07-23T16:00'
    };
    const previousTask = {
      ...updatedTask,
      title: '改期前的会议',
      startTime: '2026-07-23T14:00',
      endTime: '2026-07-23T15:00'
    };
    const store = {
      getTask: vi.fn(() => previousTask),
      updateTask: vi.fn(() => updatedTask)
    };
    const syncTaskToCalendar = vi.fn(() =>
      Promise.resolve({ status: 'updated', calendarName: '工作', eventId: 'calendar-12' })
    );
    registerTaskHandlers(ipcMain, store, { syncTaskToCalendar });

    const result = await ipcMain.invoke('tasks:update', updatedTask);

    expect(syncTaskToCalendar).toHaveBeenCalledWith(updatedTask, { previousTask });
    expect(result).toEqual({
      ...updatedTask,
      calendarSync: { status: 'updated', calendarName: '工作', eventId: 'calendar-12' }
    });
  });

  it('removes the linked Calendar event when a task is deleted', async () => {
    const ipcMain = createFakeIpcMain();
    const store = {
      getTask: vi.fn(() => ({
        id: 13,
        title: '取消的会议',
        startTime: '2026-07-23T15:00',
        endTime: '2026-07-23T16:00'
      })),
      deleteTask: vi.fn((id) => ({ ok: true, id }))
    };
    const deleteTaskFromCalendar = vi.fn(() =>
      Promise.resolve({ status: 'deleted', calendarName: '工作', eventId: 'calendar-13' })
    );
    registerTaskHandlers(ipcMain, store, { deleteTaskFromCalendar });

    const result = await ipcMain.invoke('tasks:delete', 13);

    expect(deleteTaskFromCalendar).toHaveBeenCalledWith(13, {
      id: 13,
      title: '取消的会议',
      startTime: '2026-07-23T15:00',
      endTime: '2026-07-23T16:00'
    });
    expect(store.deleteTask).toHaveBeenCalledWith(13);
    expect(result).toEqual({
      ok: true,
      id: 13,
      calendarSync: { status: 'deleted', calendarName: '工作', eventId: 'calendar-13' }
    });
  });

  it('syncs a task moved to canceled through drag and drop', async () => {
    const ipcMain = createFakeIpcMain();
    const canceledTask = {
      id: 14,
      title: '不再举行的会议',
      status: 'canceled',
      startTime: '2026-07-23T17:00',
      endTime: '2026-07-23T18:00'
    };
    const store = {
      getTask: vi.fn(() => ({ ...canceledTask, status: 'todo' })),
      reorderTasks: vi.fn(() => [canceledTask])
    };
    const syncTaskToCalendar = vi.fn(() => Promise.resolve({ status: 'deleted' }));
    registerTaskHandlers(ipcMain, store, { syncTaskToCalendar });

    await ipcMain.invoke('tasks:reorder', [{ id: 14, status: 'canceled', sortOrder: 0 }]);

    expect(syncTaskToCalendar).toHaveBeenCalledWith(canceledTask, {
      previousTask: { ...canceledTask, status: 'todo' }
    });
  });

  it('removes linked Calendar events when deleting a task type with its tasks', async () => {
    const ipcMain = createFakeIpcMain();
    const tasks = [
      { id: 16, typeId: 4, title: '类型内任务一', startTime: '2026-07-24T09:00', endTime: '2026-07-24T10:00' },
      { id: 17, typeId: 4, title: '类型内任务二', startTime: '2026-07-24T11:00', endTime: '2026-07-24T12:00' }
    ];
    const store = {
      listTasks: vi.fn(() => tasks),
      deleteTaskType: vi.fn(() => ({ ok: true }))
    };
    const deleteTaskFromCalendar = vi.fn(() => Promise.resolve({ status: 'deleted' }));
    registerTaskHandlers(ipcMain, store, { deleteTaskFromCalendar });

    const result = await ipcMain.invoke('taskTypes:delete', 4);

    expect(deleteTaskFromCalendar.mock.calls).toEqual([
      [16, tasks[0]],
      [17, tasks[1]]
    ]);
    expect(result).toEqual({
      ok: true,
      calendarSync: { status: 'deleted', count: 2 }
    });
  });
});
