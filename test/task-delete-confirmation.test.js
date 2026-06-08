import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const mainSource = fs.readFileSync(path.join(process.cwd(), 'src/main.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(process.cwd(), 'src/styles.css'), 'utf8');

describe('task delete confirmation', () => {
  it('opens an in-app confirmation dialog before deleting a task', () => {
    expect(mainSource).toContain('const [taskPendingDelete, setTaskPendingDelete] = useState(null);');
    expect(mainSource).toContain('function handleRequestDeleteTask(task)');
    expect(mainSource).toContain('setTaskPendingDelete(task);');
    expect(mainSource).toContain('<ConfirmDeleteTaskDialog');
    expect(mainSource).toContain('isDeleting={isDeletingTask}');
  });

  it('only calls the delete API from the confirmation action', () => {
    expect(mainSource).toContain('async function handleConfirmDeleteTask()');
    expect(mainSource).toContain('await getTaskApi().deleteTask(taskPendingDelete.id);');
    expect(mainSource).toContain('if (!taskPendingDelete || isDeletingTask)');
    expect(mainSource).toContain('onClick={() => onDelete(task)}');
    expect(mainSource).not.toContain('onClick={() => onDelete(task.id)}');
  });

  it('styles the destructive confirmation affordance', () => {
    expect(mainSource).toContain('确认删除');
    expect(styles).toMatch(/\.confirm-modal\s*\{[^}]*border:\s*1px solid #f1c4bd;/s);
    expect(styles).toMatch(/\.primary-button\.danger\s*\{[^}]*background:\s*#dc2626;/s);
  });
});
