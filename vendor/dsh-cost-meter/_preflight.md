
### 预检结果：dsh-cost-meter @ 1.8.20

- 结论：**⛔ 高风险**（high 4 / medium 17 / low 2 / info 0）
- 目录：`E:\future\yhb\05-学习资源\dsh-plugins\vendor\dsh-cost-meter`
- 类型：bundle；插入 1 行：`cost-meter`
- 已扫描：39 个 JS 文件
- 跳过：4 个不在入口可达图上的 JS 文件（多为未被 `exports` 暴露的源码副本或死代码，**未审阅**）

#### [high] 启动外部进程
- 为什么危险：Host 代码在宿主进程内运行且不受工作区沙箱约束，spawn/exec 等于以你的用户权限执行任意程序；插件自带的构建脚本也会在安装时被判为待批准脚本。
  - `lib\cli-bridge.js:46` const child = execFile(file, args, {
- 建议：确认你真的信任这个包；装之前先看它 spawn 了什么。

#### [high] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
- 本包情况：文件里找不到对应的 clearInterval/clearTimeout
  - `lib\gateway-quotas.js:227` const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [high] 直接结束宿主进程
- 为什么危险：进程级 exit/abort 会连坐整个 DSH：用户的其他会话、未保存的会话日志、正在跑的工具一起没了。
  - `lib\ledger-lock-owner.js:63` try { process.kill(pid, 0) } catch (error) { return error.code === 'ESRCH' }
- 建议：插件不应该拥有结束 DSH 的权力；用错误返回或日志表达失败。

#### [high] 启动外部进程
- 为什么危险：Host 代码在宿主进程内运行且不受工作区沙箱约束，spawn/exec 等于以你的用户权限执行任意程序；插件自带的构建脚本也会在安装时被判为待批准脚本。
  - `lib\ledger-lock-owner.js:24` clockTicks ??= Number(execFileSync('getconf', ['CLK_TCK'], commandOptions).trim())
  - `lib\ledger-lock-owner.js:32` const start = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command',
- 建议：确认你真的信任这个包；装之前先看它 spawn 了什么。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\backfill.js:182` await new Promise(resolve => setImmediate(resolve))
  - `lib\backfill.js:213` await new Promise(resolve => setImmediate(resolve))
  - `lib\backfill.js:584` if ((scannedCount += 1) % 8 === 0) await new Promise(resolve => setImmediate(resolve))
  - `lib\backfill.js:824` if ((scannedCount += 1) % 8 === 0) await new Promise(resolve => setImmediate(resolve))
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\cli-bridge.js:45` return new Promise((done, reject) => {
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\client.js:2` window.__ModuleLoader__.load({id:"dsh-cost-meter",factory:at=>{var na={exports:{}},kt=na.exports;Object.defineProperty(kt,Symbol.toStringTag,{value:"Module"});const Oe=at("react"),{Tooltip:$}=at("@dee
  - `lib\client.js:6` `),B=f.map((P,Q)=>P.text!=null?e("div",{key:Q,className:"cm-mm-row wide"},e("span",{className:"cm-bbox-label"},P.name),e("span",{className:"cm-mm-text cm-num"},P.text)):e(E,{key:Q},P.view.row)),M=P=>{
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\client.js:2` window.__ModuleLoader__.load({id:"dsh-cost-meter",factory:at=>{var na={exports:{}},kt=na.exports;Object.defineProperty(kt,Symbol.toStringTag,{value:"Module"});const Oe=at("react"),{Tooltip:$}=at("@dee
  - `lib\client.js:6` `),B=f.map((P,Q)=>P.text!=null?e("div",{key:Q,className:"cm-mm-row wide"},e("span",{className:"cm-bbox-label"},P.name),e("span",{className:"cm-mm-text cm-num"},P.text)):e(E,{key:Q},P.view.row)),M=P=>{
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 改写全局对象
- 为什么危险：污染 globalThis 会影响同进程的其他插件，且卸载后不会恢复。
  - `lib\client.js:2` window.__ModuleLoader__.load({id:"dsh-cost-meter",factory:at=>{var na={exports:{}},kt=na.exports;Object.defineProperty(kt,Symbol.toStringTag,{value:"Module"});const Oe=at("react"),{Tooltip:$}=at("@dee
  - `lib\client.js:6` `),B=f.map((P,Q)=>P.text!=null?e("div",{key:Q,className:"cm-mm-row wide"},e("span",{className:"cm-bbox-label"},P.name),e("span",{className:"cm-mm-text cm-num"},P.text)):e(E,{key:Q},P.view.row)),M=P=>{
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：把状态放在插件自己的 effect 作用域里。

#### [medium] 监听/注册可能没有配套的清理
- 为什么危险：注册了 ctx.on / addEventListener 却没有 ctx.effect 形式的清理，卸载后会残留。
- 本包情况：文件里找不到 ctx.effect
  - `lib\client.js:2` window.__ModuleLoader__.load({id:"dsh-cost-meter",factory:at=>{var na={exports:{}},kt=na.exports;Object.defineProperty(kt,Symbol.toStringTag,{value:"Module"});const Oe=at("react"),{Tooltip:$}=at("@dee
  - `lib\client.js:6` `),B=f.map((P,Q)=>P.text!=null?e("div",{key:Q,className:"cm-mm-row wide"},e("span",{className:"cm-bbox-label"},P.name),e("span",{className:"cm-mm-text cm-num"},P.text)):e(E,{key:Q},P.view.row)),M=P=>{
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：每个注册都返回清理函数，并交给 ctx.effect 拥有。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\gateway-quotas.js:227` const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\index.js:3277` const backfillTimer = setTimeout(async () => {
  - `lib\index.js:3297` const openRouterTimer = setInterval(() => { void refreshOpenRouter() }, 3600_000)
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\index.js:1297` .then(externalUsage => externalUsage ? { externalUsage } : {})),
  - `lib\index.js:1600` const task = queryBalance(ctx, localeOf(ledger.config, ctx), controller.signal).then(async result => {
  - `lib\index.js:1686` const task = queryGoQuota(ctx, ledger.config, localeOf(ledger.config, ctx), controller.signal).then(result => {
  - `lib\index.js:1796` const task = queryCustomBalance(ctx, configForEntry, { signal: cache.controller.signal }).then(result => {
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\native-search-billing.js:143` item.timer = setTimeout(() => { item.done = true; if (!attempt.accounted) miss(item, 'response-incomplete'); item.release() }, 60_000)
  - `lib\native-search-billing.js:184` item.timer = setTimeout(() => {
  - `lib\native-search-billing.js:254` signal.timer = setTimeout(() => finishSignal(signal, true), 60_000)
  - `lib\native-search-billing.js:321` const schedule = () => { if (!timer) { timer = setTimeout(flush, 1000); timer.unref?.() } }
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\native-search-fetch.js:19` Promise.resolve(promise).then(response => {
  - `lib\native-search-fetch.js:27` Promise.resolve(result).then(value => complete(attempt, value), () => failed(attempt)).catch(() => {})
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\net.js:40` const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\net.js:38` const sleep = (ms, signal) => new Promise((resolve, reject) => {
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 监听/注册可能没有配套的清理
- 为什么危险：注册了 ctx.on / addEventListener 却没有 ctx.effect 形式的清理，卸载后会残留。
- 本包情况：文件里找不到 ctx.effect
  - `lib\net.js:42` else signal?.addEventListener('abort', abort, { once: true })
- 建议：每个注册都返回清理函数，并交给 ctx.effect 拥有。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\openrouter-catalog.js:15` const timer = setTimeout(() => controller?.abort(new Error('OpenRouter catalog timed out')), timeoutMs)
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\openrouter-pricing.js:37` const timer = setTimeout(() => controller?.abort(new Error('OpenRouter price refresh timed out')), timeoutMs)
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\store.js:2132` this.writeTimer = setTimeout(() => {
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [low] 插件图标缺失或过大
- 为什么危险：图标只影响插件页展示；超过 256 KiB 或越界的路径会被拒绝并产生诊断。
  - `package.json:1` package.json 没有声明 icon
- 建议：放一个 ≤256 KiB 的 SVG/PNG 并声明顶层 icon。

#### [low] 监听/注册可能没有配套的清理
- 为什么危险：注册了 ctx.on / addEventListener 却没有 ctx.effect 形式的清理，卸载后会残留。
  - `lib\index.js:1500` ctx.on('credentials/record-updated', key => {
  - `lib\index.js:1503` ctx.on('deepseek-account/signed-out', invalidateAccountBalance)
  - `lib\index.js:1504` ctx.on('deepseek-account/session-expired', invalidateAccountBalance)
  - `lib\index.js:2147` ctx.on('settings/document-updated', syncMessageLocale)
- 建议：每个注册都返回清理函数，并交给 ctx.effect 拥有。

#### 想先禁用再说的话，把这段写进 profile 的 `cordis.patch.yml`（或用侧栏插件页关掉对应行）
```yaml
- id: cost-meter
  name: dsh-cost-meter
  disabled: true
```

合计：1 个包，high=4 medium=17
