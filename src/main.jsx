import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  GripVertical,
  Layers2,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react';
import { createEmptyTaskForm } from './taskForm.js';
import './styles.css';

const STATUSES = [
  {
    id: 'todo',
    label: '待办',
    icon: Circle,
    tone: 'blue'
  },
  {
    id: 'in_progress',
    label: '进行中',
    icon: LoaderCircle,
    tone: 'amber'
  },
  {
    id: 'done',
    label: '完成',
    icon: CheckCircle2,
    tone: 'green'
  }
];

function getTaskApi() {
  if (!window.taskApi) {
    throw new Error('任务 API 未加载，请通过 Electron 启动应用。');
  }
  return window.taskApi;
}

function normalizeSortOrders(tasks) {
  const counters = { todo: 0, in_progress: 0, done: 0 };
  return tasks.map((task) => {
    const sortOrder = counters[task.status];
    counters[task.status] += 1;
    return { ...task, sortOrder };
  });
}

function groupTasks(tasks) {
  return STATUSES.reduce((groups, status) => {
    groups[status.id] = tasks
      .filter((task) => task.status === status.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return groups;
  }, {});
}

function formatTimeRange(task) {
  const start = formatDateTime(task.startTime);
  const end = formatDateTime(task.endTime);
  if (start && end) {
    return `${start} - ${end}`;
  }
  return start || end || '未设时间';
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace('T', ' ');
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function createSubTaskId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `subtask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSubTasksForForm(subTasks = []) {
  if (!Array.isArray(subTasks)) {
    return [];
  }

  return subTasks.map((subTask) => ({
    id: subTask.id || createSubTaskId(),
    title: subTask.title || '',
    completed: Boolean(subTask.completed)
  }));
}

function cleanSubTasksForSave(subTasks = []) {
  return normalizeSubTasksForForm(subTasks)
    .map((subTask) => ({
      ...subTask,
      title: subTask.title.trim()
    }))
    .filter((subTask) => subTask.title);
}

function getSubTaskProgress(subTasks = []) {
  const total = Array.isArray(subTasks) ? subTasks.length : 0;
  const completed = total ? subTasks.filter((subTask) => subTask.completed).length : 0;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  return { total, completed, percent };
}

function App() {
  const [taskTypes, setTaskTypes] = useState([]);
  const [activeTypeId, setActiveTypeId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalTask, setModalTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taskPendingDelete, setTaskPendingDelete] = useState(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [editingTypeId, setEditingTypeId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const activeTypeIdRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const grouped = useMemo(() => groupTasks(tasks), [tasks]);
  const totalTasks = tasks.length;
  const doneTasks = grouped.done.length;
  const activeTasks = grouped.todo.length + grouped.in_progress.length;
  const activeType = taskTypes.find((type) => type.id === activeTypeId);

  async function loadBoardData({ preferredTypeId = activeTypeIdRef.current, showLoading = true } = {}) {
    try {
      if (showLoading) {
        setLoading(true);
      }
      setError('');
      const loadedTypes = await getTaskApi().listTaskTypes();
      const nextTypeId = loadedTypes.some((type) => type.id === preferredTypeId)
        ? preferredTypeId
        : loadedTypes[0]?.id || null;
      const loadedTasks = nextTypeId ? await getTaskApi().listTasks(nextTypeId) : [];
      setTaskTypes(loadedTypes);
      setActiveTypeId(nextTypeId);
      activeTypeIdRef.current = nextTypeId;
      setTasks(loadedTasks);
    } catch (err) {
      setError(err.message || '加载任务失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadTasks(typeId = activeTypeId) {
    if (!typeId) {
      setTasks([]);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const loadedTasks = await getTaskApi().listTasks(typeId);
      setTasks(loadedTasks);
    } catch (err) {
      setError(err.message || '加载任务失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBoardData();
  }, []);

  useEffect(() => {
    activeTypeIdRef.current = activeTypeId;
  }, [activeTypeId]);

  useEffect(() => {
    const unsubscribe = getTaskApi().onTasksChanged?.(() => {
      loadBoardData({ preferredTypeId: activeTypeIdRef.current, showLoading: false });
    });
    return unsubscribe;
  }, []);

  async function handleRefresh() {
    try {
      setIsRefreshing(true);
      await loadBoardData({ preferredTypeId: activeTypeIdRef.current, showLoading: false });
    } finally {
      setIsRefreshing(false);
    }
  }

  function openNewTask() {
    if (!activeTypeId) {
      setError('请先创建一个任务类型');
      return;
    }
    setModalTask(null);
    setIsModalOpen(true);
  }

  function openEditTask(task) {
    setModalTask(task);
    setIsModalOpen(true);
  }

  async function handleSaveTask(taskInput) {
    try {
      setError('');
      const typeId = modalTask?.typeId || activeTypeId;
      if (modalTask) {
        const updated = await getTaskApi().updateTask({ id: modalTask.id, ...taskInput, typeId });
        setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
      } else {
        const created = await getTaskApi().createTask({ ...taskInput, typeId });
        setTasks((current) => normalizeSortOrders([...current, created]));
      }
      setIsModalOpen(false);
      setModalTask(null);
    } catch (err) {
      setError(err.message || '保存任务失败');
    }
  }

  function handleRequestDeleteTask(task) {
    setTaskPendingDelete(task);
  }

  async function handleConfirmDeleteTask() {
    if (!taskPendingDelete || isDeletingTask) {
      return;
    }

    try {
      setIsDeletingTask(true);
      setError('');
      await getTaskApi().deleteTask(taskPendingDelete.id);
      setTasks((current) => normalizeSortOrders(current.filter((task) => task.id !== taskPendingDelete.id)));
      setTaskPendingDelete(null);
    } catch (err) {
      setError(err.message || '删除任务失败');
    } finally {
      setIsDeletingTask(false);
    }
  }

  async function handleToggleSubTask(task, subTaskId) {
    const subTasks = normalizeSubTasksForForm(task.subTasks).map((subTask) =>
      subTask.id === subTaskId ? { ...subTask, completed: !subTask.completed } : subTask
    );
    const nextTask = { ...task, subTasks };

    setTasks((current) => current.map((item) => (item.id === task.id ? nextTask : item)));
    try {
      setError('');
      const updated = await getTaskApi().updateTask({
        id: task.id,
        title: task.title,
        typeId: task.typeId || activeTypeId,
        startTime: task.startTime || '',
        endTime: task.endTime || '',
        description: task.description || '',
        status: task.status || 'todo',
        subTasks
      });
      setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err.message || '保存小任务失败');
      loadTasks(activeTypeId);
    }
  }

  async function handleSelectType(typeId) {
    if (typeId === activeTypeId) {
      return;
    }

    setActiveTypeId(typeId);
    activeTypeIdRef.current = typeId;
    await loadTasks(typeId);
  }

  async function handleTypeFormSubmit(event) {
    event.preventDefault();
    if (editingTypeId) {
      await handleSaveTypeName();
      return;
    }
    await handleCreateType();
  }

  async function handleCreateType() {
    const name = newTypeName.trim();
    if (!name) {
      return;
    }

    try {
      setError('');
      const created = await getTaskApi().createTaskType({ name });
      setTaskTypes((current) => [...current, created]);
      setNewTypeName('');
      setActiveTypeId(created.id);
      activeTypeIdRef.current = created.id;
      setTasks([]);
    } catch (err) {
      setError(err.message || '创建类型失败');
    }
  }

  function startEditType(type) {
    setEditingTypeId(type.id);
    setNewTypeName(type.name);
  }

  async function handleSaveTypeName() {
    const name = newTypeName.trim();
    if (!editingTypeId || !name) {
      return;
    }

    try {
      setError('');
      const updated = await getTaskApi().updateTaskType({ id: editingTypeId, name });
      setTaskTypes((current) => current.map((type) => (type.id === updated.id ? updated : type)));
      setEditingTypeId(null);
      setNewTypeName('');
    } catch (err) {
      setError(err.message || '修改类型失败');
    }
  }

  function cancelEditType() {
    setEditingTypeId(null);
    setNewTypeName('');
  }

  async function handleDeleteType(type) {
    if (taskTypes.length <= 1) {
      setError('至少保留一个任务类型');
      return;
    }

    const taskCount = type.id === activeTypeId ? totalTasks : null;
    const taskHint =
      taskCount === null
        ? '该类型下的任务也会一起删除。'
        : `该类型下的 ${taskCount} 个任务也会一起删除。`;
    if (!window.confirm(`删除「${type.name}」？${taskHint}`)) {
      return;
    }

    try {
      setError('');
      await getTaskApi().deleteTaskType(type.id);
      const remainingTypes = taskTypes.filter((item) => item.id !== type.id);
      setTaskTypes(remainingTypes);
      if (editingTypeId === type.id) {
        cancelEditType();
      }

      if (type.id === activeTypeId) {
        const nextTypeId = remainingTypes[0]?.id || null;
        setActiveTypeId(nextTypeId);
        activeTypeIdRef.current = nextTypeId;
        await loadTasks(nextTypeId);
      }
    } catch (err) {
      setError(err.message || '删除类型失败');
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const activeId = Number(active.id);
    const activeTask = tasks.find((task) => task.id === activeId);
    if (!activeTask) {
      return;
    }

    const overType = over.data.current?.type;
    const targetStatus =
      overType === 'column'
        ? over.data.current.status
        : tasks.find((task) => task.id === Number(over.id))?.status;

    if (!targetStatus) {
      return;
    }

    const withoutActive = tasks.filter((task) => task.id !== activeId);
    const movedTask = { ...activeTask, status: targetStatus };
    const overTaskIndex = withoutActive.findIndex((task) => task.id === Number(over.id));
    const insertIndex =
      overType === 'task' && overTaskIndex >= 0
        ? overTaskIndex
        : withoutActive.findLastIndex((task) => task.status === targetStatus) + 1;
    const nextTasks = [...withoutActive];
    nextTasks.splice(Math.max(insertIndex, 0), 0, movedTask);
    const normalized = normalizeSortOrders(nextTasks);

    setTasks(normalized);
    try {
      await getTaskApi().reorderTasks(
        normalized.map((task) => ({
          id: task.id,
          typeId: task.typeId || activeTypeId,
          status: task.status,
          sortOrder: task.sortOrder
        }))
      );
    } catch (err) {
      setError(err.message || '保存排序失败');
      loadTasks(activeTypeId);
    }
  }

  return (
    <main className="app-shell">
      <div className="window-drag-strip" aria-hidden="true" />
      <header className="topbar">
        <div>
          <p className="eyebrow">Local SQLite Board</p>
          <h1>{activeType ? `${activeType.name}任务` : '任务管理'}</h1>
        </div>
        <div className="topbar-actions">
          <div className="stats" aria-label="任务统计">
            <span>{totalTasks} 个任务</span>
            <span>{activeTasks} 个未完成</span>
            <span>{doneTasks} 个完成</span>
          </div>
          <button
            className="secondary-button refresh-button"
            type="button"
            onClick={handleRefresh}
            disabled={loading || isRefreshing}
            title="刷新任务"
          >
            <RefreshCw size={17} className={isRefreshing ? 'spin-icon' : ''} />
            刷新
          </button>
          <button className="primary-button" type="button" onClick={openNewTask} disabled={!activeTypeId}>
            <Plus size={18} />
            新增任务
          </button>
        </div>
      </header>

      <section className="type-toolbar" aria-label="任务类型">
        <div className="type-tabs" role="tablist" aria-label="切换任务类型">
          {taskTypes.map((type) => (
            <div key={type.id} className={`type-tab ${type.id === activeTypeId ? 'active' : ''}`}>
              <button
                className="type-tab-main"
                type="button"
                role="tab"
                aria-selected={type.id === activeTypeId}
                onClick={() => handleSelectType(type.id)}
              >
                <Layers2 size={15} />
                {type.name}
              </button>
              <button className="type-action-button" type="button" onClick={() => startEditType(type)} aria-label="修改类型名称">
                <Pencil size={13} />
              </button>
              <button
                className="type-action-button danger"
                type="button"
                onClick={() => handleDeleteType(type)}
                aria-label="删除类型"
                disabled={taskTypes.length <= 1}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <form className="type-form" onSubmit={handleTypeFormSubmit}>
          <input
            value={newTypeName}
            onChange={(event) => setNewTypeName(event.target.value)}
            placeholder={editingTypeId ? '类型名称' : '新类型'}
            aria-label="新任务类型名称"
          />
          {editingTypeId ? (
            <div className="type-form-actions">
              <button className="secondary-button" type="button" onClick={cancelEditType}>
                取消
              </button>
              <button className="primary-button compact" type="button" onClick={handleSaveTypeName}>
                保存
              </button>
            </div>
          ) : (
            <button className="secondary-button" type="submit">
              <Plus size={16} />
              添加类型
            </button>
          )}
        </form>
      </section>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-panel">
          <LoaderCircle size={24} />
          正在加载任务
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <section className="board" aria-label="任务看板">
            {STATUSES.map((status) => (
              <TaskColumn
                key={status.id}
                status={status}
                tasks={grouped[status.id]}
                onEdit={openEditTask}
                onDelete={handleRequestDeleteTask}
                onToggleSubTask={handleToggleSubTask}
              />
            ))}
          </section>
        </DndContext>
      )}

      {isModalOpen && (
        <TaskModal
          task={modalTask}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveTask}
        />
      )}

      {taskPendingDelete && (
        <ConfirmDeleteTaskDialog
          task={taskPendingDelete}
          onCancel={() => setTaskPendingDelete(null)}
          onConfirm={handleConfirmDeleteTask}
          isDeleting={isDeletingTask}
        />
      )}
    </main>
  );
}

function handleTaskListWheel(event) {
  const list = event.currentTarget;
  if (list.scrollHeight <= list.clientHeight) {
    return;
  }

  const previousScrollTop = list.scrollTop;
  event.currentTarget.scrollTop += event.deltaY;
  if (list.scrollTop !== previousScrollTop) {
    event.preventDefault();
  }
}

function handleTaskListKeyDown(event) {
  const list = event.currentTarget;
  const pageStep = Math.max(list.clientHeight - 40, 80);
  const keySteps = {
    ArrowDown: 48,
    ArrowUp: -48,
    PageDown: pageStep,
    PageUp: -pageStep
  };

  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp':
    case 'PageDown':
    case 'PageUp':
      scrollTaskList(list, keySteps[event.key]);
      event.preventDefault();
      break;
    case 'Home':
      list.scrollTop = 0;
      event.preventDefault();
      break;
    case 'End':
      list.scrollTop = list.scrollHeight;
      event.preventDefault();
      break;
    default:
      break;
  }
}

function scrollTaskList(list, delta) {
  list.scrollTop += delta;
}

function TaskColumn({ status, tasks, onEdit, onDelete, onToggleSubTask }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${status.id}`,
    data: { type: 'column', status: status.id }
  });
  const Icon = status.icon;

  return (
    <div className={`column column-${status.tone} ${isOver ? 'is-over' : ''}`} ref={setNodeRef}>
      <div className="column-header">
        <div className="column-title">
          <Icon size={18} />
          <h2>{status.label}</h2>
        </div>
        <span className="count-badge">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((task) => String(task.id))} strategy={verticalListSortingStrategy}>
        <div
          className="task-list"
          tabIndex={0}
          aria-label={`${status.label}任务列表`}
          onWheel={handleTaskListWheel}
          onKeyDown={handleTaskListKeyDown}
        >
          {tasks.length === 0 ? (
            <div className="empty-state">把任务拖到这里</div>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleSubTask={onToggleSubTask}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete, onToggleSubTask }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(task.id),
    data: { type: 'task', status: task.status }
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const cardClassName = ['task-card', `task-card-${task.status}`, isDragging ? 'dragging' : '']
    .filter(Boolean)
    .join(' ');
  const subTasks = normalizeSubTasksForForm(task.subTasks);
  const subTaskProgress = getSubTaskProgress(subTasks);

  return (
    <article ref={setNodeRef} style={style} className={cardClassName}>
      <div className="task-card-top">
        <h3>{task.title}</h3>
        {subTaskProgress.total > 0 && (
          <div
            className="subtask-progress"
            style={{ '--progress': subTaskProgress.percent }}
            aria-label={`小任务完成度 ${subTaskProgress.completed}/${subTaskProgress.total}`}
            title={`${subTaskProgress.completed}/${subTaskProgress.total}`}
          >
            <span>{subTaskProgress.percent}%</span>
          </div>
        )}
        <button className="icon-button drag-handle" type="button" {...attributes} {...listeners} aria-label="拖拽任务">
          <GripVertical size={17} />
        </button>
      </div>
      <p className="task-time">
        <CalendarDays size={15} />
        {formatTimeRange(task)}
      </p>
      {task.description ? (
        <p className="task-description">{task.description}</p>
      ) : (
        <p className="task-description muted">没有详细内容</p>
      )}
      {subTasks.length > 0 && (
        <div className="subtask-list" aria-label="小任务列表">
          {subTasks.map((subTask) => (
            <label key={subTask.id} className={`subtask-item ${subTask.completed ? 'completed' : ''}`}>
              <input
                type="checkbox"
                checked={subTask.completed}
                onChange={() => onToggleSubTask(task, subTask.id)}
              />
              <span>{subTask.title}</span>
            </label>
          ))}
        </div>
      )}
      <div className="task-actions">
        <button className="ghost-button" type="button" onClick={() => onEdit(task)}>
          <Pencil size={15} />
          编辑
        </button>
        <button className="ghost-button danger" type="button" onClick={() => onDelete(task)}>
          <Trash2 size={15} />
          删除
        </button>
      </div>
    </article>
  );
}

function TaskModal({ task, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    ...(task || createEmptyTaskForm()),
    subTasks: normalizeSubTasksForForm(task?.subTasks)
  }));
  const [formError, setFormError] = useState('');
  const subTaskListRef = useRef(null);
  const subTaskInputRefs = useRef(new Map());
  const pendingSubTaskIdRef = useRef(null);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addSubTask() {
    const id = createSubTaskId();
    pendingSubTaskIdRef.current = id;
    setForm((current) => ({
      ...current,
      subTasks: [
        ...normalizeSubTasksForForm(current.subTasks),
        { id, title: '', completed: false }
      ]
    }));
  }

  function updateSubTask(id, patch) {
    setForm((current) => ({
      ...current,
      subTasks: normalizeSubTasksForForm(current.subTasks).map((subTask) =>
        subTask.id === id ? { ...subTask, ...patch } : subTask
      )
    }));
  }

  function removeSubTask(id) {
    setForm((current) => ({
      ...current,
      subTasks: normalizeSubTasksForForm(current.subTasks).filter((subTask) => subTask.id !== id)
    }));
  }

  function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) {
      setFormError('任务名称不能为空');
      return;
    }
    setFormError('');
    onSave({
      title: form.title.trim(),
      startTime: form.startTime || '',
      endTime: form.endTime || '',
      description: form.description || '',
      status: form.status || 'todo',
      subTasks: cleanSubTasksForSave(form.subTasks)
    });
  }

  const formSubTasks = normalizeSubTasksForForm(form.subTasks);

  useEffect(() => {
    const pendingId = pendingSubTaskIdRef.current;
    if (!pendingId) {
      return undefined;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      subTaskListRef.current?.scrollTo({
        top: subTaskListRef.current.scrollHeight,
        behavior: 'smooth'
      });
      subTaskInputRefs.current.get(pendingId)?.focus();
      pendingSubTaskIdRef.current = null;
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [formSubTasks.length]);

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="task-modal" onSubmit={submit}>
        <div className="modal-header">
          <h2>{task ? '编辑任务' : '新增任务'}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <label>
          <span>名称</span>
          <input
            value={form.title}
            onChange={(event) => updateField('title', event.target.value)}
            placeholder="输入任务名称"
            autoFocus
          />
        </label>

        <div className="form-grid">
          <label>
            <span>开始时间</span>
            <input
              type="datetime-local"
              value={form.startTime}
              onChange={(event) => updateField('startTime', event.target.value)}
            />
          </label>
          <label>
            <span>结束时间</span>
            <input
              type="datetime-local"
              value={form.endTime}
              onChange={(event) => updateField('endTime', event.target.value)}
            />
          </label>
        </div>

        <label>
          <span>状态</span>
          <select value={form.status} onChange={(event) => updateField('status', event.target.value)}>
            {STATUSES.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>详细内容</span>
          <textarea
            value={form.description}
            onChange={(event) => updateField('description', event.target.value)}
            placeholder="记录背景、下一步或验收标准"
            rows={5}
          />
        </label>

        <div className="subtask-editor">
          <div className="subtask-editor-header">
            <span>小任务</span>
            <button className="ghost-button" type="button" onClick={addSubTask}>
              <Plus size={15} />
              添加
            </button>
          </div>
          {formSubTasks.length > 0 && (
            <div className="subtask-editor-list" ref={subTaskListRef}>
              {formSubTasks.map((subTask, index) => (
                <div className="subtask-editor-row" key={subTask.id}>
                  <input
                    className="subtask-checkbox"
                    type="checkbox"
                    checked={subTask.completed}
                    onChange={(event) => updateSubTask(subTask.id, { completed: event.target.checked })}
                    aria-label={`完成小任务 ${index + 1}`}
                  />
                  <input
                    ref={(node) => {
                      if (node) {
                        subTaskInputRefs.current.set(subTask.id, node);
                      } else {
                        subTaskInputRefs.current.delete(subTask.id);
                      }
                    }}
                    value={subTask.title}
                    onChange={(event) => updateSubTask(subTask.id, { title: event.target.value })}
                    placeholder="小任务名称"
                  />
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => removeSubTask(subTask.id)}
                    aria-label="删除小任务"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {formError && <p className="form-error">{formError}</p>}

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="submit">
            <Clock3 size={17} />
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDeleteTaskDialog({ task, onCancel, onConfirm, isDeleting }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-task-title">
        <div className="confirm-icon" aria-hidden="true">
          <AlertTriangle size={22} />
        </div>
        <div className="confirm-content">
          <h2 id="delete-task-title">删除「{task.title}」？</h2>
          <p>删除后无法直接恢复，请确认这不是误触。</p>
        </div>
        <div className="confirm-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={isDeleting} autoFocus>
            取消
          </button>
          <button className="primary-button danger" type="button" onClick={onConfirm} disabled={isDeleting}>
            <Trash2 size={17} />
            {isDeleting ? '删除中' : '确认删除'}
          </button>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
