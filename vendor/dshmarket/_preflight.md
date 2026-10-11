
### 预检结果：dshmarket @ 1.66.15

- 结论：**⛔ 高风险**（high 10 / medium 25 / low 1 / info 0）
- 目录：`E:\future\yhb\05-学习资源\dsh-plugins\vendor\dshmarket`
- 类型：bundle；插入 1 行：`dsh-market`
- 已扫描：47 个 JS 文件（部分文件超限只读了头部）
- 跳过：1 个不在入口可达图上的 JS 文件（多为未被 `exports` 暴露的源码副本或死代码，**未审阅**）

#### [high] 直接结束宿主进程
- 为什么危险：进程级 exit/abort 会连坐整个 DSH：用户的其他会话、未保存的会话日志、正在跑的工具一起没了。
  - `lib\dsh-cli.js:565` process.kill(-child.pid, signal);
- 建议：插件不应该拥有结束 DSH 的权力；用错误返回或日志表达失败。

#### [high] 启动外部进程
- 为什么危险：Host 代码在宿主进程内运行且不受工作区沙箱约束，spawn/exec 等于以你的用户权限执行任意程序；插件自带的构建脚本也会在安装时被判为待批准脚本。
  - `lib\dsh-cli.js:258` const out = spawnSync('git', ['config', '--get', 'core.sshCommand'], {
  - `lib\dsh-cli.js:437` return spawn(file, [...args], { ...spawnOptions, shell: false, windowsHide: true });
  - `lib\dsh-cli.js:440` return spawn(file, [...args], { ...spawnOptions, shell: false, windowsHide: true });
  - `lib\dsh-cli.js:442` return spawn(COMSPEC, ['/d', '/s', '/c', `"${cmdCommandLine([file, ...args])}"`], {
- 建议：确认你真的信任这个包；装之前先看它 spawn 了什么。

#### [high] 启动外部进程
- 为什么危险：Host 代码在宿主进程内运行且不受工作区沙箱约束，spawn/exec 等于以你的用户权限执行任意程序；插件自带的构建脚本也会在安装时被判为待批准脚本。
  - `lib\gist.js:150` child = spawn(command, ['auth', 'token'], {
- 建议：确认你真的信任这个包；装之前先看它 spawn 了什么。

#### [high] 注册了进程级崩溃钩子
- 为什么危险：注册进程级崩溃钩子会改变 DSH 的致命失败语义：它会吞掉本该释放应用并退出的致命错误，让进程带病运行，也让崩溃归因失效。
  - `lib\restart.js:371` 'process.on("uncaughtException", (error) => note("helper crashed: " + (error && error.stack ? error.stack : error)))',
  - `lib\restart.js:372` 'process.on("unhandledRejection", (error) => note("helper rejection: " + (error && error.stack ? error.stack : error)))',
- 建议：删掉这类钩子，让 DSH 自己处理致命失败；需要观测就用 ctx.logger 或官方的通知渠道。

#### [high] 直接结束宿主进程
- 为什么危险：进程级 exit/abort 会连坐整个 DSH：用户的其他会话、未保存的会话日志、正在跑的工具一起没了。
  - `lib\restart.js:553` setTimeout(() => process.kill(process.pid, 'SIGTERM'), 500);
- 建议：插件不应该拥有结束 DSH 的权力；用错误返回或日志表达失败。

#### [high] 启动外部进程
- 为什么危险：Host 代码在宿主进程内运行且不受工作区沙箱约束，spawn/exec 等于以你的用户权限执行任意程序；插件自带的构建脚本也会在安装时被判为待批准脚本。
  - `lib\restart.js:547` const helper = spawn(nodeExecutable(), ['-e', restartHelperSource(spawned, launch, { out: logOut, err: logErr }, port, handoff)], {
- 建议：确认你真的信任这个包；装之前先看它 spawn 了什么。

#### [high] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
- 本包情况：文件里找不到对应的 clearInterval/clearTimeout
  - `lib\restart.js:553` setTimeout(() => process.kill(process.pid, 'SIGTERM'), 500);
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [high] 写 profile 的清单或 patch 文件
- 为什么危险：手写 profile 的 package.json / cordis.patch.yml / pnpm-workspace.yaml 会和插件管理器的写入冲突，是“DSH 起不来”的常见原因。
  - `lib\routes.js:1446` writeFileSync(join(activeProfileDir, 'package.json'), `${JSON.stringify(mergedManifest, null, 2)}\n`);
- 建议：这些文件只应由插件管理器与 Loader 写。

#### [high] 直接结束宿主进程
- 为什么危险：进程级 exit/abort 会连坐整个 DSH：用户的其他会话、未保存的会话日志、正在跑的工具一起没了。
  - `lib\store.js:23` process.kill(pid, 0);
- 建议：插件不应该拥有结束 DSH 的权力；用错误返回或日志表达失败。

#### [high] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
- 本包情况：文件里找不到对应的 clearInterval/clearTimeout
  - `lib\themes.js:165` await new Promise(resolvePromise => setTimeout(resolvePromise, 200));
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `client\client.js:2537` const timer = setTimeout(() => {
  - `client\client.js:3631` else timer.current = setTimeout(() => commit(next), 250);
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 监听/注册可能没有配套的清理
- 为什么危险：注册了 ctx.on / addEventListener 却没有 ctx.effect 形式的清理，卸载后会残留。
- 本包情况：文件里找不到 ctx.effect
  - `client\client.js:4028` document.addEventListener("keydown", onKey);
  - `client\client.js:4029` document.addEventListener("mousedown", onPointer);
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：每个注册都返回清理函数，并交给 ctx.effect 拥有。

#### [medium] require 了 Harness 客户端包
- 为什么危险：官方明确禁止：这些包随时会变，且一个抛异常的组件会让整个槽位条目崩掉（控制台 slot entry crashed）。
  - `client\client.js:30` let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：只 require react / react/jsx-runtime 与 slots 这类基线模块，其他控件自己画。

#### [medium] 直接操作页面 DOM
- 为什么危险：在组件外写 DOM、替换应用根节点或写 document.body，会和 DSH 的渲染与主题机制打架。
  - `client\client.js:3498` const bg = getComputedStyle(document.body).backgroundColor;
- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。
- 建议：渲染只走槽位；样式用主题令牌，不要往 body 追加节点。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\accelerate.js:145` const timer = setTimeout(abort, RESOLVE_TIMEOUT_MS);
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 监听/注册可能没有配套的清理
- 为什么危险：注册了 ctx.on / addEventListener 却没有 ctx.effect 形式的清理，卸载后会残留。
- 本包情况：文件里找不到 ctx.effect
  - `lib\accelerate.js:144` signal?.addEventListener('abort', abort, { once: true });
- 建议：每个注册都返回清理函数，并交给 ctx.effect 拥有。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\backup.js:240` return await new Promise((resolveRequest, reject) => {
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\discovery-compatibility.js:204` await new Promise(resolve => this.fetchWaiters.push(resolve));
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\dsh-cli.js:575` const escalate = setTimeout(() => signalTree('SIGKILL'), 5000);
  - `lib\dsh-cli.js:729` const timer = setTimeout(() => killChild(child), timeoutMs);
  - `lib\dsh-cli.js:1013` const timer = setTimeout(() => {
  - `lib\dsh-cli.js:1196` timer = setTimeout(() => {
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\dsh-cli.js:659` return new Promise((resolvePromise) => {
  - `lib\dsh-cli.js:695` return probeHostPackageManager().then(ready => ready ? true : probePnpmOnPath());
  - `lib\dsh-cli.js:701` return new Promise((resolvePromise) => {
  - `lib\dsh-cli.js:722` return new Promise((resolvePromise) => {
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\gist.js:167` const timer = setTimeout(() => {
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\gist.js:133` return new Promise((resolve) => {
  - `lib\gist.js:213` return new Promise((resolve, reject) => {
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\hot.js:467` const timer = setTimeout(() => {
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\hot.js:466` return new Promise((resolve, reject) => {
  - `lib\hot.js:470` Promise.resolve(awaitable).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\lifecycle.js:30` timer = setTimeout(() => reject(new LifecycleWaitError(`${label}: did not settle within ${WAIT_MS / 1000}s; runtime state is uncertain`)), WAIT_MS);
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\lifecycle.js:19` const operation = Promise.resolve().then(start);
  - `lib\lifecycle.js:22` void operation.then(() => { if (pending.get(key) === operation)
  - `lib\lifecycle.js:29` new Promise((_resolve, reject) => {
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\official-desktop.js:99` current.done = operation.then((result) => {
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\patch.js:414` const run = writeQueue.then(fn, fn);
  - `lib\patch.js:415` writeQueue = run.then(() => undefined, () => undefined);
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\region-probe.js:52` const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\registry.js:208` const headersDeadline = setTimeout(() => {
  - `lib\registry.js:320` const ceiling = setTimeout(() => {
  - `lib\registry.js:326` timer = setTimeout(() => {
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\registry.js:297` return new Promise((resolve, reject) => {
  - `lib\registry.js:331` reader.read().then((r) => {
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\routes.js:2108` const timer = setTimeout(() => controller.abort(new GistError('Gist operation timed out', 'timeout')), 25_000);
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\routes.js:412` void resolveRegion(undefined).then(({ region: probed }) => {
  - `lib\routes.js:509` void mountClientOnlyDeps(host, activeProfileDir).then(async (mounted) => {
  - `lib\routes.js:548` const run = mutationChain.then(async () => fn());
  - `lib\routes.js:574` const run = mutationChain.then(async () => fn());
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 脱离 apply 的异步工作
- 为什么危险：官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。
  - `lib\themes.js:165` await new Promise(resolvePromise => setTimeout(resolvePromise, 200));
- 建议：把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。

#### [medium] 定时器（需确认有清理）
- 为什么危险：脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。
  - `lib\updates.js:64` const timer = setTimeout(() => controller.abort(), GIT_REMOTE_HEAD_TIMEOUT_MS);
- 建议：定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。

#### [low] 插件图标缺失或过大
- 为什么危险：图标只影响插件页展示；超过 256 KiB 或越界的路径会被拒绝并产生诊断。
  - `package.json:1` package.json 没有声明 icon
- 建议：放一个 ≤256 KiB 的 SVG/PNG 并声明顶层 icon。

#### 想先禁用再说的话，把这段写进 profile 的 `cordis.patch.yml`（或用侧栏插件页关掉对应行）
```yaml
- id: dsh-market
  name: dshmarket
  disabled: true
```

合计：1 个包，high=10 medium=25
