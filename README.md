# Mystwood 小程序项目参考

> 更新日期：2026-06-19
> 当前口径：原生微信小程序 + 微信云函数；没有独立 HTTP 后端，业务调用统一走 `wx.cloud.callFunction`。

## 产品边界

Mystwood 是一个双人亲密度空间：创建空间、邀请对方加入、创建和编辑任务、完成任务、把已完成或逾期任务沉淀为回忆。

已确认规则：

1. 一个用户只能拥有或加入 1 个空间。
2. 空间创建后为 `pending`，对方接受邀请后变为 `active`。
3. 解绑后历史数据不保留。
4. 亲密度是隐藏分，只通过主题和 UI 氛围表达，不直接展示分数。
5. 在线协同使用云函数长轮询模拟 socket，不使用外部 HTTP/WebSocket 服务。

## 项目结构

```text
miniprogram/
  app.js                         # 初始化 wx.cloud、预加载 getState
  config.js                      # 云环境 ID 和同步参数
  utils/api.js                   # 云函数调用封装
  utils/lbs.js                   # 地点标准化和打开地图
  utils/task-form.js             # 创建/编辑任务的表单、时间、地点共用逻辑
  utils/task-images.js           # 任务图片选择、压缩、上传、预览
  utils/sync.js                  # 长轮询同步客户端
  utils/time.js                  # 时间展示
  pages/index/index              # 首页/空间主页
  pages/space/create             # 创建空间
  pages/space/invite             # 邀请、分享、接受邀请
  pages/task/create              # 创建任务
  pages/task/detail              # 任务详情、编辑、完成、删除
  pages/memory/list              # 回忆
  pages/me/settings              # 设置/解绑
cloudfunctions/
  space-service                  # 空间、邀请、状态聚合、同步长轮询
  task-service                   # 任务创建、编辑、完成、删除
```

## 运行和部署

1. 微信开发者工具导入仓库根目录。
2. 确认云开发环境为 `cloud1-d1gawczd613a07bab`。
3. 上传并部署 `cloudfunctions/space-service` 和 `cloudfunctions/task-service`。
4. 云数据库需要 `spaces` collection。
5. 地图选点使用 `wx.chooseLocation`，`miniprogram/app.json` 已声明 `requiredPrivateInfos: ["chooseLocation"]`。

## 页面和能力

| 页面 | 主要能力 |
| --- | --- |
| `pages/index/index` | 展示空间状态、待完成任务、首张任务图；进入详情；右滑或点小标签露出删除；长轮询刷新 |
| `pages/space/create` | 创建空间 |
| `pages/space/invite` | 邀请码、微信分享、接受邀请 |
| `pages/task/create` | 创建任务，填写标题/描述/时间/地点，选择、压缩、上传、预览多张图片 |
| `pages/task/detail` | 查看任务，编辑标题/描述/时间/地点/图片，预览大图，完成或删除任务 |
| `pages/memory/list` | 展示 `completed` / `overdue` 任务 |
| `pages/me/settings` | 修改空间名称、解绑空间 |

当前页面注册在 `miniprogram/app.json`：

```json
[
  "pages/index/index",
  "pages/space/create",
  "pages/space/invite",
  "pages/task/create",
  "pages/task/detail",
  "pages/memory/list",
  "pages/me/settings"
]
```

## 业务 API

页面只通过 `miniprogram/utils/api.js` 调云函数。

| 方法 | 云函数/action | 说明 |
| --- | --- | --- |
| `getState()` | `space-service/getState` | 返回 `{ space, tasks, memories, syncCursor }` |
| `createSpace(name)` | `space-service/createSpace` | 创建 `pending` 空间 |
| `renameSpace(name)` | `space-service/renameSpace` | 修改空间名 |
| `getInvite(inviteToken)` | `space-service/getInvite` | 查询公开邀请信息 |
| `acceptInvite(inviteToken)` | `space-service/acceptInvite` | 接受邀请并激活空间 |
| `dissolveSpace()` | `space-service/dissolveSpace` | 解绑空间并清空成员/任务 |
| `waitSyncEvents(options)` | `space-service/waitSyncEvents` | 长轮询同步事件 |
| `createTask(payload)` | `task-service/createTask` | 创建任务 |
| `updateTask(id, payload)` | `task-service/updateTask` | 编辑标题、描述、地点、时间、图片 |
| `addTaskImages(id, images)` | `task-service/addTaskImages` | 兼容单独追加图片的 action |
| `completeTask(id)` | `task-service/completeTask` | 完成任务 |
| `deleteTask(id)` | `task-service/deleteTask` | 删除任务，不进入回忆 |

云函数成功返回 `{ code: 0, data }`，错误返回 `{ code, message }`。

## 数据模型

### `spaces`

| 字段 | 说明 |
| --- | --- |
| `_id` | 云数据库文档 ID |
| `name` | 空间名称 |
| `status` | `pending` / `active` / `dissolved` |
| `members` | 成员 OPENID 数组，当前产品限定 2 人 |
| `inviteToken` | 邀请码 |
| `score` | 隐藏亲密分 |
| `theme` | 当前主题对象 |
| `tasks` | 当前空间下的任务数组 |
| `sync` | 同步游标和 change 队列 |
| `createdAt` / `dissolvedAt` | 创建/解绑时间 |

### `spaces.tasks[]`

| 字段 | 说明 |
| --- | --- |
| `_id` | 任务 ID，云函数生成 |
| `creator` | 创建人 OPENID |
| `title` | 任务名称，必填 |
| `desc` | 详细描述，选填 |
| `location` | 结构化地点对象，可为空 |
| `images` | 图片云存储 fileID 数组，最多 9 张 |
| `imageUrl` | 首张图片 fileID，兼容历史单图数据 |
| `appointmentAt` / `deadline` | 目标时间；`deadline` 仅兼容旧字段 |
| `status` | `todo` / `completed` / `overdue` |
| `createdAt` / `completedAt` | 创建/完成时间 |

### `spaces.tasks[].location`

`source`、`name`、`address`、`latitude`、`longitude`、`coordinateType`、`poiId`。新数据来自 `wx.chooseLocation`，坐标类型为 GCJ-02。

## 同步事件

`spaces.sync.version` 每次写入递增，`spaces.sync.changes` 保留最近 50 条。客户端通过 `waitSyncEvents()` 按游标拉取目标用户事件，收到后刷新 `getState()`。

当前事件：

- `INVITE_CONFIRMED`
- `SPACE_UPDATED`
- `TASK_CREATED`
- `TASK_UPDATED`
- `TASK_IMAGES_ADDED`
- `TASK_COMPLETED`
- `TASK_DELETED`
- `SPACE_DISSOLVED`

## 微信 API 使用

| API | 用途 |
| --- | --- |
| `wx.cloud.init` / `wx.cloud.callFunction` | 云开发初始化和业务调用 |
| `wx.chooseLocation` / `wx.openLocation` | 选择和打开任务地点 |
| `wx.chooseImage` / `wx.compressImage` / `wx.cloud.uploadFile` / `wx.previewImage` | 任务图片选择、压缩、上传和预览 |
| `wx.showShareMenu` / `button open-type="share"` | 微信分享邀请 |
| `wx.navigateTo` / `wx.redirectTo` / `wx.reLaunch` | 当前非 tabBar 路由 |
| `wx.showToast` / `wx.showModal` / `wx.setClipboardData` | 轻提示、确认、复制 |

## 开发约定

1. 新业务调用先加 `miniprogram/utils/api.js`。
2. 页面不要直接散落 `wx.cloud.callFunction`。
3. 云函数以 `cloud.getWXContext().OPENID` 判断当前用户，不能信任客户端传入的归属、安全字段或分数。
4. 写任务前必须确认任务属于当前用户空间。
5. 大文件走云存储，不通过 `callFunction` 传输。
6. 改页面路由时同步检查 `miniprogram/app.json`。

## 验证

- 文档或样式小改：至少跑 `git diff --check`。
- JS/云函数改动：跑 `node --check` 覆盖相关 `.js` 文件。
- 云函数改动：确认 `utils/api.js` action 名和返回形状匹配。
- 新页面：确认已注册到 `miniprogram/app.json`。
