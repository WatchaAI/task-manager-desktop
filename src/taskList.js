export function upsertTaskById(tasks, nextTask) {
  const existingIndex = tasks.findIndex((task) => task.id === nextTask.id);
  if (existingIndex < 0) {
    return [...tasks, nextTask];
  }

  return tasks.map((task, index) => (index === existingIndex ? nextTask : task));
}
