import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
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

  it('migrates an existing database that does not have task types yet', () => {
    store.close();
    const dbPath = path.join(tempDir, 'legacy.sqlite');
    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        start_time TEXT NOT NULL DEFAULT '',
        end_time TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        sub_tasks TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL CHECK(status IN ('todo', 'in_progress', 'done')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO tasks (
        title,
        start_time,
        end_time,
        description,
        sub_tasks,
        status,
        sort_order,
        created_at,
        updated_at
      )
      VALUES ('旧任务', '', '', '', '[]', 'todo', 0, '2026-05-27T00:00:00.000Z', '2026-05-27T00:00:00.000Z');
    `);
    legacyDb.close();

    store = createTaskStore(dbPath);

    const [defaultType] = store.listTaskTypes();
    expect(defaultType.name).toBe('工作');
    expect(store.listTasks(defaultType.id)).toMatchObject([
      {
        title: '旧任务',
        typeId: defaultType.id,
        location: '',
        associatedPeople: []
      }
    ]);
  });

  it('seeds default task types for switching boards', () => {
    expect(store.listTaskTypes()).toMatchObject([
      { name: '工作', sortOrder: 0 },
      { name: '学习', sortOrder: 1 },
      { name: '日常', sortOrder: 2 }
    ]);
  });

  it('creates custom task types', () => {
    const created = store.createTaskType({ name: '副业' });

    expect(created).toMatchObject({
      name: '副业',
      sortOrder: 3
    });
    expect(store.listTaskTypes().map((type) => type.name)).toEqual(['工作', '学习', '日常', '副业']);
  });

  it('renames task types', () => {
    const [work] = store.listTaskTypes();

    const updated = store.updateTaskType(work.id, { name: '项目' });

    expect(updated).toMatchObject({
      id: work.id,
      name: '项目',
      sortOrder: work.sortOrder
    });
    expect(store.listTaskTypes()[0].name).toBe('项目');
  });

  it('persists task type reordering', () => {
    const [work, learning, daily] = store.listTaskTypes();

    store.reorderTaskTypes([
      { id: daily.id, sortOrder: 0 },
      { id: work.id, sortOrder: 1 },
      { id: learning.id, sortOrder: 2 }
    ]);

    expect(store.listTaskTypes()).toMatchObject([
      { id: daily.id, name: '日常', sortOrder: 0 },
      { id: work.id, name: '工作', sortOrder: 1 },
      { id: learning.id, name: '学习', sortOrder: 2 }
    ]);
  });

  it('deletes a task type and its tasks', () => {
    const customType = store.createTaskType({ name: '临时' });
    const task = store.createTask({
      title: '临时任务',
      startTime: '',
      endTime: '',
      description: '',
      status: 'todo',
      typeId: customType.id
    });

    expect(store.listTasks(customType.id)).toMatchObject([{ id: task.id }]);

    expect(store.deleteTaskType(customType.id)).toEqual({ ok: true });
    expect(store.listTaskTypes().map((type) => type.name)).not.toContain('临时');
    expect(() => store.listTasks(customType.id)).toThrow('Invalid task type');
    expect(store.db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)).toBeUndefined();
  });

  it('does not delete the last task type', () => {
    for (const type of store.listTaskTypes().slice(1)) {
      store.deleteTaskType(type.id);
    }

    const [lastType] = store.listTaskTypes();
    expect(() => store.deleteTaskType(lastType.id)).toThrow('Cannot delete the last task type');
    expect(store.listTaskTypes()).toHaveLength(1);
  });

  it('lists tasks only for the selected type', () => {
    const [work, learning] = store.listTaskTypes();

    const workTask = store.createTask({
      title: '写方案',
      startTime: '',
      endTime: '',
      description: '',
      status: 'todo',
      typeId: work.id
    });
    const learningTask = store.createTask({
      title: '读论文',
      startTime: '',
      endTime: '',
      description: '',
      status: 'todo',
      typeId: learning.id
    });

    expect(store.listTasks(work.id)).toMatchObject([{ id: workTask.id, title: '写方案', typeId: work.id }]);
    expect(store.listTasks(learning.id)).toMatchObject([{ id: learningTask.id, title: '读论文', typeId: learning.id }]);
  });

  it('keeps sort order independent across task types', () => {
    const [work, learning] = store.listTaskTypes();

    const workTask = store.createTask({
      title: '工作待办',
      startTime: '',
      endTime: '',
      description: '',
      status: 'todo',
      typeId: work.id
    });
    const learningTask = store.createTask({
      title: '学习待办',
      startTime: '',
      endTime: '',
      description: '',
      status: 'todo',
      typeId: learning.id
    });

    expect(workTask.sortOrder).toBe(0);
    expect(learningTask.sortOrder).toBe(0);
  });

  it('creates, lists, updates, and deletes a task', () => {
    const created = store.createTask({
      title: '写任务系统',
      startTime: '2026-05-26T09:00',
      endTime: '2026-05-26T11:00',
      description: '实现一个可以拖拽的桌面任务看板。',
      location: '杭州未来科技城',
      associatedPeople: ['王洋', '小明', ' 王洋 ', ''],
      status: 'todo',
      subTasks: [
        { id: 'draft', title: '拆页面结构', completed: true },
        { id: 'persist', title: '补持久化', completed: false }
      ]
    });

    expect(created).toMatchObject({
      title: '写任务系统',
      startTime: '2026-05-26T09:00',
      endTime: '2026-05-26T11:00',
      description: '实现一个可以拖拽的桌面任务看板。',
      location: '杭州未来科技城',
      associatedPeople: ['王洋', '小明'],
      status: 'todo',
      sortOrder: 0,
      subTasks: [
        { id: 'draft', title: '拆页面结构', completed: true },
        { id: 'persist', title: '补持久化', completed: false }
      ]
    });

    const updated = store.updateTask(created.id, {
      title: '完成任务系统',
      startTime: '2026-05-26T10:00',
      endTime: '2026-05-26T12:00',
      description: '补齐 SQLite 持久化。',
      location: '杭州西站',
      associatedPeople: ['小明', '小红'],
      status: 'in_progress',
      subTasks: [
        { id: 'draft', title: '拆页面结构', completed: true },
        { id: 'persist', title: '补持久化', completed: true },
        { id: 'verify', title: '跑测试', completed: false }
      ]
    });

    expect(updated).toMatchObject({
      id: created.id,
      title: '完成任务系统',
      startTime: '2026-05-26T10:00',
      endTime: '2026-05-26T12:00',
      description: '补齐 SQLite 持久化。',
      location: '杭州西站',
      associatedPeople: ['小明', '小红'],
      status: 'in_progress',
      subTasks: [
        { id: 'draft', title: '拆页面结构', completed: true },
        { id: 'persist', title: '补持久化', completed: true },
        { id: 'verify', title: '跑测试', completed: false }
      ]
    });

    expect(store.listTasks()).toHaveLength(1);
    store.deleteTask(created.id);
    expect(store.listTasks()).toEqual([]);
  });

  it('sanitizes blank subtasks and generates ids for new subtasks', () => {
    const created = store.createTask({
      title: '发布版本',
      startTime: '',
      endTime: '',
      description: '',
      status: 'todo',
      subTasks: [
        { title: '打包应用', completed: true },
        { title: '   ', completed: true },
        { id: 'ship', title: '通知用户', completed: 1 }
      ]
    });

    expect(created.subTasks).toHaveLength(2);
    expect(created.subTasks[0]).toMatchObject({
      title: '打包应用',
      completed: true
    });
    expect(created.subTasks[0].id).toEqual(expect.any(String));
    expect(created.subTasks[1]).toEqual({
      id: 'ship',
      title: '通知用户',
      completed: true
    });
  });

  it('remembers associated people for quick selection after the original task is deleted', () => {
    const created = store.createTask({
      title: '项目评审',
      associatedPeople: ['王洋', '小明'],
      status: 'todo'
    });

    store.updateTask(created.id, { associatedPeople: ['小明', '小红'] });
    store.deleteTask(created.id);

    expect(store.listPeople().map((person) => person.name)).toEqual(
      expect.arrayContaining(['王洋', '小明', '小红'])
    );
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
