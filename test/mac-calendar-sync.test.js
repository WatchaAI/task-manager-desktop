import { describe, expect, it, vi } from 'vitest';
import calendarModule from '../electron/macCalendar.cjs';

const { createMacCalendarSync } = calendarModule;

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
});
