import { describe, expect, it, vi } from 'vitest';
import { buildCalendarDays, getTasksForCalendarDay } from '../src/calendar.js';
import { CalendarView } from '../src/CalendarView.jsx';

function findElement(node, predicate) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (predicate(node)) {
    return node;
  }

  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  for (const child of children) {
    if (Array.isArray(child)) {
      for (const nestedChild of child) {
        const match = findElement(nestedChild, predicate);
        if (match) return match;
      }
      continue;
    }
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}

describe('calendar view', () => {
  it('shows all and current task type scope controls', () => {
    const onScopeChange = vi.fn();
    const view = CalendarView({
      tasks: [],
      currentMonth: new Date(2026, 6, 1),
      onMonthChange: vi.fn(),
      onOpenTask: vi.fn(),
      onCreateTask: vi.fn(),
      onExpandedDateChange: vi.fn(),
      scope: 'all',
      onScopeChange
    });
    const allButton = findElement(view, (element) => element.props?.children === '查看所有');
    const currentButton = findElement(view, (element) => element.props?.children === '查看当前');

    expect(allButton.props['aria-pressed']).toBe(true);
    expect(currentButton.props['aria-pressed']).toBe(false);
    currentButton.props.onClick();
    expect(onScopeChange).toHaveBeenCalledWith('current');
  });

  it('builds a six-week Monday-first grid for the selected month', () => {
    const days = buildCalendarDays(new Date(2026, 6, 1));

    expect(days).toHaveLength(42);
    expect(days[0].dateKey).toBe('2026-06-29');
    expect(days[41].dateKey).toBe('2026-08-09');
    expect(days.filter((day) => day.isCurrentMonth)).toHaveLength(31);
  });

  it('shows a task on every day in its inclusive date range', () => {
    const tasks = [
      {
        id: 1,
        title: '跨天任务',
        startTime: '2026-07-03T09:00',
        endTime: '2026-07-05T18:00'
      },
      {
        id: 2,
        title: '当天任务',
        startTime: '2026-07-05T10:00',
        endTime: '2026-07-05T11:00'
      },
      { id: 3, title: '未安排任务', startTime: '', endTime: '' }
    ];

    expect(getTasksForCalendarDay(tasks, '2026-07-04').map((task) => task.id)).toEqual([1]);
    expect(getTasksForCalendarDay(tasks, '2026-07-05').map((task) => task.id)).toEqual([1, 2]);
    expect(getTasksForCalendarDay(tasks, '2026-07-06')).toEqual([]);
  });

  it('opens the clicked calendar task in the details layer', () => {
    const task = {
      id: 8,
      title: '准备周会',
      startTime: '2026-07-17T09:00',
      endTime: '2026-07-17T10:00',
      status: 'todo'
    };
    const onOpenTask = vi.fn();
    const view = CalendarView({
      tasks: [task],
      currentMonth: new Date(2026, 6, 1),
      onMonthChange: vi.fn(),
      onOpenTask
    });
    const calendarTask = findElement(
      view,
      (element) => typeof element.type === 'function' && element.type.name === 'CalendarTaskButton'
    );
    const taskButton = calendarTask.type(calendarTask.props);

    expect(taskButton.props['aria-label']).toContain('查看任务详情');
    taskButton.props.onClick();
    expect(onOpenTask).toHaveBeenCalledWith(task);
  });

  it('hides canceled tasks from the calendar', () => {
    const tasks = [
      {
        id: 8,
        title: '保留在日历中的任务',
        startTime: '2026-07-17T09:00',
        endTime: '2026-07-17T10:00',
        status: 'todo'
      },
      {
        id: 9,
        title: '已取消的定时任务',
        startTime: '2026-07-17T11:00',
        endTime: '2026-07-17T12:00',
        status: 'canceled'
      },
      {
        id: 10,
        title: '已取消的未安排任务',
        startTime: '',
        endTime: '',
        status: 'canceled'
      }
    ];
    const view = CalendarView({
      tasks,
      currentMonth: new Date(2026, 6, 1),
      onMonthChange: vi.fn(),
      onOpenTask: vi.fn(),
      onCreateTask: vi.fn(),
      onExpandedDateChange: vi.fn()
    });
    const calendarDay = findElement(
      view,
      (element) => element.props?.role === 'gridcell' && element.props?.['aria-label'] === '7月17日，1个任务'
    );
    const canceledTask = findElement(
      view,
      (element) => element.props?.['aria-label'] === '查看任务详情：已取消的定时任务'
    );
    const unscheduledSection = findElement(
      view,
      (element) => String(element.props?.children || '').includes('未安排 ·')
    );

    expect(calendarDay).not.toBeNull();
    expect(canceledTask).toBeNull();
    expect(unscheduledSection).toBeNull();
  });

  it('starts a new task for the double-clicked calendar date', () => {
    const onCreateTask = vi.fn();
    const view = CalendarView({
      tasks: [],
      currentMonth: new Date(2026, 6, 1),
      onMonthChange: vi.fn(),
      onOpenTask: vi.fn(),
      onCreateTask
    });
    const calendarDay = findElement(
      view,
      (element) => element.props?.role === 'gridcell' && element.props?.['aria-label'] === '7月17日，0个任务'
    );

    calendarDay.props.onDoubleClick();

    expect(onCreateTask).toHaveBeenCalledTimes(1);
    expect(onCreateTask.mock.calls[0][0]).toEqual(new Date(2026, 6, 17));
  });

  it('expands a calendar date from its top-right control and can collapse it again', () => {
    const onExpandedDateChange = vi.fn();
    const baseProps = {
      tasks: [],
      currentMonth: new Date(2026, 6, 1),
      onMonthChange: vi.fn(),
      onOpenTask: vi.fn(),
      onCreateTask: vi.fn(),
      onExpandedDateChange
    };
    const monthView = CalendarView(baseProps);
    const expandButton = findElement(
      monthView,
      (element) => element.props?.['aria-label'] === '放大查看7月17日'
    );

    expect(expandButton).not.toBeNull();
    expandButton.props.onClick({ stopPropagation: vi.fn() });
    expect(onExpandedDateChange).toHaveBeenCalledWith('2026-07-17');

    const expandedView = CalendarView({ ...baseProps, expandedDateKey: '2026-07-17' });
    const expandedDay = findElement(
      expandedView,
      (element) => element.props?.['aria-label'] === '7月17日放大视图，0个任务'
    );
    const collapseButton = findElement(
      expandedView,
      (element) => element.props?.['aria-label'] === '收起7月17日'
    );

    expect(expandedDay).not.toBeNull();
    expect(collapseButton).not.toBeNull();
    collapseButton.props.onClick();
    expect(onExpandedDateChange).toHaveBeenLastCalledWith(null);
  });
});
