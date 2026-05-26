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
  });
});
