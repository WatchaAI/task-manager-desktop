const fs = require('node:fs');
const path = require('node:path');

function createTaskDatabaseWatcher(dbPath, onChange, options = {}) {
  const fsModule = options.fsModule || fs;
  const debounceMs = options.debounceMs ?? 250;
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const directory = path.dirname(dbPath);
  const fileName = path.basename(dbPath);
  const watchedFiles = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  let closed = false;
  let timer = null;
  let watcher = null;

  function isDatabaseFile(changedFileName) {
    if (!changedFileName) {
      return true;
    }

    const normalized = String(changedFileName);
    return normalized === fileName || normalized === `${fileName}-wal` || normalized === `${fileName}-shm`;
  }

  function notifySoon() {
    if (closed) {
      return;
    }

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      if (!closed) {
        onChange();
      }
    }, debounceMs);

    timer.unref?.();
  }

  try {
    watcher = fsModule.watch(directory, (_eventType, changedFileName) => {
      if (isDatabaseFile(changedFileName)) {
        notifySoon();
      }
    });
  } catch {
    watcher = null;
  }

  if (fsModule.watchFile) {
    for (const watchedFile of watchedFiles) {
      fsModule.watchFile(watchedFile, { interval: pollIntervalMs }, (current, previous) => {
        if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) {
          notifySoon();
        }
      });
    }
  }

  return {
    close() {
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      watcher?.close();
      if (fsModule.unwatchFile) {
        for (const watchedFile of watchedFiles) {
          fsModule.unwatchFile(watchedFile);
        }
      }
    }
  };
}

module.exports = {
  createTaskDatabaseWatcher
};
