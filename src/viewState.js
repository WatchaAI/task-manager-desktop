export const CALENDAR_SCOPES = {
  ALL: 'all',
  CURRENT: 'current'
};

export function getCalendarTaskTypeId(scope, activeTypeId) {
  return scope === CALENDAR_SCOPES.ALL ? undefined : activeTypeId;
}

export function transitionViewState(state, action) {
  if (action.type === 'show-calendar') {
    if (state.mode === 'calendar') {
      return state;
    }
    return { mode: 'calendar', calendarScope: CALENDAR_SCOPES.ALL };
  }

  if (action.type === 'show-board') {
    return { ...state, mode: 'board' };
  }

  if (action.type === 'set-calendar-scope') {
    return { ...state, calendarScope: action.scope };
  }

  return state;
}
