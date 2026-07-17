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

export function updateTaskFormField(form, field, value) {
  const nextForm = { ...form, [field]: value };
  if (field !== 'startTime' || value.length < 10 || form.endTime?.length < 10) {
    return nextForm;
  }

  const startDate = value.slice(0, 10);
  const endDate = form.endTime.slice(0, 10);
  if (startDate > endDate) {
    nextForm.endTime = `${startDate}${form.endTime.slice(10)}`;
  }

  return nextForm;
}
