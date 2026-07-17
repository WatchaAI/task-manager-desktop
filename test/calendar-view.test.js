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
});
