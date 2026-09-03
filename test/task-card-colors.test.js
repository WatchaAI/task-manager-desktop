import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const mainSource = fs.readFileSync(path.join(process.cwd(), 'src/main.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(process.cwd(), 'src/styles.css'), 'utf8');

describe('task card status colors', () => {
  it('adds a status-specific class to each task card', () => {
    expect(mainSource).toContain('task-card-${task.status}');
  });

  it('defines soft card colors for every task status', () => {
    expect(styles).toMatch(/\.task-card-todo\s*\{[^}]*--task-bg:/s);
    expect(styles).toMatch(/\.task-card-in_progress\s*\{[^}]*--task-bg:/s);
    expect(styles).toMatch(/\.task-card-done\s*\{[^}]*--task-bg:/s);
    expect(styles).toMatch(/\.task-card-canceled\s*\{[^}]*--task-bg:/s);
  });

  it('de-emphasizes completed tasks with a light gray palette', () => {
    expect(styles).toMatch(
      /\.task-card-done\s*\{[^}]*--task-accent: #c5cad1;[^}]*--task-bg: [^;]*#f5f6f7[^;]*;[^}]*opacity: 0\.78;/s
    );
    expect(styles).toMatch(
      /\.calendar-task-done,\s*\.details-status-done\s*\{[^}]*--status-bg: #f7f8fa;[^}]*--status-text: #8a93a0;/s
    );
  });
});
