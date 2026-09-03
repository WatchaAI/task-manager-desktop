import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { registerCloudSyncHandlers } from '../electron/cloudSyncIpc.cjs';

function createFakeIpcMain() {
  const handlers = new Map();
  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    invoke(channel, payload) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return handler({}, payload);
    }
  };
}

describe('iCloud sync IPC', () => {
  it('exposes sync state, toggle, and manual sync handlers', async () => {
    const ipcMain = createFakeIpcMain();
    const state = { enabled: true, available: true, status: 'synced' };
    const cloudSync = {
      getState: vi.fn(() => state),
      setEnabled: vi.fn(() => Promise.resolve(state)),
      syncNow: vi.fn(() => Promise.resolve(state))
    };

    registerCloudSyncHandlers(ipcMain, cloudSync);

    expect(await ipcMain.invoke('cloudSync:get')).toEqual(state);
    await expect(ipcMain.invoke('cloudSync:set', true)).resolves.toEqual(state);
    await expect(ipcMain.invoke('cloudSync:syncNow')).resolves.toEqual(state);
    expect(cloudSync.setEnabled).toHaveBeenCalledWith(true);
  });

  it('wires the main process and preload bridge to iCloud sync', () => {
    const mainSource = fs.readFileSync(path.join(process.cwd(), 'electron/main.cjs'), 'utf8');
    const preloadSource = fs.readFileSync(path.join(process.cwd(), 'electron/preload.cjs'), 'utf8');

    expect(mainSource).toContain('registerCloudSyncHandlers(ipcMain, cloudSync)');
    expect(mainSource).toContain('cloudSync.notifyLocalChange()');
    expect(preloadSource).toContain("getCloudSyncState: () => ipcRenderer.invoke('cloudSync:get')");
    expect(preloadSource).toContain("setCloudSyncEnabled: (enabled) => ipcRenderer.invoke('cloudSync:set', enabled)");
    expect(preloadSource).toContain("syncCloudNow: () => ipcRenderer.invoke('cloudSync:syncNow')");
    expect(preloadSource).toContain("ipcRenderer.on('cloudSync:stateChanged', listener)");
  });
});
