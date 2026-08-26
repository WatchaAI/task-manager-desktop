import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const mainSource = fs.readFileSync(path.join(process.cwd(), 'electron/main.cjs'), 'utf8');
const preloadSource = fs.readFileSync(path.join(process.cwd(), 'electron/preload.cjs'), 'utf8');

describe('login item renderer bridge', () => {
  it('exposes login item controls and registers their main-process handlers', () => {
    expect(preloadSource).toContain("getOpenAtLogin: () => ipcRenderer.invoke('loginItem:get')");
    expect(preloadSource).toContain("setOpenAtLogin: (enabled) => ipcRenderer.invoke('loginItem:set', enabled)");
    expect(mainSource).toContain('registerLoginItemHandlers(ipcMain, app);');
  });
});
