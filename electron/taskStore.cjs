const Database = require('better-sqlite3');

const STATUSES = new Set(['todo', 'in_progress', 'done']);

function createTaskStore(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('todo', 'in_progress', 'done')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status_sort
      ON tasks (status, sort_order, created_at);
  `);

  function rowToTask(row) {
    return {
      id: row.id,
      title: row.title,
      startTime: row.start_time,
      endTime: row.end_time,
      description: row.description,
      status: row.status,
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

  function normalizeTaskInput(input) {
    const title = String(input.title || '').trim();
    if (!title) {
      throw new Error('Task title is required');
    }

    const status = input.status || 'todo';
    assertStatus(status);

    return {
      title,
      startTime: input.startTime || '',
      endTime: input.endTime || '',
      description: input.description || '',
      status
    };
  }

  function getTask(id) {
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return row ? rowToTask(row) : null;
  }

  function listTasks() {
    return db
      .prepare(
        `
        SELECT * FROM tasks
        ORDER BY
          CASE status
            WHEN 'todo' THEN 0
            WHEN 'in_progress' THEN 1
            WHEN 'done' THEN 2
          END,
          sort_order ASC,
          created_at ASC
      `
      )
      .all()
      .map(rowToTask);
  }

  function nextSortOrder(status) {
    const row = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM tasks WHERE status = ?')
      .get(status);
    return row.next_order;
  }

  function createTask(input) {
    const task = normalizeTaskInput(input);
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `
        INSERT INTO tasks (
          title,
          start_time,
          end_time,
          description,
          status,
          sort_order,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        task.title,
        task.startTime,
        task.endTime,
        task.description,
        task.status,
        nextSortOrder(task.status),
        now,
        now
      );

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
      SET title = ?,
          start_time = ?,
          end_time = ?,
          description = ?,
          status = ?,
          updated_at = ?
      WHERE id = ?
    `
    ).run(
      task.title,
      task.startTime,
      task.endTime,
      task.description,
      task.status,
      now,
      id
    );

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
      SET status = ?,
          sort_order = ?,
          updated_at = ?
      WHERE id = ?
    `
    );

    const now = new Date().toISOString();
    for (const item of items) {
      assertStatus(item.status);
      statement.run(item.status, item.sortOrder, now, item.id);
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
