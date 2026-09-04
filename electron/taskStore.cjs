const Database = require('better-sqlite3');
const { createHash, randomUUID } = require('node:crypto');
const { cleanAssociatedPeople } = require('./people.cjs');

const TASK_STATUS_ORDER = ['todo', 'in_progress', 'done', 'canceled'];
const STATUSES = new Set(TASK_STATUS_ORDER);
const DEFAULT_TASK_TYPES = ['工作', '学习', '日常'];
const DEFAULT_TASK_TYPE_UPDATED_AT = '2000-01-01T00:00:00.000Z';
const SYNC_SCHEMA_VERSION = 1;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function taskDueDateKey(task) {
  const startDateKey = String(task.start_time || '').match(DATE_KEY_PATTERN)?.[0] || '';
  const endDateKey = String(task.end_time || '').match(DATE_KEY_PATTERN)?.[0] || '';
  if (!startDateKey) return endDateKey;
  if (!endDateKey) return startDateKey;
  return startDateKey > endDateKey ? startDateKey : endDateKey;
}

function createSyncId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function createMigratedTaskTypeSyncId(name, id) {
  if (Number(id) >= 1 && Number(id) <= DEFAULT_TASK_TYPES.length) {
    return `task-type-default-${id}`;
  }
  const digest = createHash('sha256').update(String(name).trim()).digest('hex').slice(0, 32);
  return `task-type-${digest}`;
}

function createTasksTableSql(tableName, ifNotExists = false) {
  const statusValues = TASK_STATUS_ORDER.map((status) => `'${status}'`).join(', ');
  return `
    CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_id TEXT NOT NULL,
      type_id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      associated_people TEXT NOT NULL DEFAULT '[]',
      sub_tasks TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL CHECK(status IN (${statusValues})),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (type_id) REFERENCES task_types(id) ON DELETE CASCADE
    );
  `;
}

function createTaskStore(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_id TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS sync_tombstones (
      entity_type TEXT NOT NULL CHECK(entity_type IN ('taskType', 'task')),
      sync_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, sync_id)
    );

    CREATE TABLE IF NOT EXISTS task_type_sync_aliases (
      alias_sync_id TEXT PRIMARY KEY,
      canonical_sync_id TEXT NOT NULL
    );

    ${createTasksTableSql('tasks', true)}
  `);

  const taskTypeColumns = db.prepare('PRAGMA table_info(task_types)').all();
  if (!taskTypeColumns.some((column) => column.name === 'sync_id')) {
    db.prepare('ALTER TABLE task_types ADD COLUMN sync_id TEXT').run();
  }

  let columns = db.prepare('PRAGMA table_info(tasks)').all();
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
  if (!columns.some((column) => column.name === 'sync_id')) {
    db.prepare('ALTER TABLE tasks ADD COLUMN sync_id TEXT').run();
  }

  seedDefaultTaskTypes();
  assignMissingSyncIds();

  const tasksTableSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")
    .get()?.sql;
  if (tasksTableSql && !tasksTableSql.includes("'canceled'")) {
    db.transaction(() => {
      db.exec(`
        ALTER TABLE tasks RENAME TO tasks_before_canceled_status;

        ${createTasksTableSql('tasks')}

        INSERT INTO tasks (
          id,
          sync_id,
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
        SELECT
          id,
          sync_id,
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
        FROM tasks_before_canceled_status;

        DROP TABLE tasks_before_canceled_status;
      `);
    })();
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_types_sort
      ON task_types (sort_order, created_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_task_types_sync_id
      ON task_types (sync_id);

    CREATE INDEX IF NOT EXISTS idx_tasks_status_sort
      ON tasks (status, sort_order, created_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_type_status_sort
      ON tasks (type_id, status, sort_order, created_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_sync_id
      ON tasks (sync_id);
  `);

  function seedDefaultTaskTypes() {
    const row = db.prepare('SELECT COUNT(*) AS count FROM task_types').get();
    if (row.count > 0) {
      return;
    }

    const now = new Date().toISOString();
    const statement = db.prepare(
      `
      INSERT INTO task_types (sync_id, name, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `
    );
    DEFAULT_TASK_TYPES.forEach((name, index) => {
      statement.run(
        `task-type-default-${index + 1}`,
        name,
        index,
        now,
        DEFAULT_TASK_TYPE_UPDATED_AT
      );
    });
  }

  function assignMissingSyncIds() {
    const updateTaskType = db.prepare('UPDATE task_types SET sync_id = ? WHERE id = ?');
    const updateTask = db.prepare('UPDATE tasks SET sync_id = ? WHERE id = ?');
    db.transaction(() => {
      for (const row of db.prepare("SELECT id, name FROM task_types WHERE sync_id IS NULL OR sync_id = ''").all()) {
        updateTaskType.run(createMigratedTaskTypeSyncId(row.name, row.id), row.id);
      }
      for (const row of db.prepare("SELECT id FROM tasks WHERE sync_id IS NULL OR sync_id = ''").all()) {
        updateTask.run(createSyncId('task'), row.id);
      }
    })();
  }

  function resolveTaskTypeSyncId(syncId) {
    let resolved = syncId;
    const visited = new Set();
    while (resolved && !visited.has(resolved)) {
      visited.add(resolved);
      const alias = db
        .prepare('SELECT canonical_sync_id FROM task_type_sync_aliases WHERE alias_sync_id = ?')
        .get(resolved);
      if (!alias) break;
      resolved = alias.canonical_sync_id;
    }
    return resolved;
  }

  function rememberTaskTypeAlias(firstSyncId, secondSyncId) {
    const ids = [
      String(firstSyncId || '').trim(),
      String(secondSyncId || '').trim(),
      resolveTaskTypeSyncId(firstSyncId),
      resolveTaskTypeSyncId(secondSyncId)
    ].filter(Boolean);
    const canonicalSyncId = ids.sort()[0];
    const aliases = [...new Set(ids.filter((syncId) => syncId !== canonicalSyncId))];
    const upsertAlias = db.prepare(`
      INSERT INTO task_type_sync_aliases (alias_sync_id, canonical_sync_id)
      VALUES (?, ?)
      ON CONFLICT(alias_sync_id) DO UPDATE SET canonical_sync_id = excluded.canonical_sync_id
      WHERE task_type_sync_aliases.canonical_sync_id != excluded.canonical_sync_id
    `);

    let changed = false;
    for (const aliasSyncId of aliases) {
      const result = upsertAlias.run(aliasSyncId, canonicalSyncId);
      const flattened = db.prepare(`
        UPDATE task_type_sync_aliases
        SET canonical_sync_id = ?
        WHERE canonical_sync_id = ? AND canonical_sync_id != ?
      `).run(canonicalSyncId, aliasSyncId, canonicalSyncId);
      changed ||= result.changes > 0 || flattened.changes > 0;
    }
    return { canonicalSyncId, changed };
  }

  function createSubTaskId(index) {
    return `subtask-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function parseJsonArray(value) {
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

  function rememberPeople(people, now) {
    const statement = db.prepare(`
      INSERT INTO people (name, created_at, last_used_at)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        created_at = MIN(people.created_at, excluded.created_at),
        last_used_at = MAX(people.last_used_at, excluded.last_used_at)
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
      syncId: row.sync_id,
      typeId: row.type_id,
      title: row.title,
      startTime: row.start_time,
      endTime: row.end_time,
      description: row.description,
      location: row.location,
      associatedPeople: cleanAssociatedPeople(parseJsonArray(row.associated_people)),
      subTasks: parseJsonArray(row.sub_tasks),
      status: row.status,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function rowToTaskType(row) {
    return {
      id: row.id,
      syncId: row.sync_id,
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
      associatedPeople: cleanAssociatedPeople(input.associatedPeople),
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
        INSERT INTO task_types (sync_id, name, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(createSyncId('task-type'), taskType.name, nextTaskTypeSortOrder(), now, now);

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

  const reorderTaskTypesTransaction = db.transaction((items) => {
    const statement = db.prepare(
      `
      UPDATE task_types
      SET sort_order = ?,
          updated_at = ?
      WHERE id = ?
    `
    );
    const now = new Date().toISOString();

    for (const item of items) {
      if (!getTaskType(item.id)) {
        throw new Error(`Task type not found: ${item.id}`);
      }
      statement.run(item.sortOrder, now, item.id);
    }
  });

  function reorderTaskTypes(items) {
    reorderTaskTypesTransaction(items);
    return listTaskTypes();
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

    const now = new Date().toISOString();
    const tasksToDelete = db.prepare('SELECT sync_id FROM tasks WHERE type_id = ?').all(id);
    const typeSyncIds = [
      existing.syncId,
      ...db
        .prepare('SELECT alias_sync_id FROM task_type_sync_aliases WHERE canonical_sync_id = ?')
        .all(existing.syncId)
        .map((row) => row.alias_sync_id)
    ];
    const addTombstone = db.prepare(`
      INSERT INTO sync_tombstones (entity_type, sync_id, deleted_at)
      VALUES (?, ?, ?)
      ON CONFLICT(entity_type, sync_id) DO UPDATE SET deleted_at = excluded.deleted_at
    `);
    db.transaction(() => {
      for (const task of tasksToDelete) {
        addTombstone.run('task', task.sync_id, now);
      }
      for (const syncId of typeSyncIds) {
        addTombstone.run('taskType', syncId, now);
      }
      db.prepare('DELETE FROM tasks WHERE type_id = ?').run(id);
      db.prepare('DELETE FROM task_types WHERE id = ?').run(id);
    })();
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
            ${TASK_STATUS_ORDER.map((status, index) => `WHEN '${status}' THEN ${index}`).join('\n            ')}
          END,
          sort_order ASC,
          created_at ASC
      `
      )
      .all(...values)
      .map(rowToTask);
  }

  const completeOldTasksTransaction = db.transaction((now) => {
    const cutoff = new Date(now);
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 2);
    const cutoffDateKey = toLocalDateKey(cutoff);
    const candidates = db
      .prepare("SELECT * FROM tasks WHERE status IN ('todo', 'in_progress') ORDER BY type_id, sort_order, created_at")
      .all()
      .filter((task) => {
        const dueDateKey = taskDueDateKey(task);
        return dueDateKey && dueDateKey <= cutoffDateKey;
      });

    const nextDoneSortOrderByType = new Map();
    const updateTask = db.prepare(`
      UPDATE tasks
      SET status = 'done',
          sort_order = ?,
          updated_at = ?
      WHERE id = ?
    `);
    const updatedAt = new Date(now).toISOString();

    for (const task of candidates) {
      if (!nextDoneSortOrderByType.has(task.type_id)) {
        const row = db
          .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM tasks WHERE type_id = ? AND status = 'done'")
          .get(task.type_id);
        nextDoneSortOrderByType.set(task.type_id, row.next_order);
      }
      const sortOrder = nextDoneSortOrderByType.get(task.type_id);
      updateTask.run(sortOrder, updatedAt, task.id);
      nextDoneSortOrderByType.set(task.type_id, sortOrder + 1);
    }

    return candidates.map((task) => rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)));
  });

  function completeOldTasks(now = new Date()) {
    return completeOldTasksTransaction(now);
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
          sync_id,
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        createSyncId('task'),
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
    const sortOrder = task.typeId === existing.typeId
      ? existing.sortOrder
      : nextSortOrder(task.typeId, task.status);
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
          sort_order = ?,
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
      sortOrder,
      now,
      id
    );

    rememberPeople(task.associatedPeople, now);

    return getTask(id);
  }

  function deleteTask(id) {
    const existing = getTask(id);
    if (!existing) {
      return { ok: true };
    }

    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`
        INSERT INTO sync_tombstones (entity_type, sync_id, deleted_at)
        VALUES ('task', ?, ?)
        ON CONFLICT(entity_type, sync_id) DO UPDATE SET deleted_at = excluded.deleted_at
      `).run(existing.syncId, now);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    })();
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

  function exportSyncSnapshot() {
    const taskTypes = listTaskTypes().map(({ id, ...taskType }) => taskType);
    const typeSyncIds = new Map(listTaskTypes().map((taskType) => [taskType.id, taskType.syncId]));
    const tasks = listTasks().map(({ id, typeId, ...task }) => ({
      ...task,
      typeSyncId: typeSyncIds.get(typeId)
    }));
    const people = listPeople().map(({ id, ...person }) => person);
    const tombstones = db
      .prepare(`
        SELECT entity_type, sync_id, deleted_at
        FROM sync_tombstones
        ORDER BY entity_type ASC, sync_id ASC
      `)
      .all()
      .map((row) => ({
        entityType: row.entity_type,
        syncId: row.sync_id,
        deletedAt: row.deleted_at
      }));
    const aliases = db
      .prepare(`
        SELECT alias_sync_id, canonical_sync_id
        FROM task_type_sync_aliases
        ORDER BY alias_sync_id ASC
      `)
      .all()
      .map((row) => ({
        entityType: 'taskType',
        syncId: row.alias_sync_id,
        canonicalSyncId: row.canonical_sync_id
      }));

    return {
      schemaVersion: SYNC_SCHEMA_VERSION,
      taskTypes,
      tasks,
      people,
      tombstones,
      aliases
    };
  }

  function isValidDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }

  function shouldApplyRemote(remote, local, toComparableValue) {
    const remoteTime = Date.parse(remote.updatedAt);
    const localTime = Date.parse(local.updatedAt);
    if (remoteTime !== localTime) {
      return remoteTime > localTime;
    }

    return JSON.stringify(toComparableValue(remote)) > JSON.stringify(toComparableValue(local));
  }

  function normalizeRemoteTaskType(taskType) {
    const syncId = String(taskType?.syncId || '').trim();
    const name = String(taskType?.name || '').trim();
    if (!syncId || !name || !isValidDate(taskType?.createdAt) || !isValidDate(taskType?.updatedAt)) {
      return null;
    }

    return {
      syncId,
      name,
      sortOrder: Number.isFinite(Number(taskType.sortOrder)) ? Number(taskType.sortOrder) : 0,
      createdAt: new Date(taskType.createdAt).toISOString(),
      updatedAt: new Date(taskType.updatedAt).toISOString()
    };
  }

  function normalizeRemoteTask(task) {
    const syncId = String(task?.syncId || '').trim();
    const typeSyncId = String(task?.typeSyncId || '').trim();
    const title = String(task?.title || '').trim();
    const status = String(task?.status || 'todo');
    if (
      !syncId ||
      !typeSyncId ||
      !title ||
      !STATUSES.has(status) ||
      !isValidDate(task?.createdAt) ||
      !isValidDate(task?.updatedAt)
    ) {
      return null;
    }

    return {
      syncId,
      typeSyncId,
      title,
      startTime: String(task.startTime || ''),
      endTime: String(task.endTime || ''),
      description: String(task.description || ''),
      location: String(task.location || '').trim(),
      associatedPeople: cleanAssociatedPeople(task.associatedPeople),
      subTasks: normalizeSubTasks(task.subTasks),
      status,
      sortOrder: Number.isFinite(Number(task.sortOrder)) ? Number(task.sortOrder) : 0,
      createdAt: new Date(task.createdAt).toISOString(),
      updatedAt: new Date(task.updatedAt).toISOString()
    };
  }

  function mergeSyncSnapshots(snapshots) {
    if (!Array.isArray(snapshots)) {
      throw new TypeError('snapshots must be an array');
    }

    let changed = false;
    let mergedTaskTypes = 0;
    let mergedTasks = 0;

    db.transaction(() => {
      const validSnapshots = snapshots.filter(
        (snapshot) => snapshot && Number(snapshot.schemaVersion) === SYNC_SCHEMA_VERSION
      );

      for (const snapshot of validSnapshots) {
        for (const alias of Array.isArray(snapshot.aliases) ? snapshot.aliases : []) {
          const syncId = String(alias?.syncId || '').trim();
          const canonicalSyncId = String(alias?.canonicalSyncId || '').trim();
          if (alias?.entityType !== 'taskType' || !syncId || !canonicalSyncId || syncId === canonicalSyncId) {
            continue;
          }
          const aliasResult = rememberTaskTypeAlias(syncId, canonicalSyncId);
          changed ||= aliasResult.changed;
        }
      }

      for (const alias of db.prepare('SELECT * FROM task_type_sync_aliases').all()) {
        const canonicalSyncId = resolveTaskTypeSyncId(alias.canonical_sync_id);
        const aliasRow = db.prepare('SELECT * FROM task_types WHERE sync_id = ?').get(alias.alias_sync_id);
        const canonicalRow = db.prepare('SELECT * FROM task_types WHERE sync_id = ?').get(canonicalSyncId);
        if (!aliasRow) {
          continue;
        }
        if (!canonicalRow) {
          db.prepare('UPDATE task_types SET sync_id = ? WHERE id = ?').run(canonicalSyncId, aliasRow.id);
        } else {
          db.prepare('UPDATE tasks SET type_id = ? WHERE type_id = ?').run(canonicalRow.id, aliasRow.id);
          db.prepare('DELETE FROM task_types WHERE id = ?').run(aliasRow.id);
        }
        changed = true;
      }

      const getTombstone = db.prepare(
        'SELECT deleted_at FROM sync_tombstones WHERE entity_type = ? AND sync_id = ?'
      );
      const upsertTombstone = db.prepare(`
        INSERT INTO sync_tombstones (entity_type, sync_id, deleted_at)
        VALUES (?, ?, ?)
        ON CONFLICT(entity_type, sync_id) DO UPDATE SET deleted_at = excluded.deleted_at
        WHERE excluded.deleted_at > sync_tombstones.deleted_at
      `);

      for (const snapshot of validSnapshots) {
        for (const tombstone of Array.isArray(snapshot.tombstones) ? snapshot.tombstones : []) {
          const entityType = tombstone?.entityType;
          const syncId = String(tombstone?.syncId || '').trim();
          if (!['taskType', 'task'].includes(entityType) || !syncId || !isValidDate(tombstone?.deletedAt)) {
            continue;
          }
          const deletedAt = new Date(tombstone.deletedAt).toISOString();
          const result = upsertTombstone.run(
            entityType,
            syncId,
            deletedAt
          );
          changed ||= result.changes > 0;
          if (entityType === 'taskType') {
            const canonicalSyncId = resolveTaskTypeSyncId(syncId);
            if (canonicalSyncId !== syncId) {
              const canonicalResult = upsertTombstone.run(entityType, canonicalSyncId, deletedAt);
              changed ||= canonicalResult.changes > 0;
            }
          }
        }
      }

      for (const tombstone of db.prepare('SELECT * FROM sync_tombstones').all()) {
        const table = tombstone.entity_type === 'task' ? 'tasks' : 'task_types';
        const syncId = tombstone.entity_type === 'taskType'
          ? resolveTaskTypeSyncId(tombstone.sync_id)
          : tombstone.sync_id;
        const result = db.prepare(`DELETE FROM ${table} WHERE sync_id = ?`).run(syncId);
        changed ||= result.changes > 0;
      }

      const remoteTypeIdMap = new Map();
      const typeComparable = (taskType) => ({
        name: taskType.name,
        sortOrder: taskType.sortOrder,
        createdAt: taskType.createdAt
      });

      for (const snapshot of validSnapshots) {
        for (const rawTaskType of Array.isArray(snapshot.taskTypes) ? snapshot.taskTypes : []) {
          const taskType = normalizeRemoteTaskType(rawTaskType);
          if (!taskType) {
            continue;
          }
          const canonicalSyncId = resolveTaskTypeSyncId(taskType.syncId);
          if (
            getTombstone.get('taskType', taskType.syncId) ||
            getTombstone.get('taskType', canonicalSyncId)
          ) {
            continue;
          }

          let localRow = db.prepare('SELECT * FROM task_types WHERE sync_id = ?').get(canonicalSyncId);
          if (!localRow) {
            const sameNameRow = db.prepare('SELECT * FROM task_types WHERE name = ?').get(taskType.name);
            if (sameNameRow) {
              const aliasResult = rememberTaskTypeAlias(sameNameRow.sync_id, canonicalSyncId);
              const mergedSyncId = aliasResult.canonicalSyncId;
              if (sameNameRow.sync_id !== mergedSyncId) {
                db.prepare('UPDATE task_types SET sync_id = ? WHERE id = ?').run(mergedSyncId, sameNameRow.id);
                changed = true;
              }
              localRow = db.prepare('SELECT * FROM task_types WHERE id = ?').get(sameNameRow.id);
              remoteTypeIdMap.set(taskType.syncId, sameNameRow.id);
              remoteTypeIdMap.set(mergedSyncId, sameNameRow.id);
            } else {
              const result = db.prepare(`
                INSERT INTO task_types (sync_id, name, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
              `).run(
                canonicalSyncId,
                taskType.name,
                taskType.sortOrder,
                taskType.createdAt,
                taskType.updatedAt
              );
              remoteTypeIdMap.set(taskType.syncId, Number(result.lastInsertRowid));
              remoteTypeIdMap.set(canonicalSyncId, Number(result.lastInsertRowid));
              changed = true;
              mergedTaskTypes += 1;
              continue;
            }
          }

          remoteTypeIdMap.set(taskType.syncId, localRow.id);
          remoteTypeIdMap.set(canonicalSyncId, localRow.id);
          const localTaskType = rowToTaskType(localRow);
          if (!shouldApplyRemote(taskType, localTaskType, typeComparable)) {
            continue;
          }

          const conflictingName = db
            .prepare('SELECT id FROM task_types WHERE name = ? AND id != ?')
            .get(taskType.name, localRow.id);
          if (conflictingName) {
            remoteTypeIdMap.set(taskType.syncId, conflictingName.id);
            continue;
          }

          db.prepare(`
            UPDATE task_types
            SET name = ?, sort_order = ?, created_at = ?, updated_at = ?
            WHERE id = ?
          `).run(
            taskType.name,
            taskType.sortOrder,
            taskType.createdAt,
            taskType.updatedAt,
            localRow.id
          );
          changed = true;
          mergedTaskTypes += 1;
        }
      }

      if (db.prepare('SELECT COUNT(*) AS count FROM task_types').get().count === 0) {
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO task_types (sync_id, name, sort_order, created_at, updated_at)
          VALUES (?, '工作', 0, ?, ?)
        `).run(createSyncId('task-type'), now, now);
        changed = true;
      }

      const taskComparable = (task) => ({
        typeSyncId: task.typeSyncId,
        title: task.title,
        startTime: task.startTime,
        endTime: task.endTime,
        description: task.description,
        location: task.location,
        associatedPeople: task.associatedPeople,
        subTasks: task.subTasks,
        status: task.status,
        sortOrder: task.sortOrder,
        createdAt: task.createdAt
      });

      for (const snapshot of validSnapshots) {
        for (const rawTask of Array.isArray(snapshot.tasks) ? snapshot.tasks : []) {
          const task = normalizeRemoteTask(rawTask);
          if (!task || getTombstone.get('task', task.syncId)) {
            continue;
          }

          const taskTypeId =
            remoteTypeIdMap.get(task.typeSyncId) ||
            remoteTypeIdMap.get(resolveTaskTypeSyncId(task.typeSyncId)) ||
            db
              .prepare('SELECT id FROM task_types WHERE sync_id = ?')
              .get(resolveTaskTypeSyncId(task.typeSyncId))?.id;
          if (!taskTypeId) {
            continue;
          }

          const localRow = db.prepare('SELECT * FROM tasks WHERE sync_id = ?').get(task.syncId);
          if (!localRow) {
            db.prepare(`
              INSERT INTO tasks (
                sync_id, type_id, title, start_time, end_time, description, location,
                associated_people, sub_tasks, status, sort_order, created_at, updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              task.syncId,
              taskTypeId,
              task.title,
              task.startTime,
              task.endTime,
              task.description,
              task.location,
              JSON.stringify(task.associatedPeople),
              JSON.stringify(task.subTasks),
              task.status,
              task.sortOrder,
              task.createdAt,
              task.updatedAt
            );
            rememberPeople(task.associatedPeople, task.updatedAt);
            changed = true;
            mergedTasks += 1;
            continue;
          }

          const localTask = rowToTask(localRow);
          localTask.typeSyncId = db
            .prepare('SELECT sync_id FROM task_types WHERE id = ?')
            .get(localTask.typeId)?.sync_id;
          if (!shouldApplyRemote(task, localTask, taskComparable)) {
            continue;
          }

          db.prepare(`
            UPDATE tasks
            SET type_id = ?, title = ?, start_time = ?, end_time = ?, description = ?,
                location = ?, associated_people = ?, sub_tasks = ?, status = ?, sort_order = ?,
                created_at = ?, updated_at = ?
            WHERE id = ?
          `).run(
            taskTypeId,
            task.title,
            task.startTime,
            task.endTime,
            task.description,
            task.location,
            JSON.stringify(task.associatedPeople),
            JSON.stringify(task.subTasks),
            task.status,
            task.sortOrder,
            task.createdAt,
            task.updatedAt,
            localRow.id
          );
          rememberPeople(task.associatedPeople, task.updatedAt);
          changed = true;
          mergedTasks += 1;
        }

        for (const person of Array.isArray(snapshot.people) ? snapshot.people : []) {
          const name = String(person?.name || '').trim();
          if (!name || !isValidDate(person?.createdAt) || !isValidDate(person?.lastUsedAt)) {
            continue;
          }
          const before = db.prepare('SELECT created_at, last_used_at FROM people WHERE name = ?').get(name);
          rememberPeople([name], new Date(person.lastUsedAt).toISOString());
          const createdAt = new Date(person.createdAt).toISOString();
          db.prepare('UPDATE people SET created_at = MIN(created_at, ?) WHERE name = ?').run(createdAt, name);
          const after = db.prepare('SELECT created_at, last_used_at FROM people WHERE name = ?').get(name);
          changed ||= JSON.stringify(before) !== JSON.stringify(after);
        }
      }
    })();

    return { changed, mergedTaskTypes, mergedTasks };
  }

  function close() {
    db.close();
  }

  return {
    db,
    listTaskTypes,
    createTaskType,
    updateTaskType,
    reorderTaskTypes,
    deleteTaskType,
    listPeople,
    listTasks,
    getTask,
    createTask,
    updateTask,
    deleteTask,
    reorderTasks,
    completeOldTasks,
    exportSyncSnapshot,
    mergeSyncSnapshots,
    close
  };
}

module.exports = {
  createTaskStore
};
