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
