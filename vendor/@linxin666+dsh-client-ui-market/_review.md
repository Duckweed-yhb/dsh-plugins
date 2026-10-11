# @linxin666/dsh-client-ui-market 0.4.6 —— 代码审阅报告

> 来源：子代理只读审阅（2026-10-11），要求"每条结论附文件:行号并逐字引用"。
> 归档溯源见 `_provenance.json`（sha512 已校验）；机器静态预检见 `_preflight.md`（high 0 / medium 7）。
> 本文件为原始报告存档，未改写结论。

## 1. 结论
- **风险等级：中（可用，但两条链需要知情）**。未发现安装期脚本、远端 JS 执行、凭据读取或环境外传；Host 写入路径有白名单校验，安装网关只收 loopback。
- **一句话理由**：唯一的信任根是 `https://dsh-market.com` 的清单——它既决定往 `$DSH_HOME` 落什么皮肤/宠物/preset，也能把"任意 npm 包名或 https git 仓库"交给官方插件管理器**以 enabled 状态装进宿主进程**。
- 证据基线：`_provenance.json:8` `"integrityVerified": true,`（仅证明 tarball 与 registry 一致，不证明代码安全）。
- 与 `_preflight.md:4` `- 结论：**⚠️ 需要留意**（high 0 / medium 7 / low 1 / info 1）` 总体一致；其中"定时器/异步/动态求值"多项经复核影响低于预检描述（见 3.7），真正的重点是预检未单列的**远端清单→插件安装**（3.3）。

## 2. 清单与 patch
- 身份与入口：`package.json:2` `"name": "@linxin666/dsh-client-ui-market",`、`package.json:4` `"version": "0.4.6",`、`package.json:7` `"main": "lib/index.js",`；`package.json:10` `"./client": "./lib/client.js",` 即浏览器半区。
- 发布内容仅 3 类：`package.json:63-67` `"files": [` / `"lib",` / `"cordis.patch.yml",` / `"icon.svg"`；**无 locale/*.json**。
- **无安装期脚本**：`package.json:72-77` 只有 `"build": "tsdown"` / `"watch"` / `"typecheck"` / `"test"`，无 preinstall/install/postinstall。
- 依赖极薄：`package.json:35-37` `"dependencies": {` `"schemastery": "^3.18.0"`；peer 为 `"@deepseek-ai/dsh": ">=0.2.0-rc.2"` 与 `"react": "^18.2.0"`；`engines.dsh: ">=0.2.0-rc.2"`。
- 客户端声明与实现**不一致**：`package.json:22-26` inject 只有 `dsh-client-connection` / `dsh-client-ui-renderer` / `dsh-client-ui-settings`，但代码另 require 了 `ui-primitives`（3.5）与 `dsh-client-store`（3.5）。
- patch 只插 1 行：`cordis.patch.yml:7-8` `- id: ui-market` / `name: '@linxin666/dsh-client-ui-market'`；Host 侧 `lib/index.js:1533` `const name = "ui-market";` 对齐。
- 注释与实现漂移：`cordis.patch.yml:3-4` 声称 Host 会注册 market settings namespace 与 loopback install gateway，实际 Host 只注册路由（`lib/index.js:1543` `const dispose = ctx.webServer.register(route);`）；`README.md:86-87` 自己承认 "The host half (`src/index.ts`) owns no settings registration"。
- 许可证元数据不准：`package.json:30` `"license": "BSD-3-Clause",`，而 `LICENSE:2` 是 `Apache License`。

## 3. 逐项发现

**3.1 Host 半区实际行为**：只注册 4 条 HTTP 路由（`lib/index.js:1510` `${MARKET_API_PREFIX}/installed`、`1515` `install-skin`、`1521` `install-pet`、`1526` `install-preset`），**没有**插件安装路由、没有 `child_process`（全库检索 `child_process|execSync|spawn` 无命中）。

**3.2 写 `$DSH_HOME` 的方式**：目标是 `lib/index.js:1258` `return join(dshHome, KIND_DIR[kind], id);`（`KIND_DIR` 见 `1209-1213`：skins/pets/agent-presets）；id 双重校验（`1454` 路由层、`1239` `if (!id || !KIND_ID_RE[kind].test(id)) throw new Error(...)`）；相对路径走白名单 `1226` `const SAFE_REL_RE = /^[A-Za-z0-9._][A-Za-z0-9._\-/]{0,199}$/;` + `1230` `if (rel.includes("..") || rel.includes("//") || rel.startsWith("/") || rel.endsWith("/")) return false;`，落盘 `1357` `writeFileSync(target, buf);`。**未发现穿越**（`..`、`//`、绝对路径、`C:` 均被拒；`\` 不在字符集内）。
- 覆盖行为：默认拒绝（`1345` `if (exists && options.force !== true) throw new MarketInstallError("conflict", ...`），`force` 时整体替换 `1370` `if (exists) rmSync(dest, {`（recursive/force）——即"删掉同名资产目录再改名"，范围限于该 id 目录。
- `$DSH_HOME` 取值：`1026` `function resolveDshHome(env = process.env, home = homedir()) {` → `1030` `const raw = env.DSH_HOME;`，无其它 env 使用。

**3.3 安装链路（最需关注）**：清单来自固定站点（`lib/index.js:1197` `const MARKET_ORIGIN = "https://dsh-market.com";`，路径 `1235` `${MARKET_ORIGIN}/assets/${KIND_MANIFEST[kind]}/${encodeURIComponent(id)}/`），下载 URL **由 Host 用已校验的 rel 重建**，客户端只发 id/force——这点设计是对的（无 SSRF、无客户端指定路径）。
- 但**没有任何 hash/签名/白名单**：`1358` `hashes[entry.rel] = createHash("sha256").update(buf).digest("hex");` 是下载**之后**的记录，只写进 `dsh-market.provenance.json`，不是校验；`README.md:116-119` 承认其用途是让 Skin Center 事后判断"是否市场原样下发"。
- 插件安装的 spec 完全由远端清单决定：`lib/client.js:1735` `const spec = installSpec(item);`，`lib/client.js:872` `return entry.npm ?? entry.repo ?? entry.id;`，校验只有形状（`865` `const NPM_SPEC = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@[0-9A-Za-z][0-9A-Za-z._-]*)?$/;` 与 `882` `if (spec.startsWith("https://")) return isHttpsGitUrl(spec);`）→ **任意已发布 npm 包名或任意 https git 仓库都能通过**。
- 且是"安装即启用"：`lib/client.js:1746` `(manager != null ? installViaOfficialManager(manager, spec, requestId) : face.install(spec))`；`lib/client.js.map`（内嵌 `native-plugin-faces.ts:119`）`const result = await manager.installBundle(spec, { enabled: true, requestId })`。
- 唯一人工闸门是用户点击 + loopback 限制：`lib/client.js:1733` `if (face === null || !face.isLoopback || installing !== null) return;`（注意此守卫读的是家族 face，不是官方 manager，见 3.7）；Host 侧同样拦非本机：`lib/index.js:1429` `if (!isLoopback(req)) {`。

**3.4 网络端点**（浏览器直连 + Host 直连，均为 https）：
- 目录/统计：`lib/client.js:1355-1359` `fetchJson("https://dsh-market.com/manifest/skins.json"),` … `"https://dsh-market.com/api/stats"),`；npm 下载量 `1353` `fetchJsonOptional("https://dsh-market.com/api/npm-downloads");`。
- 互动上报：`1797` `const res = await fetch("https://dsh-market.com/api/like", {` 与 `1842` `const res = await fetch(origin + "/api/install", {`，载荷含 `device_fp: deviceFp(),`（`1272-1284` 的 localStorage 随机 UUID）。
- 本地网关（相对路径，同源）：`1416` `const res = await fetch("api/market/install-" + kind, {`、`1435` `const r = await fetchJson("api/market/installed");`、跨插件 `1602` `await fetch("api/skin-center/v2/active", {`。
- **无远端 JS 下载执行**：全库无 `eval(`；唯一 `new Function` 在 `lib/index.js:300` `schema.callback = new Function("return " + schema.callback)();`，位于内联依赖 schemastery（`lib/index.js:260` region 注释），非远端内容。

**3.5 浏览器半区**：`lib/client.js:2` `id: "@linxin666/dsh-client-ui-market",` ——与包名一致 ✓。
- 额外 require Harness 客户端包：`lib/client.js:8` `let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");`（**不在 inject 声明里**，且是工厂顶层 require）；另有一处**刻意拆字符串规避静态扫描**的 require：`508-509` `const platform = ["@deepseek-ai/dsh-client", "-store"].join("");` / `const legacy = ["@deepseek-ai/dsh-client-runtime", "/client"].join("");`，`512-514` 依次 try require 两者。
- DOM 注入：`42` `document.body.append(iframe);`（隐藏 Turnstile 校验 iframe，指向 `13` `const CHALLENGE_URL = "https://dsh-market.com/api/turnstile/challenge";`，回包校验 `53` `if (event.origin !== MARKET_ORIGIN$1 || event.source !== iframe.contentWindow) return;`）；`88-92` 与 `1160-1163` 往 `document.head` 插 `<style>`（带 `data-plugin` 去重，但**卸载不摘除**）。
- **无 XSS 渲染面**：全库检索 `innerHTML|dangerouslySetInnerHTML|document.write|insertAdjacentHTML|srcdoc` **零命中**，远端文案一律经 React 文本渲染。
- 但远端 URL 未做 scheme 校验：`lib/client.js:2144` `href: item.repo,`（紧随 `2150` `props.openExternal(item.repo ?? MARKET_ORIGIN);`），`2359` `ctx.sidebarRight.openTab(BROWSER_TAB_KIND, { params: { url } });` —— `item.repo` 来自远端清单，`javascript:` 之类不会被本包拦下。
- 定时器/监听：`50` 的超时有清（`58` `window.clearTimeout(timer);`）、`66` 的 message 监听在 finish 移除（`59`）、`381-382` 成对增删 ✓。

**3.6 凭据与隐私**：检索 `credential|apiKey|api_key|password|authorization` 无命中；`process.env` 仅 `lib/index.js:1026/1030` 读 `DSH_HOME`。外传仅两项：每日心跳 `lib/client.js:2769` `reportDailyHeartbeat([{ name: "@linxin666/dsh-client-ui-market" }]);`（载荷 `2731-2735` `kind: "heartbeat"` / `visitor` / `items`；`2719` `if (navigator.webdriver) return;`；`README.md:82` 有披露），以及市场互动（点赞/安装上报带 device_fp 与 `turnstile_token`）。未读会话内容、工作区文件或 Host token。

**3.7 稳健性**：定时器类告警多为误报（React 组件内 `314`/`362-364` 有清理；`1540`/`1551` 未跟踪但回调仅 setState、2.4s/1.2s 自灭）。
- 真正残留：Turnstile 隐藏 iframe 常驻（`turnstile.ts:81` 注释 `/** Test-only lifecycle reset; production keeps one hidden frame per page. */`）与两处 `<style>`，禁用插件后仍在页面。
- 静默吞异常 + 已登记挂载：`lib/index.js:1541` `for (const route of routes) try {` … `1548` `} catch {}`，而 `991` `mounted.add(packageName);` 先于 apply 执行 → 注册失败时表现是"卡片在、装不了、无日志"。
- 宿主忙等：`1380` `while (Date.now() - start < 50);`（rename 重试，最多阻塞宿主事件循环 50 ms）。
- 配置开关不生效：`1536` `const Config = Schema.object({ enabled: Schema.boolean().default(true).volatile() });` 而 `applyImpl` 完全不读 config；客户端只用它控制显示（`lib/client.js:1313` `const cardVisible = state.enabled.text !== "false";`），**网关始终在**。

**3.8 构建产物 vs 源码**：Host 半区**无 sourcemap**，结论基于 `lib/index.js` 打包产物（内含本包逻辑 + 内联 schemastery，边界靠 `lib/index.js:260` 的 region 注释区分）。客户端半区反而"源码全公开"——`lib/client.js.map:1` 的 `sourcesContent` 内嵌全部 14 个原始 TS，可逐行对照；缺点是 map 行号是内嵌源码行号，不是 `client.js` 行号。

## 4. 最值得关注的 3 个点
1. **一键安装+启用任意 npm/git 代码**：远端清单 → `spec` 形状校验（`lib/client.js:865`/`882`）→ `installBundle(spec, { enabled: true, ... })`。没有签名、没有发布者白名单、没有确认弹窗。一次点击 = 第三方代码在**无沙箱、用户完整权限**的宿主进程里跑起来。
2. **皮肤/宠物/preset 内容零校验落盘并被激活**：`lib/index.js:1357` 落盘、`1358` 事后记 hash；随后客户端 `lib/client.js:1602` `await fetch("api/skin-center/v2/active", {` 直接激活刚下载的皮肤。README 把安全性托付给另一个插件（`README.md:109` "skin CSS is sanitized by the Skin Center runtime"）——跨插件信任，本包不自证。
3. **远端清单驱动的 URL 未校验 scheme**：`lib/client.js:2144` `href: item.repo,` 与 `2359` `ctx.sidebarRight.openTab(...)`。渲染进程里一次点击即可把任意远端 URL 送进内置浏览器/新标签。

## 5. 未确认/盲区
- DSH 客户端 module loader 对**未在 inject 声明**的 `require("@deepseek-ai/dsh-client-ui-primitives")`（`lib/client.js:8`）与拆字符串 require（`508-515`）是否放行 → 未确认（若不放行，`ui-primitives` 的顶层 require 会让整个卡片加载失败）。
- `javascript:` href 是否真能触发：契约是 `"react": "^18.2.0"`，React 19 才硬拦；实际安装版本未查 → 未确认。
- 官方 `remote.pluginManager.installBundle` 内部是否另有确认/校验、Skin Center 是否真做 CSS sanitize → 未审 → 未确认。
- Host 半区无 map，无法 100% 排除打包期注入。
- 同族包（dsh-pet / skin-center / web-ui-settings）共享遥测与部分代码，不在本报告范围内。

## 6. 装前建议
- 若只想要"市场浏览 + 复制命令"：注意**禁用行只关卡片显示，Host 网关仍会注册**。
- 保留插件时：不要在没看清清单的情况下用 `install all`；安装插件后到官方 Plugins 页复核来源；对 `$DSH_HOME/{skins,pets,agent-presets}` 做快照备份（`dsh-market.provenance.json` 是记录不是签名）。
- 长期建议：把该站点清单纳入白名单/校验（至少 pin 或验签），对 `item.repo` 加 `https:` 前缀校验，`installBundle` 的 `enabled` 改成默认 false。
- **最坏情况**：dsh-market.com 或其账号/构建被攻破 → 清单下发恶意皮肤（点击安装后自动激活）或恶意插件条目；一次点击即以完整用户权限在宿主进程执行任意代码，可读工作区、凭据与全部会话。
- **恢复路径**：侧栏插件页关掉 `ui-market` 行（并在 profile 的 `cordis.patch.yml` 写 `disabled: true`）→ 删除对应 `$DSH_HOME/{skins,pets,agent-presets}/<id>` → 官方 Plugins 页卸载涉事包并清掉其 profile 行 → 重启宿主 → 从备份还原 `$DSH_HOME` → 轮换该机器上宿主进程可见的一切密钥（含 DSH 配置里的 API key）。
