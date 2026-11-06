# @yhb/dsh-plugin-file-upload

> fork 自 [`dsh-file-upload@0.5.4`](https://www.npmjs.com/package/dsh-file-upload)（MIT）。
> 上游三份文档保留为 `README.upstream.md` / `README.zh.md` / `INSTALL.md`；本文件只写「改了什么、安全边界、怎么验、怎么退」。

## 定位

在输入框里上传文件并按需解析成 Markdown/表格给模型读（PDF / DOCX / PPTX / XLSX / HTML / CSV / JSON / ZIP / 图片 OCR）。

## fork 改了哪四处

| 位置 | 原值 | 现值 |
|---|---|---|
| `package.json` name | `dsh-file-upload` | `@yhb/dsh-plugin-file-upload` |
| `cordis.patch.yml` 行 | `id: dsh-file-upload` / `name: 'dsh-file-upload'` | `id: yhb-file-upload` / `name: '@yhb/dsh-plugin-file-upload'` |
| `lib/client.js` 加载器 id | `dsh-file-upload` | `@yhb/dsh-plugin-file-upload` |
| `lib/index.js` 导出的 `name` | `dsh-file-upload` | `@yhb/dsh-plugin-file-upload`（与 patch 行保持一致） |

## 安全边界（这是它值得用的关键）

- **默认完全不 exec 子进程**：`execFile` 只出现在"外部 MarkItDown CLI"那条可选路径，而 fork 的配置里
  `markitdownBin: ''`（空 = 走内置纯 JS 引擎 `markitdown-node`）。
- **默认不联网**：`visionEndpoint: ''`（空 = 不调视觉 API）；`visionApiKeyEnv` 才决定用哪把 key。
- 4 个解析依赖全是纯 JS（`mammoth` / `pdfjs-dist` / `read-excel-file` / `markitdown-node`），无原生模块。
- `node_modules/` 是 vendor 进来的（`pnpm install --ignore-scripts`，**没有执行任何安装脚本**），
  删掉它插件就起不来。
- 上传上限 25MB/文件、缓存 64MB、TTL 7 天（见 patch 的 config）。

## 怎么验

1. `install_bundle` 目标 = 本目录绝对路径。
2. 冷启动后输入框旁应出现上传入口；上传一个 PDF/DOCX 应能读出正文。
3. 看日志有无 `markitdown-node` 失败（失败会回退到轻量 JS 解析器）。

## 怎么退

`remove_bundle target=@yhb/dsh-plugin-file-upload`。上游原件在 `.scratch/cand3/dsh-file-upload/`（未改动）。