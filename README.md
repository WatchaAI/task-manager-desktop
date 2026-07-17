# Task Manager Desktop

一个本地桌面任务管理工具，使用 Electron + React + SQLite。

## 功能

- 新增、编辑、删除任务
- 任务字段：名称、开始时间、结束时间、地点、关联人员、详细内容、状态、任务类型
- 地点支持从任务卡片或详情页一键在系统地图中搜索
- 关联人员只需录入一次，后续创建或编辑任务时可快捷选择
- 支持任务类型管理和任务状态管理
- 不同任务状态使用不同颜色卡片，方便区分待办、进行中和已完成任务
- 每个任务可配置时间和子任务，子任务勾选比例会自动更新
- 支持状态详情和子任务管理，可补充相关资料并添加、删除子任务
- 支持跨列拖拽和同列排序
- SQLite 持久化，数据库保存在 Electron 的 `userData` 目录
- 支持监听外部数据库变更，CLI 写入同一 SQLite 后桌面端会自动刷新，也可手动刷新

## 界面截图

![任务管理主界面](https://mingmingruyue-hz.oss-cn-hangzhou.aliyuncs.com/2025/20260608213940113.png)

主界面包括任务类型管理和任务状态管理，不同状态的任务卡片会以不同颜色展示。

![任务编辑界面](https://mingmingruyue-hz.oss-cn-hangzhou.aliyuncs.com/2025/20260608214007775.png)

单个任务支持创建、编辑、日期选择、状态详情和子任务管理；开始日期默认使用创建任务当天。

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
