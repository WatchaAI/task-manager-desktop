import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildCalendarDays,
  getTaskDateKeys,
  getTasksForCalendarDay,
  getUnscheduledTasks,
  toDateKey
} from './calendar.js';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function formatMonthTitle(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function getCalendarTaskTime(task, dateKey) {
  const { startKey, endKey } = getTaskDateKeys(task);
  if (startKey === dateKey && task.startTime.length >= 16) {
    return task.startTime.slice(11, 16);
  }
  if (endKey === dateKey && task.endTime.length >= 16) {
    return `至 ${task.endTime.slice(11, 16)}`;
  }
  return '跨天';
}

function moveMonth(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function CalendarTaskButton({ task, dateKey, onOpenTask, unscheduled = false }) {
  return (
    <button
      className={`calendar-task calendar-task-${task.status || 'todo'}`}
      type="button"
      onClick={() => onOpenTask(task)}
      aria-label={`查看任务详情：${task.title}`}
      title={task.title}
    >
      {!unscheduled && <span className="calendar-task-time">{getCalendarTaskTime(task, dateKey)}</span>}
      <span className="calendar-task-title">{task.title}</span>
    </button>
  );
}

export function CalendarView({ tasks, currentMonth, onMonthChange, onOpenTask }) {
  const days = buildCalendarDays(currentMonth);
  const todayKey = toDateKey(new Date());
  const unscheduledTasks = getUnscheduledTasks(tasks);

  return (
    <section className="calendar-view" aria-label="任务日历">
      <div className="calendar-toolbar">
        <div>
          <p className="calendar-kicker">按日期查看任务</p>
          <h2>{formatMonthTitle(currentMonth)}</h2>
        </div>
        <div className="calendar-navigation" aria-label="切换月份">
          <button
            className="icon-button calendar-nav-button"
            type="button"
            onClick={() => onMonthChange(moveMonth(currentMonth, -1))}
            aria-label="上个月"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="secondary-button calendar-today-button"
            type="button"
            onClick={() => onMonthChange(new Date())}
          >
            今天
          </button>
          <button
            className="icon-button calendar-nav-button"
            type="button"
            onClick={() => onMonthChange(moveMonth(currentMonth, 1))}
            aria-label="下个月"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="calendar-grid" role="grid" aria-label={formatMonthTitle(currentMonth)}>
        {WEEKDAYS.map((weekday) => (
          <div className="calendar-weekday" role="columnheader" key={weekday}>
            {weekday}
          </div>
        ))}
        {days.map((day) => {
          const dayTasks = getTasksForCalendarDay(tasks, day.dateKey);
          const isToday = day.dateKey === todayKey;
          return (
            <div
              className={`calendar-day ${day.isCurrentMonth ? '' : 'outside-month'} ${isToday ? 'today' : ''}`}
              role="gridcell"
              key={day.dateKey}
              aria-label={`${day.date.getMonth() + 1}月${day.date.getDate()}日，${dayTasks.length}个任务`}
              aria-current={isToday ? 'date' : undefined}
            >
              <span className="calendar-day-number">{day.date.getDate()}</span>
              <div className="calendar-day-tasks">
                {dayTasks.map((task) => (
                  <CalendarTaskButton
                    key={task.id}
                    task={task}
                    dateKey={day.dateKey}
                    onOpenTask={onOpenTask}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {unscheduledTasks.length > 0 && (
        <div className="calendar-unscheduled">
          <span className="calendar-unscheduled-label">未安排 · {unscheduledTasks.length}</span>
          <div className="calendar-unscheduled-tasks">
            {unscheduledTasks.map((task) => (
              <CalendarTaskButton key={task.id} task={task} onOpenTask={onOpenTask} unscheduled />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
