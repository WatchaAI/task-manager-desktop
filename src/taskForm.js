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

export function cleanAssociatedPeople(people = []) {
  const uniqueNames = new Map();
  for (const value of people) {
    for (const part of String(value || '').split(/[,，]/)) {
      const name = part.trim();
      const key = name.toLocaleLowerCase();
      if (name && !uniqueNames.has(key)) {
        uniqueNames.set(key, name);
      }
    }
  }
  return [...uniqueNames.values()];
}

export function createEmptyTaskForm(now = new Date()) {
  const today = formatLocalDate(now);

  return {
    title: '',
    startTime: `${today}T00:00`,
    endTime: `${today}T23:59`,
    description: '',
    location: '',
    associatedPeople: [],
    status: 'todo',
    subTasks: []
  };
}
