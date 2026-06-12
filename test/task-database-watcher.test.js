import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTaskDatabaseWatcher } from '../electron/taskDatabaseWatcher.cjs';

describe('task database watcher', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces task database and WAL file changes', () => {
    vi.useFakeTimers();

    let watchHandler;
    const watchFileHandlers = new Map();
    const close = vi.fn();
    const fsModule = {
      watch: vi.fn((_directory, handler) => {
        watchHandler = handler;
        return { close };
      }),
      watchFile: vi.fn((filePath, _options, handler) => {
        watchFileHandlers.set(filePath, handler);
      }),
      unwatchFile: vi.fn()
    };
    const onChange = vi.fn();

    const watcher = createTaskDatabaseWatcher('/tmp/task-manager/tasks.sqlite', onChange, {
      debounceMs: 100,
      fsModule
    });

    expect(fsModule.watch).toHaveBeenCalledWith('/tmp/task-manager', expect.any(Function));

    watchHandler('change', 'other.sqlite');
    vi.advanceTimersByTime(100);
    expect(onChange).not.toHaveBeenCalled();

    watchHandler('change', 'tasks.sqlite-wal');
    watchHandler('change', 'tasks.sqlite-shm');
    vi.advanceTimersByTime(99);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    watcher.close();
    expect(close).toHaveBeenCalledTimes(1);
    expect(fsModule.unwatchFile).toHaveBeenCalledWith('/tmp/task-manager/tasks.sqlite');
    expect(fsModule.unwatchFile).toHaveBeenCalledWith('/tmp/task-manager/tasks.sqlite-wal');
    expect(fsModule.unwatchFile).toHaveBeenCalledWith('/tmp/task-manager/tasks.sqlite-shm');
  });

  it('detects content changes in SQLite companion files', () => {
    vi.useFakeTimers();

    const watchFileHandlers = new Map();
    const fsModule = {
      watch: vi.fn(() => ({ close: vi.fn() })),
      watchFile: vi.fn((filePath, _options, handler) => {
        watchFileHandlers.set(filePath, handler);
      }),
      unwatchFile: vi.fn()
    };
    const onChange = vi.fn();

    createTaskDatabaseWatcher('/tmp/task-manager/tasks.sqlite', onChange, {
      debounceMs: 100,
      fsModule
    });

    watchFileHandlers.get('/tmp/task-manager/tasks.sqlite-wal')(
      { mtimeMs: 20, size: 200 },
      { mtimeMs: 10, size: 100 }
    );
    vi.advanceTimersByTime(100);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('returns a no-op watcher when fs.watch is unavailable', () => {
    const fsModule = {
      watch: vi.fn(() => {
        throw new Error('watch unavailable');
      })
    };

    const watcher = createTaskDatabaseWatcher('/tmp/task-manager/tasks.sqlite', vi.fn(), { fsModule });

    expect(() => watcher.close()).not.toThrow();
  });
});
