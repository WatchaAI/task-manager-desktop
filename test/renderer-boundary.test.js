import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('renderer module boundary', () => {
  it('does not import CommonJS modules from the Electron main process', async () => {
    const taskFormSource = await readFile(new URL('../src/taskForm.js', import.meta.url), 'utf8');

    expect(taskFormSource).not.toMatch(/from\s+['"]\.\.\/electron\/.*\.cjs['"]/);
  });
});
