# @yhb/dsh-plugin-hello

插件工坊的示例插件（也是后续插件的复制模板）。

- **Host 半区**：`index.js` —— 空的 `apply`，只在日志里留一条挂载痕迹。
- **浏览器半区**：`client.js` —— 往 `conversation.composer.dock`（输入框卡片下方的环境信息区）注册一行徽标，文案走词典服务，颜色走主题令牌。
- **插入行**：`cordis.patch.yml` —— 行 id `yhb-hello`。

## 装法

```powershell
# 让 agent 装：plugin_manager install_bundle，target 填这个目录的绝对路径
# 或者 GUI：侧栏「插件」→ 添加插件 → 绝对路径
# 或者 CLI：
dsh plugin --profile desktop add "E:\future\yhb\05-学习资源\dsh-plugins\plugins\hello"
```

装完在 DSH 页面里，输入框下方应该出现：

```
● 插件工坊已就绪   来自 @yhb/dsh-plugin-hello
```

## 改完代码怎么让改动生效

浏览器半区是普通 JS 文件，但**已安装的包要重启 DSH 才会加载新的模块版本**（插件管理器的官方限制：换掉已安装包需要重启）。所以迭代节奏是：

1. 改 `client.js` / `index.js`
2. 重启 DSH（或先 `remove_bundle` 再重装）
3. 页面刷新

## 复制成新插件的步骤

1. 复制整个 `hello/` 目录成 `plugins/<新名字>/`
2. 改 `package.json` 的 `name`（如 `@yhb/dsh-plugin-xxx`）与 `description`
3. 改 `cordis.patch.yml` 的行 id（如 `yhb-xxx`）
4. 改 `client.js` 里 `window.__ModuleLoader__.load({ id })` —— **必须等于新包名**
5. 改 `client.js` 里的词典命名空间 `NS` 与条目 id `ROW_ID`
6. 改 `locale/*.json` 的 `meta`
