
### 预检结果：@linxin666/dsh-client-ui-market @ 0.4.6

- 结论：**⚠️ 需要留意**（high 0 / medium 7 / low 1 / info 1）
- 目录：`E:\future\yhb\05-学习资源\dsh-plugins\vendor\@linxin666+dsh-client-ui-market`
- 类型：bundle；插入 1 行：`ui-market`
- 已扫描：2 个 JS 文件

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\client.js:50` const timer = window.setTimeout(() => finish(/* @__PURE__ */ new Error("turnstile-timeout")), TIMEOUT_MS);
  - `lib\client.js:314` closeTimer.current = setTimeout(() => {
  - `lib\client.js:1540` window.setTimeout(() => {
  - `lib\client.js:1551` window.setTimeout(() => setCopiedId(null), 1200);
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\client.js:28` ready = new Promise((resolve, reject) => {
  - `lib\client.js:49` return new Promise((resolve, reject) => {
  - `lib\client.js:79` const request = chain.then(() => requestOne(action));
  - `lib\client.js:80` chain = request.then(() => void 0, () => void 0);
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] require 了 Harness 客户端包
- 为什么危险：官方明确禁止：这些包随时会变，且一个抛异常的组件会让整个槽位条目崩掉（控制台 slot entry crashed）。
  - `lib\client.js:8` let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：只 require react / react/jsx-runtime 与 slots 这类基线模块，其他控件自己画。

#### [medium] 直接操作页面 DOM
- 为什么危险：在组件外写 DOM、替换应用根节点或写 document.body，会和 DSH 的渲染与主题机制打架。
  - `lib\client.js:42` document.body.append(iframe);
  - `lib\client.js:286` return Object.keys(document.body.dataset).some((key) => key.startsWith("dsh") && !NON_SKIN_BODY_MARKERS.has(key));
  - `lib\client.js:1556` document.body.appendChild(ta);
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：渲染只走槽位；样式用主题令牌，不要往 body 追加节点。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\index.js:998` for (const waiter of queue.splice(0)) queueMicrotask(() => {
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 动态求值
- 为什么危险：eval / new Function 让静态审查失效，也是任意代码执行的入口。
  - `lib\index.js:300` schema.callback = new Function("return " + schema.callback)();
- 建议：确认为什么需要动态代码；多数场景可以用显式分支替代。

#### [medium] 改写全局对象
- 为什么危险：污染 globalThis 会影响同进程的其他插件，且卸载后不会恢复。
  - `lib\index.js:264` globalThis.__schemastery_refs__ = void 0;
  - `lib\index.js:333` globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  - `lib\index.js:339` globalThis.__schemastery_refs__ = void 0;
- 建议：把状态放在插件自己的 effect 作用域里。

#### [low] 监听/注册可能没有配套的清理
- 为什么危险：注册了 ctx.on / addEventListener 却没有 ctx.effect 形式的清理，卸载后会残留。
  - `lib\client.js:66` window.addEventListener("message", onMessage);
  - `lib\client.js:381` document.addEventListener("pointerdown", onPointerDown);
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：每个注册都返回清理函数，并交给 ctx.effect 拥有。

#### [info] 缺少展示用 locale 文件
- 为什么危险：插件页卡片会退回用包名/description 显示，不影响功能。
  - `package.json:1` 没有 locale/*.json
- 建议：想让它好看点就加 locale/zh.json 与 locale/en.json 的 meta.title/description。

#### 想先禁用再说的话，把这段写进 profile 的 `cordis.patch.yml`（或用侧栏插件页关掉对应行）
```yaml
- id: ui-market
  name: @linxin666/dsh-client-ui-market
  disabled: true
```

合计：1 个包，high=0 medium=7
