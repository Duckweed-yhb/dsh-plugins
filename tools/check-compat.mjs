#!/usr/bin/env node
/**
 * 兼容性对照：把一个（或一批）第三方插件声明的依赖，跟**你本机 DSH 运行时实际提供的包**对一遍。
 *
 * 为什么需要：community 插件普遍把 DSH peer 钉在**旧版本区间**（例如 `^0.1.0-rc.6`），
 * 而 DSH 的插件管理器会在 pnpm 运行之前按 semver 拒绝不兼容的 peer —— 实测：
 * `dsh-plugin-gate@1.3.2` 声明 `@deepseek-ai/dsh-fs: ^0.1.0-rc.6`，在 0.2.0-rc.2 上直接
 * `incompatible-version`，一个字节都不装。所以只看"包名在不在"不够，必须做区间判定。
 *
 * 判定实现说明：内置一份最小 semver 比较（支持 `>=`/`<=`/`>`/`<`/`=`/`^`/`~` 与 `||`），
 * 并实现 npm 的**预发布规则**：版本带预发布标签时，只有同 [major,minor,patch] 元组的预发布
 * 比较器才能让它成立。这正是"`0.2.0-rc.2` 不满足 `>=0.1.7-rc.1`"的原因，也是最容易踩的坑。
 * 无法解析的区间一律报 `❓ 无法判定`，绝不假装能判。
 *
 * 用法：
 *   node tools/check-compat.mjs                      # 检查 vendor/ 下全部归档
 *   node tools/check-compat.mjs <包目录> [更多目录...]
 *   node tools/check-compat.mjs --runtime <app.asar 路径>   # 指定安装，默认自动探测
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const runtimeIndex = argv.indexOf('--runtime')
const runtimeAsar = runtimeIndex >= 0 ? argv[runtimeIndex + 1] : undefined
const targets = argv.filter((arg, index) => !arg.startsWith('--') && !(runtimeIndex >= 0 && index === runtimeIndex + 1))

// ---------------------------------------------------------------- 最小 semver

/** 解析 `1.2.3-rc.4`。 */
function parseVer(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(text).trim())
  if (match === null) return undefined
  return { nums: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] === undefined ? [] : match[4].split('.') }
}

/** 比较两个版本（含预发布规则：release > prerelease；数字段 < 字母段）。 */
function compareVer(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a.nums[i] !== b.nums[i]) return a.nums[i] < b.nums[i] ? -1 : 1
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0
  if (a.pre.length === 0) return 1
  if (b.pre.length === 0) return -1
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i]
    const y = b.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const numericX = /^\d+$/.test(x)
    const numericY = /^\d+$/.test(y)
    if (numericX && numericY) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
      continue
    }
    if (numericX) return -1
    if (numericY) return 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** `^` / `~` 的上界。 */
function upperBound(ver, kind) {
  const [major, minor, patch] = ver.nums
  if (kind === '^') {
    if (major > 0) return { nums: [major + 1, 0, 0], pre: [] }
    if (minor > 0) return { nums: [0, minor + 1, 0], pre: [] }
    return { nums: [0, 0, patch + 1], pre: [] }
  }
  return { nums: [major, minor + 1, 0], pre: [] }
}

/** 一个空格分隔的比较器集合。返回 true / false / undefined（无法判定）。 */
function satisfiesSet(version, set) {
  const comparators = []
  for (const token of set.trim().split(/\s+/)) {
    if (token.length === 0) continue
    const match = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(token)
    const op = match[1] ?? '='
    const ver = parseVer(match[2])
    if (ver === undefined) return undefined
    if (op === '^' || op === '~') {
      comparators.push({ op: '>=', ver })
      comparators.push({ op: '<', ver: upperBound(ver, op) })
    } else {
      comparators.push({ op, ver })
    }
  }
  if (comparators.length === 0) return undefined
  // npm 的预发布规则：带预发布的版本，必须有一个"同元组且带预发布"的比较器才可能成立。
  if (version.pre.length > 0) {
    const tuple = version.nums.join('.')
    const sameTuple = comparators.some((c) => c.ver.pre.length > 0 && c.ver.nums.join('.') === tuple)
    if (!sameTuple) return false
  }
  for (const comparator of comparators) {
    const order = compareVer(version, comparator.ver)
    if (comparator.op === '>=' && order < 0) return false
    if (comparator.op === '<=' && order > 0) return false
    if (comparator.op === '>' && order <= 0) return false
    if (comparator.op === '<' && order >= 0) return false
    if (comparator.op === '=' && order !== 0) return false
  }
  return true
}

/** 完整区间（支持 `||`）。 */
function satisfies(versionText, rangeText) {
  const version = parseVer(versionText)
  if (version === undefined) return undefined
  let unknown = false
  for (const set of String(rangeText).split('||')) {
    const result = satisfiesSet(version, set)
    if (result === true) return true
    if (result === undefined) unknown = true
  }
  return unknown ? undefined : false
}

/** 判定结果 → 记号。 */
function mark(result) {
  if (result === true) return '✅ 满足'
  if (result === false) return '❌ 不满足（装的时候会被拒）'
  return '❓ 无法判定'
}

// ---------------------------------------------------------------- 运行时清单

/** 自动探测已安装的 DSH app.asar。 */
function findAsar() {
  const candidates = [
    'E:\\deepseek-harness\\harness\\resources\\app.asar',
    'C:\\Program Files\\DeepSeek Harness\\resources\\app.asar',
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'),
  ]
  return candidates.find((candidate) => candidate.length > 0 && existsSync(candidate))
}

/** 从安装包里取出运行时依赖清单（dsh/package.json）：包名 → 该安装里钉定的版本。 */
function runtimePackages(asarPath) {
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-compat-'))
  const out = join(scratch, 'runtime-package.json')
  try {
    const result = spawnSync(process.execPath, [join(repo, 'tools', 'asar-tool.mjs'), 'extract', asarPath, 'dsh/package.json', out], { encoding: 'utf8' })
    if (result.status !== 0 || !existsSync(out)) throw new Error(result.stderr || 'asar extract failed')
    const manifest = JSON.parse(readFileSync(out, 'utf8'))
    const versions = new Map(Object.entries(manifest.dependencies ?? {}))
    return { version: manifest.version, names: new Set(versions.keys()), versions }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/**
 * 判定一个 peer 区间：**用该包在运行时里钉定的版本**去比，而不是用 DSH 的版本。
 * 例如 `@deepseek-ai/cordis @ ^4.0.1` 要比的是运行时的 cordis `4.0.4`，不是 DSH `0.2.0-rc.2`。
 * 只有 `@deepseek-ai/dsh`（DSH 自身）与 `dsh.engines.dsh` 才拿 DSH 版本比。
 */
function judgePeer(runtime, name, range) {
  const subject = name === '@deepseek-ai/dsh' ? runtime.version : runtime.versions.get(name)
  if (subject === undefined) return { verdict: undefined, subject: '(运行时未提供)' }
  return { verdict: satisfies(subject, range), subject }
}

const asar = runtimeAsar ?? findAsar()
if (asar === undefined) {
  console.error('找不到 app.asar；用 --runtime <路径> 指定。')
  process.exit(2)
}
const runtime = runtimePackages(asar)
console.log(`运行时：${asar}`)
console.log(`运行时版本：${runtime.version}；提供 ${runtime.names.size} 个包\n`)

// ---------------------------------------------------------------- 逐包判定

const dirs = targets.length > 0
  ? targets.map((target) => resolve(target))
  : readdirSync(join(repo, 'vendor'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(repo, 'vendor', entry.name))

let predictedBlocked = 0
for (const dir of dirs) {
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const dsh = manifest.dsh ?? {}
  const client = dsh.client ?? {}
  const inject = Array.isArray(client.inject) ? client.inject : []
  const peers = Object.entries(manifest.peerDependencies ?? {})

  const missingInject = inject.filter((name) => !runtime.names.has(name))
  const dshPeers = peers.filter(([name]) => name.startsWith('@deepseek-ai/'))
  const missingPeers = dshPeers.filter(([name]) => !runtime.names.has(name))
  const floor = dsh.engines?.dsh
  const floorVerdict = floor === undefined ? undefined : satisfies(runtime.version, floor)
  const peerVerdicts = dshPeers
    .filter(([name]) => runtime.names.has(name))
    .map(([name, range]) => ({ name, range, ...judgePeer(runtime, name, range) }))

  console.log(`=== ${manifest.name}@${manifest.version}`)
  console.log(`  bundle patch      : ${dsh.bundle?.patch ?? '(无 —— 不是 bundle)'}`)
  if (floor !== undefined) console.log(`  dsh.engines.dsh   : ${floor}  → ${mark(floorVerdict)}（比的是 DSH ${runtime.version}）`)
  if (inject.length > 0) {
    console.log(`  dsh.client.inject : ${inject.length} 个，${missingInject.length === 0 ? '✅ 全部存在于运行时' : `❌ 缺 ${missingInject.join(', ')}`}`)
  }
  if (dshPeers.length > 0) {
    console.log(`  DSH peer 依赖     : ${missingPeers.length === 0 ? '命名全部存在' : `❌ 缺 ${missingPeers.map(([n]) => n).join(', ')}`}`)
    for (const peer of peerVerdicts) console.log(`      ${peer.name} @ ${peer.range}  → ${mark(peer.verdict)}（比的是 ${peer.subject}）`)
  }
  const runtimeDeps = Object.entries(manifest.dependencies ?? {}).filter(([, range]) => typeof range === 'string')
  if (runtimeDeps.length > 0) console.log(`  运行期会装        : ${runtimeDeps.map(([n, r]) => `${n}@${r}`).join(', ')}`)
  const scripts = Object.keys(manifest.scripts ?? {}).filter((name) => ['preinstall', 'install', 'postinstall', 'prepare'].includes(name))
  if (scripts.length > 0) console.log(`  安装期脚本        : ⚠️ ${scripts.join(', ')}（registry tarball 安装不执行；git/本地安装会执行）`)

  const blocked = floorVerdict === false || peerVerdicts.some((p) => p.verdict === false) || missingInject.length > 0 || missingPeers.length > 0
  if (blocked) predictedBlocked += 1
  console.log(blocked ? '  → 预测：⚠️ 会被插件管理器拒绝，或客户端激活条件不满足\n' : '  → 预测：✅ 可安装\n')
}

console.log(predictedBlocked === 0 ? '预测：全部可安装 ✅' : `预测：${predictedBlocked} 个会被拒 / 有缺失 ⚠️（以插件管理器的实际判定为准）`)
