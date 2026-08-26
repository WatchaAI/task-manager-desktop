import { describe, expect, it, vi } from 'vitest';
import { registerLoginItemHandlers } from '../electron/loginItemIpc.cjs';

function createFakeIpcMain() {
  const handlers = new Map();
  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    invoke(channel, payload) {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return handler({}, payload);
    }
  };
}

describe('login item IPC handlers', () => {
  it('reads whether the app opens at login', async () => {
    const ipcMain = createFakeIpcMain();
    const electronApp = {
      getLoginItemSettings: vi.fn(() => ({ openAtLogin: true }))
    };

    registerLoginItemHandlers(ipcMain, electronApp);

    expect(await ipcMain.invoke('loginItem:get')).toBe(true);
  });

  it('updates the login item and returns the effective setting', async () => {
    const ipcMain = createFakeIpcMain();
    let openAtLogin = false;
    const electronApp = {
      getLoginItemSettings: vi.fn(() => ({ openAtLogin })),
      setLoginItemSettings: vi.fn((settings) => {
        openAtLogin = settings.openAtLogin;
      })
    };

    registerLoginItemHandlers(ipcMain, electronApp);

    expect(await ipcMain.invoke('loginItem:set', true)).toBe(true);
    expect(electronApp.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
  });
});
