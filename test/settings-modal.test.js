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
});
