const { execFile: defaultExecFile } = require('node:child_process');

const CALENDAR_EVENT_URL_PREFIX = 'task-manager-desktop://task/';

const CALENDAR_EVENT_LOOKUP_SCRIPT = String.raw`
function eventTime(event, property) {
  try {
    return event[property]().getTime();
  } catch (_error) {
    return NaN;
  }
}

function eventText(event, property) {
  try {
    return String(event[property]() || '');
  } catch (_error) {
    return '';
  }
}

function findLinkedEvent(calendars, payload) {
  const marker = '${CALENDAR_EVENT_URL_PREFIX}' + payload.taskId;

  for (const calendar of calendars) {
    const linkedEvents = calendar.events.whose({ url: marker })();
    if (linkedEvents.length > 0) {
      return { calendar, event: linkedEvents[0], marker };
    }
  }

  const previousTask = payload.previousTask;
  if (!previousTask) {
    return { marker };
  }

  const legacyCalendar = calendars[0];
  const candidates = legacyCalendar.events.whose({ summary: previousTask.title })();
  for (const event of candidates) {
    const existingUrl = eventText(event, 'url');
    if (
      existingUrl.startsWith('${CALENDAR_EVENT_URL_PREFIX}') ||
      eventTime(event, 'startDate') !== previousTask.startTimeMs ||
      eventTime(event, 'endDate') !== previousTask.endTimeMs ||
      eventText(event, 'description') !== previousTask.description ||
      eventText(event, 'location') !== previousTask.location
    ) {
      continue;
    }
    return { calendar: legacyCalendar, event, marker };
  }

  return { marker };
}
`;

const UPSERT_CALENDAR_SCRIPT = String.raw`
${CALENDAR_EVENT_LOOKUP_SCRIPT}

function run(argv) {
  const payload = JSON.parse(argv[0]);
  const calendarApp = Application('Calendar');
  const writableCalendars = calendarApp.calendars.whose({ writable: true })();

  if (writableCalendars.length === 0) {
    throw new Error('没有可写入的日历');
  }

  const linked = findLinkedEvent(writableCalendars, payload);
  if (linked.event) {
    linked.event.summary = payload.title;
    linked.event.startDate = new Date(payload.startTimeMs);
    linked.event.endDate = new Date(payload.endTimeMs);
    linked.event.alldayEvent = payload.allDay;
    linked.event.description = payload.description;
    linked.event.location = payload.location;
    linked.event.url = linked.marker;

    return JSON.stringify({
      action: 'updated',
      calendarName: linked.calendar.name(),
      eventId: linked.event.uid()
    });
  }

  const calendar = writableCalendars[0];
  const event = calendarApp.Event({
    summary: payload.title,
    startDate: new Date(payload.startTimeMs),
    endDate: new Date(payload.endTimeMs),
    alldayEvent: payload.allDay,
    description: payload.description,
    location: payload.location,
    url: linked.marker
  });
  calendar.events.push(event);

  return JSON.stringify({
    action: 'created',
    calendarName: calendar.name(),
    eventId: event.uid()
  });
}
`;

const DELETE_CALENDAR_SCRIPT = String.raw`
${CALENDAR_EVENT_LOOKUP_SCRIPT}

function run(argv) {
  const payload = JSON.parse(argv[0]);
  const calendarApp = Application('Calendar');
  const writableCalendars = calendarApp.calendars.whose({ writable: true })();

  if (writableCalendars.length === 0) {
    throw new Error('没有可写入的日历');
  }

  const linked = findLinkedEvent(writableCalendars, payload);
  if (!linked.event) {
    return JSON.stringify({ action: 'not-found' });
  }

  const calendarName = linked.calendar.name();
  const eventId = linked.event.uid();
  calendarApp.delete(linked.event);

  return JSON.stringify({ action: 'deleted', calendarName, eventId });
}
`;

function executeCalendarScript(execFile, script, payload) {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', script, '--', JSON.stringify(payload)],
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

function normalizeTimeRange(task) {
  if (!task) {
    return null;
  }

  const startTimeMs = new Date(task.startTime).getTime();
  const originalEndTimeMs = new Date(task.endTime).getTime();
  if (!Number.isFinite(startTimeMs) || !Number.isFinite(originalEndTimeMs) || originalEndTimeMs <= startTimeMs) {
    return null;
  }

  const allDay = task.startTime.slice(11, 16) === '00:00' && task.endTime.slice(11, 16) === '23:59';
  return {
    startTimeMs,
    endTimeMs: allDay ? originalEndTimeMs + 60_000 : originalEndTimeMs,
    allDay
  };
}

function createPreviousTaskLookup(task) {
  const timeRange = normalizeTimeRange(task);
  if (!timeRange) {
    return undefined;
  }

  return {
    title: task.title,
    startTimeMs: timeRange.startTimeMs,
    endTimeMs: timeRange.endTimeMs,
    description: task.description || '',
    location: task.location || ''
  };
}

function createMacCalendarDelete({ platform = process.platform, execFile = defaultExecFile } = {}) {
  return async function deleteTaskFromCalendar(taskId, previousTask) {
    if (platform !== 'darwin') {
      return { status: 'skipped', reason: 'unsupported-platform' };
    }

    const result = await executeCalendarScript(execFile, DELETE_CALENDAR_SCRIPT, {
      taskId,
      previousTask: createPreviousTaskLookup(previousTask)
    });
    if (result.action === 'not-found') {
      return { status: 'skipped', reason: 'calendar-event-not-found' };
    }

    return {
      status: 'deleted',
      calendarName: result.calendarName,
      eventId: result.eventId
    };
  };
}

function createMacCalendarSync({ platform = process.platform, execFile = defaultExecFile } = {}) {
  const deleteTaskFromCalendar = createMacCalendarDelete({ platform, execFile });

  return async function syncTaskToCalendar(task, { previousTask } = {}) {
    if (platform !== 'darwin') {
      return { status: 'skipped', reason: 'unsupported-platform' };
    }

    const timeRange = normalizeTimeRange(task);
    if (task.status === 'canceled' || !timeRange) {
      if (!previousTask) {
        return {
          status: 'skipped',
          reason: task.status === 'canceled' ? 'canceled-task' : 'invalid-time-range'
        };
      }
      return deleteTaskFromCalendar(task.id, previousTask);
    }

    const result = await executeCalendarScript(execFile, UPSERT_CALENDAR_SCRIPT, {
      taskId: task.id,
      title: task.title,
      startTimeMs: timeRange.startTimeMs,
      endTimeMs: timeRange.endTimeMs,
      description: task.description || '',
      location: task.location || '',
      allDay: timeRange.allDay,
      previousTask: createPreviousTaskLookup(previousTask)
    });

    return {
      status: result.action === 'updated' ? 'updated' : 'synced',
      calendarName: result.calendarName,
      eventId: result.eventId
    };
  };
}

module.exports = {
  createMacCalendarDelete,
  createMacCalendarSync
};
