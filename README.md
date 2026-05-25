# Mystwood - 亲密空间（微信小程序 + 微信云函数）

这是一个微信小程序工程，当前仓库直接维护可运行的小程序代码与微信云函数。

## 当前架构

- 小程序代码：`miniprogram/*`
- 微信工程配置：根目录 `project.config.json`
- 云函数代码：`cloudfunctions/*`
- 当前云环境：`cloud1-d1gawczd613a07bab`

## 微信云函数部署

1. 在微信开发者工具中开启云开发并选择 `cloud1-d1gawczd613a07bab`。
2. 对 `cloudfunctions/space-service` 和 `cloudfunctions/task-service` 执行“上传并部署：云端安装依赖”。
3. 在微信开发者工具中调试与运行小程序。

## 微信开发者工具工作流

1. 打开微信开发者工具并导入项目根目录 `/Users/yuicer/code/Mystwood`。
2. 工具会根据根目录的 `project.config.json` 自动指向 `miniprogram/`。
3. 在微信开发者工具中完成预览、真机调试、云函数上传和代码上传。

## 项目参考文档

- 项目唯一参考文档：`docs/project-reference.md`
