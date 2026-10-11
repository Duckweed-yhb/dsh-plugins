# 六个第三方插件的审阅汇总（2026-10-11）

> 流程：**registry tarball + sha512 校验** → `tools/preflight.mjs` 静态预检 → **人工/子代理只读代码 review（逐条 `文件:行号` 证据）**。
> 逐包全文见各目录的 `_review.md`；机器预检见 `_preflight.md`；溯源见 `_provenance.json`。

## 一、总表

| 包 | 版本 | 预检 | 审阅结论 | 一句话 |
|---|---|---|---|---|
| `@linxin666/dsh-pet` | 0.4.6 | ✅ 0 high / 5 medium | **低—中，可装** | Host 半区很干净（只写 `$DSH_HOME/pet.json`）；**无条件每日遥测**，关设置开关无效 |
| `@linxin666/dsh-client-ui-skin-center` | 0.4.6 | ⚠️ 0 / 4 | **中（内含一个高风险面）** | 清理纪律上游水平（effect ledger），但**皮肤 hooks = 渲染进程任意 JS，门槛可伪造** |
| `@linxin666/dsh-client-ui-web-ui-settings` | 0.4.6 | ⚠️ 0 / 3 | **低—中，可装** | Host 无写盘；用字符串拼接隐藏了一个 require；遥测与 README 一致 |
| `@linxin666/dsh-client-ui-market` | 0.4.6 | ⚠️ 0 / 7 | **中，可用但两条链要知情** | 远端清单 → `installBundle(spec, {enabled:true})`：一键把任意 npm/git 包以完整权限装进宿主；资产零校验落盘并被激活 |
| `dshmarket` | 1.66.15 | ⛔ 10 / 25 | **中，可装（高权限工具）** | 命令执行/写 profile 都被白名单与原子写约束住；风险在信任链（目录无签名、giscus 第三方脚本、一键重启默认开） |
| `dsh-plugin-gate` | 1.3.2 | ✅ 0 / 0（修复前误报 2 high） | **低，可装但别当硬闸门** | 1.3.2 不拦截安装，只靠系统提示劝告；与自研预检**能力互补** |

**六个包的 patch 层都干净**：各只 `- insert` 一行、id 唯一、**不覆盖/禁用任何官方行**。

## 二、跨包共性发现

1. **同族遥测**：`@linxin666/*` 四个包各自内联同一份匿名心跳（`https://dsh-market.com/api/telemetry/event`）。因**共享日键**，实际上约每天 1 次 POST；载荷 = localStorage 随机 UUID + 包名/版本（skin-center 还会带上**已装皮肤清单**，与其 README 表述不一致）。**没有任何配置项能关**——只能整行 `disabled: true` 或屏蔽域名。
2. **"内置浏览器/iframe/第三方脚本"是这几类插件的共同外联面**：`ui-market` 往 `document.body` 常驻一个指向 dsh-market.com 的隐藏 Turnstile iframe；`dshmarket` 在用户点开评论时把 `https://giscus.app/client.js` 注入页面源（该源同源可调市场全部接口）。两者都不在系统提示里，只有读代码才看得到。
3. **"一键安装任意包"是这类市场的核心能力，也是最大风险**：`ui-market` 只做 spec **形状**校验（`NPM_SPEC` / `isHttpsGitUrl`），`dshmarket` 靠**目录白名单 + 防抢名绑定**约束（更好）。两者最终都调用官方插件管理器，把第三方 host 半区代码装进**无沙箱**的宿主进程——这是 DSH 插件模型的固有性质。
4. **静态预检的边界被这轮 review 明确画出**：
   - 预检命中的 `high` 往往是**能力**而非恶意（`dshmarket` 的 child_process / process.kill 属职责所需，且被四道门约束）。
   - 预检**看不出**"远端清单 → 一键安装"这类**数据流**风险（`ui-market` 的 7 条 medium 全不是重点，真正的重点预检没列）。
   - 预检**看不出**"资产目录里的 `hooks.mjs` 被动态 import"这种**信任转移**（skin-center 的高风险面）。
   - 因此：**预检挡已知崩溃面，review 挡数据流与信任链**，两者不能互相替代。

## 三、这轮 review 反向修好了我的预检工具（两处真 bug）

| 问题 | 证据 | 修复 | 效果 |
|---|---|---|---|
| `child_process` 等"纯代码"规则把**字符串字面量**当行为 | `dsh-plugin-gate` 的 `lib/rules.js:49/57` 把 `child_process.exec(...)` 写在规则说明里 → 被误判 high 2 | 新增 `stripStringLiterals()`；9 条纯代码规则改标 `strings: 'ignore'` | gate **high 2 → 0** |
| 把**未被 `exports` 暴露的源码副本**当独立逻辑重复扫描 | `@linxin666/dsh-pet` 的 `lib/types/**/*.js` 与 `lib/client.js` 同一逻辑各算一次 | 新增 `walkRelativeImports()`：只审"入口可达图"上的文件，跳过的数量在报告里明示 | pet **medium 25 → 5**，并显示"跳过 55 个" |
| （附带）CLI 只认绝对路径 | `node tools/preflight.mjs vendor\xxx` → 解析失败退出 2 | 相对路径先按 cwd 解析 | 可用相对路径 |

## 四、如果要装，建议的顺序与边界

1. **先备份 profile**：`E:\DeepseekHarness\dsh-data\profiles\desktop\` 下的 `package.json` + `cordis.patch.yml` 复制一份。
2. **一次只装一个，装完重启验证**（浏览器半区改动必须重启才加载新模块）。
3. **推荐先装 `@linxin666/dsh-pet`**（Host 半区最干净），但**先决定是否接受 `dsh-market.com` 心跳**；不接受就屏蔽域名。
4. **`skin-center` 只在"不用带 hooks 的第三方皮肤"的前提下装**；它会改写宿主启动配置，装前备份 `cordis.patch.yml`。
5. **`ui-market` / `dshmarket` 是"安装别人的东西"的工具**，等于把信任交给 dsh-market.com / awesome-dsh-plugin.com 的清单。要用就别批量装未审插件；`dshmarket` 建议设 `allowRestart: false` 且不点评论区。
6. **`dsh-plugin-gate` 可以装**（低风险），但只当"补充扫描"，别当安装闸门。
7. 出事恢复顺序：侧栏插件页关掉那一行 → profile 的 `cordis.patch.yml` 写 `disabled: true` → `dsh plugin remove <name>` → 从备份还原 → 轮换宿主可见的密钥。

## 五、仍未覆盖（诚实边界）

- 六份 review 都是**只读静态审阅**，没有执行任何包内代码，也没有在真实 profile 上装过；"能装/不能装"的兼容性结论来自 `tools/check-compat.mjs` 的**存在性**比对（287 个运行时包名），不是实装验证。
- 打包产物（`lib/client.js`、`lib/live2d-vendor.js`、`lib/routes.js` 等）体量大，均为抽样 + 模式检索，**未逐行通读**；`dshmarket` 还有约 30 条路由未逐行看。
- 遥测的**服务端**行为（是否加盐哈希、是否存 IP）只能采信作者自述，无法独立验证。
