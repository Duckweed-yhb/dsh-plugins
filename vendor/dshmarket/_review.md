# dshmarket 1.66.15 —— 代码审阅报告

> 来源：子代理只读审阅（2026-10-11）。结论、等级与关键证据保留；为归档紧凑做了压缩（原文约 3 倍篇幅，逐项 walkthrough 已并入各节结论）。

## 1. 结论
- **风险：中。建议：可以装，但它是"高权限工具"。**
- 一句话理由：宿主半区**没有**进程级危险写法（全 lib 无 `process.exit(` 调用、无 `eval`/`new Function`、无 TLS 降级），外部命令一律 argv 数组 + `shell:false`，安装目标受"目录白名单 + 字符白名单"双重约束；真正的风险是**信任链**——远端目录、第三方脚本 giscus、以及每个被装插件的 host 半区，都直接接进你的宿主进程。
- 最坏情况：`awesome-dsh-plugin.com/plugins.json`（CN 区还会改从 npm 包 `dsh-plugin-catalog` 读）被投毒 → 你点一次 Install 即装入任意 npm/GitHub 包 → 其 host 半区在 DSH 进程内以完整用户权限运行（**这是 DSH 插件模型的固有性质，不是本包缺陷**）。
- 恢复路径：① 自带快照（`lib/snapshot.js:37` `SNAPSHOT_FILES = ['package.json', 'cordis.patch.yml', '.dsh-market/state.json']`）与 `/dsh-market/backup`；② `dsh plugin remove <name>` 或手工编辑 profile 的 `package.json` + `cordis.patch.yml`；③ 宿主起不来时市场留 127.0.0.1 恢复页可勾掉肇事插件。

## 2. 清单与 patch
- `package.json:6` main=`lib/index.js`；`:69` `"./client": "./client/client.js"`；`:47-50` `dsh.bundle.patch`。
- patch 一致：`cordis.patch.yml:3-4` `- id: dsh-market` / `name: 'dshmarket'`，与 `lib/index.js:12` `export const name = 'dsh-market';` 及包名三处一致。
- 依赖极小：`package.json:38-40` 仅 `js-yaml`、`undici`；peer 为 cordis/dsh-settings/schemastery。
- **安装期脚本：有，但只对 git/本地安装生效**：`:31` `"prepare": "npm run build"`、`:30` `"prepack": "npm run build && node scripts/preflight.mjs"`；`files`（`:74-82`）不含 `scripts/`。**tarball 安装不执行；用 `github:` 源码安装会执行该仓库构建脚本。**

## 3. 逐项结论
1. **外部命令**：三处 spawn，全 argv 数组。主安装 `lib/dsh-cli.js:996`；非 shim 路径 `shell:false`（`:437`/`:440`）；Windows `.cmd` 是唯一走 cmd.exe 的路径（`:442`），引号规则 `:395` `const CMD_METACHARS = /[\s"&|<>^()%!]/;`，profile 名另加一道 `:982`。**注入面被白名单封住**：`:925` `export const TARGET_RE = /^[A-Za-z0-9@:./_#+~^=-]+$/;`（不含空格/引号/`%`/`&`/`|`/`$`/反引号），不合格即拒（`:932-934`）。超时/取消齐备：`:388` 15 分钟默认、`:1013-1016` `killTree`、`:549-577` `taskkill /T /F` 或进程组 SIGTERM→SIGKILL。另有两处无 shell 的 `gh auth token`（`lib/gist.js:150`）与 `git config --get core.sshCommand`（`lib/dsh-cli.js:258`，5s 超时）。**未发现把用户/远端输入拼进 shell 字符串。**
2. **profile 写入**：只写 profile 目录 + tmpdir；家目录 patch 只读（`lib/check.js:1131-1133`）。原子写入为主：`lib/profile.js:953-956` `writeManifestAtomic`（temp+rename）、`lib/routes.js:1094-1097`、`lib/order.js:32-33`、`lib/snapshot.js:128-129`。**真实缺口（非原子写）**：`lib/patch.js:438/449/455/481` `writeFileSync(patchPath, …)`（直接覆盖 `cordis.patch.yml`）、`lib/profile.js:1176`（pnpm-workspace.yaml）、`lib/profile.js:1448`、`lib/routes.js:1446/1478/1495/1507`（restore 回退路径的 package.json）——写一半被杀会留截断文件（窗口小，且 KB 级短写 + 有快照/恢复页兜底）。回滚完备：安装前捕获 manifest+lockfile（`lib/routes.js:5732`/`:5738`），失败即恢复（`:5779`、`:5810-5823`）；patch 层非法 YAML 时**拒绝追加**（`lib/patch.js:474-479`）且写入串行化（`:412-417`）；宿主基础设施行禁改（`lib/patch.js:39-83` `PROTECTED_MODULE_PATTERNS`）。
3. **`process.exit` / 进程钩子**：**全 lib 无 `process.exit(` 调用**（grep 只命中 `process.exitCode` 与 `process.kill`）。`lib/recovery.js:1000/1009/1037` 的 `process.exitCode = 1` 在**独立恢复进程**且有自执行守卫（`:1041-1048`）；`lib/restart.js:370-372` 的 `process.on(...)` 只在**字符串模板生成的助手脚本**里，由 `:547` spawn detached 独立进程。唯一"带走宿主"的写法 `lib/restart.js:553` `setTimeout(() => process.kill(process.pid, 'SIGTERM'), 500);` 被四道门拦住（`lib/routes.js:5026` `restartAllowed`、`:5030` `detectedDebugger`、`:5034` `trustedRestartRequest`、`:5038` `writing || installing`）。**但默认值**：`lib/restart.js:152-154` `return detectedSupervisor(env, ppid) === null;` → 普通 `dsh web` 下**默认允许**页面一键重启宿主。
4. **网络**：固定域名、https、**无 TLS 降级**（`rejectUnauthorized|NODE_TLS_REJECT|strict-ssl` 0 命中）。`lib/regions.js:34-35` npmjs / 腾讯镜像；`:55-56` `gh-proxy.com`/`ghfast.top`（CN 区 GitHub 前缀代理）；`:63` `https://awesome-dsh-plugin.com/plugins.json`；`:80` `dsh-plugin-catalog`；`lib/changelog.js:30` `updates.json`；`lib/gist.js:34` `api.github.com`。**无遥测**（lib 内无对外 POST；客户端无 `sendBeacon`；`api()` 只取 pathname，不回传页面 query——`src/client/market-data.ts:30-34`）。**第三方脚本注入**：`client/client.js:3518-3519` `script.src = "https://giscus.app/client.js";`（点开评论才加载，卸载 `replaceChildren()` `:3543-3545`）。截图来源限死 4 个 GitHub 域名（`market-data.ts:1046-1051`）。
5. **安装来源受目录绑定**：`lib/routes.js:5584-5588` 必须在策展目录里，否则 `'plugin is not in the curated registry'`。防抢名绑定：`lib/sources.js:41-50`（tarball 的 `owner/repo` 必须等于条目自己的 repo）、`:425-430`（npm 名过 `NPM_NAME_RE`）。GitHub 源会先把 HEAD 解析成 commit（`lib/accelerate.js:19-29`），但 **HEAD 可变**。更新/回滚不可自由指定（`lib/routes.js:3692-3696`、回滚靠服务端令牌 `:5484-5489`）。构建脚本授权有闸：`:5104-5107`（先过 `PKG_RE` 且必须已在 `node_modules`），`setAllowBuilds` 仅由 `/dsh-market/approve-builds` 调用（`:5226`）→ **不存在"安装即自动放行 postinstall"**。**目录本身无签名/校验和**：`lib/registry.js:228` 直接 `JSON.parse` 远端 JSON。
6. **凭据与隐私**：token 解析顺序 = 请求体 → `DSH_GITHUB_TOKEN` → `gh auth token`（`lib/gist.js:88-103`/`:150`），只发 `api.github.com`（`:215`）；WebDAV 密码只存服务端内存（`src/client/MarketSection.tsx:1519-1523`）。日志脱敏且家目录折 `~`（`lib/log.js:33-37`/`:26`）。备份会**主动导出疑似密钥文件**但有提示与计数（`lib/backup.js:22` `SECRET_FILE_HINTS`）→ 指向自建 WebDAV 时自担。评论刻意不带页面 URL 以免泄漏宿主一次性 token（`src/client/comments.ts:44-46`）。
7. **浏览器半区**：`client/client.js:1` `load({ id: "dshmarket", … })` 与包名一致 ✓；只 require 宿主注入模块（`:29-33`，含 `@deepseek-ai/dsh-client-ui-primitives`，缺失时优雅跳过注册 `:14850-14854`）。**XSS 面未发现**：`innerHTML|document.write|outerHTML|insertAdjacentHTML|eval(|new Function` 全 0 命中，远端列表/README 一律作 React 文本渲染。清理良好：MutationObserver 在 effect 内、disposer 里 `observer.disconnect()` + `tag.remove()`（`:14799-14805`）。
8. **产物 vs 源码**：`lib/*.js` 是 `tsc` 产物，`client/client.js`（14975 行）是打包产物；**`src/` 随包发布**，关键结论均对照过 `src/*.ts`（如 giscus 见 `src/client/CommentsModal.tsx:56-57`）。

## 4. 最值得关注的 3 个点
1. **信任链而非本包代码**：一次 Install = 在 DSH 进程内运行对方 host 半区代码；目录无签名、GitHub 源按可变 HEAD 安装、CN 区目录还经第三方 npm 包。
2. **giscus 第三方脚本执行在 DSH 页面源**（`client/client.js:3519`）：该源同源可调 `/dsh-market/install` 等全部接口。**不点开评论即不加载。**
3. **一键重启默认开启**：同源页面可 POST `/dsh-market/restart` → `process.kill(process.pid,'SIGTERM')`。要关就在配置里显式 `allowRestart: false`。

## 5. 未确认 / 盲区
- patch 的 `insert` 行与宿主 loader 命名空间是否完全对得上，未在真实 profile 验证（仅核对三处字符串一致）。
- `lib/routes.js` 尚有约 30 个路由未逐行通读（backup/restore/webdav/gist/snapshot/setup-pnpm/channel/region/github-proxy/build-env/self-uninstall/logs）；已确认都经 `registerRoute` → `refuseUnadmitted`（`:1722-1734`）与各自 `sameOrigin`/`trustedDownloadRequest` 门，**不能排除**某条读接口有路径穿越或信息过量返回。
- `sameOrigin` 允许 **Origin 缺失**（`lib/http.js:195-196`，为 Desktop 代理刻意放宽）：浏览器跨站仍安全，但**本机任意非浏览器进程可无 Origin 驱动安装接口**（它本就有你的权限，不构成提权，属"本地无认证"）。
- Windows cmd.exe 的 `%VAR%` 展开仅静态推断（`TARGET_RE` 已排除 `%`，实际不可达），未真机验证。
- 打包产物与 `src/` 一致性为抽样对照，未全量 diff；UI 交互路径未逐条走查。

## 6. 装前建议
1. **先备份再装**：对目标 profile 做一次市场快照 + `/dsh-market/backup` 导出（package.json / cordis.patch.yml / .dsh-market/state.json）。
2. **别用 git 源装它**（会执行仓库 `prepare`/`build`）；走 registry：`dsh plugin add dshmarket`。
3. 不想让页面能重启宿主：显式 `allowRestart: false`（`lib/index.js:263` 透传，`restartAllowed` 尊重显式 false）。
4. 首次只装 1–2 个可信插件试水，重启确认 profile 组合正常后再下一批。
5. WebDAV 自动备份指向**你自己的**存储（默认导出含 `config.toml`/`.env` 类文件）。
6. 不需要评论区就别点开（避免 giscus 脚本进入页面源）。
7. 出问题顺序：市场快照 → `dsh plugin remove <name>` → 手工编辑 profile → 127.0.0.1 恢复页勾掉肇事插件。
