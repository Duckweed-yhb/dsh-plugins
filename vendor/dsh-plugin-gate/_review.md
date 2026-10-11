# dsh-plugin-gate 1.3.2 —— 代码审阅报告

> 来源：子代理只读审阅（2026-10-11）。这份 review 的额外目的：它是"安装前安全门"，与自研预检同类，需要判断其真实能力与自我安全性。

## 1. 结论
- **自身风险：低，可装。** 无 `node:child_process`、无 `node:fs`、无 `eval`/`new Function` 调用、无 `process.on/exit`、无定时器、无浏览器半区、无遥测。改动面只有 4 个工具注册 + 1 段系统提示注入 + 两处可选的工作区内写文件。
- **我的静态预检 high 2 / medium 1 全是误报**：命中的是它**规则定义里的字符串字面量**（见 §3），不是行为。修复后的预检结论：**✅ 通过（high 0 / medium 0）**。
- **但它作为"安全门"名不副实**：1.3.2 **不拦截** `dsh plugin add`，只靠系统提示劝模型自觉先调 `gate_scan`。`ROADMAP.md:13` 写明拦截能力排在未发布的 v1.5.0。

## 2. 清单与 patch
- 安装期脚本：**无**。`package.json:22-24` 只有 `prepublishOnly`（跑自带测试）→ `dsh plugin add` 不会执行它的构建脚本。`dependencies` 为空，全部走 peer（`package.json:46`：cordis ^4.0.1、dsh-fs / dsh-tools / dsh-system-prompt ^0.1.0-rc.6、schemastery ^3.18.1）。
- `engines` **未声明**（盲区）。`exports` 无 `./client`（无 UI）。
- patch 只插 1 行 + 一段 config，**主机内全局生效**：`cordis.patch.yml:9-11` → `- id: gate` / `name: 'dsh-plugin-gate'`；其注释自承 `cordis.patch.yml:6-7` "The row registers the `gate_scan` model tool (plus prompt guidance when configured) host-wide."；`:18` `promptSection: true`、`:19` `sectionOrder: 5`。无 `disabled`、无 per-preset 限定。

## 3. 拦截机制：没有拦截，只有提示
- **没有 monkey-patch、没有包管理器包装、没有事件监听。** 对 ctx 的写操作只有两类：`index.js:135/240/284/345` 四处 `ctx.tools.register(defineTool({`（gate_scan / gate_guard / gate_diff / gate_report），以及 `index.js:409` `ctx.effect(() => ctx.systemPrompt.section({`。全包无 `ctx.on(`、无对已有服务方法的覆写；`index.js:30` `const inject = ["tools", "fs", "systemPrompt"];`。
- 清理正确：`systemPrompt.section` 返回 disposer，`ctx.effect` 回调正是返回它；`apply` 同步（`index.js:94`）→ 无异步 apply、无脱离 apply 的异步。
- 实际"拦截"= **提示词劝告**：`index.js:61` 的常量（10 行 / 1402 字符）以 *"Installation safety gate: before installing any plugin from a marketplace, npm registry, or untrusted repository (e.g. before running 'dsh plugin add' or adding a bundle), call gate_scan on the plugin source"* 注入系统提示；条件 `index.js:408` `if (config.promptSection)`，默认 `index.js:51` `promptSection: z.boolean().default(true)`，patch 又显式 true → **可在 config 里关**，关掉后零 prompt 占用。
- 提示注入面：注入文本是静态常量、不含扫描结果，第三方内容改不了它。真正注入面在工具输出（`index.js:128` `evidence: (h.evidence || "").slice(0, 200)`）——被截到 200 字符且只出现在工具结果里，属可接受残余风险。

## 4. "两处 child_process" 与"动态求值"：都是我这边误报
- 全包 import 穷举只有 `@deepseek-ai/schemastery`、`@deepseek-ai/dsh-tools`、`node:path`、`node:zlib` + 5 个相对导入。**既无 `node:child_process`，也无 spawn/exec 调用**。它刻意手写 tar 解包以避免起进程：`targz.js:4` "Pure module (node:zlib only). Used to scan npm tarballs without touching…"。
- 命中全是**字符串**：`rules.js:49` `hint: "child_process.exec/execFile spawns OS commands; inspect the command string.",`、`rules.js:57` `hint: "child_process.spawn is common in legit tools; …",`、`scan.js:140/144` 的提示串。
- 动态求值同理：`rules.js:136` `name: "eval()"`、`:144` `name: "new Function()"` 是**规则名**；全包无一处真正 `eval(`/`new Function(`。唯一"动态"是固定字面量 `scan.js:493` `const { extractTarball } = await import("./targz.js");`。

## 5. 规则集抽样与质量评价
- 规模与自述一致：`rules.js:34` `export const RULES = [` 起共 **60 条**（high 31 / medium 24 / low 5）。纯正则文本匹配，**无 AST、无数据流**（`rules.js:541`）。
- 扫描范围是**整包源码**，不止 scripts：`scan.js:243` `collectFiles` 广度遍历，默认跳 `node_modules`（`scan.js:260`）；`package.json` 另做结构化解析。判定线 `scan.js:556` `const verdict = summary.high > 0 ? "BLOCK" : summary.medium > 0 ? "WARN" : "PASS";`
- **好的抽样（逐字）**：`rules.js:349` 云元数据 IP（`169.254.169.254|metadata.google.internal|…`，high，指标硬）；`rules.js:220` 具体凭据环境变量枚举（`process\.env\.(OPENAI|ANTHROPIC|DEEPSEEK|…)`，high）；`rules.js:88` `powershell -enc`（high）；`rules.js:518` 启动项注册表（high）；`rules.js:470` `exfil_post`（把"外发 + 读本地/btoa"压在同一处）。
- **会误报/漏报的抽样**：`rules.js:365` `re: /\.onion\b/g`（high）——**它自己的 rules.js 第 365 行就含该字符串**，且 onion 不在 `scan.js:33` 的 `CODE_CONTEXT_RULES` 内（注释/文档降级不适用）→ **静态推导：拿它扫它自己会 BLOCK**（未实跑）。同类自命中还有 `rules.js:284/236/268`。`rules.js:244` 的 `HOME` 裸词（medium）会命中任何文档。`rules.js:430` 的 `password|api_key` 赋值（medium）占位符必中。
- **结构性漏报（对 DSH 特别关键）**：60 条里**没有一条覆盖 DSH 特有致命面**——`process.on('unhandledRejection')`、`process.exit`、未清理的 `setInterval`、脱离 apply 的异步、异步 apply。这**恰好是自研预检的强项**。
- 供应链深度有限：只扫目标包自身；依赖树的 postinstall 只靠 OSV 已知漏洞库覆盖，不扫依赖源码（`includeNodeModules: false` 默认）。
- 自伤性能（推导，未实测）：`rules.js:545-546` 用 `lineOf(text, match.index)` 定位行，而 `lineOf`（`:572-582`）每个命中都从文件头重扫 → ~O(命中数 × 文件长度)；2 MiB 文件里十万个命中可长时间占住宿主事件循环。

## 6. 副作用边界（写入与网络）
- 写文件只有两处、都 opt-in、都走工作区围栏：`index.js:327`（`gate_diff` + `update:true` → `.dsh/gate-baseline.json`）、`index.js:399`（`gate_report` + `write:true`）。围栏 `index.js:87` `if (!ctx.fs.contains(cwdTarget, target))` 抛 "escapes the session workspace"；**但围栏是条件式的**：`index.js:85` `if (cwd !== undefined)` —— 无会话 cwd 时不做包含性校验，写路径由模型给的 `path` 决定（能力边界收窄，非提权）。
- 失败回滚：`fs.writeText` 为原子替换；写失败抛错、旧基线保留。基线 JSON 损坏时静默当"无基线"（`index.js:321`）。
- **文档与行为不一致**：`index.js:14`、`README.md:16`、`SECURITY.md:20` 以及**注入给模型的系统提示**都断言 "never executes scanned code and never writes files."，实际有上述两处写（危害低，但这是喂给模型的不变式）。
- 网络 3 个出口，**无遥测、无结果上报**：`scan.js:453` npm registry 元数据；`scan.js:484` 下载 tarball（URL 取自 registry 响应，无域名 allowlist，SSRF 面小但存在）；`osv.js:58` `https://api.osv.dev/v1/query`，POST 内容仅 `{ package: { name, ecosystem: "npm" }, version }`（**只发依赖名+精确版本**，不发文件内容/路径/结果），默认 10s/依赖、最多 8 个。
- **配置失效 bug**：`index.js:106` 调 `scanNpmPackage` 时没传 `osvCheck`，而 `scan.js:529` `if (opts.osvCheck !== false)` 收到 `undefined` → **对 `npm:` 目标，config 的 `osvCheck: false` 关不掉 OSV 查询**（目录扫描正常生效，`scan.js:361`）。
- 下载是**先全量缓冲再判大小**：`scan.js:486` `const ab = await res.arrayBuffer();` → `:487` 才比 `maxTarballBytes`（32 MiB）。

## 7. 最值得关注的 3 个点
1. **"安装安全门"是软门**：无 pre-execute 钩子、不识别 `dsh plugin add`，全靠模型遵守那 1402 字符提示。当硬闸门用会产生安全错觉。
2. **规则集对它自己会自阻断，且对 DSH 致命矩阵零覆盖。** 与自研预检**互补**：它补的是 npm 供应链恶意面，自研预检补的是"DSH 起不来/被带走"面。
3. **三个边界小口子**：`osvCheck:false` 对 `npm:` 失效（静默外发依赖名）、tarball 先缓冲后判大小、`lineOf` 每命中 O(n) 复扫。

## 8. 未确认 / 盲区
- 全程只读，**未执行任何代码**："扫自己会 BLOCK"与"大文件会卡"均为静态/复杂度推导。
- 未验证该 config 能否通过 Config 校验并真实生效（未启动 DSH 加载该行）。
- 未核对 npm 上的 1.3.2 与本地字节逐字一致（`_provenance.json` 的 integrityVerified 是抓取时记录，非本次复核）。
- 本机 profile 的 `node_modules` 里没有 `@deepseek-ai/dsh-fs`，故 `ctx.fs` 行为细节未实测，仅比对 Inspect 声明的签名。
- `test/*.mjs` 未随包发布，其自测命令在本地产物上无文件可跑。

## 9. 装前建议
- **可装，按低风险处理**。想最小化足迹：把 patch 里 `promptSection` 改 `false`（省约 1400 字符/步），`allowlistHosts` 填你信任的扫描目标域名以减少噪声。
- 隐私口径：目录扫描可用 `osvCheck: false` 关掉 `api.osv.dev`；`npm:` 扫描在当前版本关不掉（§6 bug）——**若你介意"依赖名外发给 Google"，就只用目录模式扫本地已下载的包**（这正是本仓库现在的用法）。
- **与自研预检的分工**：`preflight`（先跑，硬门：退出码 1 = high，覆盖启动/生命周期/沙箱越界，零网络零依赖）→ `gate_scan`（补供应链恶意面：install 脚本、凭据读取、混淆、外传、OSV）→ 人工。重叠处（eval / child_process / 写系统路径）**以 preflight 为准**。
- **不必**用 gate 替换自研预检——两者规则集几乎不重叠。若要收敛，值得借鉴它三点：`CODE_CONTEXT_RULES` 式"注释/文档降级"、`hitFingerprint` 式基线 diff（`baseline.js:18`）、OSV 精确版本查询。
