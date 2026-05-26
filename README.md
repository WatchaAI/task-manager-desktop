# Task Manager Desktop

一个本地桌面任务管理工具，使用 Electron + React + SQLite。

## 功能

- 新增、编辑、删除任务
- 任务字段：名称、开始时间、结束时间、详细内容、状态
- 三个固定状态：待办、进行中、完成
- 支持跨列拖拽和同列排序
- SQLite 持久化，数据库保存在 Electron 的 `userData` 目录

## 使用

```bash
npm install
npm run dev
```

## 验证

```bash
npm test
npm run build
```

## 打包

```bash
npm run dist
```
