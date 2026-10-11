
### 预检结果：@linxin666/dsh-client-ui-skin-center @ 0.4.6

- 结论：**⚠️ 需要留意**（high 0 / medium 4 / low 2 / info 1）
- 目录：`E:\future\yhb\05-学习资源\dsh-plugins\vendor\@linxin666+dsh-client-ui-skin-center`
- 类型：bundle；插入 1 行：`ui-skin-center`
- 已扫描：2 个 JS 文件（部分文件超限只读了头部）
- 跳过：1 个不在入口可达图上的 JS 文件（多为未被 `exports` 暴露的源码副本或死代码，**未审阅**）

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\client.js:1132` const timer = setTimeout(() => rejectLink(/* @__PURE__ */ new Error(`stylesheet load timeout: ${href}`)), 15e3);
  - `lib\client.js:1416` const timer = setTimeout(() => {
  - `lib\client.js:1741` timer = store.window.setInterval(() => {
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\client.js:1128` const loadStylesheet = deps.loadStylesheet ?? ((href) => new Promise((resolveLink, rejectLink) => {
  - `lib\client.js:2078` fetch(EXTERNAL_WALLPAPER_API).then((res) => res.ok ? res.json() : null).then((payload) => {
  - `lib\client.js:2102` installPluginSpec(spec, requestId).then((outcome) => {
  - `lib\client.js:2109` copyText$1(state.installCommand).then((ok) => {
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 直接操作页面 DOM
- 为什么危险：在组件外写 DOM、替换应用根节点或写 document.body，会和 DSH 的渲染与主题机制打架。
  - `lib\client.js:3178` const dark = document.body.hasAttribute("data-ds-dark-theme");
  - `lib\client.js:4018` document.body.style.removeProperty(INPUT_CARD_BLUR_VAR);
  - `lib\client.js:4019` document.body.style.removeProperty(BUBBLE_ALPHA_VAR);
  - `lib\client.js:4020` document.body.style.removeProperty(BUBBLE_BLUR_VAR);
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：渲染只走槽位；样式用主题令牌，不要往 body 追加节点。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\index.js:3891` for (const waiter of queue.splice(0)) queueMicrotask(() => {
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [low] 监听/注册可能没有配套的清理
- 为什么危险：注册了 ctx.on / addEventListener 却没有 ctx.effect 形式的清理，卸载后会残留。
  - `lib\client.js:939` win.addEventListener("resize", follower.onResize);
  - `lib\client.js:1631` win.addEventListener("dsh-skin-applied", onApplied);
  - `lib\client.js:1757` store.doc.addEventListener("visibilitychange", onVisibility);
  - `lib\client.js:2745` input.addEventListener("change", listener);
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：每个注册都返回清理函数，并交给 ctx.effect 拥有。

#### [low] 监听/注册可能没有配套的清理
- 为什么危险：注册了 ctx.on / addEventListener 却没有 ctx.effect 形式的清理，卸载后会残留。
  - `lib\index.js:4049` disposers.push(ctx.on("webserver/index-inject", (table) => {
- 建议：每个注册都返回清理函数，并交给 ctx.effect 拥有。

#### [info] 缺少展示用 locale 文件
- 为什么危险：插件页卡片会退回用包名/description 显示，不影响功能。
  - `package.json:1` 没有 locale/*.json
- 建议：想让它好看点就加 locale/zh.json 与 locale/en.json 的 meta.title/description。

#### 想先禁用再说的话，把这段写进 profile 的 `cordis.patch.yml`（或用侧栏插件页关掉对应行）
```yaml
- id: ui-skin-center
  name: @linxin666/dsh-client-ui-skin-center
  disabled: true
```

合计：1 个包，high=0 medium=4
