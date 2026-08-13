import React from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import {
  buildCalendarDays,
  getTaskDateKeys,
  getTasksForCalendarDay,
  getUnscheduledTasks,
  toDateKey
} from './calendar.js';
import { CALENDAR_SCOPES } from './viewState.js';

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

function formatDayLabel(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function CalendarTaskButton({ task, dateKey, onOpenTask, unscheduled = false }) {
  return (
    <button
      className={`calendar-task calendar-task-${task.status || 'todo'}`}
      type="button"
      onClick={() => onOpenTask(task)}
      onDoubleClick={(event) => event.stopPropagation()}
      aria-label={`查看任务详情：${task.title}`}
      title={task.title}
    >
      {!unscheduled && <span className="calendar-task-time">{getCalendarTaskTime(task, dateKey)}</span>}
      <span className="calendar-task-title">{task.title}</span>
    </button>
  );
}

export function CalendarView({
  tasks,
  currentMonth,
  onMonthChange,
  onOpenTask,
  onCreateTask,
  scope = CALENDAR_SCOPES.ALL,
  onScopeChange,
  expandedDateKey = null,
  onExpandedDateChange
}) {
  const visibleTasks = tasks.filter((task) => task.status !== 'canceled');
  const days = buildCalendarDays(currentMonth);
  const todayKey = toDateKey(new Date());
  const unscheduledTasks = getUnscheduledTasks(visibleTasks);
  const expandedDay = days.find((day) => day.dateKey === expandedDateKey);
  const expandedDayTasks = expandedDay ? getTasksForCalendarDay(visibleTasks, expandedDay.dateKey) : [];

  function changeMonth(date) {
    onExpandedDateChange(null);
    onMonthChange(date);
  }

  return (
    <section className="calendar-view" aria-label="任务日历">
      <div className="calendar-toolbar">
        <div>
          <p className="calendar-kicker">按日期查看任务</p>
          <h2>{formatMonthTitle(currentMonth)}</h2>
        </div>
        <div className="calendar-scope-switcher" role="group" aria-label="日历任务范围">
          <button
            className={scope === CALENDAR_SCOPES.ALL ? 'active' : ''}
            type="button"
            onClick={() => onScopeChange(CALENDAR_SCOPES.ALL)}
            aria-pressed={scope === CALENDAR_SCOPES.ALL}
          >
            查看所有
          </button>
          <button
            className={scope === CALENDAR_SCOPES.CURRENT ? 'active' : ''}
            type="button"
            onClick={() => onScopeChange(CALENDAR_SCOPES.CURRENT)}
            aria-pressed={scope === CALENDAR_SCOPES.CURRENT}
          >
            查看当前
          </button>
        </div>
        <div className="calendar-navigation" aria-label="切换月份">
          <button
            className="icon-button calendar-nav-button"
            type="button"
            onClick={() => changeMonth(moveMonth(currentMonth, -1))}
            aria-label="上个月"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="secondary-button calendar-today-button"
            type="button"
            onClick={() => changeMonth(new Date())}
          >
            今天
          </button>
          <button
            className="icon-button calendar-nav-button"
            type="button"
            onClick={() => changeMonth(moveMonth(currentMonth, 1))}
            aria-label="下个月"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {expandedDay ? (
        <div
          className={`calendar-expanded-day ${expandedDay.dateKey === todayKey ? 'today' : ''}`}
          role="region"
          aria-label={`${formatDayLabel(expandedDay.date)}放大视图，${expandedDayTasks.length}个任务`}
          onDoubleClick={() => onCreateTask(expandedDay.date)}
        >
          <div className="calendar-expanded-header">
            <div>
              <p className="calendar-kicker">当天任务 · {expandedDayTasks.length}</p>
              <h3>{formatDayLabel(expandedDay.date)}</h3>
            </div>
            <button
              className="icon-button calendar-collapse-button"
              type="button"
              onClick={() => onExpandedDateChange(null)}
              onDoubleClick={(event) => event.stopPropagation()}
              aria-label={`收起${formatDayLabel(expandedDay.date)}`}
              title="收起当天视图"
            >
              <Minimize2 size={18} />
            </button>
          </div>
          <div className="calendar-expanded-tasks">
            {expandedDayTasks.length > 0 ? (
              expandedDayTasks.map((task) => (
                <CalendarTaskButton
                  key={task.id}
                  task={task}
                  dateKey={expandedDay.dateKey}
                  onOpenTask={onOpenTask}
                />
              ))
            ) : (
              <div className="calendar-expanded-empty">当天还没有任务，双击空白处即可新建</div>
            )}
          </div>
        </div>
      ) : (
        <div className="calendar-grid" role="grid" aria-label={formatMonthTitle(currentMonth)}>
          {WEEKDAYS.map((weekday) => (
            <div className="calendar-weekday" role="columnheader" key={weekday}>
              {weekday}
            </div>
          ))}
          {days.map((day) => {
            const dayTasks = getTasksForCalendarDay(visibleTasks, day.dateKey);
            const isToday = day.dateKey === todayKey;
            return (
              <div
                className={`calendar-day ${day.isCurrentMonth ? '' : 'outside-month'} ${isToday ? 'today' : ''}`}
                role="gridcell"
                key={day.dateKey}
                aria-label={`${formatDayLabel(day.date)}，${dayTasks.length}个任务`}
                aria-current={isToday ? 'date' : undefined}
                onDoubleClick={() => onCreateTask(day.date)}
              >
                <div className="calendar-day-header">
                  <span className="calendar-day-number">{day.date.getDate()}</span>
                  <button
                    className="calendar-expand-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onExpandedDateChange(day.dateKey);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                    aria-label={`放大查看${formatDayLabel(day.date)}`}
                    title="放大当天视图"
                  >
                    <Maximize2 size={13} />
                  </button>
                </div>
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
      )}

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
