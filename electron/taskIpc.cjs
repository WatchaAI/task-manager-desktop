const { createMapUrl } = require('./mapUrl.cjs');

function calendarFailureResult(error, action = 'saved') {
  const detail = String(error?.message || error || '');
  const permissionDenied = /-1743|not authorized|not permitted|permission|权限/i.test(detail);
  const actionLabel = action === 'deleted' ? '删除' : '保存';
  return {
    status: 'failed',
    reason: 'calendar-access-failed',
    message: permissionDenied
      ? `事项已${actionLabel}，但无法同步到 macOS 日历。请在“系统设置 → 隐私与安全性 → 自动化”中允许 Task Manager Desktop 控制“日历”。`
      : `事项已${actionLabel}，但同步到 macOS 日历失败。请确认系统“日历”中至少有一个可写日历，并检查自动化权限。`
  };
}

const CALENDAR_FIELDS = ['title', 'startTime', 'endTime', 'description', 'location', 'status'];

function calendarDetailsChanged(previousTask, nextTask) {
  return !previousTask || CALENDAR_FIELDS.some((field) => previousTask[field] !== nextTask[field]);
}

function registerTaskHandlers(
  ipcMain,
  store,
  {
    openExternal,
    syncTaskToCalendar,
    deleteTaskFromCalendar,
    onTasksAutomaticallyCompleted
  } = {}
) {
  const recentCreateRequests = new Map();
  const completeTasksDueTwoDaysAgoOrEarlier = () =>
    store.completeTasksDueTwoDaysAgoOrEarlier?.() || [];
  const notifyAutomaticCompletion = (completedTasks) => {
    if (completedTasks.length > 0) {
      onTasksAutomaticallyCompleted?.(completedTasks);
    }
  };
  const mergeCompletedTasksIntoResult = (result, completedTasks) => {
    if (completedTasks.length === 0) {
      return result;
    }
    const completedTaskById = new Map(completedTasks.map((task) => [task.id, task]));
    if (Array.isArray(result)) {
      return result.map((item) => {
        const completedTask = completedTaskById.get(item?.id);
        return completedTask ? { ...item, ...completedTask } : item;
      });
    }
    const completedTask = completedTaskById.get(result?.id);
    return completedTask ? { ...result, ...completedTask } : result;
  };
  const registerHandlerWithAutomaticTaskCompletion = (
    channel,
    handler,
    { refreshTaskResult = false } = {}
  ) => {
    ipcMain.handle(channel, (event, ...args) => {
      const completedBefore = completeTasksDueTwoDaysAgoOrEarlier();
      const finishActivity = (result) => {
        const completedAfter = completeTasksDueTwoDaysAgoOrEarlier();
        const completedTasks = [...completedBefore, ...completedAfter];
        notifyAutomaticCompletion(completedTasks);
        return refreshTaskResult
          ? mergeCompletedTasksIntoResult(result, completedAfter)
          : result;
      };
      const handleFailure = (error) => {
        notifyAutomaticCompletion(completedBefore);
        throw error;
      };

      try {
        const result = handler(event, ...args);
        return result && typeof result.then === 'function'
          ? result.then(finishActivity, handleFailure)
          : finishActivity(result);
      } catch (error) {
        return handleFailure(error);
      }
    });
  };

  ipcMain.handle('tasks:completeOld', () => {
    const completedTasks = completeTasksDueTwoDaysAgoOrEarlier();
    notifyAutomaticCompletion(completedTasks);
    return completedTasks;
  });

  registerHandlerWithAutomaticTaskCompletion('taskTypes:list', () => store.listTaskTypes());
  registerHandlerWithAutomaticTaskCompletion('taskTypes:create', (_event, taskType) => store.createTaskType(taskType));
  registerHandlerWithAutomaticTaskCompletion('taskTypes:update', (_event, payload) => {
    const { id, ...taskType } = payload;
    return store.updateTaskType(id, taskType);
  });
  registerHandlerWithAutomaticTaskCompletion('taskTypes:reorder', (_event, items) => store.reorderTaskTypes(items));
  registerHandlerWithAutomaticTaskCompletion('taskTypes:delete', async (_event, id) => {
    const tasks =
      typeof deleteTaskFromCalendar === 'function' && typeof store.listTasks === 'function'
        ? store.listTasks(id)
        : [];
    const deletedTaskType = store.deleteTaskType(id);
    if (typeof deleteTaskFromCalendar !== 'function' || tasks.length === 0) {
      return deletedTaskType;
    }

    const calendarSyncResults = await Promise.all(
      tasks.map(async (task) => {
        try {
          return await deleteTaskFromCalendar(task.id, task);
        } catch (error) {
          console.error('[calendar:task-type-delete-failed]', error);
          return calendarFailureResult(error, 'deleted');
        }
      })
    );
    const failedSync = calendarSyncResults.find((result) => result.status === 'failed');
    return {
      ...deletedTaskType,
      calendarSync: failedSync || {
        status: 'deleted',
        count: calendarSyncResults.filter((result) => result.status === 'deleted').length
      }
    };
  });
  registerHandlerWithAutomaticTaskCompletion('people:list', () => store.listPeople());
  registerHandlerWithAutomaticTaskCompletion('maps:open', async (_event, location) => {
    const url = createMapUrl(location);
    if (!url) {
      throw new Error('Task location is required');
    }
    if (typeof openExternal !== 'function') {
      throw new Error('Map integration is unavailable');
    }
    await openExternal(url);
    return { ok: true };
  });
  registerHandlerWithAutomaticTaskCompletion(
    'tasks:list',
    (_event, typeId) => store.listTasks(typeId),
    { refreshTaskResult: true }
  );
  registerHandlerWithAutomaticTaskCompletion('tasks:create', async (_event, task) => {
    const { requestId, ...taskInput } = task;
    const requestKey = requestId
      ? `request:${requestId}`
      : `payload:${JSON.stringify(taskInput)}`;
    const existingRequest = recentCreateRequests.get(requestKey);
    if (existingRequest) {
      return existingRequest;
    }

    const createRequest = (async () => {
      const createdTask = store.createTask(taskInput);
      if (typeof syncTaskToCalendar !== 'function') {
        return createdTask;
      }

      try {
        const calendarSync = await syncTaskToCalendar(createdTask);
        return { ...createdTask, calendarSync };
      } catch (error) {
        console.error('[calendar:sync-failed]', error);
        return { ...createdTask, calendarSync: calendarFailureResult(error) };
      }
    })();

    recentCreateRequests.set(requestKey, createRequest);
    void createRequest
      .finally(() => {
        const cleanupTimer = setTimeout(() => {
          if (recentCreateRequests.get(requestKey) === createRequest) {
            recentCreateRequests.delete(requestKey);
          }
        }, 1_500);
        cleanupTimer.unref?.();
      })
      .catch(() => {});

    return createRequest;
  }, { refreshTaskResult: true });
  registerHandlerWithAutomaticTaskCompletion('tasks:update', async (_event, payload) => {
    const { id, ...task } = payload;
    const previousTask = typeof store.getTask === 'function' ? store.getTask(id) : undefined;
    const updatedTask = store.updateTask(id, task);
    if (typeof syncTaskToCalendar !== 'function' || !calendarDetailsChanged(previousTask, updatedTask)) {
      return updatedTask;
    }

    try {
      const calendarSync = await syncTaskToCalendar(updatedTask, { previousTask });
      return { ...updatedTask, calendarSync };
    } catch (error) {
      console.error('[calendar:update-failed]', error);
      return { ...updatedTask, calendarSync: calendarFailureResult(error) };
    }
  }, { refreshTaskResult: true });
  registerHandlerWithAutomaticTaskCompletion('tasks:delete', async (_event, id) => {
    const previousTask = typeof store.getTask === 'function' ? store.getTask(id) : undefined;
    const deletedTask = store.deleteTask(id);
    if (typeof deleteTaskFromCalendar !== 'function') {
      return deletedTask;
    }

    try {
      const calendarSync = await deleteTaskFromCalendar(id, previousTask);
      return { ...deletedTask, id, calendarSync };
    } catch (error) {
      console.error('[calendar:delete-failed]', error);
      return { ...deletedTask, id, calendarSync: calendarFailureResult(error, 'deleted') };
    }
  });
  registerHandlerWithAutomaticTaskCompletion('tasks:reorder', async (_event, items) => {
    const previousTasks = new Map(
      typeof store.getTask === 'function'
        ? items.map((item) => [item.id, store.getTask(item.id)])
        : []
    );
    const reorderedTasks = store.reorderTasks(items);
    if (typeof syncTaskToCalendar !== 'function') {
      return reorderedTasks;
    }

    const tasksToSync = reorderedTasks.filter((task) => {
      const previousTask = previousTasks.get(task.id);
      return previousTask && previousTask.status !== task.status;
    });
    const calendarSyncResults = await Promise.all(
      tasksToSync.map(async (task) => {
        try {
          const calendarSync = await syncTaskToCalendar(task, { previousTask: previousTasks.get(task.id) });
          return [task.id, calendarSync];
        } catch (error) {
          console.error('[calendar:reorder-sync-failed]', error);
          return [task.id, calendarFailureResult(error)];
        }
      })
    );
    const calendarSyncByTaskId = new Map(calendarSyncResults);
    return reorderedTasks.map((task) => {
      const calendarSync = calendarSyncByTaskId.get(task.id);
      return calendarSync ? { ...task, calendarSync } : task;
    });
  }, { refreshTaskResult: true });
}

module.exports = {
  registerTaskHandlers
};
