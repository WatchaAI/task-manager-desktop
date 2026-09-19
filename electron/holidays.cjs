const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const HOLIDAYS_FILE_NAME = 'holidays.json';
const FETCH_TIMEOUT_MS = 10_000;

const BUILTIN_HOLIDAY_YEARS = [
  {
    year: 2026,
    days: [
      { name: '元旦', date: '2026-01-01', isOffDay: true },
      { name: '元旦', date: '2026-01-02', isOffDay: true },
      { name: '元旦', date: '2026-01-03', isOffDay: true },
      { name: '元旦', date: '2026-01-04', isOffDay: false },
      { name: '春节', date: '2026-02-14', isOffDay: false },
      { name: '春节', date: '2026-02-15', isOffDay: true },
      { name: '春节', date: '2026-02-16', isOffDay: true },
      { name: '春节', date: '2026-02-17', isOffDay: true },
      { name: '春节', date: '2026-02-18', isOffDay: true },
      { name: '春节', date: '2026-02-19', isOffDay: true },
      { name: '春节', date: '2026-02-20', isOffDay: true },
      { name: '春节', date: '2026-02-21', isOffDay: true },
      { name: '春节', date: '2026-02-22', isOffDay: true },
      { name: '春节', date: '2026-02-23', isOffDay: true },
      { name: '春节', date: '2026-02-28', isOffDay: false },
      { name: '清明节', date: '2026-04-04', isOffDay: true },
      { name: '清明节', date: '2026-04-05', isOffDay: true },
      { name: '清明节', date: '2026-04-06', isOffDay: true },
      { name: '劳动节', date: '2026-05-01', isOffDay: true },
      { name: '劳动节', date: '2026-05-02', isOffDay: true },
      { name: '劳动节', date: '2026-05-03', isOffDay: true },
      { name: '劳动节', date: '2026-05-04', isOffDay: true },
      { name: '劳动节', date: '2026-05-05', isOffDay: true },
      { name: '劳动节', date: '2026-05-09', isOffDay: false },
      { name: '端午节', date: '2026-06-19', isOffDay: true },
      { name: '端午节', date: '2026-06-20', isOffDay: true },
      { name: '端午节', date: '2026-06-21', isOffDay: true },
      { name: '国庆节', date: '2026-09-20', isOffDay: false },
      { name: '中秋节', date: '2026-09-25', isOffDay: true },
      { name: '中秋节', date: '2026-09-26', isOffDay: true },
      { name: '中秋节', date: '2026-09-27', isOffDay: true },
      { name: '国庆节', date: '2026-10-01', isOffDay: true },
      { name: '国庆节', date: '2026-10-02', isOffDay: true },
      { name: '国庆节', date: '2026-10-03', isOffDay: true },
      { name: '国庆节', date: '2026-10-04', isOffDay: true },
      { name: '国庆节', date: '2026-10-05', isOffDay: true },
      { name: '国庆节', date: '2026-10-06', isOffDay: true },
      { name: '国庆节', date: '2026-10-07', isOffDay: true },
      { name: '国庆节', date: '2026-10-10', isOffDay: false }
    ]
  }
];

const HOLIDAY_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidHolidayDate(date) {
  const match = HOLIDAY_DATE_PATTERN.exec(date);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function validateHolidayYearData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('节假日文件格式不正确：顶层必须是包含 year 和 days 的对象。');
  }
  if (!Number.isInteger(value.year)) {
    throw new Error('节假日文件格式不正确：year 必须是整数。');
  }
  if (!Array.isArray(value.days)) {
    throw new Error('节假日文件格式不正确：days 必须是数组。');
  }

  const days = value.days.map((day, index) => {
    const label = `第 ${index + 1} 条记录`;
    if (!day || typeof day !== 'object' || Array.isArray(day)) {
      throw new Error(`节假日文件格式不正确：${label}必须是对象。`);
    }
    if (typeof day.date !== 'string' || !isValidHolidayDate(day.date)) {
      throw new Error(`节假日文件格式不正确：${label}的 date 必须是合法的 YYYY-MM-DD 日期。`);
    }
    if (typeof day.name !== 'string' || !day.name.trim()) {
      throw new Error(`节假日文件格式不正确：${label}的 name 必须是非空字符串。`);
    }
    if (typeof day.isOffDay !== 'boolean') {
      throw new Error(`节假日文件格式不正确：${label}的 isOffDay 必须是布尔值。`);
    }
    return { name: day.name.trim(), date: day.date, isOffDay: day.isOffDay };
  });

  return { year: value.year, days };
}

function buildHolidayLookup(yearDataList) {
  const lookup = {};
  for (const yearData of yearDataList) {
    for (const day of yearData?.days || []) {
      if (typeof day?.date === 'string' && typeof day?.name === 'string') {
        lookup[day.date] = { name: day.name, isOffDay: Boolean(day.isOffDay) };
      }
    }
  }
  return lookup;
}

function remoteHolidayUrls(year) {
  return [
    `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
    `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`
  ];
}

function writeJsonAtomically(fsModule, filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  fsModule.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fsModule.renameSync(temporaryPath, filePath);
}

function createHolidayService({
  userDataPath,
  fsModule = fs,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  dialog = null,
  getWindow = () => null,
  onDataChanged = () => {}
} = {}) {
  if (!userDataPath) {
    throw new TypeError('A userData path is required');
  }

  const holidaysFilePath = path.join(userDataPath, HOLIDAYS_FILE_NAME);

  function readStoredYears() {
    let parsed;
    try {
      parsed = JSON.parse(fsModule.readFileSync(holidaysFilePath, 'utf8'));
    } catch {
      return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const stored = {};
    for (const [yearKey, yearData] of Object.entries(parsed)) {
      try {
        const validated = validateHolidayYearData(yearData);
        if (String(validated.year) === yearKey) {
          stored[yearKey] = validated;
        }
      } catch {
        // 忽略损坏的年份数据，继续使用内置数据兜底
      }
    }
    return stored;
  }

  function getMergedYears() {
    const merged = new Map(BUILTIN_HOLIDAY_YEARS.map((yearData) => [yearData.year, yearData]));
    for (const [yearKey, yearData] of Object.entries(readStoredYears())) {
      merged.set(Number(yearKey), yearData);
    }
    return [...merged.values()].sort((left, right) => left.year - right.year);
  }

  function getState() {
    const years = getMergedYears();
    return {
      years: years.map((yearData) => yearData.year),
      holidays: buildHolidayLookup(years)
    };
  }

  function getYearData() {
    const data = {};
    for (const yearData of getMergedYears()) {
      data[String(yearData.year)] = yearData;
    }
    return data;
  }

  function notifyDataChanged() {
    try {
      onDataChanged(getYearData());
    } catch {
      // 节假日附加同步是尽力而为，失败不影响主流程
    }
  }

  function mergeYearData(yearData) {
    const stored = readStoredYears();
    stored[String(yearData.year)] = yearData;
    fsModule.mkdirSync(userDataPath, { recursive: true });
    writeJsonAtomically(fsModule, holidaysFilePath, stored);
    notifyDataChanged();
    return getState();
  }

  async function updateYear(year) {
    const targetYear = Number.isInteger(year)
      ? year
      : BUILTIN_HOLIDAY_YEARS[BUILTIN_HOLIDAY_YEARS.length - 1].year;
    if (typeof fetchImpl !== 'function') {
      throw new Error('当前环境不支持在线更新节假日，请改用 JSON 文件导入。');
    }

    let lastError = null;
    for (const url of remoteHolidayUrls(targetYear)) {
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const yearData = validateHolidayYearData(await response.json());
        if (yearData.year !== targetYear) {
          throw new Error(`下载的数据年份为 ${yearData.year}，与预期 ${targetYear} 不符`);
        }
        const state = mergeYearData(yearData);
        return { ...state, message: `已更新 ${targetYear} 年节假日数据（${yearData.days.length} 天）` };
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`无法在线更新 ${targetYear} 年节假日：${String(lastError?.message || '网络请求失败')}`);
  }

  async function importFromFile() {
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      throw new Error('当前环境不支持选择文件。');
    }

    const result = await dialog.showOpenDialog(getWindow() || undefined, {
      title: '选择节假日 JSON 文件',
      properties: ['openFile'],
      filters: [{ name: '节假日数据', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths?.length) {
      return { canceled: true };
    }

    let parsed;
    try {
      parsed = JSON.parse(fsModule.readFileSync(result.filePaths[0], 'utf8'));
    } catch {
      throw new Error('无法读取所选文件，请确认它是有效的 JSON 文件。');
    }
    const yearData = validateHolidayYearData(parsed);
    const state = mergeYearData(yearData);
    return { canceled: false, ...state, message: `已导入 ${yearData.year} 年节假日数据（${yearData.days.length} 天）` };
  }

  return {
    getState,
    getYearData,
    updateYear,
    importFromFile
  };
}

module.exports = {
  BUILTIN_HOLIDAY_YEARS,
  buildHolidayLookup,
  createHolidayService,
  isValidHolidayDate,
  validateHolidayYearData
};
