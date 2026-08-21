# AGENTS.md

## 本项目开发约定

- 仓库内每次完成任何修改（包括代码、配置和文档）后，都必须依次完成：自测、提交、推送、停止旧进程、重新打包、安装到 `/Applications`、启动已安装版本和基础验证。不要只运行开发模式或 `release/` 中的临时产物。
- 自测至少运行 `npm test`；根据修改范围补充相关检查。打包使用 `npm run dist`。
- 安装时先停止 `Task Manager Desktop` 旧进程，再用本次生成的 `release/mac-*/Task Manager Desktop.app` 覆盖 `/Applications/Task Manager Desktop.app`，然后从 `/Applications` 启动。覆盖应用包不得删除或改动 Electron `userData` 目录中的本地数据。
- 打包完成后使用下面的安装命令；`rm -rf` 只允许作用于这个明确的应用包路径：

  ```bash
  task_manager_bundle_path="$(find release -maxdepth 2 -type d -name 'Task Manager Desktop.app' -print -quit)"
  test -n "$task_manager_bundle_path"
  pkill -x 'Task Manager Desktop' 2>/dev/null || true
  rm -rf '/Applications/Task Manager Desktop.app'
  ditto "$task_manager_bundle_path" '/Applications/Task Manager Desktop.app'
  open '/Applications/Task Manager Desktop.app'
  ```

- 基础验证至少确认 `/Applications/Task Manager Desktop.app` 存在、启动的进程来自该安装包，并对本次修改涉及的功能做一次冒烟检查。任一步失败都要继续修复和重试，不能把未安装或未验证的修改报告为已完成。
- 自动提交和推送仅限当前代码仓库；如果涉及发布、发帖、发邮件或其他外部平台操作，需要先征求用户确认。
- 推送代码到远端前，必须确认本地待办数据未被暂存或纳入提交；不得提交和推送本地待办数据。

## Agent skills

### Issue tracker

Issues and PRDs live in GitHub Issues for `WatchaAI/task-manager-desktop`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: use root `CONTEXT.md` and `docs/adr/` when present. See `docs/agents/domain.md`.
