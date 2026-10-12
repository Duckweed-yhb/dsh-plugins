
### 预检结果：dsh-bloom-theme @ 0.17.3

- 结论：**⚠️ 需要留意**（high 0 / medium 5 / low 1 / info 1）
- 目录：`E:\future\yhb\05-学习资源\dsh-plugins\vendor\dsh-bloom-theme`
- 类型：bundle；插入 1 行：`bloom-theme`
- 已扫描：2 个 JS 文件

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\client.js:2068` timer = setTimeout(() => {
  - `lib\client.js:2095` liveTurnTimer = setTimeout(() => {
  - `lib\client.js:2167` await new Promise((r) => setTimeout(r, 0));
  - `lib\client.js:2169` await new Promise((r) => setTimeout(r, 0));
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\client.js:2167` await new Promise((r) => setTimeout(r, 0));
  - `lib\client.js:2169` await new Promise((r) => setTimeout(r, 0));
  - `lib\client.js:2172` await new Promise((r) => setTimeout(r, 0));
  - `lib\client.js:2375` void fetchDshVersionFromHost().then((v) => {
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 改写全局对象
- 为什么危险：污染 globalThis 会影响同进程的其他插件，且卸载后不会恢复。
  - `lib\client.js:2076` window.__dshBloomThinkObserver__ = obs;
  - `lib\client.js:3555` window.__dshBloomObserver__ = obs;
  - `lib\client.js:3561` window.__dshBloomCursorBound__ = true;
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：把状态放在插件自己的 effect 作用域里。

#### [medium] 监听/注册可能没有配套的清理
- 为什么危险：注册了 ctx.on / addEventListener 却没有 ctx.effect 形式的清理，卸载后会残留。
- 本包情况：文件里找不到 ctx.effect
  - `lib\client.js:2150` mq.addEventListener("change", () => {
  - `lib\client.js:2479` btnRefresh.addEventListener("click", async (ev) => {
  - `lib\client.js:2509` btnCopy.addEventListener("click", async (ev) => {
  - `lib\client.js:3189` window.addEventListener("resize", () => {
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：每个注册都返回清理函数，并交给 ctx.effect 拥有。

#### [medium] 直接操作页面 DOM
- 为什么危险：在组件外写 DOM、替换应用根节点或写 document.body，会和 DSH 的渲染与主题机制打架。
  - `lib\client.js:2042` const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  - `lib\client.js:2075` obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  - `lib\client.js:2127` document.body.toggleAttribute("data-ds-dark-theme", prefersDark);
  - `lib\client.js:2129` document.body.toggleAttribute("data-ds-dark-theme", mode === "dark");
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：渲染只走槽位；样式用主题令牌，不要往 body 追加节点。

#### [low] 插件图标缺失或过大
- 为什么危险：图标只影响插件页展示；超过 256 KiB 或越界的路径会被拒绝并产生诊断。
  - `package.json:1` package.json 没有声明 icon
- 建议：放一个 ≤256 KiB 的 SVG/PNG 并声明顶层 icon。

#### [info] 缺少展示用 locale 文件
- 为什么危险：插件页卡片会退回用包名/description 显示，不影响功能。
  - `package.json:1` 没有 locale/*.json
- 建议：想让它好看点就加 locale/zh.json 与 locale/en.json 的 meta.title/description。

#### 想先禁用再说的话，把这段写进 profile 的 `cordis.patch.yml`（或用侧栏插件页关掉对应行）
```yaml
- id: bloom-theme
  name: dsh-bloom-theme
  disabled: true
```

合计：1 个包，high=0 medium=5
