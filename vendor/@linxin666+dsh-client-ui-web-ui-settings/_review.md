# @linxin666/dsh-client-ui-web-ui-settings 0.4.6 —— 代码审阅报告

本包的审阅与同族的 `@linxin666/dsh-client-ui-skin-center` **在同一份报告里**（两者一起审的，便于对比）：

→ 见 [`../@linxin666+dsh-client-ui-skin-center/_review.md`](../@linxin666+dsh-client-ui-skin-center/_review.md)

**本包单独结论：低—中，可装。**

要点（证据见上面那份报告的 §4/§5）：

- Host 半区**无写盘**；两条 loopback 默认 POST 路由（`lib/index.js:577-586`），守卫 `isTrustedBridgeRequestResolved`（`:567`）与 `timingSafeEqual`（`:348`）。
- 遥测与其 `README.md:99` 的表述**一致**（`lib/client.js:720`）。
- 用**字符串拼接隐藏了一个 require**：`lib/client.js:10-11` `const platform = ["@deepseek-ai/dsh-client", "-store"].join("");` / `const legacy = ["@deepseek-ai/dsh-client-runtime", "/client"].join("");`，随后 `require(platform)`（`:14`）、`require(legacy)`（`:16`）。`store` 确在其 `dsh.client.inject` 内（`package.json:25`），但**回退目标 `dsh-client-runtime/client` 不在 inject 列表**，且拼接恰好绕过纯文本检索。
- 客户端 `<style>` 注入发生在模块求值期、**无卸载清理**（`lib/client.js:596-600`），低影响。
- 头注宣称的 legacy 导入在 `applyImpl` 中**并未实现**（宿主唯一写路径是 HTTP handler 的 `deps.settings.mutate`，`:536`）——文档与实现漂移。
- 装前建议：保持 loopback 默认，**勿配 `trustedProxyHosts`**。
