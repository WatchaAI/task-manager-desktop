import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { registerHolidayHandlers } from '../electron/holidayIpc.cjs';

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

describe('holiday IPC', () => {
  it('exposes get, online update, and file import handlers', async () => {
    const ipcMain = createFakeIpcMain();
    const state = { years: [2026], holidays: { '2026-02-17': { name: '春节', isOffDay: true } } };
    const holidayService = {
      getState: vi.fn(() => state),
      updateYear: vi.fn(() => Promise.resolve({ ...state, message: '已更新' })),
      importFromFile: vi.fn(() => Promise.resolve({ canceled: false, ...state }))
    };

    registerHolidayHandlers(ipcMain, holidayService);

    expect(await ipcMain.invoke('holidays:get')).toEqual(state);
    await expect(ipcMain.invoke('holidays:update', 2027)).resolves.toMatchObject({ years: [2026] });
    expect(holidayService.updateYear).toHaveBeenCalledWith(2027);
    await expect(ipcMain.invoke('holidays:import')).resolves.toMatchObject({ canceled: false });
  });

  it('wires the main process and preload bridge to the holiday service', () => {
    const mainSource = fs.readFileSync(path.join(process.cwd(), 'electron/main.cjs'), 'utf8');
    const preloadSource = fs.readFileSync(path.join(process.cwd(), 'electron/preload.cjs'), 'utf8');

    expect(mainSource).toContain('createHolidayService({');
    expect(mainSource).toContain('registerHolidayHandlers(');
    expect(preloadSource).toContain("getHolidays: () => ipcRenderer.invoke('holidays:get')");
    expect(preloadSource).toContain("updateHolidays: () => ipcRenderer.invoke('holidays:update')");
    expect(preloadSource).toContain("importHolidays: () => ipcRenderer.invoke('holidays:import')");
  });
});
