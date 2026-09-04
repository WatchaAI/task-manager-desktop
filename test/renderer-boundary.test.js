import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('renderer module boundary', () => {
  it('does not import CommonJS modules from the Electron main process', async () => {
    const taskFormSource = await readFile(new URL('../src/taskForm.js', import.meta.url), 'utf8');

    expect(taskFormSource).not.toMatch(/from\s+['"]\.\.\/electron\/.*\.cjs['"]/);
  });

  it('checks old tasks when the user resumes interacting with the application', async () => {
    const rendererSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
    const preloadSource = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');

    expect(preloadSource).toContain("completeOldTasks: () => ipcRenderer.invoke('tasks:completeOld')");
    expect(rendererSource).toContain("window.addEventListener('pointerdown', checkOldTasksForActivity, true)");
    expect(rendererSource).toContain("window.addEventListener('keydown', checkOldTasksForActivity, true)");
  });
});
