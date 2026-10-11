# @yhb/dsh-plugin-preflight

**在 DSH 装载一个插件之前先给它做体检**，把官方失败矩阵里那几类「会让 DSH 起不来 / 直接崩掉」的写法挑出来。

- **Host 半区**：`index.js` —— 注册一个工具 `plugin_preflight`（没有浏览器半区，`dsh.client` 不声明）。
- **规则引擎**：`lib/rules.js` —— 纯 Node、只读、零 DSH 依赖，因此也能被仓库根目录的独立脚本直接复用。
- **插入行**：`cordis.patch.yml` —— 行 id `yhb-preflight`。

## 怎么用

在 DSH 里对我说（或你自己在别的 agent 里调这个工具）：

```
plugin_preflight(target: "E:\\future\\yhb\\05-学习资源\\dsh-plugins\\plugins\\hello")
plugin_preflight(target: "@linxin666/dsh-pet")
plugin_preflight(target: "installed")     ← 审查当前 profile 已安装的全部第三方插件
```

返回：结论（`ok` / `caution` / `high-risk`）+ 逐条发现的**文件:行号证据** + 为什么危险 + 怎么改 + 一段可直接粘贴的禁用补丁。

## 它查什么

清单层：读不到清单、缺 name/version、Host 入口不存在、bundle patch 缺失/为空/没有 insert 行、
`dsh.client` 声明了却没有 `./client` 导出、platform 不是 web、图标过大、缺 locale。

行 id 层：与已挂载条目重名（会顶掉别人的行）、命中官方关键行（`modules`/`connection`/`tools`/`session`…）。

Host 代码层：`process.on('unhandledRejection')`、`process.exit`、`child_process`、
写 profile 的 `package.json`/`cordis.patch.yml`、无清理的定时器、脱离 apply 的异步、
`async function apply`、`eval`/`new Function`、改写全局对象、无清理的监听。

浏览器代码层：不是 `__ModuleLoader__.load()` 工厂格式、`load({ id })` 与包名不一致、
`require` 任何 Harness 客户端包（除 react / slots 基线）、直接操作 `document.body`。

## 它**不**能保证什么

- 它是**静态启发式**（正则 + 清单检查），命中的是「值得人工看一眼的地方」，不是定罪；反过来，
  **通过也不等于真机一定不出事**——运行时数据、服务缺失、版本漂移它都看不到。
- 依赖版本兼容性由 DSH 插件管理器自己把关（`incompatible-version`），本插件不重复做。
- 它不读取、也不修改你 profile 的任何文件：只读扫描 + 返回报告，禁用补丁要你自己（或通过侧栏插件页）应用。

## 设计取舍

一个“防崩溃”的插件自己绝不能成为崩溃源，所以：`apply` 同步、只注册一个工具、全部工作放进 `execute`
（工具失败会被流水线materialize成结构化错误结果，而不是未捕获异常）、不写文件、不起定时器、
不注册进程钩子、不发网络请求、不改全局对象，并且对扫描规模设了上限（60 个文件 / 单文件 256 KiB /
单包 4 MiB）。
