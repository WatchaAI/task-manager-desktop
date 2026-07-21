import { describe, expect, it } from 'vitest';
import { upsertTaskById } from '../src/taskList.js';

describe('task list updates', () => {
  it('replaces a task already loaded by the database watcher instead of duplicating it', () => {
    const tasks = [
      { id: 8, title: '已有事项' },
      { id: 9, title: '监听器先加载的事项' }
    ];

    expect(upsertTaskById(tasks, { id: 9, title: '日历同步后返回的事项' })).toEqual([
      { id: 8, title: '已有事项' },
      { id: 9, title: '日历同步后返回的事项' }
    ]);
  });
});
