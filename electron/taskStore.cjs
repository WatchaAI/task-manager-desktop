const Database = require('better-sqlite3');

const STATUSES = new Set(['todo', 'in_progress', 'done']);
const DEFAULT_TASK_TYPES = ['工作', '学习', '日常'];

function createTaskStore(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type_id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      associated_people TEXT NOT NULL DEFAULT '[]',
      sub_tasks TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL CHECK(status IN ('todo', 'in_progress', 'done')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (type_id) REFERENCES task_types(id) ON DELETE CASCADE
    );
  `);

  seedDefaultTaskTypes();

  const columns = db.prepare('PRAGMA table_info(tasks)').all();
  if (!columns.some((column) => column.name === 'sub_tasks')) {
    db.prepare("ALTER TABLE tasks ADD COLUMN sub_tasks TEXT NOT NULL DEFAULT '[]'").run();
  }
  if (!columns.some((column) => column.name === 'type_id')) {
    db.prepare("ALTER TABLE tasks ADD COLUMN type_id INTEGER NOT NULL DEFAULT 1").run();
  }
  if (!columns.some((column) => column.name === 'location')) {
    db.prepare("ALTER TABLE tasks ADD COLUMN location TEXT NOT NULL DEFAULT ''").run();
  }
  if (!columns.some((column) => column.name === 'associated_people')) {
    db.prepare("ALTER TABLE tasks ADD COLUMN associated_people TEXT NOT NULL DEFAULT '[]'").run();
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_types_sort
      ON task_types (sort_order, created_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_status_sort
      ON tasks (status, sort_order, created_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_type_status_sort
      ON tasks (type_id, status, sort_order, created_at);
  `);

  function seedDefaultTaskTypes() {
    const row = db.prepare('SELECT COUNT(*) AS count FROM task_types').get();
    if (row.count > 0) {
      return;
    }

    const now = new Date().toISOString();
    const statement = db.prepare(
      `
      INSERT INTO task_types (name, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `
    );
    DEFAULT_TASK_TYPES.forEach((name, index) => {
      statement.run(name, index, now, now);
    });
  }

  function createSubTaskId(index) {
    return `subtask-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function parseSubTasks(value) {
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function normalizeSubTasks(subTasks = []) {
    if (!Array.isArray(subTasks)) {
      return [];
    }

    return subTasks
      .map((subTask, index) => {
        const title = String(subTask?.title || '').trim();
        if (!title) {
          return null;
        }

        const id = String(subTask?.id || '').trim() || createSubTaskId(index);
        return {
          id,
          title,
          completed: Boolean(subTask?.completed)
        };
      })
      .filter(Boolean);
  }

  function normalizeAssociatedPeople(people = []) {
    if (!Array.isArray(people)) {
      return [];
    }

    return [...new Set(people.map((person) => String(person || '').trim()).filter(Boolean))];
  }

  function rememberPeople(people, now) {
    const statement = db.prepare(`
      INSERT INTO people (name, created_at, last_used_at)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET last_used_at = excluded.last_used_at
    `);
    for (const name of people) {
      statement.run(name, now, now);
    }
  }

  function listPeople() {
    return db
      .prepare('SELECT id, name, created_at, last_used_at FROM people ORDER BY last_used_at DESC, name COLLATE NOCASE ASC')
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at
      }));
  }

  function rowToTask(row) {
    return {
      id: row.id,
      typeId: row.type_id,
      title: row.title,
      startTime: row.start_time,
      endTime: row.end_time,
      description: row.description,
      location: row.location,
      associatedPeople: normalizeAssociatedPeople(parseSubTasks(row.associated_people)),
      subTasks: parseSubTasks(row.sub_tasks),
      status: row.status,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function rowToTaskType(row) {
    return {
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function assertStatus(status) {
    if (!STATUSES.has(status)) {
      throw new Error(`Invalid task status: ${status}`);
    }
  }

  function assertTaskType(typeId) {
    const row = db.prepare('SELECT id FROM task_types WHERE id = ?').get(typeId);
    if (!row) {
      throw new Error(`Invalid task type: ${typeId}`);
    }
  }

  function getDefaultTaskTypeId() {
    const row = db.prepare('SELECT id FROM task_types ORDER BY sort_order ASC, created_at ASC LIMIT 1').get();
    return row.id;
  }

  function normalizeTaskTypeInput(input) {
    const name = String(input.name || '').trim();
    if (!name) {
      throw new Error('Task type name is required');
    }
    return { name };
  }

  function normalizeTaskInput(input) {
    const title = String(input.title || '').trim();
    if (!title) {
      throw new Error('Task title is required');
    }

    const status = input.status || 'todo';
    assertStatus(status);
    const typeId = Number(input.typeId || getDefaultTaskTypeId());
    assertTaskType(typeId);

    return {
      typeId,
      title,
      startTime: input.startTime || '',
      endTime: input.endTime || '',
      description: input.description || '',
      location: String(input.location || '').trim(),
      associatedPeople: normalizeAssociatedPeople(input.associatedPeople),
      subTasks: normalizeSubTasks(input.subTasks),
      status
    };
  }

  function getTask(id) {
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return row ? rowToTask(row) : null;
  }

  function listTaskTypes() {
    return db
      .prepare(
        `
        SELECT * FROM task_types
        ORDER BY sort_order ASC, created_at ASC
      `
      )
      .all()
      .map(rowToTaskType);
  }

  function nextTaskTypeSortOrder() {
    const row = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM task_types').get();
    return row.next_order;
  }

  function createTaskType(input) {
    const taskType = normalizeTaskTypeInput(input);
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `
        INSERT INTO task_types (name, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `
      )
      .run(taskType.name, nextTaskTypeSortOrder(), now, now);

    return rowToTaskType(db.prepare('SELECT * FROM task_types WHERE id = ?').get(result.lastInsertRowid));
  }

  function getTaskType(id) {
    const row = db.prepare('SELECT * FROM task_types WHERE id = ?').get(id);
    return row ? rowToTaskType(row) : null;
  }

  function updateTaskType(id, input) {
    const existing = getTaskType(id);
    if (!existing) {
      throw new Error(`Task type not found: ${id}`);
    }

    const taskType = normalizeTaskTypeInput(input);
    const now = new Date().toISOString();
    db.prepare(
      `
      UPDATE task_types
      SET name = ?,
          updated_at = ?
      WHERE id = ?
    `
    ).run(taskType.name, now, id);

    return getTaskType(id);
  }

  function deleteTaskType(id) {
    const existing = getTaskType(id);
    if (!existing) {
      throw new Error(`Task type not found: ${id}`);
    }

    const count = db.prepare('SELECT COUNT(*) AS count FROM task_types').get().count;
    if (count <= 1) {
      throw new Error('Cannot delete the last task type');
    }

    db.prepare('DELETE FROM tasks WHERE type_id = ?').run(id);
    db.prepare('DELETE FROM task_types WHERE id = ?').run(id);
    return { ok: true };
  }

  function listTasks(typeId) {
    const filters = [];
    const values = [];

    if (typeId !== undefined && typeId !== null) {
      const normalizedTypeId = Number(typeId);
      assertTaskType(normalizedTypeId);
      filters.push('type_id = ?');
      values.push(normalizedTypeId);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    return db
      .prepare(
        `
        SELECT * FROM tasks
        ${whereClause}
        ORDER BY
          type_id ASC,
          CASE status
            WHEN 'todo' THEN 0
            WHEN 'in_progress' THEN 1
            WHEN 'done' THEN 2
          END,
          sort_order ASC,
          created_at ASC
      `
      )
      .all(...values)
      .map(rowToTask);
  }

  function nextSortOrder(typeId, status) {
    const row = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM tasks WHERE type_id = ? AND status = ?')
      .get(typeId, status);
    return row.next_order;
  }

  function createTask(input) {
    const task = normalizeTaskInput(input);
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `
        INSERT INTO tasks (
          type_id,
          title,
          start_time,
          end_time,
          description,
          location,
          associated_people,
          sub_tasks,
          status,
          sort_order,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        task.typeId,
        task.title,
        task.startTime,
        task.endTime,
        task.description,
        task.location,
        JSON.stringify(task.associatedPeople),
        JSON.stringify(task.subTasks),
        task.status,
        nextSortOrder(task.typeId, task.status),
        now,
        now
      );

    rememberPeople(task.associatedPeople, now);

    return getTask(result.lastInsertRowid);
  }

  function updateTask(id, input) {
    const existing = getTask(id);
    if (!existing) {
      throw new Error(`Task not found: ${id}`);
    }

    const task = normalizeTaskInput({ ...existing, ...input });
    const now = new Date().toISOString();
    db.prepare(
      `
      UPDATE tasks
      SET type_id = ?,
          title = ?,
          start_time = ?,
          end_time = ?,
          description = ?,
          location = ?,
          associated_people = ?,
          sub_tasks = ?,
          status = ?,
          updated_at = ?
      WHERE id = ?
    `
    ).run(
      task.typeId,
      task.title,
      task.startTime,
      task.endTime,
      task.description,
      task.location,
      JSON.stringify(task.associatedPeople),
      JSON.stringify(task.subTasks),
      task.status,
      now,
      id
    );

    rememberPeople(task.associatedPeople, now);

    return getTask(id);
  }

  function deleteTask(id) {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return { ok: true };
  }

  const reorderTransaction = db.transaction((items) => {
    const statement = db.prepare(
      `
      UPDATE tasks
      SET type_id = ?,
          status = ?,
          sort_order = ?,
          updated_at = ?
      WHERE id = ?
    `
    );

    const now = new Date().toISOString();
    for (const item of items) {
      const existing = getTask(item.id);
      if (!existing) {
        throw new Error(`Task not found: ${item.id}`);
      }
      const typeId = Number(item.typeId || existing.typeId);
      assertTaskType(typeId);
      assertStatus(item.status);
      statement.run(typeId, item.status, item.sortOrder, now, item.id);
    }
  });

  function reorderTasks(items) {
    reorderTransaction(items);
    return listTasks();
  }

  function close() {
    db.close();
  }

  return {
    db,
    listTaskTypes,
    createTaskType,
    updateTaskType,
    deleteTaskType,
    listPeople,
    listTasks,
    createTask,
    updateTask,
    deleteTask,
    reorderTasks,
    close
  };
}

module.exports = {
  createTaskStore
};
