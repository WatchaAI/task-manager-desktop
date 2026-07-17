import { describe, expect, it } from 'vitest';
import { cleanAssociatedPeople, createEmptyTaskForm } from '../src/taskForm.js';

describe('task form defaults', () => {
  it('defaults a new task to the start and end of the local day', () => {
    const form = createEmptyTaskForm(new Date(2026, 4, 27, 15, 30));

    expect(form).toMatchObject({
      title: '',
      startTime: '2026-05-27T00:00',
      endTime: '2026-05-27T23:59',
      description: '',
      location: '',
      associatedPeople: [],
      status: 'todo',
      subTasks: []
    });
  });
});

describe('associated people input', () => {
  it('splits typed names and removes blanks and duplicates', () => {
    expect(cleanAssociatedPeople(['王洋', ' 小明, 小红 ', '', '王洋', '小明'])).toEqual([
      '王洋',
      '小明',
      '小红'
    ]);
  });
});
