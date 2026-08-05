import { describe, expect, it } from 'vitest';
import { getCalendarTaskTypeId, transitionViewState } from '../src/viewState.js';

describe('view state', () => {
  it('defaults to all task types every time the calendar view is entered', () => {
    const currentCalendar = { mode: 'calendar', calendarScope: 'current' };
    expect(transitionViewState(currentCalendar, { type: 'show-calendar' })).toBe(currentCalendar);

    const board = transitionViewState(currentCalendar, { type: 'show-board' });

    expect(transitionViewState(board, { type: 'show-calendar' })).toEqual({
      mode: 'calendar',
      calendarScope: 'all'
    });
  });

  it('removes the task type filter when the calendar scope is all', () => {
    expect(getCalendarTaskTypeId('all', 42)).toBeUndefined();
    expect(getCalendarTaskTypeId('current', 42)).toBe(42);
  });
});
