function padTwoDigits(value) {
  return String(value).padStart(2, '0');
}

function formatLocalDate(date) {
  return [
    date.getFullYear(),
    padTwoDigits(date.getMonth() + 1),
    padTwoDigits(date.getDate())
  ].join('-');
}

export function createEmptyTaskForm(now = new Date()) {
  const today = formatLocalDate(now);

  return {
    title: '',
    startTime: `${today}T00:00`,
    endTime: `${today}T23:59`,
    description: '',
    status: 'todo',
    subTasks: []
  };
}
