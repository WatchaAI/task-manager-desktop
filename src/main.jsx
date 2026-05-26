import React, { useEffect, useMemo, useState } from 'react';
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
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  GripVertical,
  LoaderCircle,
  Pencil,
  Plus,
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

function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalTask, setModalTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  async function loadTasks() {
    try {
      setLoading(true);
      setError('');
      const loadedTasks = await getTaskApi().listTasks();
      setTasks(loadedTasks);
    } catch (err) {
      setError(err.message || '加载任务失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  function openNewTask() {
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
      if (modalTask) {
        const updated = await getTaskApi().updateTask({ id: modalTask.id, ...taskInput });
        setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
      } else {
        const created = await getTaskApi().createTask(taskInput);
        setTasks((current) => normalizeSortOrders([...current, created]));
      }
      setIsModalOpen(false);
      setModalTask(null);
    } catch (err) {
      setError(err.message || '保存任务失败');
    }
  }

  async function handleDeleteTask(id) {
    try {
      setError('');
      await getTaskApi().deleteTask(id);
      setTasks((current) => normalizeSortOrders(current.filter((task) => task.id !== id)));
    } catch (err) {
      setError(err.message || '删除任务失败');
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
          status: task.status,
          sortOrder: task.sortOrder
        }))
      );
    } catch (err) {
      setError(err.message || '保存排序失败');
      loadTasks();
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local SQLite Board</p>
          <h1>任务管理</h1>
        </div>
        <div className="topbar-actions">
          <div className="stats" aria-label="任务统计">
            <span>{totalTasks} 个任务</span>
            <span>{activeTasks} 个未完成</span>
            <span>{doneTasks} 个完成</span>
          </div>
          <button className="primary-button" type="button" onClick={openNewTask}>
            <Plus size={18} />
            新增任务
          </button>
        </div>
      </header>

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
                onDelete={handleDeleteTask}
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
    </main>
  );
}

function TaskColumn({ status, tasks, onEdit, onDelete }) {
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
        <div className="task-list">
          {tasks.length === 0 ? (
            <div className="empty-state">把任务拖到这里</div>
          ) : (
            tasks.map((task) => (
              <TaskCard key={task.id} task={task} onEdit={onEdit} onDelete={onDelete} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete }) {
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

  return (
    <article ref={setNodeRef} style={style} className={cardClassName}>
      <div className="task-card-top">
        <h3>{task.title}</h3>
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
      <div className="task-actions">
        <button className="ghost-button" type="button" onClick={() => onEdit(task)}>
          <Pencil size={15} />
          编辑
        </button>
        <button className="ghost-button danger" type="button" onClick={() => onDelete(task.id)}>
          <Trash2 size={15} />
          删除
        </button>
      </div>
    </article>
  );
}

function TaskModal({ task, onClose, onSave }) {
  const [form, setForm] = useState(() => task || createEmptyTaskForm());
  const [formError, setFormError] = useState('');

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
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
      status: form.status || 'todo'
    });
  }

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

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
