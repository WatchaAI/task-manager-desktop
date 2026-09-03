import React from 'react';
import { CheckCircle2, Cloud, LoaderCircle, Power, RefreshCw, X } from 'lucide-react';

function formatLastSyncedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

export function SettingsModal({
  openAtLogin,
  isLoading,
  isSaving,
  status,
  error,
  cloudSyncState = {},
  isCloudSyncLoading = false,
  isCloudSyncSaving = false,
  cloudSyncError = '',
  onOpenAtLoginChange,
  onCloudSyncEnabledChange = () => {},
  onSyncCloudNow = () => {},
  onClose
}) {
  const isBusy = isLoading || isSaving;
  const cloudBusy = isCloudSyncLoading || isCloudSyncSaving || cloudSyncState.status === 'syncing';
  const lastSyncedAt = formatLastSyncedAt(cloudSyncState.lastSyncedAt);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-header">
          <div>
            <p className="details-kicker">应用偏好</p>
            <h2 id="settings-title">设置</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭设置">
            <X size={18} />
          </button>
        </div>

        <div className="settings-section">
          <label className="settings-row">
            <span className="settings-row-icon" aria-hidden="true">
              <Cloud size={19} />
            </span>
            <span className="settings-row-copy">
              <strong>iCloud 多设备同步</strong>
              <span>在登录同一 Apple ID 的 Mac 之间同步任务、类型和常用联系人</span>
            </span>
            <span className="switch-control">
              <input
                type="checkbox"
                role="switch"
                aria-label="iCloud 多设备同步"
                checked={Boolean(cloudSyncState.enabled)}
                disabled={cloudBusy}
                onChange={(event) => onCloudSyncEnabledChange(event.target.checked)}
              />
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
            </span>
          </label>

          {(isCloudSyncLoading || ['checking', 'syncing'].includes(cloudSyncState.status)) && (
            <p className="settings-status" role="status">
              <LoaderCircle className="spin-icon" size={15} />
              {cloudSyncState.status === 'syncing' ? '正在与 iCloud 同步' : '正在检查 iCloud 状态'}
            </p>
          )}
          {cloudSyncState.enabled && cloudSyncState.status === 'synced' && (
            <div className="settings-cloud-footer">
              <p className="settings-cloud-success" role="status">
                <CheckCircle2 size={15} />
                已同步{lastSyncedAt ? ` · ${lastSyncedAt}` : ''}
              </p>
              <button
                className="settings-sync-button"
                type="button"
                aria-label="立即同步 iCloud"
                disabled={cloudBusy}
                onClick={onSyncCloudNow}
              >
                <RefreshCw size={14} />
                立即同步
              </button>
            </div>
          )}
          {cloudSyncState.status === 'unavailable' && (
            <p className="settings-warning" role="status">
              {cloudSyncState.error || '未检测到 iCloud Drive，请先在系统设置中开启。'}
            </p>
          )}
          {(cloudSyncState.status === 'error' || cloudSyncError) && (
            <p className="settings-error" role="alert">
              {cloudSyncError || cloudSyncState.error}
            </p>
          )}
        </div>

        <div className="settings-section">
          <label className="settings-row">
            <span className="settings-row-icon" aria-hidden="true">
              <Power size={18} />
            </span>
            <span className="settings-row-copy">
              <strong>开机自动启动</strong>
              <span>登录 macOS 后自动打开 Task Manager Desktop</span>
            </span>
            <span className="switch-control">
              <input
                type="checkbox"
                role="switch"
                aria-label="开机自动启动"
                checked={openAtLogin}
                disabled={isBusy}
                onChange={(event) => onOpenAtLoginChange(event.target.checked)}
              />
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
            </span>
          </label>

          {isBusy && (
            <p className="settings-status" role="status">
              <LoaderCircle className="spin-icon" size={15} />
              {isSaving ? '正在更新系统登录项' : '正在读取系统登录项'}
            </p>
          )}
          {status === 'requires-approval' && (
            <p className="settings-warning" role="status">
              已添加登录项，但 macOS 需要你批准。请前往“系统设置 → 通用 → 登录项与扩展”允许
              Task Manager Desktop。
            </p>
          )}
          {error && (
            <p className="settings-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
