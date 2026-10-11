/**
 * preflight 插件的 Host 半区。
 *
 * 它只做一件事：往工具注册表里加一个 `plugin_preflight` 工具，让 agent（以及通过 agent
 * 的用户）在**安装或启用一个插件之前**先静态审查它。
 *
 * 自我约束（这个插件存在的意义就是防崩溃，所以它自己必须是最规矩的插件）：
 * - **零依赖**：连 `@deepseek-ai/dsh-*` 都不 import。工具的 parameters / output.schema 直接手写成
 *   注册表要的 JSON Schema（我核对过 dsh-tools 的 defineTool：它就是把手写规格编译成 JSON Schema
 *   再交给注册表，所以手写等价，但少了一条可能解析失败的依赖边）。
 * - apply 同步、只注册一个工具，所有实际工作在 execute 里做（工具失败会变成结构化错误结果，
 *   不会变成未捕获异常）。
 * - 不写任何文件、不起定时器、不注册进程钩子、不发网络请求、不改全局对象。
 * - 只读扫描，且有文件数与字节数上限。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { renderReport, scanPackage } from './lib/rules.js'

/** Cordis 插件名。 */
export const name = 'plugin-preflight'

/** 需要工具注册表；Loader 用可选访问，缺了也能降级。 */
export const inject = ['tools']

/** 解析 DSH home（与桌面壳一致：$DSH_HOME，否则 ~/.dsh）。 */
function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv.trim()
  return join(homedir(), '.dsh')
}

/** 找出用来解析包名的 node_modules 根。 */
function candidateRoots() {
  const home = dshHome()
  const roots = []
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir.length > 0) roots.push(join(profileDir, 'node_modules'))
  roots.push(join(home, 'profiles', 'node_modules'))
  try {
    for (const entry of readdirSync(join(home, 'profiles'))) {
      roots.push(join(home, 'profiles', entry, 'node_modules'))
    }
  } catch {
    // profiles 目录不存在就忽略
  }
  return roots
}

/** 判断路径是不是一个含 package.json 的包目录。 */
function isPackageDir(dir) {
  return typeof dir === 'string' && dir.length > 0 && existsSync(join(dir, 'package.json'))
}

/**
 * 把一个 spec（绝对路径 / 包名）解析成包目录。
 *
 * @param spec - 目标。
 * @param ctx - 插件上下文（用于可选的 pluginPackages 服务）。
 * @returns 包目录绝对路径，解析不到返回 undefined。
 */
function resolveTargetDir(spec, ctx) {
  const trimmed = spec.trim()
  if (trimmed.startsWith('file:')) {
    try {
      const dir = dirname(fileURLToPath(trimmed))
      if (isPackageDir(dir)) return dir
    } catch {
      // 继续尝试其他方式
    }
  }
  if (isAbsolute(trimmed) && isPackageDir(trimmed)) return trimmed

  // 带子路径的 spec 只取包名部分
  const parts = trimmed.split('/')
  const packageName = trimmed.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]

  // 1) 运行时解析器（能覆盖随 DSH 提供的包）
  try {
    const packages = ctx.get?.('pluginPackages')
    const resolved = packages?.packageOf?.(packageName, import.meta.url)
    if (typeof resolved?.manifestPath === 'string') {
      const dir = dirname(resolved.manifestPath)
      if (isPackageDir(dir)) return dir
    }
  } catch {
    // 服务不可用就继续
  }
  // 2) 已知的 node_modules 根
  for (const root of candidateRoots()) {
    const dir = join(root, packageName)
    if (isPackageDir(dir)) return dir
  }
  // 3) 从本插件位置出发的原生 ESM 查询
  try {
    const require = createRequire(import.meta.url)
    for (const searchPath of require.resolve.paths(packageName) ?? []) {
      const dir = join(searchPath, packageName)
      if (isPackageDir(dir)) return dir
    }
  } catch {
    // 解析失败就返回 undefined
  }
  return undefined
}

/** 读出 profile 里选中的组合包列表。 */
function profileBundles() {
  const profileDir = process.env.DSH_PROFILE_DIR
  const candidates = []
  if (typeof profileDir === 'string' && profileDir.length > 0) candidates.push(profileDir)
  const home = dshHome()
  try {
    for (const entry of readdirSync(join(home, 'profiles'))) {
      candidates.push(join(home, 'profiles', entry))
    }
  } catch {
    // 忽略
  }
  for (const dir of candidates) {
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      // 取第一个读得通的 profile 就够用：桌面端只跑一个 profile。
      return { dir, bundles: manifest?.dsh?.profile?.bundles ?? [] }
    } catch {
      continue
    }
  }
  return { dir: undefined, bundles: [] }
}

/** 从 Loader 收集“行 id → 模块名”，用于冲突检测。 */
function knownRowIds(ctx) {
  const known = new Map()
  try {
    const loader = ctx.get?.('loader')
    for (const entry of loader?.entries?.() ?? []) {
      const id = entry?.options?.id
      if (typeof id !== 'string' || id.length === 0) continue
      const rowId = id.startsWith('include:') ? id.slice('include:'.length) : id
      const moduleName = entry?.options?.name
      if (typeof moduleName === 'string') known.set(rowId, moduleName)
    }
  } catch {
    // Loader 不可用时不报冲突
  }
  return known
}

/** 扫描一个目录并返回报告。 */
function scanOne(dir, ctx) {
  return scanPackage(dir, { knownRowIds: knownRowIds(ctx) })
}

/** 执行一次预检。 */
function runPreflight(ctx, args) {
  const target = typeof args?.target === 'string' ? args.target.trim() : ''
  if (target.length === 0) throw new Error('plugin_preflight: target 不能为空')

  const reports = []
  const unresolved = []

  if (target === 'installed' || target === 'all') {
    const { dir, bundles } = profileBundles()
    const thirdParty = bundles.filter((bundle) => typeof bundle === 'string' && !bundle.startsWith('@deepseek-ai/'))
    for (const bundle of thirdParty) {
      const resolved = resolveTargetDir(bundle, ctx)
      if (resolved === undefined) unresolved.push(bundle)
      else reports.push(scanOne(resolved, ctx))
    }
    const header = [
      `### 已安装的第三方插件预检（profile: ${dir ?? '未定位'}）`,
      '',
      `- 该 profile 共选中 ${bundles.length} 个组合包，其中非官方 ${thirdParty.length} 个`,
      ...thirdParty.map((bundle) => `  - \`${bundle}\``),
      '',
    ].join('\n')
    const body = reports.map((report) => renderReport(report)).join('\n\n---\n\n')
    const missing = unresolved.length > 0 ? `\n解析不到目录：${unresolved.map((b) => `\`${b}\``).join('、')}\n` : ''
    return { reports, text: `${header}${missing}${body || '（没有可扫描的第三方插件）'}` }
  }

  const dir = resolveTargetDir(target, ctx)
  if (dir === undefined) {
    throw new Error(`plugin_preflight: 解析不到目标「${target}」。绝对路径请确认目录含 package.json；包名请确认它装在当前 profile 或随 DSH 提供。`)
  }
  const report = scanOne(dir, ctx)
  return { reports: [report], text: renderReport(report) }
}

/**
 * 注册 `plugin_preflight` 工具。
 *
 * parameters / output.schema 是**手写的 JSON Schema**（注册表要的形态），
 * 不使用 `@deepseek-ai/dsh-tools` 的 `defineTool`，因此这个插件没有任何依赖。
 *
 * @param ctx - 承载工具注册表的插件上下文。
 */
export function apply(ctx) {
  ctx.tools.register({
    name: 'plugin_preflight',
    description:
      '在 DSH 装载一个插件之前静态审查它：读取包清单、bundle patch、Host 半区与浏览器半区代码，'
      + '找出官方失败矩阵里已知会导致「终止启动 / 致命退出 / 破坏 profile」的写法，给出风险等级、'
      + '证据文件与行号、以及可直接使用的禁用补丁。'
      + '用法：target 填插件目录绝对路径、包名，或填 "installed" 审查当前 profile 已安装的全部第三方插件。'
      + '这是启发式静态检查，通过不代表真机一定不出问题，但它能挡住最常见的那几类崩溃。',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: '插件目录绝对路径 | 包名（如 @linxin666/dsh-pet） | "installed"（审查当前 profile 已安装的第三方插件）',
        },
      },
      required: ['target'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          report: {
            type: 'string',
            description: '给人看的 markdown 预检报告。',
          },
          verdict: {
            type: 'string',
            enum: ['ok', 'caution', 'high-risk'],
            description: '最差的那一个结论。',
          },
          high: { type: 'integer', description: '高风险发现数。' },
          medium: { type: 'integer', description: '中风险发现数。' },
          targets: { type: 'integer', description: '被扫描的包数量。' },
        },
        required: ['report', 'verdict', 'high', 'medium', 'targets'],
      },
      render: (_args, value) => [{ type: 'text', text: value.report }],
    },
    presentCall: (args) => ({
      card: 'generic',
      title: '插件预检',
      kind: 'other',
      rawInput: args?.target,
    }),
    execute(args) {
      const { reports, text } = runPreflight(ctx, args)
      const counts = reports.reduce((acc, report) => ({
        high: acc.high + report.counts.high,
        medium: acc.medium + report.counts.medium,
      }), { high: 0, medium: 0 })
      const verdict = counts.high > 0 ? 'high-risk' : counts.medium > 0 ? 'caution' : 'ok'
      return Promise.resolve({
        report: text,
        verdict,
        high: counts.high,
        medium: counts.medium,
        targets: reports.length,
      })
    },
  })
}
