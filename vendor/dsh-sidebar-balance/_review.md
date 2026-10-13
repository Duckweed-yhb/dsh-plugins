# dsh-sidebar-balance 0.1.1 —— 审阅 + 上线记录

> 2026-10-12。目标：侧栏常驻「OpenCode Go 额度 + DeepSeek 余额」。
> 解包副本与 sha512 校验记录在 `.scratch/`（含本轮全部候选）。

## 1. 结论：已装并实测生效

- 安装方式：`plugin_manager install_bundle`，target = `dsh-sidebar-balance@0.1.1`（registry 安装，非 `link:`）。
  返回 `application=applied`、`changed=true`、`warnings=[]`、pnpm exit 0。
- 安装安全门：**WARN，high 0** / medium 4（4 条全是「本包自己 fetch 同源 `/api/dsh-sidebar-balance/*` 路由」与 URL 字面量）。
- 实测（都打在运行中的 19387 上）：
  - `GET /api/dsh-sidebar-balance/opencode` → **200**，`{"rolling":{"percent":7},"weekly":{"percent":3},"monthly":{"percent":5}}`（真实额度，随用量变动）。
  - `GET /api/dsh-sidebar-balance/balance` → 502 `未配置 DeepSeek API key(credentials: DEEPSEEK_API_KEY)`（本机确实没有该凭据，符合预期）。
  - `GET /dsh-sidebar-balance/client.js` → 200，28,954 B，`text/javascript`（自托管成功）。
  - Client `Slots.listSubTree("settings.trigger")` → occupant `id=dsh-sidebar-balance, priority=-1, active=true`；原厂 seat（priority 0）转为 `active=false`。
    → **浏览器半区已加载并注册成功**，且是该插件声明的设计（余额显示在「设置」同一行右侧）。

## 2. 为什么是它（本轮被否掉的候选）

| 候选 | 安装安全门 | 否掉/保留的理由 |
|---|---|---|
| `dsh-cost-meter` 1.8.20 | **BLOCK**（high 4） | `cli-bridge.js:46` execFile、`ledger-lock-owner.js:24/32` getconf & powershell `execFileSync`、`:63` `process.kill(pid,0)` 存活探测 |
| `dsh-cost-meter` 1.8.22 | **BLOCK**（high 4，同上） | 上游最新版未改这四处；sha512 与 registry 一致。按安全门规则不装 |
| `@linxin666/dsh-usage` 0.4.6 | WARN（high 0） | `src/core/adapters.ts:158` `familyOnlyIds:['deepseek-account']` 把登录账号路由排除在探测外（issue #1772）→ 无 sk- key 时 DeepSeek 那一半永远不出;`inject` 含客户端不存在的 `remote` |
| `dsh-plugin-llm-balance` 0.3.0 | WARN（high 0） | DeepSeek 走 `apiKeyEnv=DEEPSEEK_API_KEY`；本机无 key，同样缺一半 |
| `dsh-whale-widget` 0.4.2 | **BLOCK**（high 13） | 体量大（音效/PNG），13 条 high |
| `balance-dsh` 1.3.0 | **BLOCK**（high 2） | `lib/index.js:272-273` 直接读 `process.env.DEEPSEEK_API_KEY` |
| `dsh-ds-balance` 2.3.1 | WARN（high 0） | **保留为备选**：走 `ctx.inject(['deepseekAccount'])` 读账号钱包（唯一能补 DeepSeek 那一半的干净候选） |
| 4 个 opencode-go 专用挂件 | 未逐一扫 | 都**没有** User-Agent，但实测证明 UA 非必需（见 §4） |

## 3. 本包安全性核查（逐条）

- **宿主半区零依赖**：只 `import { readFileSync } from "node:fs"`、`import { createHash } from "node:crypto"`。
  没有 import 任何 Harness 包 → 不存在 `link:` 装法下「import 宿主包失败 → 启动失败」那类崩溃（见 `docs/插件机制.md` 实测踩坑）。
- **客户端半区只 require `react` 与 `react/jsx-runtime`** → 两者都在外壳冻结的 9 项 seed 表内（`docs/插件机制.md` §6.0）。
- 客户端服务依赖只有 `slots` 与 `locale` → 都在本机 client Service 目录里（实测）。
- 两条路由都有 `isTrustedRequest()`（只认 loopback Host + 同源 Origin，非白名单主机 403）；错误文案过 `redact()` 去掉 sk-/bearer。
- 密钥只经 `ctx.credentials.resolve(ref)` 拿，不落日志、不出宿主；两张卡片数据只走同源 `/api/dsh-sidebar-balance/*`。
- 与宿主生命周期的关系：`ctx.effect()` 拥有 locale 字典与 slot 注册；无定时器（客户端 30s 轮询读的是宿主 30s TTL 缓存）。

## 4. 顺带证实的两件事（写进机制笔记）

1. **opencode.ai 的 `/zen/go/v1/usage` 不需要浏览器 User-Agent**：带 `Authorization: Bearer <OPENCODE_GO_API_KEY>` 裸请求实测 **HTTP 200**（有/无 UA 各一次，均 200）。cost-meter 注释里「不带浏览器 UA 会被 Cloudflare 拦 1010」在本机不成立——但它是并发/间歇现象的防御性写法，不算错。
2. **`vendor/` 目录带一条 Everyone 的 `DeleteSubdirectoriesAndFiles` 拒绝 ACE**：PowerShell / Node 都无法在该目录内新建文件（`UnauthorizedAccessException`），只有 DSH 的 fs 工具能写（本文件即由 write 工具写入）。要往 vendor 归档新包，先处理这条 ACE。

## 5. 回滚

```yaml
# profile 的 cordis.patch.yml
- id: dsh-sidebar-balance
  name: dsh-sidebar-balance
  disabled: true
```
或 `plugin_manager`：`set_bundle(false)` / `remove_bundle`。卸载残留：无（不写 DSH home，除 profile 自身的 node_modules/pnpm-lock）。

## 6. 缺口 / 待办

- DeepSeek **官方账户钱包**（= 设置→账号 那一份 `deepseekAccount.getBalance`）本包不读，它读的是 `DEEPSEEK_API_KEY` 的 `/user/balance`。
  本机凭据库只有 `refs: OPENCODE_GO_API_KEY` + `deepseek-account-platform/default`（登录级 token），**没有任何 sk- 开放平台 key**。
  要在卡片里显示账号钱包，二选一：装 `dsh-ds-balance` 2.3.1（WARN/high 0，`ctx.inject(['deepseekAccount'])`），或自写一个零依赖小卡片。
- `.scratch/` 留有本轮 10 个候选的解包副本（约 4 MB），确认后可清。

## 7. ⚠️ 上线结论（2026-10-12 15:26）：会崩 web boot，已摘除，勿再启用

- 现象：重启桌面端即弹崩溃报告，日志在
  `%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-2026-10-12T07-26-52-015Z-web-boot.log`：

  ```
  Error: web boot: 1 entry did not activate
  dsh-sidebar-balance: failed
  ```

- 连带损失（桌面端自动恢复造成的）：`profiles/desktop/package.json` 的 `dsh.profile.bundles`
  被削回 `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"]`（5 个第三方 bundle 全掉）；
  `cordis.patch.yml` 丢掉 `agent-default-model`（默认模型配置）与 `agent-preset-registry`，
  `ui-settings` 被置 `enabled: false`。两者已从同目录 `cordis.patch.yml.bak-1791790015063` 手工还原。
- **根因（2026-10-13 改正，先前归因错了）**：不是 inject id 不存在，而是
  **在启动批次里往一个还没被声明的槽位注册**。三条证据：
  1. 外壳启动校验的状态文案里，`fiber === undefined` 才报 `import failed`，
     `pending` 会报 `pending (waiting for service: …)`；我们拿到的是裸的 `failed`
     ⇒ 模块加载成功，是 `apply()` 抛了异常。
  2. 槽位核心注册实现：``if(!o?.spec) throw new Error(`slot "${e.name}" is not declared …`)``
     —— 槽位要先由「父条目的 children 表」声明。
  3. 全量扫 asar（8276 个文本文件）只有两处提到 `settings.trigger`，渲染/声明方是
     `@deepseek-ai/dsh-client-ui-settings-general/lib/client.js`（`renderSlot("settings.trigger", { wide })`）。
  本包的条目在启动批次里比这个模块先激活 → `settings.trigger` 还没声明 → `ctx.slots.register` 抛异常 →
  fiber failed → web boot 整体失败。原版写的 `inject: ["@deepseek-ai/dsh-client-runtime"]` 本想解决排序，
  但那个 id 在外壳里不存在（`index-5SrrfWpU.js` 633 KB 里 grep 不到），**未知 id 不会被等待 ⇒ 等于没排序**。
- **修法（已落在 `plugins/sidebar-balance/` 的 fork 里）**：注册包 try/catch + 每 500ms 重试（最多 120 次），
  槽位一出现就挂上；注册失败只降级成「挂件没挂上」，绝不冒泡成 fiber failed。`inject` 保持 `[]`
  （不依赖别的模块激活时机，避免反过来把自己卡成 pending）。
- **要救活就得改包**（fork 到 `plugins/`）：`dsh.client.inject` 改成 `[]`，并去掉宿主半区 `webServer.tapIndex`
  注入行里的 `inject` 字段。宿主半区本身干净（只 import `node:fs` / `node:crypto`），
  Go 额度链路实测可用（`/api/dsh-sidebar-balance/opencode` → 200，rolling/weekly/monthly 都有数）。
- **现状**：bundle 已从 `dsh.profile.bundles` 摘除；包仍留在 `dependencies`（不进 bundles 就不会挂载），
  但**不要再在插件页把它打开**，否则同样的崩会再来一次。
