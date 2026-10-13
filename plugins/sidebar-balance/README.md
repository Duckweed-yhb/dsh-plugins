# @yhb/dsh-plugin-sidebar-balance（侧栏余额挂件）

fork 自第三方包 `dsh-sidebar-balance@0.1.1`（MIT，作者 zhouchengke2046）。
为什么要 fork：它的功能正是我们要的（在「设置」同一行显示 DeepSeek 余额 + OpenCode Go 套餐消耗圆环），
但原版会让 DSH **起不来**。

## 与原版的差异（3 处）

| # | 改动 | 原因 |
|---|---|---|
| 1 | 删掉宿主半区 `webServer.tapIndex` 注入 boot row 的整段代码；`dsh.client.inject` 改成 `[]` | 原版 inject 写的是 `@deepseek-ai/dsh-client-runtime`，而外壳 `index-5SrrfWpU.js`（633 KB）里 grep 不到这个 id → 条目永不激活 → `web boot: 1 entry did not activate` → 整页起不来（2026-10-12 实测崩过一次，还连带 profile 被桌面端自动恢复削掉）。浏览器半区改走标准 `dsh.client` 扫描 —— `dsh-bloom-theme` 走的就是这条路，同机已验证 |
| 2 | 两条 API 路由改名 `/api/yhb-sidebar-balance/*` | 与仍留在 profile `dependencies` 里的原包彻底隔离，互不干扰 |
| 3 | DeepSeek 余额支持**宿主账号钱包**回退 | 本机只有桌面端登录账号、没有 sk- 开放平台 key，原版只会报「未配置」 |

## 数据来源

- **OpenCode Go 额度**：`GET https://opencode.ai/zen/go/v1/usage`，key = 凭据库 `OPENCODE_GO_API_KEY`。
  实测 200，返回 `usage.rolling / weekly / monthly`（5h / 周 / 月）。此端点不需要浏览器 UA（已实测）。
- **DeepSeek 余额**：优先 `DEEPSEEK_API_KEY` → `GET /user/balance`；
  没有 key 时回退 `ctx.get('deepseekAccount').getBalance()` —— 即「设置 → 账号」那一份钱包，插件不接触 token。

密钥只经 `ctx.credentials.resolve(ref)` 取，不出宿主；两条路由只认 loopback Host + 同源 Origin，错误文案过 `redact()`。

## 可调参数

写进 profile `cordis.patch.yml` 里 `yhb-sidebar-balance` 那一行的 `config`：

| 字段 | 默认 | 说明 |
|---|---|---|
| `balanceApiKeyEnv` | `DEEPSEEK_API_KEY` | 换一个凭据引用，就能显示那个账号的官方余额 |
| `balanceBaseUrl` | `https://api.deepseek.com` | |
| `opencodeApiKeyEnv` | `OPENCODE_GO_API_KEY` | |
| `opencodeBaseUrl` | `https://opencode.ai/zen/go` | |
| `accountFallback` | `true` | 无 key 时改读宿主账号钱包 |
| `cacheMs` / `timeoutMs` | `30000` / `15000` | 宿主侧缓存与上游超时（会被 clamp 到安全区间） |
| `allowedHosts` | `[]` | 除 loopback 外额外允许的 Host |

## 验证

```powershell
# 1. Go 额度（应 200）
curl.exe -s http://127.0.0.1:19387/api/yhb-sidebar-balance/opencode
# 2. DeepSeek 余额（应 200，source 是 account 或 api-key）
curl.exe -s http://127.0.0.1:19387/api/yhb-sidebar-balance/balance
```

3. Client 侧：`Slots.listSubTree("settings.trigger")` 应看到
   `occupant id=@yhb/dsh-plugin-sidebar-balance, active: true`。
4. 界面：侧栏**展开**状态下，「设置」那一行右侧出现余额；悬浮出磨砂卡片。
   窄条（rail）状态按原版设计只显示图标，不显示数字。

## 回滚

```yaml
- id: yhb-sidebar-balance
  name: '@yhb/dsh-plugin-sidebar-balance'
  disabled: true
```

或 `plugin_manager`：`set_bundle(false)` / `remove_bundle`。

## 边界（要清楚的）

- 它挂在 `settings.trigger` 这个 **单值、`shadows-shipped-ui`** 的座位上：等于**接管**「设置」那一行的内容，
  原厂 seat 会变成 `inactive`。外观是"齿轮 + 设置 + 右侧余额"，但这条行不再由原厂渲染。
- 浏览器半区改走标准扫描后少了一层"自托管 + 注入 boot row"的兜底；
  万一哪天扫描不再覆盖 profile 内的第三方包，表现是**挂件不出现**（安全失败），不会崩启动。
- Host 半区零外部依赖（只 import `node:*`），所以用 `link:` 外链安装也不会踩"import 宿主包失败"的坑。
