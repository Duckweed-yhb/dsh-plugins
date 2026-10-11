# @linxin666/dsh-pet 0.4.6 —— 代码审阅报告

> 来源：子代理只读审阅（2026-10-11）。结论与证据均保留；为归档紧凑做了轻度压缩。
> 溯源 `_provenance.json`（sha512 已校验）；机器预检 `_preflight.md`（修复后 high 0 / medium 5）。

## 1. 结论
**风险：低—中。建议：装，但先决定是否接受遥测，并接受它常驻页面全局 DOM。**

Host 半区很干净：无安装期脚本、无子进程、无 `process.exit` / 进程级错误钩子；落盘只有 `$DSH_HOME/pet.json`；HTTP 路由有 loopback 围栏 + realpath 包含 + 体积上限。浏览器半区清理到位。唯一实质外联是 README 已披露的每日匿名心跳。

## 2. 清单与 patch
- 入口/导出：`package.json:21` main=`lib/index.js`、`:34` `exports["./client"]`、`:60` `dsh.bundle.patch`、`:57` `engines.dsh = ">=0.1.7-rc.1"`。
- **无 preinstall/postinstall**：`scripts` 只有 build/test/pet:cli/typecheck/prepare（`:14-20`）。唯一疑似钩子 `"prepare": "tsdown --config tsdown.prepare.config.ts"`（`:19`），但 `tsdown.prepare.config.ts` 与 `scripts/` **都不在 tarball**（实测不存在），且 registry tarball 安装不跑 prepare → **无执行路径**。
- patch 只插 1 行、无 `!!js`、不覆盖官方行：`cordis.patch.yml:8-10` → `- id: pet` / `name: '@linxin666/dsh-pet'`。
- 依赖仅 `schemastery` + `clsx`；react 为 peer（`package.json:73-81`）。

## 3. 遥测（重点，已核实）
- 端点 `src/client/telemetry.ts:27` `const ENDPOINT = 'https://dsh-market.com/api/telemetry/event'`（产物 `lib/client.js:4155`）。
- **唯一调用方且无条件**：`src/client/index.ts:361` `reportDailyHeartbeat([{ name: '@linxin666/dsh-pet' }])`，位于 `apply()` 第一句、**在 `enabled()` 判断之前 → 在设置页关掉宠物仍然会发**；只有整行 `disabled: true` 或屏蔽域名才停。
- 载荷 `telemetry.ts:93` `JSON.stringify({ kind:'heartbeat', visitor, items })`：localStorage 随机 UUID（`:49-51`）+ 包名 + 构建期版本（`:86-92`）。**无会话内容/会话 id/路径/用户名。**
- 节流：`if (navigator.webdriver) return`（`:81`）；共享日键 `DAY_KEY_PREFIX`（`:25-26`、`:82`、`:102`）；失败 `.catch()` 静默、下次再试（`:103`）。
- **无配置项可关。** 缓解：整行 disabled / 屏蔽域名 / 预置 localStorage 键 `dsh-web-ui-telemetry-day:<UTC日期>`。
- 同族 4 个包各自内联同一模块，因**共享日键**，当天首个成功者抑制其余 → 实际约**每天 1 次 POST**，不是每插件 1 次。
- `README.md:375` 有披露；被引用的 `docs/telemetry.md` **未随包发布**，故"服务端加盐哈希/不存 IP"只能采信作者自述。

## 4. 其他重点
- **无子进程**：`src`+`lib` 检索 `child_process|spawn|exec(` 仅命中测试与文案。**无 `process.exit` / `process.on('unhandledRejection')`**（ripgrep + Select-String 双工具交叉验证）。异步边界有 `src/host/run-guarded.ts:34` 专门兜底，注释明说是为避免触发 DSH 宿主 fail-loud 整进程退出——**这是对的方向**。
- **FS 白名单**：唯一写入 `src/persist.ts:276-280`（mkdir + `join(dir,'pet.json')` + tmp + rename），dir = `$DSH_HOME` 或 `~/.dsh`（`src/dsh-home.ts:31-36`）；读取来自包内 assets、`$DSH_HOME/pets`、旧 `~/.codex/pets`（`src/registry.ts:84-92`）。非测试代码无 `rmSync`/递归删除，不写 profile 的 `package.json`/`cordis.patch.yml`/`settings.yaml`。
- **HTTP 面防御扎实**：loopback 围栏 `src/loopback.ts:45`；realpath 包含 `src/routes.ts:93`；Live2D 运行时精确文件名白名单 `src/routes.ts:354-358`（否则 404）；体积上限 `routes.ts:43-50`；manifest/decoration 路径守卫 `manifest-v2.ts:244-247`、`decoration.ts:75-79`。
- **浏览器半区**：`lib/client.js:2` 的 load id 与包名一致 ✓；require 面仅 react/react-dom/react-dom-client/jsx-runtime + 带 try/catch 的 store engine（`:7-19`）；body 常驻 React 根 `document.body.appendChild(container)`（`:4651`）卸载时 `petRoot.unmount(); container.remove();`（`:4664-4665`）并清残留根（`src/client/index.ts:644`）；head 注入 4 个 `<style>`（`:278/2073/2735/3536`）以 `data-plugin-css` 去重但**永不移除**（低影响）；轮询 `setInterval` 与 visibilitychange 同处一个 `ctx.effect` 并成对清理（`src/client/index.ts:498/510/511-514`）；各 rAF/定时器均有 cleanup；**无 `dangerouslySetInnerHTML`/`document.write`**。
- **构建产物**：`lib/live2d-vendor.js`（792KB，压缩的 pixi + live2d）**未逐行审阅**。`lib/types/**/*.js` 是未打包源码副本且不被 `exports` 暴露 → 死代码，也是我的预检一度把同一逻辑报两遍的原因（已修：现在只审"入口可达图"）。

## 5. 对 `_preflight.md` 的两处更正（已并入工具修复）
1. "文件里找不到 `ctx.effect`" **不成立**：真实源码有 `ctx.effect`（`src/index.ts:401`、`src/client/index.ts:363/483/520/696`）。
2. "require 了 Harness 客户端包" **不准确**：实际只 require react 系 + 一个 try/catch 兜底的 store engine；命中项来自被打包的 react-dom/client，不是 Harness 控件包。

## 6. 未确认 / 盲区
- `docs/telemetry.md` 未随包发布（GitHub 拉取失败）→ 服务端行为无法独立验证。
- `lib/live2d-vendor.js` 仅做模式检索。
- 两处 cordis 语义无法在包内证实：service 的 `ctx.on` disposer 是否随 fiber 自动释放（`disposeActivity` 仅在 enable 切换时调用，`src/service.ts:625-628`）；`ctx.effect` disposer 被手动提前调用后 fiber 二次调用是否幂等。
- `lib/types` 与 `lib/*.js` 只抽查 3 处一致，未机械 diff。**未执行任何包内代码。**

## 7. 装前建议
1. 读 `README.md:373-375` 决定是否接受心跳；不接受就**屏蔽 `dsh-market.com`**（关设置开关无效）。
2. DevTools 确认每日 1 次 POST、载荷只有 visitor + 包名/版本。
3. 确认 `$DSH_HOME` 只多了 `pet.json`。
4. 只有用 Live2D 才需自备 `live2dcubismcore.min.js` 放进 `$DSH_HOME/pets/.runtime/`——**它会被当脚本执行**（`runtime.ts:74-78`），自己确认来源。
5. 保留回退写法：`- id: pet` / `  name: @linxin666/dsh-pet` / `  disabled: true`。
6. 顺带核对同族另外 3 个包也启用了同一份心跳。
