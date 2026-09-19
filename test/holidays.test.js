import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_HOLIDAY_YEARS,
  buildHolidayLookup,
  createHolidayService,
  validateHolidayYearData
} from '../electron/holidays.cjs';

function createTempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'task-manager-holidays-'));
}

const VALID_YEAR = {
  year: 2027,
  days: [
    { name: '元旦', date: '2027-01-01', isOffDay: true },
    { name: '元旦', date: '2027-01-03', isOffDay: false }
  ]
};

describe('validateHolidayYearData', () => {
  it('accepts valid holiday data and normalizes names', () => {
    const validated = validateHolidayYearData({
      year: 2027,
      days: [{ name: ' 元旦 ', date: '2027-01-01', isOffDay: true }]
    });

    expect(validated).toEqual({ year: 2027, days: [{ name: '元旦', date: '2027-01-01', isOffDay: true }] });
  });

  it.each([
    ['non-object payload', []],
    ['missing year', { days: [] }],
    ['non-integer year', { year: '2027', days: [] }],
    ['missing days array', { year: 2027 }],
    ['non-array days', { year: 2027, days: {} }],
    ['malformed date', { year: 2027, days: [{ name: '元旦', date: '2027/01/01', isOffDay: true }] }],
    ['impossible date', { year: 2027, days: [{ name: '元旦', date: '2027-02-30', isOffDay: true }] }],
    ['empty name', { year: 2027, days: [{ name: '  ', date: '2027-01-01', isOffDay: true }] }],
    ['missing name', { year: 2027, days: [{ date: '2027-01-01', isOffDay: true }] }],
    ['non-boolean isOffDay', { year: 2027, days: [{ name: '元旦', date: '2027-01-01', isOffDay: 1 }] }]
  ])('rejects %s', (_label, payload) => {
    expect(() => validateHolidayYearData(payload)).toThrow('节假日文件格式不正确');
  });
});

describe('buildHolidayLookup', () => {
  it('maps date keys to holiday entries across years', () => {
    const lookup = buildHolidayLookup([
      { year: 2026, days: [{ name: '春节', date: '2026-02-17', isOffDay: true }] },
      { year: 2027, days: [{ name: '元旦', date: '2027-01-01', isOffDay: true }] }
    ]);

    expect(lookup['2026-02-17']).toEqual({ name: '春节', isOffDay: true });
    expect(lookup['2027-01-01']).toEqual({ name: '元旦', isOffDay: true });
    expect(lookup['2026-02-18']).toBeUndefined();
  });

  it('keeps the make-up workday flag for adjusted days', () => {
    const lookup = buildHolidayLookup([
      { year: 2026, days: [{ name: '国庆节', date: '2026-09-20', isOffDay: false }] }
    ]);

    expect(lookup['2026-09-20']).toEqual({ name: '国庆节', isOffDay: false });
  });
});

describe('createHolidayService', () => {
  let userDataPath;

  beforeEach(() => {
    userDataPath = createTempUserData();
  });

  afterEach(() => {
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it('falls back to the built-in holiday data when nothing is stored', () => {
    const service = createHolidayService({ userDataPath });
    const state = service.getState();

    expect(state.years).toEqual(BUILTIN_HOLIDAY_YEARS.map((yearData) => yearData.year));
    expect(state.holidays['2026-02-17']).toEqual({ name: '春节', isOffDay: true });
    expect(state.holidays['2026-09-20']).toEqual({ name: '国庆节', isOffDay: false });
    expect(state.holidays['2026-09-25']).toEqual({ name: '中秋节', isOffDay: true });
  });

  it('ignores corrupted stored years and keeps built-in data usable', () => {
    fs.writeFileSync(
      path.join(userDataPath, 'holidays.json'),
      JSON.stringify({ '2026': { year: 2026, days: [{ name: '坏数据', date: 'not-a-date', isOffDay: true }] } })
    );

    const state = createHolidayService({ userDataPath }).getState();

    expect(state.holidays['2026-02-17']).toEqual({ name: '春节', isOffDay: true });
  });

  it('merges imported data by year and overrides the same year', async () => {
    const importFile = path.join(userDataPath, 'import.json');
    fs.writeFileSync(importFile, JSON.stringify(VALID_YEAR));
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [importFile] })) };
    const service = createHolidayService({ userDataPath, dialog });

    const result = await service.importFromFile();

    expect(result.canceled).toBe(false);
    expect(result.years).toEqual([2026, 2027]);
    expect(result.holidays['2027-01-01']).toEqual({ name: '元旦', isOffDay: true });
    expect(result.holidays['2026-02-17']).toEqual({ name: '春节', isOffDay: true });

    const override = {
      year: 2027,
      days: [{ name: '元旦调休', date: '2027-01-02', isOffDay: false }]
    };
    fs.writeFileSync(importFile, JSON.stringify(override));
    const secondResult = await service.importFromFile();

    expect(secondResult.holidays['2027-01-01']).toBeUndefined();
    expect(secondResult.holidays['2027-01-02']).toEqual({ name: '元旦调休', isOffDay: false });
    expect(JSON.parse(fs.readFileSync(path.join(userDataPath, 'holidays.json'), 'utf8'))['2027']).toEqual(override);
  });

  it('does not write anything when the import file is invalid', async () => {
    const importFile = path.join(userDataPath, 'broken.json');
    fs.writeFileSync(importFile, JSON.stringify({ year: 2027, days: [{ name: '', date: '2027-01-01', isOffDay: true }] }));
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [importFile] })) };
    const service = createHolidayService({ userDataPath, dialog });

    await expect(service.importFromFile()).rejects.toThrow('节假日文件格式不正确');
    expect(fs.existsSync(path.join(userDataPath, 'holidays.json'))).toBe(false);
  });

  it('reports a canceled file picker without touching stored data', async () => {
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) };
    const service = createHolidayService({ userDataPath, dialog });

    await expect(service.importFromFile()).resolves.toEqual({ canceled: true });
    expect(fs.existsSync(path.join(userDataPath, 'holidays.json'))).toBe(false);
  });

  it('updates holiday data online and persists it', async () => {
    const fetchImpl = vi.fn(async (url) => ({
      ok: true,
      json: async () => VALID_YEAR
    }));
    const service = createHolidayService({ userDataPath, fetchImpl });

    const result = await service.updateYear(2027);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('NateScarlet/holiday-cn');
    expect(result.holidays['2027-01-01']).toEqual({ name: '元旦', isOffDay: true });
    expect(result.message).toContain('2027');
    expect(service.getState().holidays['2027-01-01']).toEqual({ name: '元旦', isOffDay: true });
  });

  it('falls back to the CDN mirror when the primary source fails', async () => {
    const requestedUrls = [];
    const fetchImpl = vi.fn(async (url) => {
      requestedUrls.push(url);
      if (url.includes('raw.githubusercontent.com')) {
        throw new Error('network unreachable');
      }
      return { ok: true, json: async () => VALID_YEAR };
    });
    const service = createHolidayService({ userDataPath, fetchImpl });

    const result = await service.updateYear(2027);

    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[1]).toContain('cdn.jsdelivr.net');
    expect(result.holidays['2027-01-03']).toEqual({ name: '元旦', isOffDay: false });
  });

  it('keeps existing data when every source fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const service = createHolidayService({ userDataPath, fetchImpl });

    await expect(service.updateYear(2027)).rejects.toThrow('无法在线更新');
    expect(fs.existsSync(path.join(userDataPath, 'holidays.json'))).toBe(false);
    expect(service.getState().holidays['2026-02-17']).toEqual({ name: '春节', isOffDay: true });
  });

  it('rejects online data whose year does not match the requested year', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => VALID_YEAR }));
    const service = createHolidayService({ userDataPath, fetchImpl });

    await expect(service.updateYear(2028)).rejects.toThrow('无法在线更新');
    expect(fs.existsSync(path.join(userDataPath, 'holidays.json'))).toBe(false);
  });

  it('exposes the full merged year data for extras sync', () => {
    const service = createHolidayService({ userDataPath });
    const yearData = service.getYearData();

    expect(Object.keys(yearData)).toEqual(['2026']);
    expect(yearData['2026'].year).toBe(2026);
    expect(yearData['2026'].days).toContainEqual({ name: '中秋节', date: '2026-09-25', isOffDay: true });
    expect(yearData['2026'].days).toContainEqual({ name: '国庆节', date: '2026-09-20', isOffDay: false });
  });

  it('notifies onDataChanged with the full year map after a successful update', async () => {
    const onDataChanged = vi.fn();
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => VALID_YEAR }));
    const service = createHolidayService({ userDataPath, fetchImpl, onDataChanged });

    await service.updateYear(2027);

    expect(onDataChanged).toHaveBeenCalledTimes(1);
    const payload = onDataChanged.mock.calls[0][0];
    expect(payload['2026'].days.length).toBeGreaterThan(0);
    expect(payload['2027']).toEqual(VALID_YEAR);
  });

  it('notifies onDataChanged after a successful import', async () => {
    const importFile = path.join(userDataPath, 'import.json');
    fs.writeFileSync(importFile, JSON.stringify(VALID_YEAR));
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [importFile] })) };
    const onDataChanged = vi.fn();
    const service = createHolidayService({ userDataPath, dialog, onDataChanged });

    await service.importFromFile();

    expect(onDataChanged).toHaveBeenCalledTimes(1);
    expect(onDataChanged.mock.calls[0][0]['2027']).toEqual(VALID_YEAR);
  });

  it('does not notify onDataChanged when an update or import fails', async () => {
    const onDataChanged = vi.fn();
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    const service = createHolidayService({ userDataPath, fetchImpl, onDataChanged });

    await expect(service.updateYear(2027)).rejects.toThrow('无法在线更新');
    expect(onDataChanged).not.toHaveBeenCalled();

    const brokenFile = path.join(userDataPath, 'broken.json');
    fs.writeFileSync(brokenFile, JSON.stringify({ year: 2027, days: [{ name: '', date: '2027-01-01', isOffDay: true }] }));
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [brokenFile] })) };
    const importingService = createHolidayService({ userDataPath, dialog, onDataChanged });

    await expect(importingService.importFromFile()).rejects.toThrow('节假日文件格式不正确');
    expect(onDataChanged).not.toHaveBeenCalled();
  });

  it('keeps the flow working when the onDataChanged callback throws', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => VALID_YEAR }));
    const service = createHolidayService({
      userDataPath,
      fetchImpl,
      onDataChanged: () => { throw new Error('extras unavailable'); }
    });

    const result = await service.updateYear(2027);

    expect(result.holidays['2027-01-01']).toEqual({ name: '元旦', isOffDay: true });
  });
});
