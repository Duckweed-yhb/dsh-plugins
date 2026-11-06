# dsh-plugins

自用的 DeepSeek Harness（DSH）插件工坊。每个插件是一个**可以独立安装的包（bundle）**，安装到当前 profile 后对该 profile 的所有会话生效，并跨重启保留。

## 目录结构

```
dsh-plugins/
├─ README.md              ← 你在这里：快速上手
├─ docs/
│  └─ 插件机制.md          ← Host 半区 / 浏览器半区 / patch 的契约细节 + 实测踩坑
├─ tools/
│  ├─ preflight.mjs       ← 独立预检：审一个插件目录/包名（不起 DSH）
│  ├─ fetch-plugin.mjs    ← 从 npm 拉插件进 vendor/，并校验 sha512 + 记录溯源
│  ├─ check-compat.mjs    ← 对照本机 DSH 运行时清单，检查 client.inject / peer 是否存在
│  └─ asar-tool.mjs       ← 直接读 DSH 的 app.asar（列文件/抽文件），用于查官方实现
├─ tests/
│  ├─ run.mjs             ← 预检规则引擎自测（node tests/run.mjs）
│  └─ fixtures/bad-plugin ← 故意写坏的反面样本，用来证明规则真的会响
├─ vendor/                ← 第三方插件归档与审阅区（见 vendor/README.md）
└─ plugins/
   ├─ hello/              ← 插件 #1：可复制的最小 UI 模板
   │  ├─ package.json     ← 清单：bundle patch + dsh.client 声明
   │  ├─ cordis.patch.yml ← 往 profile 组合里插入一行
   │  ├─ index.js         ← Host 半区（Node 侧）
   │  ├─ client.js        ← 浏览器半区（Web UI 渲染）
   │  ├─ locale/{zh,en}.json ← 插件卡片上的标题/描述
   │  ├─ icon.svg         ← 插件卡片图标
   │  └─ README.md
   └─ preflight/          ← 插件 #2：装插件之前的静态体检（零依赖 Host 工具）
      ├─ index.js         ← 注册 plugin_preflight 工具（手写 JSON Schema，不 import DSH 包）
      ├─ lib/rules.js     ← 规则引擎（纯 Node，可被独立脚本复用）
      ├─ cordis.patch.yml ← 行 id：yhb-preflight
      └─ README.md
```

## 一个 DSH 插件由什么组成

| 部分 | 文件 | 作用 |
|---|---|---|
| 清单 | `package.json` | `dsh.bundle.patch` 指出 patch 文件；有 UI 时 `dsh.client` 声明浏览器半区 |
| 插入行 | `cordis.patch.yml` | 用 Loader 的 patch 语法往 profile 里 `insert` 一行插件 |
| Host 半区 | `index.js` | `export function apply(ctx, config)`，跑在 DSH 宿主进程里 |
| 浏览器半区 | `client.js` | 注册进 `window.__ModuleLoader__`，在 Web 页面里渲染 |

**纯 JS，不需要编译**：`client.js` 直接手写成 DSH 期望的模块工厂格式（见 `plugins/hello/client.js`），所以这个仓库没有构建步骤、没有 `node_modules`。

## 安装一个插件

三种方式任选：

1. **让 agent 装**（推荐）：`plugin_manager` 的 `action: install_bundle`，`target` 填插件目录的**绝对路径**，例如
   `E:\future\yhb\05-学习资源\dsh-plugins\plugins\hello`。
   它负责装包、写 profile、选入 bundle；**不要**手改 profile 的 `package.json` / `cordis.patch.yml`，也不要在 profile 目录跑 pnpm。
2. **GUI**：侧栏「插件」→「添加插件」→ 填绝对路径 → 安装 → 「立即启用」。
3. **CLI**：
   ```powershell
   dsh plugin --profile desktop add "E:\future\yhb\05-学习资源\dsh-plugins\plugins\hello"
   ```

安装结果看返回的 `application` 字段：`applied` = 已经生效（HMR 重组），`restart-required` = 要重启 DSH 才生效。返回的 `warnings` 也要看。

## 装任何第三方插件之前：先跑预检

`plugins/preflight` 已经装在这个 profile 里，它给 agent 注册了一个 `plugin_preflight` 工具。用法：

```
plugin_preflight(target: "installed")          ← 审当前 profile 已装的全部第三方插件
plugin_preflight(target: "@linxin666/dsh-pet")  ← 审某个包名
plugin_preflight(target: "D:\\path\\to\\plugin") ← 审某个目录（还没装也能审）
```

返回：结论（`ok` / `caution` / `high-risk`）+ 逐条发现的**文件:行号证据** + 为什么危险 + 怎么改 + 可直接粘贴的禁用补丁。

不想起 DSH 也能跑同一个引擎（审还没安装的源码目录）：

```powershell
node tools/preflight.mjs "D:\下载的插件目录"      # 审一个目录
node tools/preflight.mjs installed               # 审当前 profile 的第三方插件
node tools/preflight.mjs --json @linxin666/dsh-pet
node tests/run.mjs                               # 自测：反面样本应命中 9 条规则，正常插件与自检应为 0
```

## 验证

- 不花批准额度：`cordis_inspect_query`（host `Config.listConfigs`）确认新行已挂载。
- 看得到：Client `Slots.listSubTree` 的 `occupants` 里出现你的 `id`。
- 肉眼：DSH 页面里输入框下方应出现一行小徽标（跟随亮/暗主题）。

## 禁用 / 卸载 / 排错

| 目的 | 做法 |
|---|---|
| 临时关掉 | 侧栏「插件」页里那一行的开关，或 `plugin_manager` `set_plugin`（写 profile patch 的 `disabled`） |
| 关掉整个 bundle | 侧栏插件页的组合包开关，或 `plugin_manager` `set_bundle` |
| 卸载 | `plugin_manager` `remove_bundle` |
| 启动失败 / 崩了 | 先看 `E:\DeepseekHarness\dsh-data\logs\`（StartupError 完整诊断），再看 `C:\Users\yhb\AppData\Roaming\@deepseek-ai\dsh-desktop\logs\crash-*.log`（桌面崩溃报告）；桌面弹窗第三个按钮会备份 profile patch 并禁用第三方插件 |

## 红线（踩了就会搞坏界面或搞崩启动）

1. `client.js` 里 `window.__ModuleLoader__.load({ id })` 的 **id 必须等于包名**。
2. **不要** `require('@deepseek-ai/dsh-client-ui-primitives')` 或任何其他 Harness 客户端包（除 `react` 与 `slots` 这类基础模块）；它们随时会变。
3. 颜色只用主题令牌 `--dsw-alias-*`（清单见 `docs/插件机制.md`），不要写死颜色。
4. 不要在组件外写 DOM、不要碰 `document.body`、不要读别的插件的 DOM。所有注册都放进 `apply` 里并用 `ctx.effect` / `ctx.on` 返回清理函数。
5. 一个组件抛异常会让**那一个槽位条目**崩掉（控制台 `slot entry crashed in '<slot>'`），不会整页崩——但 Host 半区在 required 条目上抛异常会让 DSH 起不来。

## 🧭 升级兼容台账（DSH 升版后先跑这条命令）

体检工具：`tools/check-peers.mjs`（比对每个已装插件的 peer/engines 要求与当前 harness 版本，
只支持 `^` / `~` / `>=` / 精确，够覆盖本仓库）。用法：

```powershell
node tools/check-peers.mjs --harness 0.2.1-rc.2
```

**2026-10-20 · harness 0.2.0-rc.2 → 0.2.1-rc.2**

| 插件 | 结果 |
|---|---|
| `@yhb/dsh-plugin-{hello,mode-panel,preflight,sidebar-balance}` | ✅ 匹配 |
| `dsh-bloom-theme@0.17.3` | ✅ 匹配（且有 0.18.1 可升） |
| `dsh-provider-usage@0.3.16` | ✅ 匹配（peer 是 `>=0.1.2-alpha.3`，向上兼容） |
| `dsh-plugin-gate@1.3.2` | ⛔ **不匹配**：写死 `@deepseek-ai/dsh-fs/system-prompt/tools ^0.1.0-rc.6`，而新 harness 是 `0.2.1-rc.2`（`^0.1.0-rc.6` 的上界是 `<0.2.0`）。npm 上 4 个已发布版本全都是这个写法，**没有可用新版** → 已卸载 |

卸载的代价：`gate_scan` / `gate_guard` / `gate_report` 三个工具没了（它在升级后本来就被门禁拦住、不可用）。
**替代**：自研 `@yhb/dsh-plugin-preflight`（静态预检，仍在跑）承担安装前的排查；等上游放宽 peer 再装回。

> 立场：**不做版本豁免**。豁免等于让"要求不被满足"的代码跑起来，而作者声明的 API 面对不上——
> 那正是"崩溃或数据丢失"的来源。要恢复 gate 的能力，优先级是：① 上游出新版 ② 我们自己 fork 并**冷启动验证**（不是豁免）。

## 🧩 已 fork 并安装（都是 @yhb 名下，源码在你的工作区）

| 包 | 上游 | fork 改动 | 状态 |
|---|---|---|---|
| `@yhb/dsh-plugin-context` | `dsh-context@0.74.0`（Apache-2.0） | 包名 / patch 行 / 客户端加载器 id；vendor `zod@4.4.3` | ✅ 已安装（`applied`） |
| `@yhb/dsh-plugin-savepoint` | `dsh-undo-savepoint@0.5.0`（MIT） | 同上三处 + **启动期快捷方式改默认关闭**（`YHB_SAVEPOINT_DESKTOP_SHORTCUT=1` 才开） | ✅ 已安装（`applied`，patch 未被它改动） |
| `@yhb/dsh-plugin-file-upload` | `dsh-file-upload@0.5.4`（MIT） | 包名 / patch 行 / 客户端 id / 导出 name 四处；vendor 4 个纯 JS 解析器（`--ignore-scripts`） | ✅ 已安装（`applied`；默认 `markitdownBin`/`visionEndpoint` 为空 = 不 exec、不联网） |

**为什么"变成你的"**：源码进 `plugins/`，升级与否由你决定，改动可读可审；代价是上游修复不会自动来，需要自己拉。

**fork 的固定流程**（工具：`tools/fork-plugin.mjs`）：
1. `screen-plugins.mjs` 看元数据（peer/体积/inject）
2. 拉包 → `plugin_preflight` 审源码（**以它为准**，别用 grep 粗筛）
3. `fork-plugin.mjs --src <上游目录> --slug <名字>`
4. 检查 `dependencies` 并 vendor 进 fork 的 `node_modules`（`link:` 安装不会带依赖）
5. `node --check` → `install_bundle` → 验证 bundles/patch 未被改动 + 无新崩溃日志

## 💥 事故复盘：2026-10-25 14:15 DSH 启动崩溃

**现象**：启动失败，日志显示 12 个插件"候选等待服务"，看起来像全坏了。

**根因（只有一个）**：为验证一个假设，我直接用 npm 方式装了 `deepseek-harness-weixin@0.2.5`。
它的 `dependencies` 里带着 `@deepseek-ai/dsh-credentials-local: 0.1.0-rc.7`，pnpm 把这个**旧版 harness 包**
提进了 profile 的 `node_modules` → 与 0.2.1-rc.3 不兼容被判定禁用 → `credentials` 服务缺失 →
必需行 `connection` 无法激活 → **host 启动失败**。
崩溃恢复按钮随后把 `dsh.profile.bundles` 清空（只剩 base + web-app），所以看起来"所有插件都没了"。

**代价**：一次崩溃 + 全部插件挂载丢失 + 一次 profile patch 还原。**没有数据损失**（会话、工件、skill 库、快照都在）。

### 新规则（已写进 fork 流程）

1. **安装前必查 `dependencies` 里有没有 `@deepseek-ai/*`** —— 有就**先挪到 `peerDependencies`** 再装。
   这是唯一能"装一个插件、崩掉整个 host"的机制。（`tools/audit-profile.mjs` 会扫这一项）
2. **每个 fork 的 patch 行 id 必须是 `yhb-*`** —— 上游可能用 `web`、`file-upload` 这类通用名，
   会**顶掉官方行**（ds-bot 原版 `- id: web` 就是这种）。
3. **恢复时一次 2-3 个**，每次验：三条路由 200 + 近 15 分钟无崩溃日志。别一口气全挂回来。
4. **同类功能只挂一个**：`ds-bot` 与官方 `dsh-experimental-agent-team-profile` 有 **15 个同名工具**，
   同时挂会分不清是谁在响应。
5. 装 `link:` 插件时，它的 `peerDependencies` 里若含 harness 内部包（如 `dsh-agent-presets`），
   **解析不到就是解析不到** —— 这类包不要硬修，直接放弃（weixin 就属于这种）。

### 能查的工具（都在 `tools/`）

| 工具 | 查什么 |
|---|---|
| `audit-profile.mjs` | **profile 有没有被污染**（`@deepseek-ai/*` 版本、依赖隐患、行数、备份） |
| `check-peers.mjs` | 每个已装包的 peer/engines 是否匹配当前 harness |
| `screen-plugins.mjs` | 候选包安装前的元数据筛（体积/inject/peer） |
| `fork-plugin.mjs` | 把上游包 fork 成 `@yhb/dsh-plugin-*`（含三处改名） |