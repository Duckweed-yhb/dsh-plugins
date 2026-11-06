# @yhb/dsh-plugin-artifact

> fork 自 [`dsh-artifact@0.8.1`](https://github.com/Jannchie/dsh-artifact)（MIT）。
> 上游中文/英文文档保留为 `README.upstream.md` / `README.upstream.en.md`，设计笔记见 `NOTES.md`。

## 定位（这就是你要的「在 DSH 里预览 HTML」）

- 给我一个 `artifact` 工具：把**自包含 HTML 页**或**幻灯片**写进 `$DSH_HOME/artifacts`；
- **写完直接在对话右侧打开**（沙箱 iframe 预览），不占聊天记录、也不在仓库里堆 `.html` 文件；
- 附带时间倒序的工件事务面板：就地阅读、编辑、**对比历史版本**（默认留 20 版）；
- 幻灯片还能放映并**导出 PowerPoint**；
- 注册一个模型侧系统提示段 + 内置 `writing-artifacts` skill（运行时 skill，不占磁盘 skill 根）。

## fork 改了哪几处

| 位置 | 原值 | 现值 |
|---|---|---|
| `package.json` name | `dsh-artifact` | `@yhb/dsh-plugin-artifact` |
| `cordis.patch.yml` 行 | `id: artifact` / `name: 'dsh-artifact'` | `id: yhb-artifact` / `name: '@yhb/dsh-plugin-artifact'` |
| `lib/client.js` 加载器 id | `dsh-artifact` | `@yhb/dsh-plugin-artifact` |
| `package.json` 依赖位置 | `@deepseek-ai/schemastery` 在 `dependencies` | 挪到 `peerDependencies`（harness 自带，`link:` 安装不装 deps，挪了才解析得到） |

⚠️ 内部 137 处 `dsh-artifact` 是 CSS 类名/i18n 命名空间/存储键，保留上游原样。

## 边界

- 工件存 `$DSH_HOME/artifacts`（默认 `null` = 自动），**不在工作区里**；要改位置就在 patch 的 `root` 里写绝对路径。
- 预览是**沙箱 iframe**：没有网络、不能读本地文件 —— 这是它的安全边界，不是 bug。
- 单件上限 `maxArtifactChars: 400000`；历史 `maxVersionsPerArtifact: 20`（设 0 可关历史）。
- 预检会报两个 high，但**都是误报**：① "不是 ModuleLoader 工厂格式"（它只读了 436KB 文件的开头，`__ModuleLoader__.load({id: ...})` 实际在文件里 ✅）② `lib/deck.js` 的动画定时器。

## 怎么验

1. `install_bundle` 目标 = 本目录绝对路径（已装）。
2. 刷新页面 → 侧栏/右侧应出现工件入口；让我用 `artifact` 工具写一张 HTML 给你看。
3. 技能目录里应出现 `writing-artifacts`（运行时 skill）。

## 怎么退

`remove_bundle target=@yhb/dsh-plugin-artifact`。上游原件在 `.scratch/cand3/dsh-artifact/`（未改动）。