import { describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '../src/SettingsModal.jsx';

function findElement(node, predicate) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (predicate(node)) {
    return node;
  }

  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  for (const child of children) {
    if (Array.isArray(child)) {
      for (const nestedChild of child) {
        const match = findElement(nestedChild, predicate);
        if (match) return match;
      }
      continue;
    }
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}

describe('settings modal', () => {
  it('shows the effective login item state and lets the user turn it off', () => {
    const onOpenAtLoginChange = vi.fn();
    const view = SettingsModal({
      openAtLogin: true,
      isLoading: false,
      isSaving: false,
      status: 'enabled',
      error: '',
      onOpenAtLoginChange,
      onClose: vi.fn()
    });
    const openAtLoginSwitch = findElement(
      view,
      (element) => element.props?.['aria-label'] === '开机自动启动'
    );

    expect(openAtLoginSwitch.props.checked).toBe(true);
    openAtLoginSwitch.props.onChange({ target: { checked: false } });
    expect(onOpenAtLoginChange).toHaveBeenCalledWith(false);
  });

  it('explains when macOS requires approval for the login item', () => {
    const view = SettingsModal({
      openAtLogin: false,
      isLoading: false,
      isSaving: false,
      status: 'requires-approval',
      error: '',
      onOpenAtLoginChange: vi.fn(),
      onClose: vi.fn()
    });
    const approvalMessage = findElement(
      view,
      (element) => element.props?.className === 'settings-warning'
    );

    expect(approvalMessage).not.toBeNull();
    expect(approvalMessage.props.children).toContain('系统设置');
  });

  it('shows iCloud sync state and lets the user sync or turn it off', () => {
    const onCloudSyncEnabledChange = vi.fn();
    const onSyncCloudNow = vi.fn();
    const view = SettingsModal({
      openAtLogin: false,
      isLoading: false,
      isSaving: false,
      status: 'not-registered',
      error: '',
      cloudSyncState: {
        enabled: true,
        available: true,
        status: 'synced',
        lastSyncedAt: '2030-01-01T09:30:00.000Z',
        folderName: 'iCloud Drive/Task Manager Desktop',
        error: ''
      },
      isCloudSyncLoading: false,
      isCloudSyncSaving: false,
      cloudSyncError: '',
      onOpenAtLoginChange: vi.fn(),
      onCloudSyncEnabledChange,
      onSyncCloudNow,
      onClose: vi.fn()
    });
    const cloudSwitch = findElement(
      view,
      (element) => element.props?.['aria-label'] === 'iCloud 多设备同步'
    );
    const syncNowButton = findElement(
      view,
      (element) => element.props?.['aria-label'] === '立即同步 iCloud'
    );
    const syncedStatus = findElement(
      view,
      (element) => element.props?.className === 'settings-cloud-success'
    );

    expect(cloudSwitch.props.checked).toBe(true);
    cloudSwitch.props.onChange({ target: { checked: false } });
    expect(onCloudSyncEnabledChange).toHaveBeenCalledWith(false);
    syncNowButton.props.onClick();
    expect(onSyncCloudNow).toHaveBeenCalledTimes(1);
    expect(syncedStatus).not.toBeNull();
  });

  it('keeps manual retry available after an iCloud sync error', () => {
    const view = SettingsModal({
      openAtLogin: false,
      isLoading: false,
      isSaving: false,
      status: 'not-registered',
      error: '',
      cloudSyncState: {
        enabled: true,
        available: true,
        status: 'error',
        error: 'iCloud 文件尚未下载完整'
      },
      onOpenAtLoginChange: vi.fn(),
      onSyncCloudNow: vi.fn(),
      onClose: vi.fn()
    });

    const retryButton = findElement(
      view,
      (element) => element.props?.['aria-label'] === '立即同步 iCloud'
    );
    expect(retryButton).not.toBeNull();
    expect(retryButton.props.disabled).toBe(false);
  });

  it('shows loaded holiday years and triggers online update and file import', () => {
    const onUpdateHolidays = vi.fn();
    const onImportHolidays = vi.fn();
    const view = SettingsModal({
      openAtLogin: false,
      isLoading: false,
      isSaving: false,
      status: 'enabled',
      error: '',
      onOpenAtLoginChange: vi.fn(),
      holidayYears: [2026, 2027],
      holidayMessage: '',
      holidayError: '',
      onUpdateHolidays,
      onImportHolidays,
      onClose: vi.fn()
    });
    const updateButton = findElement(
      view,
      (element) => element.props?.['aria-label'] === '一键更新节假日'
    );
    const importButton = findElement(
      view,
      (element) => element.props?.['aria-label'] === '从 JSON 文件导入节假日'
    );
    const yearsHint = findElement(
      view,
      (element) => String(element.props?.children?.[1] || '').includes('已加载 2026、2027 年')
    );

    expect(updateButton).not.toBeNull();
    expect(importButton).not.toBeNull();
    expect(yearsHint).not.toBeNull();
    updateButton.props.onClick();
    importButton.props.onClick();
    expect(onUpdateHolidays).toHaveBeenCalledTimes(1);
    expect(onImportHolidays).toHaveBeenCalledTimes(1);
  });

  it('shows holiday success and error feedback', () => {
    const view = SettingsModal({
      openAtLogin: false,
      isLoading: false,
      isSaving: false,
      status: 'enabled',
      error: '',
      onOpenAtLoginChange: vi.fn(),
      holidayYears: [2026],
      holidayMessage: '已更新 2026 年节假日数据（40 天）',
      holidayError: '无法在线更新 2026 年节假日',
      onUpdateHolidays: vi.fn(),
      onImportHolidays: vi.fn(),
      onClose: vi.fn()
    });
    const successMessage = findElement(
      view,
      (element) => element.props?.className === 'settings-cloud-success'
    );
    const errorMessages = [];
    (function collect(node) {
      if (!node || typeof node !== 'object') return;
      if (node.props?.className === 'settings-error') errorMessages.push(node);
      const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
      for (const child of children) {
        if (Array.isArray(child)) child.forEach(collect);
        else collect(child);
      }
    })(view);

    expect(successMessage).not.toBeNull();
    expect(errorMessages.some((element) => String(element.props.children).includes('无法在线更新'))).toBe(true);
  });
});
