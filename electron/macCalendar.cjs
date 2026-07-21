const { execFile: defaultExecFile } = require('node:child_process');

const CALENDAR_SCRIPT = String.raw`
function run(argv) {
  const payload = JSON.parse(argv[0]);
  const calendarApp = Application('Calendar');
  const writableCalendars = calendarApp.calendars.whose({ writable: true })();

  if (writableCalendars.length === 0) {
    throw new Error('没有可写入的日历');
  }

  const calendar = writableCalendars[0];
  const event = calendarApp.Event({
    summary: payload.title,
    startDate: new Date(payload.startTimeMs),
    endDate: new Date(payload.endTimeMs),
    alldayEvent: payload.allDay,
    description: payload.description,
    location: payload.location
  });
  calendar.events.push(event);

  return JSON.stringify({
    calendarName: calendar.name(),
    eventId: event.uid()
  });
}
`;

function executeCalendarScript(execFile, payload) {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', CALENDAR_SCRIPT, '--', JSON.stringify(payload)],
      { timeout: 15_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || error.message || '').trim();
          const calendarError = new Error(detail || '无法写入 macOS 日历');
          calendarError.cause = error;
          reject(calendarError);
          return;
        }

        try {
          resolve(JSON.parse(String(stdout).trim()));
        } catch {
          reject(new Error('macOS 日历返回了无法识别的结果'));
        }
      }
    );
  });
}

function createMacCalendarSync({ platform = process.platform, execFile = defaultExecFile } = {}) {
  return async function syncTaskToCalendar(task) {
    if (platform !== 'darwin') {
      return { status: 'skipped', reason: 'unsupported-platform' };
    }

    const startTimeMs = new Date(task.startTime).getTime();
    const originalEndTimeMs = new Date(task.endTime).getTime();
    if (!Number.isFinite(startTimeMs) || !Number.isFinite(originalEndTimeMs) || originalEndTimeMs <= startTimeMs) {
      return { status: 'skipped', reason: 'invalid-time-range' };
    }

    const allDay = task.startTime.slice(11, 16) === '00:00' && task.endTime.slice(11, 16) === '23:59';
    const endTimeMs = allDay ? originalEndTimeMs + 60_000 : originalEndTimeMs;

    const result = await executeCalendarScript(execFile, {
      title: task.title,
      startTimeMs,
      endTimeMs,
      description: task.description || '',
      location: task.location || '',
      allDay
    });

    return {
      status: 'synced',
      calendarName: result.calendarName,
      eventId: result.eventId
    };
  };
}

module.exports = {
  createMacCalendarSync
};
