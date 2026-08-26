import React from 'react';
import { LoaderCircle, Power, X } from 'lucide-react';

export function SettingsModal({
  openAtLogin,
  isLoading,
  isSaving,
  status,
  error,
  onOpenAtLoginChange,
  onClose
}) {
  const isBusy = isLoading || isSaving;

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
      </section>
    </div>
  );
}
