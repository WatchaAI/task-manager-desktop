import { describe, expect, it } from 'vitest';
import {
  cleanAssociatedPeople,
  createEmptyTaskForm,
  updateTaskFormField
} from '../src/taskForm.js';

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
    expect(cleanAssociatedPeople(['王洋', ' 小明, 小红 ', '', '王洋', '小明', 'Alice', 'alice'])).toEqual([
      '王洋',
      '小明',
      '小红',
      'Alice'
    ]);
  });
});

describe('task form time range', () => {
  it('moves the end date forward while preserving its time when the start date passes it', () => {
    const form = {
      startTime: '2026-07-17T09:00',
      endTime: '2026-07-18T18:30'
    };

    expect(updateTaskFormField(form, 'startTime', '2026-07-19T10:15')).toEqual({
      startTime: '2026-07-19T10:15',
      endTime: '2026-07-19T18:30'
    });
  });

  it('leaves the end time unchanged when the start stays on the same date', () => {
    const form = {
      startTime: '2026-07-19T09:00',
      endTime: '2026-07-19T10:00'
    };

    expect(updateTaskFormField(form, 'startTime', '2026-07-19T11:00')).toEqual({
      startTime: '2026-07-19T11:00',
      endTime: '2026-07-19T10:00'
    });
  });
});
