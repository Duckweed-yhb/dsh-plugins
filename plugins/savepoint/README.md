# @yhb/dsh-plugin-savepoint

> fork 自 [`dsh-undo-savepoint@0.5.0`](https://github.com/lire1131/dsh-undo-savepoint)（MIT，作者 lire1131）。
> 上游文档见 `README.upstream.md` / `README.upstream.en.md`；本文件只写「改了哪三处、为什么、怎么验、怎么退」。

## 定位

配置快照与撤销：改动 profile / 插件目录之前留一张快照，坏了就回滚 —— **连 DSH 起不来的情况也能用**（它带一套离线 CLI / GUI）。

## 为什么 fork 而不是直接用

1. 你的工作区规矩：第三方插件先进 `05-学习资源/dsh-plugins/plugins/`，源码由你自己持有，升级与否你说了算。
2. 改名只动加载器认得出的三处，**行为一个字节没改**。

## fork 改了哪三处（其余保持上游原样）

| 位置 | 原值 | 现值 |
|---|---|---|
| `package.json` → `name` | `dsh-undo-savepoint` | `@yhb/dsh-plugin-savepoint` |
| `cordis.patch.yml` 插入行 | `id: dsh-undo` / `name: 'dsh-undo-savepoint'` | `id: yhb-savepoint` / `name: '@yhb/dsh-plugin-savepoint'` |
| `lib/client.js` 加载器 id | `id: "dsh-undo-savepoint"` | `id: "@yhb/dsh-plugin-savepoint"` |

⚠️ **内部标识故意没改**：CSS 去重键、localStorage 键 `dsh-undo-savepoint-keys`、CustomEvent 名、i18n 命名空间、离线 CLI 的状态键。
它们是这个插件内部自洽的字符串，改了只会制造 host↔client 不一致 —— 不会让它"更像你的"。

## 边界（要清楚的）

- 注册 **16 个 `undo_*` 工具**（`undo_snapshot` / `undo_restore` / `undo_doctor` / `undo_safe_mode` / `undo_scan` …）。
  每个工具的描述都占上下文 —— 这是**真实的 token 成本**，装它就等于认这笔账。
- `tools/` 里那套 `.ps1` / `undo-server.mjs` 是**离线救急**用的，DSH 运行时不加载。
- 它快照的是**它自己配置的目录**（默认 profile 与插件树），不是整个仓库 —— 别指望它替你备份 `E:\future\yhb`。

## 怎么验

1. 装：`plugin_manager` `install_bundle`，target = 本目录绝对路径。
2. 冷启动后：行 `yhb-savepoint` 应为 applied；`undo_list` 工具应可调。
3. 冒烟：`undo_snapshot` 一次 → `undo_list` 能看到 → `undo_restore` 回来。

## 怎么退

`plugin_manager` `remove_bundle`，target = `@yhb/dsh-plugin-savepoint`。上游原件仍留在 `.scratch/cand3/dsh-undo-savepoint/`（未改动）。
## ⚠️ fork 的第 4 处改动：启动期快捷方式默认关闭（2026-10-24）

上游在 **apply 阶段无条件**创建桌面/守卫快捷方式（`lib/index.js` 里 `ensureDesktopShortcut` / `ensureGuardShortcut`，
Windows 下各起一次 `powershell -Command`）。纯装饰，却是"每次启动都起子进程"的常驻风险。

fork 做法：整段包进开关，**默认关闭**——

```js
if (String(process.env.YHB_SAVEPOINT_DESKTOP_SHORTCUT ?? '') === '1') { … }
```

想要桌面快捷方式：启动 DSH 的环境里加 `YHB_SAVEPOINT_DESKTOP_SHORTCUT=1`。

## 保留的「起子进程」路径（都是你主动触发才有）

| 位置 | 何时跑 | 为什么留着 |
|---|---|---|
| `core.mjs` `runPnpm` | 你让它**修 profile**（重装/修复插件树）时 | 这是它"救砖"的核心能力 |
| `core.mjs` `pickDirectory` / `pickFile` | 你在界面点"选择目录/文件"时 | 系统原生选择框 |
| `health.mjs` 写 profile `package.json` | 同上（修 profile）时 | 修复能力本体 |
| `dedupeMount`（启动自愈去重） | 仅当检测到**多处挂载**时 | 单处安装是空操作；多处挂载正是"启动即崩"的成因 |

**结论**：自动路径已封，功能路径保留。用它修 DSH 时它确实会起 pnpm、写 profile —— 那是它的职责，不是漏洞。