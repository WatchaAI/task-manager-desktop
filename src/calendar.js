const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTaskDateKeys(task) {
  const startKey = task.startTime?.match(DATE_KEY_PATTERN)?.[0] || '';
  const endKey = task.endTime?.match(DATE_KEY_PATTERN)?.[0] || '';
  return { startKey, endKey };
}

export function getTaskDateRange(task) {
  const { startKey, endKey } = getTaskDateKeys(task);

  if (!startKey && !endKey) {
    return null;
  }

  const firstKey = startKey || endKey;
  const lastKey = endKey || startKey;
  return firstKey <= lastKey
    ? { startKey: firstKey, endKey: lastKey }
    : { startKey: lastKey, endKey: firstKey };
}

export function buildCalendarDays(monthDate) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date,
      dateKey: toDateKey(date),
      isCurrentMonth: date.getMonth() === firstOfMonth.getMonth()
    };
  });
}

export function getTasksForCalendarDay(tasks, dateKey) {
  return tasks
    .filter((task) => {
      const range = getTaskDateRange(task);
      return range && range.startKey <= dateKey && range.endKey >= dateKey;
    })
    .sort((left, right) => {
      const timeComparison = (left.startTime || left.endTime || '').localeCompare(
        right.startTime || right.endTime || ''
      );
      return timeComparison || (left.sortOrder || 0) - (right.sortOrder || 0);
    });
}

export function getUnscheduledTasks(tasks) {
  return tasks.filter((task) => !getTaskDateRange(task));
}
