#!/usr/bin/env node
/**
 * 独立预检脚本：不需要启动 DSH，直接审一个插件目录/包名。
 *
 * 用法：
 *   node tools/preflight.mjs <插件目录绝对路径>
 *   node tools/preflight.mjs @linxin666/dsh-pet
 *   node tools/preflight.mjs installed            # 审当前 DSH profile 里的第三方插件
 *   node tools/preflight.mjs --json <目标>         # 输出机器可读 JSON
 *
 * 退出码：0 = ok/caution，1 = 有 high 风险，2 = 用法或解析错误。
 * 规则引擎与 DSH 里的 plugin_preflight 工具完全同一份（plugins/preflight/lib/rules.js）。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { renderReport, scanPackage } from '../plugins/preflight/lib/rules.js'

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const target = args.find((arg) => !arg.startsWith('--'))

if (target === undefined) {
  console.error('用法：node tools/preflight.mjs [--json] <插件目录|包名|installed>')
  process.exit(2)
}

const home = (process.env.DSH_HOME ?? '').trim() || join(homedir(), '.dsh')

/** 收集可用来解析包名的 node_modules 根。 */
function roots() {
  const list = []
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir.length > 0) list.push(join(profileDir, 'node_modules'))
  list.push(join(home, 'profiles', 'node_modules'))
  try {
    for (const entry of readdirSync(join(home, 'profiles'))) list.push(join(home, 'profiles', entry, 'node_modules'))
  } catch {
    // 没有 profiles 目录就算了
  }
  return list
}

/** 解析 spec → 包目录。 */
function resolveDir(spec) {
  // 目录：先按"相对于当前工作目录"试，再按"绝对路径"试。
  const asPath = resolve(spec)
  if (existsSync(join(asPath, 'package.json'))) return asPath
  if (isAbsolute(spec)) return undefined
  const parts = spec.split('/')
  const packageName = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  for (const root of roots()) {
    const dir = join(root, packageName)
    if (existsSync(join(dir, 'package.json'))) return dir
  }
  return undefined
}

/** 读出 profile 里选中的 bundle 名。 */
function profileBundles() {
  const candidates = []
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir.length > 0) candidates.push(profileDir)
  try {
    for (const entry of readdirSync(join(home, 'profiles'))) candidates.push(join(home, 'profiles', entry))
  } catch {
    // 忽略
  }
  for (const dir of candidates) {
    const manifest = join(dir, 'package.json')
    if (!existsSync(manifest)) continue
    try {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
      return { dir, bundles: parsed?.dsh?.profile?.bundles ?? [] }
    } catch {
      continue
    }
  }
  return { dir: undefined, bundles: [] }
}

const reports = []
if (target === 'installed' || target === 'all') {
  const { dir, bundles } = profileBundles()
  const thirdParty = bundles.filter((bundle) => typeof bundle === 'string' && !bundle.startsWith('@deepseek-ai/'))
  console.log(`profile: ${dir ?? '(未定位)'}；选中 ${bundles.length} 个组合包，非官方 ${thirdParty.length} 个`)
  for (const bundle of thirdParty) {
    const resolved = resolveDir(bundle)
    if (resolved === undefined) {
      console.log(`\n### ${bundle}\n- 解析不到目录（可能装在别处）`)
      continue
    }
    reports.push(scanPackage(resolved))
  }
} else {
  const dir = resolveDir(target)
  if (dir === undefined) {
    console.error(`解析不到目标「${target}」：绝对路径请确认目录含 package.json；包名请确认它装在 profile 里。`)
    process.exit(2)
  }
  reports.push(scanPackage(dir))
}

if (asJson) {
  console.log(JSON.stringify(reports, null, 2))
} else {
  for (const report of reports) console.log(`\n${renderReport(report)}`)
}

const high = reports.reduce((sum, report) => sum + report.counts.high, 0)
const medium = reports.reduce((sum, report) => sum + report.counts.medium, 0)
console.log(`\n合计：${reports.length} 个包，high=${high} medium=${medium}`)
process.exitCode = high > 0 ? 1 : 0
