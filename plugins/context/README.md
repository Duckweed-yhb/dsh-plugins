# @yhb/dsh-plugin-context

> fork 自 [`dsh-context@0.74.0`](https://www.npmjs.com/package/dsh-context)（Apache-2.0，作者 bowenliang123）。
> 上游文档见 `README.upstream.md`；本文件只写「改了哪三处、边界、怎么验、怎么退」。

## 定位

上下文洞察：把一次会话的上下文**由什么组成、怎么被压缩、涨在哪里**可视化（dashboard + `context` 命令）。

## fork 改了哪三处（其余保持上游原样）

| 位置 | 原值 | 现值 |
|---|---|---|
| `package.json` → `name` | `dsh-context` | `@yhb/dsh-plugin-context` |
| `cordis.patch.yml` 插入行 | `id: dsh-context` / `name: dsh-context` | `id: yhb-context` / `name: '@yhb/dsh-plugin-context'` |
| `lib/client.js` 加载器 id | ``id:`dsh-context` `` | ``id:`@yhb/dsh-plugin-context` `` |

⚠️ **内部标识保留上游原样**（`lib/client.js` 里 74 处、`lib/index.js` 36 处 dsh-context，多为 CSS 类名前缀
`lc-`、i18n 命名空间、事件名、localStorage 键）。这些是自洽字符串，乱改只会让 host↔client 对不上。

## 边界（要清楚的）

- 客户端 `inject` 里有 **`@deepseek-ai/dsh-client-ui-primitives`** —— 它确实在冻结 seed 的 9 项里、能用；
  但官方写法指引是"尽量别依赖 Harness 客户端包"，所以它随上游升级断的风险比别家高一点。
- 它会往 **设置页** 和 **右栏（`sidebar-right`）** 加入口 —— 跟 `bloom-theme`（改 DOM）在视觉上同区，
  跟我们的余额挂件不同槽位，所以是"看着挤"而非"抢槽位"。
- 客户端压缩成两行，静态审计只能按行命中，**误报率高**；真机验证请以冷启动后是否出现页签/命令为准。

## 怎么验

1. `plugin_manager` `install_bundle`，target = 本目录绝对路径。
2. 冷启动后：`bundles` 里多出 `@yhb/dsh-plugin-context`；设置页/右栏出现它自己的入口。
3. Agent 侧：应能调用 `context` 相关命令/工具（随上游实现）。

## 怎么退

`plugin_manager` `remove_bundle`，target = `@yhb/dsh-plugin-context`。上游原件留在 `.scratch/cand3/dsh-context/`（未改动）。
## ⚠️ 本地依赖：zod（必须保留）

`lib/index.js` 一启动就 `import 'zod'`，而 `link:` 方式安装的本地插件**不会自动装依赖**（pnpm 的警告：
"The linked in dependency will not resolve the peer dependencies"）。首装就因此失败过：
`Cannot find package 'zod' imported from .../lib/index.js`。

做法：把 `zod@4.4.3`（sha512 已校验）直接解进本目录的 `node_modules/zod`。
**这个 `node_modules/zod` 是插件的一部分，删了它插件就起不来。**