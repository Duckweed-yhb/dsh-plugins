
### 预检结果：@linxin666/dsh-client-ui-web-ui-settings @ 0.4.6

- 结论：**⚠️ 需要留意**（high 0 / medium 3 / low 1 / info 1）
- 目录：`E:\future\yhb\05-学习资源\dsh-plugins\vendor\@linxin666+dsh-client-ui-web-ui-settings`
- 类型：bundle；插入 1 行：`ui-web-ui-settings`
- 已扫描：2 个 JS 文件

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\client.js:248` const task = this.tail.then(async () => {
  - `lib\client.js:699` }).then((response) => {
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] require 了 Harness 客户端包
- 为什么危险：官方明确禁止：这些包随时会变，且一个抛异常的组件会让整个槽位条目崩掉（控制台 slot entry crashed）。
  - `lib\client.js:7` let _deepseek_ai_cordis = require("@deepseek-ai/cordis");
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：只 require react / react/jsx-runtime 与 slots 这类基线模块，其他控件自己画。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\index.js:708` for (const waiter of queue.splice(0)) queueMicrotask(() => {
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [low] 监听/注册可能没有配套的清理
- 为什么危险：注册了 ctx.on / addEventListener 却没有 ctx.effect 形式的清理，卸载后会残留。
  - `lib\client.js:580` disposers.push(ctx.on("connection/reset", () => {
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：每个注册都返回清理函数，并交给 ctx.effect 拥有。

#### [info] 缺少展示用 locale 文件
- 为什么危险：插件页卡片会退回用包名/description 显示，不影响功能。
  - `package.json:1` 没有 locale/*.json
- 建议：想让它好看点就加 locale/zh.json 与 locale/en.json 的 meta.title/description。

#### 想先禁用再说的话，把这段写进 profile 的 `cordis.patch.yml`（或用侧栏插件页关掉对应行）
```yaml
- id: ui-web-ui-settings
  name: @linxin666/dsh-client-ui-web-ui-settings
  disabled: true
```

合计：1 个包，high=0 medium=3
