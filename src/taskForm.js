import peopleModule from '../electron/people.cjs';

const { cleanAssociatedPeople } = peopleModule;

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

export { cleanAssociatedPeople };

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
