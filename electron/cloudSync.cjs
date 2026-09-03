const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const CLOUD_FOLDER_NAME = 'Task Manager Desktop';
const SETTINGS_FILE_NAME = 'cloud-sync.json';

function writeJsonAtomically(fsModule, filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  fsModule.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fsModule.renameSync(temporaryPath, filePath);
}

function snapshotData(snapshot) {
  return {
    schemaVersion: snapshot?.schemaVersion,
    taskTypes: Array.isArray(snapshot?.taskTypes) ? snapshot.taskTypes : [],
    tasks: Array.isArray(snapshot?.tasks) ? snapshot.tasks : [],
    people: Array.isArray(snapshot?.people) ? snapshot.people : [],
    tombstones: Array.isArray(snapshot?.tombstones) ? snapshot.tombstones : [],
    aliases: Array.isArray(snapshot?.aliases) ? snapshot.aliases : []
  };
}

function isValidSnapshotEnvelope(snapshot) {
  return (
    snapshot &&
    typeof snapshot === 'object' &&
    Number(snapshot.schemaVersion) === 1 &&
    Array.isArray(snapshot.taskTypes) &&
    Array.isArray(snapshot.tasks) &&
    Array.isArray(snapshot.people) &&
    Array.isArray(snapshot.tombstones) &&
    (snapshot.aliases === undefined || Array.isArray(snapshot.aliases))
  );
}

function createCloudSync({
  store,
  userDataPath,
  cloudDrivePath,
  deviceId,
  deviceName = os.hostname(),
  fsModule = fs,
  onDataChanged = () => {},
  onStateChanged = () => {},
  debounceMs = 500,
  pollIntervalMs = 15_000,
  watch = true
}) {
  if (!store || typeof store.exportSyncSnapshot !== 'function' || typeof store.mergeSyncSnapshots !== 'function') {
    throw new TypeError('A sync-capable task store is required');
  }

  const settingsPath = path.join(userDataPath, SETTINGS_FILE_NAME);
  const resolvedCloudDrivePath = cloudDrivePath || path.join(
    os.homedir(),
    'Library',
    'Mobile Documents',
    'com~apple~CloudDocs'
  );
  const devicesPath = path.join(resolvedCloudDrivePath, CLOUD_FOLDER_NAME, 'Sync', 'devices');
  let preferences = readPreferences();
  if (deviceId) {
    preferences.deviceId = deviceId;
  }
  if (!preferences.deviceId) {
    preferences.deviceId = `device-${randomUUID()}`;
  }

  const deviceFileName = `${createHash('sha256')
    .update(preferences.deviceId)
    .digest('hex')
    .slice(0, 24)}.json`;
  const deviceSnapshotPath = path.join(devicesPath, deviceFileName);
  let state = {
    enabled: Boolean(preferences.enabled),
    available: isCloudDriveAvailable(),
    status: preferences.enabled ? 'checking' : 'disabled',
    lastSyncedAt: preferences.lastSyncedAt || null,
    error: ''
  };
  let closed = false;
  let watcher = null;
  let pollTimer = null;
  let debounceTimer = null;
  let syncQueue = Promise.resolve();

  function readPreferences() {
    try {
      const parsed = JSON.parse(fsModule.readFileSync(settingsPath, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function savePreferences() {
    fsModule.mkdirSync(userDataPath, { recursive: true });
    writeJsonAtomically(fsModule, settingsPath, preferences);
  }

  function isCloudDriveAvailable() {
    try {
      return fsModule.statSync(resolvedCloudDrivePath).isDirectory();
    } catch {
      return false;
    }
  }

  function setState(nextState) {
    state = { ...state, ...nextState };
    onStateChanged(getState());
  }

  function getState() {
    return {
      ...state,
      folderName: `iCloud Drive/${CLOUD_FOLDER_NAME}`
    };
  }

  function readCloudSnapshots() {
    let entries;
    try {
      entries = fsModule.readdirSync(devicesPath, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    if (entries.some((entry) => entry.isFile() && entry.name.includes('.json') && entry.name.endsWith('.icloud'))) {
      throw new Error('同步快照仍在从 iCloud 下载，请稍后重试。');
    }

    return entries
      .filter(
        (entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== deviceFileName
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => {
        try {
          const snapshot = JSON.parse(fsModule.readFileSync(path.join(devicesPath, entry.name), 'utf8'));
          if (!isValidSnapshotEnvelope(snapshot)) {
            throw new Error('Invalid snapshot');
          }
          return snapshot;
        } catch (error) {
          const snapshotError = new Error('无法读取某台设备的同步快照，请确认 iCloud 文件已下载完整。');
          snapshotError.cause = error;
          throw snapshotError;
        }
      });
  }

  function readOwnSnapshotData() {
    try {
      return snapshotData(JSON.parse(fsModule.readFileSync(deviceSnapshotPath, 'utf8')));
    } catch {
      return null;
    }
  }

  function writeOwnSnapshotIfChanged() {
    const data = snapshotData(store.exportSyncSnapshot());
    if (JSON.stringify(readOwnSnapshotData()) === JSON.stringify(data)) {
      return false;
    }

    writeJsonAtomically(fsModule, deviceSnapshotPath, {
      ...data,
      sourceDeviceId: preferences.deviceId,
      sourceDeviceName: deviceName,
      generatedAt: new Date().toISOString()
    });
    return true;
  }

  async function performSync() {
    if (closed || !state.enabled) {
      return getState();
    }

    const available = isCloudDriveAvailable();
    if (!available) {
      setState({ available: false, status: 'unavailable', error: '未检测到 iCloud Drive，请先在系统设置中开启。' });
      return getState();
    }

    setState({ available: true, status: 'syncing', error: '' });
    try {
      fsModule.mkdirSync(devicesPath, { recursive: true });
      const mergeResult = store.mergeSyncSnapshots(readCloudSnapshots());
      writeOwnSnapshotIfChanged();
      ensureCloudWatcher();
      const lastSyncedAt = new Date().toISOString();
      preferences = { ...preferences, enabled: true, lastSyncedAt };
      savePreferences();
      setState({ status: 'synced', lastSyncedAt, error: '' });
      if (mergeResult.changed) {
        onDataChanged();
      }
    } catch (error) {
      setState({
        status: 'error',
        error: `iCloud 同步失败：${String(error?.message || error)}`
      });
    }

    return getState();
  }

  function syncNow() {
    syncQueue = syncQueue.then(performSync, performSync);
    return syncQueue;
  }

  function scheduleSync() {
    if (closed || !state.enabled) {
      return;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void syncNow();
    }, debounceMs);
    debounceTimer.unref?.();
  }

  function ensureCloudWatcher() {
    if (!watch || watcher || !state.enabled || !isCloudDriveAvailable()) {
      return;
    }

    try {
      watcher = fsModule.watch(devicesPath, (_eventType, changedFileName) => {
        if (!changedFileName || String(changedFileName).endsWith('.json')) {
          scheduleSync();
        }
      });
      const activeWatcher = watcher;
      activeWatcher.on?.('error', () => {
        activeWatcher.close?.();
        if (watcher === activeWatcher) {
          watcher = null;
        }
        scheduleSync();
      });
    } catch {
      watcher = null;
    }
  }

  function startWatching() {
    stopWatching();
    if (!state.enabled) {
      return;
    }

    ensureCloudWatcher();

    if (pollIntervalMs > 0) {
      pollTimer = setInterval(() => {
        void syncNow();
      }, pollIntervalMs);
      pollTimer.unref?.();
    }
  }

  function stopWatching() {
    watcher?.close();
    watcher = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  async function start() {
    state.available = isCloudDriveAvailable();
    if (!state.enabled) {
      setState({ status: 'disabled', error: '' });
      return getState();
    }
    if (!state.available) {
      setState({ status: 'unavailable', error: '未检测到 iCloud Drive，请先在系统设置中开启。' });
      startWatching();
      return getState();
    }

    startWatching();
    return syncNow();
  }

  async function setEnabled(enabled) {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('enabled must be a boolean');
    }

    if (!enabled) {
      stopWatching();
      preferences = { ...preferences, enabled: false };
      savePreferences();
      setState({ enabled: false, available: isCloudDriveAvailable(), status: 'disabled', error: '' });
      return getState();
    }

    if (!isCloudDriveAvailable()) {
      preferences = { ...preferences, enabled: false };
      savePreferences();
      setState({
        enabled: false,
        available: false,
        status: 'unavailable',
        error: '未检测到 iCloud Drive，请先在系统设置中登录 Apple ID 并开启 iCloud Drive。'
      });
      return getState();
    }

    preferences = { ...preferences, enabled: true };
    savePreferences();
    setState({ enabled: true, available: true, status: 'checking', error: '' });
    startWatching();
    return syncNow();
  }

  function close() {
    closed = true;
    stopWatching();
  }

  return {
    start,
    getState,
    setEnabled,
    syncNow,
    notifyLocalChange: scheduleSync,
    close
  };
}

module.exports = {
  CLOUD_FOLDER_NAME,
  createCloudSync
};
