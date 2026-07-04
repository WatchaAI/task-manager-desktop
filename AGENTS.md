# AGENTS.md

## 本项目开发约定

- 在开发新功能或修改 Bug 之后，需要先做自测，确保相关功能正常。
- 自测通过后，需要及时自动提交代码并推送到远端仓库。
- 提交并推送完成后，再重新杀死当前运行进程，并重新打包启动应用。
- 这样用户体验到的一定是最新构建后的功能，而不是旧进程里的缓存或旧版本代码。
- 完成代码修改后，优先主动执行必要的自测、提交、推送、停止、打包、启动和基础验证步骤。
- 自动提交和推送仅限当前代码仓库；如果涉及发布、发帖、发邮件或其他外部平台操作，需要先征求用户确认。

## Agent skills

### Issue tracker

Issues and PRDs live in GitHub Issues for `WatchaAI/task-manager-desktop`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: use root `CONTEXT.md` and `docs/adr/` when present. See `docs/agents/domain.md`.
