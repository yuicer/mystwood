# Mystwood 小程序项目参考

> 更新日期：2026-06-29
> 当前口径：原生微信小程序 + 微信云函数；没有独立 HTTP 后端，业务调用统一走 `wx.cloud.callFunction`。

## 产品边界

Mystwood 是一个双人亲密度空间：创建空间、邀请对方加入、发起三类约定、接受或婉拒约定、完成约定、把已完成或已婉拒的约定沉淀为回忆，并在约定完成后继续用文字和图片回信复盘。

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
  pages/task/create              # 选择类型并创建约定
  pages/task/detail              # 约定详情、回应、完成、删除、分享
  pages/task/share               # 私密任务分享校验与跳转
  pages/memory/list              # 已完成或已婉拒的约定
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
| `pages/index/index` | 展示空间状态、进行中的约定和等待回应的约定；信封式卡片显示类型与当前角色状态；长轮询刷新 |
| `pages/space/create` | 创建空间 |
| `pages/space/invite` | 邀请码、微信分享、接受邀请 |
| `pages/task/create` | 选择三类约定，填写标题/描述/时间/地点，选择、压缩、上传、预览多张图片 |
| `pages/task/detail` | 信纸式查看约定，接受或婉拒，按角色完成，创建者删除，微信分享给 TA；支持任务后聊天式文字和图片回信 |
| `pages/task/share` | 校验私密分享链接；无权访问时回首页并引导创建空间 |
| `pages/memory/list` | 展示 `completed` / `declined` 约定 |
| `pages/me/settings` | 修改空间名称、解绑空间 |

当前页面注册在 `miniprogram/app.json`：

```json
[
  "pages/index/index",
  "pages/space/create",
  "pages/space/invite",
  "pages/task/create",
  "pages/task/detail",
  "pages/task/share",
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
| `dissolveSpace()` | `space-service/dissolveSpace` | 解绑空间并清空任务，保留同步投递所需成员标记 |
| `waitSyncEvents(options)` | `space-service/waitSyncEvents` | 长轮询同步事件 |
| `createTask(payload)` | `task-service/createTask` | 创建约定 |
| `addTaskReply(id, payload)` | `task-service/addTaskReply` | 给约定追加文字或图片回信，完成或婉拒后仍可继续回复 |
| `respondTask(id, decision, note)` | `task-service/respondTask` | 指定 TA 接受或婉拒约定，可附一句回应 |
| `completeTask(id)` | `task-service/completeTask` | 完成任务 |
| `deleteTask(id)` | `task-service/deleteTask` | 仅创建者可物理删除约定及其归档 |
| `resolveTaskShare(id, shareToken)` | `task-service/resolveTaskShare` | 校验私密分享链接，不返回任务内容 |

云函数成功返回 `{ code: 0, data }`，错误返回 `{ code, message }`。

## 数据模型

### `spaces`

| 字段 | 说明 |
| --- | --- |
| `_id` | 云数据库文档 ID |
| `name` | 空间名称 |
| `status` | `pending` / `active` / `dissolved` |
| `members` | 成员 OPENID 数组，当前产品限定 2 人；解散后仅用于同步事件投递 |
| `inviteToken` | 邀请码 |
| `score` | 隐藏亲密分 |
| `theme` | 当前主题对象 |
| `tasks` | 当前空间下的任务数组 |
| `sync` | 同步游标和 change 队列 |
| `createdAt` / `dissolvedAt` | 创建/解绑时间 |

### `spaces.tasks[]`

| 字段 | 说明 |
| --- | --- |
| `_id` | 约定 ID，云函数生成 |
| `creator` | 创建人 OPENID，仅云函数用于权限校验 |
| `targetOpenid` | 需要回应的 TA OPENID，仅云函数用于权限校验 |
| `participantOpenids` | 需要点击完成的成员 OPENID 数组，仅云函数使用 |
| `completedOpenids` | 已完成成员 OPENID 数组，仅云函数使用 |
| `kind` | `self`（自愿去做）/ `together`（邀请一起做）/ `for_partner`（希望 TA 做） |
| `title` | 约定名称，必填 |
| `desc` | 详细描述，选填 |
| `location` | 结构化地点对象，可为空 |
| `images` | 图片云存储 fileID 数组，最多 9 张 |
| `imageUrl` | 首张图片 fileID |
| `appointmentAt` | 目标时间，可为空 |
| `status` | `pending` / `active` / `completed` / `declined` |
| `responseNote` / `responseAt` | TA 接受或婉拒时的可选回应与时间 |
| `shareToken` | 私密微信分享链接校验 token，仅创建者客户端可读取 |
| `createdAt` / `completedAt` | 创建/全部完成时间 |
| `replies` | 约定后的回信数组，保存文字、图片和创建时间；客户端只展示“我 / TA”和默认头像，不暴露 OPENID |

### `spaces.tasks[].replies[]`

| 字段 | 说明 |
| --- | --- |
| `_id` | 回信 ID，云函数生成 |
| `author` | 回信作者 OPENID，仅云函数和聚合层用于判断“我 / TA” |
| `text` | 回信文字，最多 500 字，可为空 |
| `images` | 图片云存储 fileID 数组，最多 9 张 |
| `createdAt` | 回信时间 |

### `spaces.tasks[].location`

`source`、`name`、`address`、`latitude`、`longitude`、`coordinateType`、`poiId`。新数据来自 `wx.chooseLocation`，坐标类型为 GCJ-02。

## 同步事件

`spaces.sync.version` 每次写入递增，`spaces.sync.changes` 保留最近 50 条。客户端通过 `waitSyncEvents()` 按游标拉取目标用户事件，收到后刷新 `getState()`。

当前事件：

- `INVITE_CONFIRMED`
- `SPACE_UPDATED`
- `TASK_CREATED`
- `TASK_PROPOSED`
- `TASK_ACCEPTED`
- `TASK_DECLINED`
- `TASK_PARTICIPANT_COMPLETED`
- `TASK_COMPLETED`
- `TASK_DELETED`
- `TASK_REPLIED`
- `SPACE_DISSOLVED`

## 微信 API 使用

| API | 用途 |
| --- | --- |
| `wx.cloud.init` / `wx.cloud.callFunction` | 云开发初始化和业务调用 |
| `wx.chooseLocation` / `wx.openLocation` | 选择和打开任务地点 |
| `wx.chooseImage` / `wx.compressImage` / `wx.cloud.uploadFile` / `wx.previewImage` | 任务和回信图片选择、压缩、上传和预览 |
| `wx.showShareMenu` / `button open-type="share"` | 微信分享邀请 |
| `wx.navigateTo` / `wx.redirectTo` / `wx.reLaunch` | 当前非 tabBar 路由 |
| `wx.showToast` / `wx.showModal` / `wx.setClipboardData` | 轻提示、确认、复制 |

## 开发约定

1. 新业务调用先加 `miniprogram/utils/api.js`。
2. 页面不要直接散落 `wx.cloud.callFunction`。
3. 云函数以 `cloud.getWXContext().OPENID` 判断当前用户，不能信任客户端传入的归属、目标成员、完成进度、安全字段或分数。
4. 写任务前必须确认任务属于当前用户空间，并在每次写入前校验当前状态和角色权限。
5. 大文件走云存储，不通过 `callFunction` 传输。
6. 改页面路由时同步检查 `miniprogram/app.json`。

## 验证

- 文档或样式小改：至少跑 `git diff --check`。
- JS/云函数改动：跑 `node --check` 覆盖相关 `.js` 文件。
- 云函数改动：确认 `utils/api.js` action 名和返回形状匹配。
- 新页面：确认已注册到 `miniprogram/app.json`。
