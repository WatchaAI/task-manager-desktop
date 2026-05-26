import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTaskStore } from '../electron/taskStore.cjs';

let tempDir;
let store;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-manager-store-'));
  store = createTaskStore(path.join(tempDir, 'tasks.sqlite'));
});

afterEach(() => {
  store?.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('task store', () => {
  it('creates the tasks table during initialization', () => {
    const table = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")
      .get();

    expect(table.name).toBe('tasks');
  });

  it('creates, lists, updates, and deletes a task', () => {
    const created = store.createTask({
      title: '写任务系统',
      startTime: '2026-05-26T09:00',
      endTime: '2026-05-26T11:00',
      description: '实现一个可以拖拽的桌面任务看板。',
      status: 'todo'
    });

    expect(created).toMatchObject({
      title: '写任务系统',
      startTime: '2026-05-26T09:00',
      endTime: '2026-05-26T11:00',
      description: '实现一个可以拖拽的桌面任务看板。',
      status: 'todo',
      sortOrder: 0
    });

    const updated = store.updateTask(created.id, {
      title: '完成任务系统',
      startTime: '2026-05-26T10:00',
      endTime: '2026-05-26T12:00',
      description: '补齐 SQLite 持久化。',
      status: 'in_progress'
    });

    expect(updated).toMatchObject({
      id: created.id,
      title: '完成任务系统',
      startTime: '2026-05-26T10:00',
      endTime: '2026-05-26T12:00',
      description: '补齐 SQLite 持久化。',
      status: 'in_progress'
    });

    expect(store.listTasks()).toHaveLength(1);
    store.deleteTask(created.id);
    expect(store.listTasks()).toEqual([]);
  });

  it('lists tasks grouped by status and ordered by sortOrder', () => {
    const todoLater = store.createTask({
      title: '第二个待办',
      startTime: '',
      endTime: '',
      description: '',
      status: 'todo'
    });
    const done = store.createTask({
      title: '已完成',
      startTime: '',
      endTime: '',
      description: '',
      status: 'done'
    });
    const todoFirst = store.createTask({
      title: '第一个待办',
      startTime: '',
      endTime: '',
      description: '',
      status: 'todo'
    });

    store.reorderTasks([
      { id: todoFirst.id, status: 'todo', sortOrder: 0 },
      { id: todoLater.id, status: 'todo', sortOrder: 1 },
      { id: done.id, status: 'done', sortOrder: 0 }
    ]);

    expect(store.listTasks().map((task) => task.title)).toEqual([
      '第一个待办',
      '第二个待办',
      '已完成'
    ]);
  });

  it('persists cross-column reordering', () => {
    const first = store.createTask({
      title: '调研',
      startTime: '',
      endTime: '',
      description: '',
      status: 'todo'
    });
    const second = store.createTask({
      title: '开发',
      startTime: '',
      endTime: '',
      description: '',
      status: 'todo'
    });

    store.reorderTasks([
      { id: second.id, status: 'in_progress', sortOrder: 0 },
      { id: first.id, status: 'todo', sortOrder: 0 }
    ]);

    expect(store.listTasks()).toMatchObject([
      { id: first.id, status: 'todo', sortOrder: 0 },
      { id: second.id, status: 'in_progress', sortOrder: 0 }
    ]);
  });
});
