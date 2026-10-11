# vendor/ —— 第三方插件的本地归档与审阅区

这里放的**不是**已安装的插件，而是从 npm registry 原样拉到本地的第三方插件包，用于**离线阅读、静态预检和人工代码 review**。

## 怎么来的

```powershell
node tools/fetch-plugin.mjs @linxin666/dsh-pet dshmarket          # 下载并校验
node tools/fetch-plugin.mjs --list                                # 看已有归档
node tools/fetch-plugin.mjs --force dshmarket                     # 强制重下
```

每个包取 registry 声明的 `dist.tarball`，并用 registry 声明的 **sha512 integrity** 逐字节校验；校验结果记在各自的 `_provenance.json`，汇总在 `index.json`。这样"我审的代码"和"npm 上发布的字节"可以对齐。

## 这批归档（2026-10-11 拉取，integrity 全部 ✅）

**六份深度审阅已完成 → 汇总在 [`_review-summary.md`](./_review-summary.md)**（每包全文见其 `_review.md`）。

| 包 | 版本 | 许可证 | 文件数 | 插入的行 id | 预检（修复后） | 审阅等级 |
|---|---|---|---|---|---|---|
| `@linxin666/dsh-pet` | 0.4.6 | Apache-2.0 | 318 | `pet` | ✅ 0 high / 5 medium | 低—中，可装（遥测无条件） |
| `@linxin666/dsh-client-ui-skin-center` | 0.4.6 | Apache-2.0 | 25 | `ui-skin-center` | ⚠️ 0 / 4 | 中（皮肤 hooks 可在渲染进程跑任意 JS） |
| `@linxin666/dsh-client-ui-web-ui-settings` | 0.4.6 | Apache-2.0 | 10 | `ui-web-ui-settings` | ⚠️ 0 / 3 | 低—中，可装 |
| `@linxin666/dsh-client-ui-market` | 0.4.6 | BSD-3-Clause | 10 | `ui-market` | ⚠️ 0 / 7 | 中（一键安装任意 npm/git 包） |
| `dshmarket` | 1.66.15 | MIT | 177 | `dsh-market` | ⛔ 10 / 25 | 中，可装（高权限工具） |
| `dsh-plugin-gate` | 1.3.2 | MIT | 15 | `gate` | ✅ 0 / 0 | 低，可装但别当硬闸门 |

**六个包的 patch 层共同点**：都只 `- insert` **一行**，行 id 各自唯一，**没有覆盖或禁用任何官方行** → 不会因行 id 冲突把 DSH 顶坏。

> 预检数字是**修复后**的：这轮 review 反向修掉了我预检的两个真 bug（把字符串字面量当行为 → gate 假 high 2；重复扫描未导出的源码副本 → pet 假 medium 20）。详见 `_review-summary.md` 第三节。

## 兼容性对照（装之前看）

```powershell
node tools/check-compat.mjs              # 对照本机 DSH 运行时清单，检查全部归档
node tools/check-compat.mjs <包目录>      # 只查一个
```

它只做**存在性**判断（`dsh.client.inject` 与 `@deepseek-ai/*` peer 在你运行时里到底有没有），
`engines` / peer 的 **semver 区间原样打印**、不做区间求值——避免脚本给出假精度。同时会列出
运行期会额外安装的依赖、以及安装期脚本（pnpm 默认拦截）。

## 目录约定

- `vendor/<扁平包名>/` —— 解包后的包内容（`@scope/name` 的 `/` 写成 `+`，Windows 合法）
- `vendor/<扁平包名>/_provenance.json` —— 包名/版本/许可证/仓库/engines/peer/dsh 元数据/tarball URL/integrity/抓取时间
- `vendor/<扁平包名>/_preflight.md` —— 静态预检报告（规则见 `plugins/preflight/lib/rules.js`）
- `vendor/<扁平包名>/_review.md` —— 人工代码 review 报告（子代理或我本人产出）
- `vendor/_review-summary.md` —— 跨包汇总：总表、共性发现、装前边界、仍未覆盖的部分

## ⚠️ 三条纪律

1. **这里是"待审"的第三方代码，不是可信副本。** 不要 `dsh plugin add ./vendor/...` 之前不审；也不要在本目录里 `node`/`npm install` 任何东西（那会执行第三方脚本，正是供应链风险）。看代码只用读和搜。
2. **默认不进 git。** `vendor/` 在 `.gitignore` 里：它包含第三方代码（有各自许可证），往公开仓库镜像会带来再分发与许可证义务。想固化版本，改为提交 `index.json` + 各自的 `_provenance.json` 就够（哈希能证明字节）。确实要连代码一起提交时，先确认每个包的许可证允许再分发。
3. **预检报告不等于 review 结论。** `high` 命中的是**能力**（跑子进程、写 profile、进程级钩子），对"插件管理器/安全门"这类工具属于职责所需；是否可接受要看 review 里这些能力**有没有被约束**。
