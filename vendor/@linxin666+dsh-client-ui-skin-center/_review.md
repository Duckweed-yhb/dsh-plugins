# skin-center 0.4.6 + web-ui-settings 0.4.6 —— 代码审阅报告

> 来源：子代理只读审阅（2026-10-11）。结论、等级与关键证据保留；为归档紧凑做了轻度压缩。
> 溯源见各自 `_provenance.json`；机器预检见各自 `_preflight.md`。

## 1. 结论

| 包 | 等级 | 建议 |
|---|---|---|
| `@linxin666/dsh-client-ui-skin-center` 0.4.6 | **中（内含一个高风险面）** | 可装但设边界：**只使用无 hooks 面的第三方皮肤** |
| `@linxin666/dsh-client-ui-web-ui-settings` 0.4.6 | **低—中** | 可装：保持 loopback 默认，勿配 `trustedProxyHosts` |

## 2. 先说好事：effect ledger 是真的，且覆盖完整

这是最重要的**正面**结论——我的静态扫描给 skin-center 的 4 条 medium（定时器无清理 / 脱离 apply 的异步 / 直接操作 DOM）**基本是误报**：

- 台账本体 `client.js:73-78`：`disposeActivation(activationId) { if (disposed.has(activationId)) return; disposed.add(activationId); const bucket = live.get(activationId) ?? []; for (const effect of [...bucket].reverse()) release(effect, activationId); }` → **逆序 + 幂等**；`release` 自身也幂等且不吞异常：`if (effect.released) return; effect.released = true;`（`:29-30`）、`try { effect.teardown(); } catch { push(activationId, "cleanup-failed", effect.label); }`（`:33-36`）。
- 台账覆盖四类：**样式** `ledger.record(activation, \`style:${label}\`, () => link?.remove());`（`:1193`）、**背景层** `ledger.record(activation, "background:layer", restore);`（`:1240`）、**hook 清理** `ledger.record(activation, "hooks", () => {`（`:1282`）、**定时器** `ledger.record(activation, "yield:claim-window", () => clearTimeout(timer));`（`:1422`）。
- **切换与卸载两条路径都走它**：切换 `if (previous !== null) ledger.disposeActivation(previous);`（`:1352`）；失败回滚 `ledger.disposeActivation(activation);`（`:1358`）；关停 `ledger.disposeActivation(currentActivation);`（`:1477`，同处 `doc.documentElement.removeAttribute("data-dsh-skin")` `:1489`）。
- 其余监听/定时器成对：`clearTimeout(timer);`（`:1134`）、`store.window.clearInterval(timer);`（`:1736`）、`removeEventListener("visibilitychange"…)`（`:1761`）、`removeEventListener("resize"…)`（`:956`）、`removeEventListener("dsh-skin-applied"…)`（`:1633`）、`cancelAnimationFrame`（`:607/814/4014`）、`style.remove();`（`:621`）、`document.body.style.removeProperty(SCRIM_VAR)`（`:4018-4020`）、`delete document.body.dataset.dshSkinCenter;`（`:5588`）、自定义主题 `this.style.remove();` + `data-dsh-custom-theme` 移除（`:5143-5144`，dispose 于 `:5655`）。

→ **"换肤插件会不会把页面搞脏"：skin-center 有实质清理，不是靠运气。**

## 3. 高风险面：皮肤 hooks = 渲染进程内任意 JS，门槛可伪造

- 宿主把 `hooks.mjs` 原样送出：`index.js:3231` `res.end(readFileSync(abs));`
- 客户端执行它：`client.js:1263` `const factory = (await importHooks(\`${apiBase}/skins/${entry.manifest.id}/hooks.mjs\`))?.default;`
- 放行条件只认"内置"或"可信"：`client.js:1337-1339` `return entry.origin === "builtin" || marketHooksTrust(entry.manifest, entry.dir).trusted;`，而 `trusted` 只凭皮肤目录里的 `dsh-market.provenance.json`（`:269-291`）。
- 作者自述承认（`:248-249`）：*"Forging the provenance requires write access to $DSH_HOME itself — an attacker with that access can already install full plugins, so the file is a provenance record, not a capability guard against the local user."*
- **结论：任何能写 `$DSH_HOME/skins/<id>/` 的来源（含任何安装渠道）都能让 GUI 渲染进程跑其代码。建议在预检里把这类"资产目录内可执行文件被动态 import"补为 high。**

## 4. 遥测披露不一致 + 隐藏 require

- skin-center：`client.js:5438` `const ENDPOINT = "https://dsh-market.com/api/telemetry/event";`，由 `beatHeartbeat();`（`:5574`）触发；除包名外**还上报已装皮肤清单**（`{ name: "skin:" + id }` + version + channel，`:5560-5565`）。而 `README.md:154` 写的是 "a random localStorage id plus this package's name, nothing else" → **披露不一致**。
- web-ui-settings：上报与其 `README.md:99` 一致（`client.js:720`）。
- **字符串拼接隐藏 require**：web-ui-settings `client.js:10-11` `const platform = ["@deepseek-ai/dsh-client", "-store"].join("");` / `const legacy = ["@deepseek-ai/dsh-client-runtime", "/client"].join("");`，随后 `engine = require(platform);`（`:14`）、`engine = require(legacy);`（`:16`）。store 确在其 `dsh.client.inject` 内（`package.json:25`），但拼接**恰好绕过纯文本检索**；回退目标 `dsh-client-runtime/client` **不在 inject 列表**。

## 5. 其余要点（均带证据）

- **skin-center 宿主有真实副作用**：改写宿主启动配置 `(options.writePatch ?? writePatchAtomic)(patchPath, cleaned);`（`index.js:3772`，候选 `join(harnessHome, "cordis.patch.yml")` 与 profile 版 `:1220-1221`）；写 `$DSH_HOME`（`:1302/:1637/:1681`）；**联网下载皮肤** `repairSkinFromMarket` 走 `https://dsh-market.com`（`:255、:461、:479、:485`），并有版本检查 fetch（`:591`）。路径穿越防护到位（`:402、:1508、:1524`）。轻微：rename 失败忙等 `while (Date.now() - start < 50);`（`:507`）。
- **安装期脚本**：skin-center 有 `"prepare": "tsdown"`（`package.json:38`）——npm 对 **git/本地目录**安装会执行（registry tarball 不执行）；web-ui-settings 无。
- **浏览器半区合规性**：两包 `load({id})` 均等于包名；skin-center 只 require react / react/jsx-runtime（`client.js:7-8`），**无** Harness 客户端包。
- **CSS 侧安全**：宿主强制作用域 + 白名单（`remote URL "${url}" is not allowed…` `index.js:2331`；禁 `@import` `:2373`；违规 `throw new SkinCssSafetyError(...)` `:2405`）→ 皮肤 CSS 无法外链外发。
- **web-ui-settings 宿主无写盘**，2 条 loopback 默认 POST 路由（`:577-586`），守卫 `isTrustedBridgeRequestResolved`（`:567`）与 `timingSafeEqual`（`:348`）；其头注宣称的 legacy 导入在 `applyImpl` 中**并未实现**（宿主唯一写路径是 HTTP handler 的 `deps.settings.mutate`，`:536`）。其客户端 `<style>` 注入在模块求值期、**无卸载清理**（`client.js:596-600`），低影响。
- 全 vendor 客户端 bundle 检索 `innerHTML|outerHTML|document.write|insertAdjacentHTML|dangerouslySetInnerHTML|eval(|new Function` → **0 命中**（用 "目录 + include" 形式复核过，非空 grep 假阴性）。

## 6. 换肤类插件的共性风险

全局覆盖 CSS 变量/DOM 属性、注入 `<style>`、卸载后留下脏变量、插件间互斥（壁纸引擎与皮肤二选一）、宿主 token 改名后错位。**本次实例在清理纪律上属上游水平**；真正的风险在 hooks（§3）与遥测披露（§4）。

## 7. 未确认 / 盲区
- provenance 的可信根由未审的 `@linxin666/dsh-client-ui-market` 与 dsh-market.com 服务端背书。
- `REVIEWED_SKIN_HOOKS` 的 24 组哈希无法对照上游；`src/` 与 `docs/telemetry.md` 未随包发布；`.map` 未与 bundle 逐字节比对。
- `lightningcss` 原生模块解析不可信 CSS 未审计。

## 8. 装前建议
1. skin-center：**只装「无 hooks」的第三方皮肤**；首次启动前备份 profile 的 `cordis.patch.yml`（它会改写宿主启动配置）。
2. web-ui-settings：保持 loopback 默认，**勿配 `trustedProxyHosts`**。
3. 两者都会每日心跳到 `dsh-market.com`；不接受就屏蔽该域名（skin-center 会额外上报皮肤清单）。
