import { describe, expect, it, vi } from 'vitest';
import calendarModule from '../electron/macCalendar.cjs';

const { createMacCalendarSync, createMacCalendarDelete } = calendarModule;

function createScriptEvent(initialValues) {
  const values = { ...initialValues };
  const event = {
    uid: () => values.uid,
    values
  };
  for (const property of ['summary', 'startDate', 'endDate', 'alldayEvent', 'description', 'location', 'url']) {
    Object.defineProperty(event, property, {
      configurable: true,
      get: () => () => values[property],
      set: (value) => {
        values[property] = value;
      }
    });
  }
  return event;
}

function createCalendarHarness(initialEvents = []) {
  const events = initialEvents.map(createScriptEvent);
  events.whose = (query) => () =>
    events.filter((event) =>
      Object.entries(query).every(([property, expected]) => event[property]() === expected)
    );
  const calendar = {
    name: () => '工作',
    writable: () => true,
    events
  };
  const calendars = [calendar];
  calendars.whose = (query) => () =>
    calendars.filter((item) =>
      Object.entries(query).every(([property, expected]) => item[property]() === expected)
    );
  let nextEventId = 1;
  const calendarApp = {
    calendars,
    Event: (properties) => createScriptEvent({ ...properties, uid: `generated-${nextEventId++}` }),
    delete(event) {
      const index = events.indexOf(event);
      if (index >= 0) {
        events.splice(index, 1);
      }
    }
  };
  const execFile = vi.fn((_file, args, _options, callback) => {
    try {
      const run = new Function('Application', `${args[3]}; return run;`)(() => calendarApp);
      callback(null, run([args.at(-1)]), '');
    } catch (error) {
      callback(error, '', String(error.stack || error));
    }
  });
  return { events, execFile };
}

describe('macOS calendar sync', () => {
  it('creates a Calendar event from a newly created task', async () => {
    const execFile = vi.fn((_file, _args, _options, callback) => {
      callback(null, JSON.stringify({ calendarName: '工作', eventId: 'event-123' }), '');
    });
    const syncTaskToCalendar = createMacCalendarSync({ platform: 'darwin', execFile });

    const result = await syncTaskToCalendar({
      id: 42,
      title: '拜访客户',
      startTime: '2026-07-22T09:30',
      endTime: '2026-07-22T10:45',
      description: '确认下一阶段方案',
      location: '杭州西站'
    });

    expect(result).toEqual({ status: 'synced', calendarName: '工作', eventId: 'event-123' });
    expect(execFile).toHaveBeenCalledTimes(1);
    const [file, args, options] = execFile.mock.calls[0];
    expect(file).toBe('/usr/bin/osascript');
    expect(args.slice(0, 4)).toEqual(['-l', 'JavaScript', '-e', expect.any(String)]);
    expect(options).toMatchObject({ timeout: 15_000 });
    expect(JSON.parse(args.at(-1))).toMatchObject({
      taskId: 42,
      title: '拜访客户',
      startTimeMs: new Date('2026-07-22T09:30').getTime(),
      endTimeMs: new Date('2026-07-22T10:45').getTime(),
      description: '确认下一阶段方案',
      location: '杭州西站',
      allDay: false
    });
  });

  it('writes the default full-day range as an all-day Calendar event', async () => {
    const execFile = vi.fn((_file, _args, _options, callback) => {
      callback(null, JSON.stringify({ calendarName: '个人', eventId: 'event-all-day' }), '');
    });
    const syncTaskToCalendar = createMacCalendarSync({ platform: 'darwin', execFile });

    await syncTaskToCalendar({
      id: 43,
      title: '全天事项',
      startTime: '2026-07-22T00:00',
      endTime: '2026-07-22T23:59'
    });

    const payload = JSON.parse(execFile.mock.calls[0][1].at(-1));
    expect(payload).toMatchObject({
      allDay: true,
      startTimeMs: new Date('2026-07-22T00:00').getTime(),
      endTimeMs: new Date('2026-07-23T00:00').getTime()
    });
  });

  it('skips Calendar when the task does not have a valid forward time range', async () => {
    const execFile = vi.fn();
    const syncTaskToCalendar = createMacCalendarSync({ platform: 'darwin', execFile });

    await expect(
      syncTaskToCalendar({
        id: 44,
        title: '时间未定',
        startTime: '',
        endTime: ''
      })
    ).resolves.toEqual({ status: 'skipped', reason: 'invalid-time-range' });
    expect(execFile).not.toHaveBeenCalled();
  });

  it('upserts the same linked event when an existing task time changes', async () => {
    const { events, execFile } = createCalendarHarness([
      {
        uid: 'event-45',
        url: 'task-manager-desktop://task/45',
        summary: '改期前的拜访',
        startDate: new Date('2026-07-22T09:00'),
        endDate: new Date('2026-07-22T10:00')
      }
    ]);
    const syncTaskToCalendar = createMacCalendarSync({ platform: 'darwin', execFile });

    const result = await syncTaskToCalendar({
      id: 45,
      title: '改期后的拜访',
      startTime: '2026-07-22T14:00',
      endTime: '2026-07-22T15:30'
    });

    expect(result).toEqual({ status: 'updated', calendarName: '工作', eventId: 'event-45' });
    expect(events).toHaveLength(1);
    expect(events[0].values).toMatchObject({
      summary: '改期后的拜访',
      startDate: new Date('2026-07-22T14:00'),
      endDate: new Date('2026-07-22T15:30'),
      url: 'task-manager-desktop://task/45'
    });
    const payload = JSON.parse(execFile.mock.calls[0][1].at(-1));
    expect(payload).toMatchObject({ taskId: 45, title: '改期后的拜访' });
  });

  it('deletes the Calendar event linked to a removed task', async () => {
    const { events, execFile } = createCalendarHarness([
      {
        uid: 'event-46',
        url: 'task-manager-desktop://task/46',
        summary: '取消的会议',
        startDate: new Date('2026-07-22T15:00'),
        endDate: new Date('2026-07-22T16:00')
      }
    ]);
    const deleteTaskFromCalendar = createMacCalendarDelete({ platform: 'darwin', execFile });

    const result = await deleteTaskFromCalendar(46);

    expect(result).toEqual({ status: 'deleted', calendarName: '工作', eventId: 'event-46' });
    expect(events).toHaveLength(0);
    expect(JSON.parse(execFile.mock.calls[0][1].at(-1))).toEqual({ taskId: 46 });
  });

  it('adopts and updates an event created before task links were introduced', async () => {
    const { events, execFile } = createCalendarHarness([
      {
        uid: 'legacy-event-49',
        url: '',
        summary: '旧版创建的会议',
        startDate: new Date('2026-07-22T10:00'),
        endDate: new Date('2026-07-22T11:00')
      }
    ]);
    const syncTaskToCalendar = createMacCalendarSync({ platform: 'darwin', execFile });
    const previousTask = {
      id: 49,
      title: '旧版创建的会议',
      startTime: '2026-07-22T10:00',
      endTime: '2026-07-22T11:00'
    };

    const result = await syncTaskToCalendar(
      {
        ...previousTask,
        title: '旧会议已改期',
        startTime: '2026-07-22T13:00',
        endTime: '2026-07-22T14:00'
      },
      { previousTask }
    );

    expect(result).toEqual({ status: 'updated', calendarName: '工作', eventId: 'legacy-event-49' });
    expect(events).toHaveLength(1);
    expect(events[0].values).toMatchObject({
      summary: '旧会议已改期',
      url: 'task-manager-desktop://task/49'
    });
  });

  it('does not adopt an unrelated legacy event with the same title and time', async () => {
    const { events, execFile } = createCalendarHarness([
      {
        uid: 'personal-event',
        url: '',
        summary: '同名会议',
        startDate: new Date('2026-07-22T10:00'),
        endDate: new Date('2026-07-22T11:00'),
        description: '私人安排',
        location: '家里'
      }
    ]);
    const syncTaskToCalendar = createMacCalendarSync({ platform: 'darwin', execFile });
    const previousTask = {
      id: 50,
      title: '同名会议',
      startTime: '2026-07-22T10:00',
      endTime: '2026-07-22T11:00',
      description: '工作安排',
      location: '公司'
    };

    const result = await syncTaskToCalendar(
      { ...previousTask, startTime: '2026-07-22T13:00', endTime: '2026-07-22T14:00' },
      { previousTask }
    );

    expect(result).toEqual({ status: 'synced', calendarName: '工作', eventId: 'generated-1' });
    expect(events).toHaveLength(2);
    expect(events[0].values).toMatchObject({ description: '私人安排', location: '家里', url: '' });
    expect(events[1].values.url).toBe('task-manager-desktop://task/50');
  });

  it('deletes the linked event when an existing task is canceled', async () => {
    const execFile = vi.fn((_file, _args, _options, callback) => {
      callback(null, JSON.stringify({ calendarName: '工作', eventId: 'event-47' }), '');
    });
    const syncTaskToCalendar = createMacCalendarSync({ platform: 'darwin', execFile });
    const previousTask = {
      id: 47,
      title: '原定会议',
      status: 'todo',
      startTime: '2026-07-22T16:00',
      endTime: '2026-07-22T17:00'
    };

    const result = await syncTaskToCalendar(
      { ...previousTask, status: 'canceled' },
      { previousTask }
    );

    expect(result).toEqual({ status: 'deleted', calendarName: '工作', eventId: 'event-47' });
    expect(JSON.parse(execFile.mock.calls[0][1].at(-1))).toMatchObject({
      taskId: 47,
      previousTask: {
        title: '原定会议',
        startTimeMs: new Date('2026-07-22T16:00').getTime(),
        endTimeMs: new Date('2026-07-22T17:00').getTime()
      }
    });
  });

  it('deletes the linked event when an existing task time is cleared', async () => {
    const execFile = vi.fn((_file, _args, _options, callback) => {
      callback(null, JSON.stringify({ calendarName: '工作', eventId: 'event-48' }), '');
    });
    const syncTaskToCalendar = createMacCalendarSync({ platform: 'darwin', execFile });
    const previousTask = {
      id: 48,
      title: '时间待调整',
      status: 'todo',
      startTime: '2026-07-22T18:00',
      endTime: '2026-07-22T19:00'
    };

    const result = await syncTaskToCalendar(
      { ...previousTask, startTime: '', endTime: '' },
      { previousTask }
    );

    expect(result).toEqual({ status: 'deleted', calendarName: '工作', eventId: 'event-48' });
  });
});
