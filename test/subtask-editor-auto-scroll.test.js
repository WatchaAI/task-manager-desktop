import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const mainSource = fs.readFileSync(path.join(process.cwd(), 'src/main.jsx'), 'utf8');

describe('subtask editor auto scroll', () => {
  it('scrolls to and focuses the newly added subtask input after render', () => {
    expect(mainSource).toContain('pendingSubTaskIdRef.current = id');
    expect(mainSource).toContain('subTaskListRef.current?.scrollTo');
    expect(mainSource).toContain('subTaskInputRefs.current.get(pendingId)?.focus()');
  });
});
