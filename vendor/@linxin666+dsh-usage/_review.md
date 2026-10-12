# @linxin666/dsh-usage 0.4.6 —— 代码审阅报告

> 来源：子代理只读审阅（2026-10-11）。结论、等级与关键证据保留；轻度压缩。
> 溯源 `_provenance.json`（sha512 已校验）；机器预检 `_preflight.md`（high 0 / medium 4）。
> 用途：查各家 provider 余额/额度（含 OpenCode Zen Go 与 DeepSeek 官方余额）。

## 1. 结论
- **风险：中，可装，但必须留回滚路径。**
- **与同族的关键差异：本包没有任何遥测。** 全包（src + lib + .map）grep
  `telemetry|dsh-market|analytics|gtag|sentry|posthog|umami|mixpanel|sendBeacon` **零命中**；
  也没有 `randomUUID`/`crypto.*` 设备 ID。同族那条 `https://dsh-market.com/api/telemetry/event` **在本包不存在**。
- 无安装期脚本、无 `eval`/`new Function`/`atob`、无第三方 `<script src>`/iframe。
- 风险集中在两处：**浏览器半区模块级 hidden require（失败即整个 client factory 抛错）**，以及
  **宿主定时器上的 fire-and-forget promise 链（无 `.catch()`）**——正对该家族已知的
  「渲染进程启动失败 / 非零退出」形态。
- 凭据路径干净：全部走宿主 `credentials` seam，密钥只发往各 provider 自家端点，浏览器只收到
  `'api-key'|'env'|'oauth'|'none'` 枚举（`src/core/types.ts:121`）。

## 2. 清单与 patch
- `package.json:10` main=`lib/index.js`；`:17-19` `exports["./client"] = ./lib/client.js`。
- `package.json:89-94` 脚本只有 build/watch/test/typecheck，**没有 `prepare`/`preinstall`/`postinstall`/`prepublish`**。
- 依赖仅 `@deepseek-ai/schemastery ^3.18.4`；peer 为 `@deepseek-ai/dsh` + react。
- **patch 只插 1 行，行 id = `usage`**（`cordis.patch.yml:9-10`），未带 `disabled`。
- `dsh.client.inject` 5 项：connection / locale / ui-settings / ui-slots / ui-renderer。

## 3. 凭据与网络
- 只经宿主 seam，无文件/环境直读密钥：`src/host/usage-service.ts:792` `credentials.readRecord(credentialKey('llm-pi-ai', provider))`、`:809` 取 `profile?.apiKeyEnv`、`:811` `credentials.resolve(credentialRef(envName))`；DeepSeek 默认 `DEEPSEEK_API_KEY`（`:829`）。
- 唯一出站：`usage-service.ts:742` `fetch(spec.url, …)` + `:744` `AbortSignal.timeout(PROBE_TIMEOUT_MS)`（10s）。
- 端点**硬编码**在 `src/core/adapters.ts`：
  - `:162` `https://api.deepseek.com/user/balance` ← **DeepSeek 官方余额**
  - `:311` `https://opencode.ai/zen/go/v1/usage` ← **OpenCode Zen Go 额度**
  - `:201` `api.kimi.com/coding/v1/usages`、`:373` `openrouter.ai/api/v1/credits`、`:408` `zenmux.ai/...`、`:432` `chatgpt.com/backend-api/wham/usage`，以及 `:484-496` 注册表里的 moonshot / bigmodel / z.ai / minimax / siliconflow（host 由闭包写死，**用户 baseURL 改写不了**）。
- 无明文 HTTP（唯一 `http://` 是 `src/host/routes.ts:55` 的 `'http://127.0.0.1'` 解析基址）；无重定向跟随；无密钥日志（src 内 `console.*` 零命中）。
- 一处细节：**origin 防串号只保护 balance、不保护 plan**（`usage-service.ts:739` `if (kind === 'balance' && !balanceApplies) return undefined`）。
- README 如实披露（`README.md:28`）：探测全在宿主侧按轮询周期跑（默认 60s），API key 走凭据 seam，**永不进浏览器**。

## 4. 客户端半区
- `lib/client.js:2` `id: "@linxin666/dsh-usage"` — **与包名一致** ✓
- require：`react`、`react/jsx-runtime`、`react-dom/client`，以及**字符串拼接的隐藏 require**：
  `:11` `const platform = ["@deepseek-ai/dsh-client", "-store"].join("");`
  `:12` `const legacy = ["@deepseek-ai/dsh-client-runtime", "/client"].join("");`
  调用 `:15` `engine = require(platform);`、`:17` `engine = require(legacy);`
- **未在 `dsh.client.inject` 声明的**：`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-runtime/client`。
  （`dsh-client-store` 只在 `package.json:64` 的 devDependencies；`:10` 的 `//#region \0dsh-store-engine` 表明这是自家 tsdown 注入的兼容 shim，**不是为藏恶意代码**。）
- **降级单层且不完整**：`:14-18` 只有第一次 require 在 `try` 内，**legacy 那次没有兜底**；两者都失败 → factory 在**模块级**抛错，而 `lib/client.js:1` 顶层直接 `window.__ModuleLoader__.load({…})` → 正是「客户端模块加载失败 → 渲染进程启动失败」的形态。
- 有兜底处：`ctx.locale.register`（`:2707-2714`）、`disposeFootCard()`（`:2763-2765`）、`ctx.slots.register`（`:2768-2782`）均 catch 后 no-op。
- DOM：`src/client/foot-card-mount.tsx:87` 建 div、`:89` `createRoot`、`:98` `insertBefore(container, settings)`；`src/client/body-mutations.ts:112` 全页 `MutationObserver`（全页仅 1 个，Symbol 共享）。
- **清理齐备**：`foot-card-mount.tsx:107-111` 返回 disposer（`unsubscribeBody(); root.unmount(); container.remove()`），由 `src/client/index.ts:180-186` 的 `ctx.effect(..., 'dsh-usage: sidebar foot card')` 拥有；`body-mutations.ts:124-131` 最后一个订阅者离开时 `disconnect()` + `cancelAnimationFrame`。

## 5. 遥测：不存在
- 端点/载荷/触发/开关/披露——均不适用；包内 grep 上述关键词**零命中**（含 `lib/client.js`、`lib/index.js`、`lib/client.js.map`）。
- 唯一本地持久化是折叠状态：`src/client/UsageFootCard.tsx:53` `FOOT_CARD_COLLAPSED_KEY = 'dsh-usage.foot-card.collapsed'`，**不含任何标识符**。
- 客户端出站只有同源相对路径 `api/dsh-usage/overview|day|refresh`（`src/client/index.ts:51-53`）。

## 6. 定时器与文件
- 两枚宿主定时器：`usage-service.ts:574` flush（3s 防抖）、`:638` poll 自重排（`pollIntervalSec` 默认 60、下限 30，`src/index.ts:67`）。
- **确实被 `ctx.effect` 拥有并清理**：`:284-285` 两个 `clearTimeout`，由 `:282` `stop()` 调用，而 `stop()` 出自 `src/index.ts:200-207` 的 `ctx.effect(...)`。
  → `_preflight.md` 的「定时器需确认清理」是**误报**。
- **真正的缺口在失败路径**：`lib/index.js:1821` `this.pollNow().finally(() => this.rearmPoll(...))` —— `.finally()` **保留 rejection** 而返回的 promise 被丢弃；`pollNow` 的 cycle（`lib/index.js:1833-1853`）只有 `try/finally`、**没有 `catch`**。同理 `lib/index.js:1770` `this.flushLedger();`。
- 文件写入只有两处、都在 DSH home：`usage-service.ts:264-266` → `$DSH_HOME/dsh-usage/usage-ledger.json` 与 `provider-snapshots.json`；**原子写**（`:90` tmp → `:95` fsync → `:99` rename → 失败 `:101` unlink）。
- **不触碰 profile 的 `package.json`/`cordis.patch.yml`**（全包 fs 只用 mkdir/open/readFile/rename/unlink）。

## 7. 最值得关注的 3 个点
1. **模块级 hidden require + 无兜底的 legacy 分支**（`lib/client.js:11-18`）——**唯一有可能让 GUI 起不来的点**。
2. **定时器上的 fire-and-forget**（`lib/index.js:1821`、`:1770`）——`.finally()` 不吞 rejection、cycle 无 `catch`；触发需 poll 途中非预期异常，概率低但后果是「释放/退出非零」类。
3. **绕开槽位的 DOM 手术**（`insertBefore` + 全页 observer + 合成 `click()` 打开设置面板）：依赖对 shell class 名的猜测（`'[class*="footArea"]'`、`'[class*="settingsArea"]'`），shell 一变就退化或错位（不致命）。

## 8. 未确认 / 盲区
- **未确认**：`__ModuleLoader__` 是否对 factory 抛错兜底、是否允许 require 注入清单外的模块（本包内无法证明）。
- **未确认**：客户端 `inject` 里的 `"remote"` 由哪个包提供、缺失时是 pending 还是报错；代码里**从未使用 `ctx.remote`**。
- **未确认**：本机是否真有 `@deepseek-ai/dsh-client-store`（包内无法证明；我在运行时清单里看到该名字存在）。
- 抽样而非逐行：`lib/client.js`（417KB）用定向 grep + 首尾段；`voucher-art.generated.ts`（299KB）验证为惰性 base64 JPEG；`lib/client.js.map`（493KB）按关键字抽查。
- **未做动态验证**（只读审阅，未安装未执行）。

## 9. 装前建议
1. **可装，先记回滚路径**：回滚 = profile 的 `cordis.patch.yml` 写 `- id: usage` / `  name: @linxin666/dsh-usage` / `  disabled: true`，或删包；残留只有 `$DSH_HOME/dsh-usage/` 两个 JSON。
2. **装后第一件事是刷新/重启并盯启动情况**，确认 `@deepseek-ai/dsh-client-store` 的 require 成功；若 GUI 白屏，这是首要嫌疑，**禁用该行即可恢复**（不必清 profile）。
3. 唯一值得提的隐私项：`usage-service.ts:157` `settings.describe({ redactSecrets: false })` 会把未脱敏的 llm 设置整段读进内存（只取 `apiKeyEnv`/`baseURL`、不外发）。要求最小明文暴露的话，这是可提 issue 的点。
4. 想让它更稳，可提两项 issue：(a) 把 `@deepseek-ai/dsh-client-store` 写进 `dsh.client.inject` 并把 legacy require 也放进 `try`；(b) 给 `pollNow().finally(...)` 与 `flushLedger()` 补 `.catch()`。
5. 横向对比：**本包不含同族匿名遥测**，比 pet / skin-center / web-ui-settings 干净。
