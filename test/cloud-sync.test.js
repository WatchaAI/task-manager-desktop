import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCloudSync } from '../electron/cloudSync.cjs';
import { createTaskStore } from '../electron/taskStore.cjs';

let tempDir;
let stores;
let services;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2030-01-01T08:00:00.000Z'));
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-manager-cloud-sync-'));
  stores = [];
  services = [];
});

afterEach(() => {
  for (const service of services) service.close();
  for (const store of stores) store.close();
  vi.useRealTimers();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function createDevice(name) {
  const userDataPath = path.join(tempDir, name);
  fs.mkdirSync(userDataPath, { recursive: true });
  const store = createTaskStore(path.join(userDataPath, 'tasks.sqlite'));
  const service = createCloudSync({
    store,
    userDataPath,
    cloudDrivePath: path.join(tempDir, 'iCloud Drive'),
    deviceId: name,
    deviceName: name,
    watch: false
  });
  stores.push(store);
  services.push(service);
  return { store, service };
}

describe('iCloud data sync', () => {
  it('shares creates, edits, and deletions between two Macs', async () => {
    fs.mkdirSync(path.join(tempDir, 'iCloud Drive'), { recursive: true });
    const macA = createDevice('mac-a');
    const macB = createDevice('mac-b');

    await macA.service.setEnabled(true);
    await macB.service.setEnabled(true);

    const taskOnA = macA.store.createTask({ title: '跨设备任务', status: 'todo' });
    await macA.service.syncNow();
    await macB.service.syncNow();
    const taskOnB = macB.store.listTasks().find((task) => task.syncId === taskOnA.syncId);
    expect(taskOnB).toMatchObject({ title: '跨设备任务', status: 'todo' });

    vi.setSystemTime(new Date('2030-01-01T09:00:00.000Z'));
    macB.store.updateTask(taskOnB.id, { title: '另一台 Mac 已更新', status: 'done' });
    await macB.service.syncNow();
    await macA.service.syncNow();
    expect(macA.store.getTask(taskOnA.id)).toMatchObject({
      title: '另一台 Mac 已更新',
      status: 'done'
    });

    vi.setSystemTime(new Date('2030-01-01T10:00:00.000Z'));
    macB.store.deleteTask(taskOnB.id);
    await macB.service.syncNow();
    await macA.service.syncNow();
    expect(macA.store.getTask(taskOnA.id)).toBeNull();
    expect(macA.service.getState()).toMatchObject({
      enabled: true,
      available: true,
      status: 'synced'
    });
  });

  it('reports iCloud Drive as unavailable without enabling sync', async () => {
    const mac = createDevice('mac-a');

    const state = await mac.service.setEnabled(true);

    expect(state).toMatchObject({
      enabled: false,
      available: false,
      status: 'unavailable'
    });
    expect(fs.existsSync(path.join(tempDir, 'iCloud Drive'))).toBe(false);
  });

  it('keeps a renamed default task type when a fresh Mac joins later', async () => {
    fs.mkdirSync(path.join(tempDir, 'iCloud Drive'), { recursive: true });
    const macA = createDevice('mac-a');
    const [workType] = macA.store.listTaskTypes();
    macA.store.updateTaskType(workType.id, { name: '项目' });
    await macA.service.setEnabled(true);

    vi.setSystemTime(new Date('2031-01-01T08:00:00.000Z'));
    const macB = createDevice('mac-b');
    await macB.service.setEnabled(true);

    expect(macB.store.listTaskTypes().map((taskType) => taskType.name)).toEqual([
      '项目',
      '学习',
      '日常'
    ]);
  });

  it('does not resurrect task types independently created with the same name', async () => {
    fs.mkdirSync(path.join(tempDir, 'iCloud Drive'), { recursive: true });
    const macA = createDevice('mac-a');
    const macB = createDevice('mac-b');
    macA.store.createTaskType({ name: '客户项目' });
    macB.store.createTaskType({ name: '客户项目' });

    await macA.service.setEnabled(true);
    await macB.service.setEnabled(true);
    await macA.service.syncNow();
    const mergedTypeOnA = macA.store.listTaskTypes().find((taskType) => taskType.name === '客户项目');
    const typeOnB = macB.store.listTaskTypes().find((taskType) => taskType.name === '客户项目');
    expect(typeOnB.syncId).toBe(mergedTypeOnA.syncId);

    vi.setSystemTime(new Date('2030-01-01T09:00:00.000Z'));
    macA.store.deleteTaskType(mergedTypeOnA.id);
    await macA.service.syncNow();
    await macB.service.syncNow();
    await macA.service.syncNow();

    expect(macA.store.listTaskTypes().map((taskType) => taskType.name)).not.toContain('客户项目');
    expect(macB.store.listTaskTypes().map((taskType) => taskType.name)).not.toContain('客户项目');
  });

  it('automatically resumes after iCloud Drive becomes available again', async () => {
    const cloudDrivePath = path.join(tempDir, 'iCloud Drive');
    fs.mkdirSync(cloudDrivePath, { recursive: true });
    const mac = createDevice('mac-a');
    await mac.service.setEnabled(true);
    mac.service.close();
    fs.rmSync(cloudDrivePath, { recursive: true, force: true });

    const restartedService = createCloudSync({
      store: mac.store,
      userDataPath: path.join(tempDir, 'mac-a'),
      cloudDrivePath,
      deviceId: 'mac-a',
      deviceName: 'mac-a',
      pollIntervalMs: 100,
      watch: false
    });
    services.push(restartedService);
    await restartedService.start();
    expect(restartedService.getState().status).toBe('unavailable');

    fs.mkdirSync(cloudDrivePath, { recursive: true });
    await vi.advanceTimersByTimeAsync(100);

    expect(restartedService.getState()).toMatchObject({
      enabled: true,
      available: true,
      status: 'synced'
    });
  });

  it('reports an error instead of claiming success when a remote snapshot is unreadable', async () => {
    const devicesPath = path.join(
      tempDir,
      'iCloud Drive',
      'Task Manager Desktop',
      'Sync',
      'devices'
    );
    fs.mkdirSync(devicesPath, { recursive: true });
    fs.writeFileSync(path.join(devicesPath, 'another-device.json'), '{not valid json', 'utf8');
    const mac = createDevice('mac-a');

    const state = await mac.service.setEnabled(true);

    expect(state.status).toBe('error');
    expect(state.lastSyncedAt).toBeNull();
    expect(state.error).toContain('无法读取');
  });
});
