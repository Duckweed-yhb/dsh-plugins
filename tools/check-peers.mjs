/**
 * check-peers.mjs —— DSH 升级后，体检"哪些已装插件的 peer 要求已经和当前 harness 不匹配"。
 *
 * 为什么需要：harness 从 0.2.0-rc.2 升到 0.2.1-rc.2 时，`dsh-plugin-gate@1.3.2` 立刻被判"不兼容"——
 * 它要求 `@deepseek-ai/dsh-fs ^0.1.0-rc.6`（=只接受 0.1.x），而新 harness 提供 0.2.1-rc.2。
 * semver 里 `^0.1.0-rc.6` 的上界是 `<0.2.0`，于是要求不满足 → 加载器给红牌。
 * 这种错只会在升级那天出现，平时看不出来，所以要有个一键体检。
 *
 * 用法：node check-peers.mjs [--harness 0.2.1-rc.2] [--profile <dir>]
 * 退出码：0 = 全部匹配；1 = 有插件不匹配（会列出建议动作）。
 */
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }

const PROFILE = argOf('--profile', 'E:\\DeepseekHarness\\dsh-data\\profiles\\desktop')
const NM = path.join(PROFILE, 'node_modules')
const HARNESS = argOf('--harness', '0.2.1-rc.2')

/** 解析 `x.y.z[-pre...]`；pre 段按字符串比较（够用）。 */
function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v).trim())
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null }
}
function cmp(a, b) {
  for (const k of ['major', 'minor', 'patch']) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1
  if (a.pre === b.pre) return 0
  if (a.pre === null) return 1      // 正式版 > 预发布
  if (b.pre === null) return -1
  return a.pre < b.pre ? -1 : a.pre > b.pre ? 1 : 0
}
/** 只支持 ^ / ~ / 精确 / >=：够覆盖本仓库的声明方式。 */
function satisfies(range, version) {
  const v = parse(version)
  if (!v) return { ok: false, why: `版本号看不懂：${version}` }
  const r = String(range).trim()
// `>=a <b` 这种空格分隔的复合区间：每个条件都满足才算满足（file-upload 的 peer 就是这形态）。
if (!r.includes("||") && /\s/.test(r)) {
  const parts = r.split(/\s+/).filter(Boolean)
  const rs = parts.map((p) => satisfies(p, version))
  const ok = rs.every((x) => x.ok === true)
  return { ok, why: r + (ok ? "（全部条件满足）" : "（有条件不满足）") }
}
  // `a || b` 型声明（engines.dsh 常见）：任一分支满足即算满足，别整条当"看不懂"误报。
  if (r.includes("||")) {
    const parts = r.split("||").map((s) => s.trim()).filter(Boolean)
    const oks = parts.map((p) => satisfies(p, version))
    const ok = oks.some((o) => o.ok === true)
    return { ok, why: r + (ok ? "（任一分支满足）" : "（各分支均不满足）") }
  }
  if (r === '' || r === '*' || r === 'latest') return { ok: true, why: '任意版本' }
  if (r.startsWith('^')) {
    const lo = parse(r.slice(1))
    if (!lo) return { ok: false, why: 'range 看不懂' }
    const hi = lo.major > 0
      ? { major: lo.major + 1, minor: 0, patch: 0, pre: null }
      : { major: 0, minor: lo.minor + 1, patch: 0, pre: null }
    const ok = cmp(v, lo) >= 0 && cmp(v, hi) < 0
    return { ok, why: `${r} → [${r.slice(1)}, ${hi.major}.${hi.minor}.${hi.patch})  实际 ${version}` }
  }
  if (r.startsWith('~')) {
    const lo = parse(r.slice(1))
    if (!lo) return { ok: false, why: 'range 看不懂' }
    const hi = { major: lo.major, minor: lo.minor + 1, patch: 0, pre: null }
    return { ok: cmp(v, lo) >= 0 && cmp(v, hi) < 0, why: `${r} → [${r.slice(1)}, ${hi.major}.${hi.minor}.0)  实际 ${version}` }
  }
  if (r.startsWith('<=')) { const hi = parse(r.slice(2)); return hi ? { ok: cmp(v, hi) <= 0, why: r } : { ok: null, why: 'range 看不懂' } }
  if (r.startsWith('<')) { const hi = parse(r.slice(1)); return hi ? { ok: cmp(v, hi) < 0, why: r } : { ok: null, why: 'range 看不懂' } }
  if (r.startsWith('>') && !r.startsWith('>=')) { const lo = parse(r.slice(1)); return lo ? { ok: cmp(v, lo) > 0, why: r } : { ok: null, why: 'range 看不懂' } }  if (r.startsWith('>=')) {
    const lo = parse(r.slice(2))
    return lo ? { ok: cmp(v, lo) >= 0, why: `${r}  实际 ${version}` } : { ok: false, why: 'range 看不懂' }
  }
  const exact = parse(r)
  return exact ? { ok: cmp(v, exact) === 0, why: `${r} 要求精确匹配  实际 ${version}` } : { ok: false, why: 'range 看不懂' }
}

/** harness 实际提供的包版本：从 app.asar 同级读不到，就让调用方传；这里按"同 harness 版本"处理常见包。 */
const PROVIDED = {
  '@deepseek-ai/dsh-fs': HARNESS,
  '@deepseek-ai/dsh-system-prompt': HARNESS,
  '@deepseek-ai/dsh-tools': HARNESS,
  '@deepseek-ai/dsh-credentials': HARNESS,
  '@deepseek-ai/dsh-settings': HARNESS,
  '@deepseek-ai/cordis': null,          // 由插件自带，不判
  react: '18.x（由客户端运行时提供）',
}

function readPkg(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

const isDir = (p) => { try { return fs.statSync(p).isDirectory() } catch { return false } }
const scopes = fs.existsSync(NM) ? fs.readdirSync(NM, { withFileTypes: true }) : []
const dirs = []
for (const e of scopes) {
  if (!e.isDirectory()) continue
  if (e.name.startsWith('@')) {
    for (const sub of fs.readdirSync(path.join(NM, e.name), { withFileTypes: true })) {
      if (isDir(path.join(NM, e.name, sub.name))) dirs.push(path.join(NM, e.name, sub.name))
    }
  } else if (!e.name.startsWith('.')) dirs.push(path.join(NM, e.name))
}

const rows = []
for (const dir of dirs) {
  const pkg = readPkg(dir)
  if (!pkg || !pkg.name) continue
  const peers = pkg.peerDependencies ?? {}
  const engines = pkg.engines ?? {}
  const problems = []
  for (const [name, range] of Object.entries(peers)) {
    if (name === 'react' || name === 'react-dom') continue   // 客户端运行时提供，不按 semver 判
    const provided = PROVIDED[name] === null ? undefined : PROVIDED[name]
    if (provided === undefined || provided === null) continue
    const r = satisfies(range, typeof provided === 'string' && /^\d/.test(provided) ? provided : HARNESS)
    if (!r.ok) problems.push({ kind: 'peer', name, range, why: r.why })
  }
  if (engines.dsh && !satisfies(engines.dsh, HARNESS).ok) {
    problems.push({ kind: 'engines.dsh', name: 'engines.dsh', range: engines.dsh, why: satisfies(engines.dsh, HARNESS).why })
  }
  rows.push({ pkg, problems })
}

console.log(`harness ${HARNESS} · profile ${path.basename(PROFILE)} · 扫描 ${rows.length} 个已装包\n`)
let bad = 0
for (const { pkg, problems } of rows.sort((a, b) => a.pkg.name.localeCompare(b.pkg.name))) {
  const tag = problems.length ? '⛔ 不匹配' : '✅ 匹配'
  console.log(`${tag}  ${pkg.name} @${pkg.version}`)
  for (const p of problems) {
    bad += 1
    console.log(`      ${p.kind}: ${p.name} 要求 ${p.range} —— ${p.why}`)
  }
}
if (bad) {
  console.log(`\n共 ${bad} 处不匹配。处理顺序建议：`)
  console.log('  1) 先查 npm 上有没有放宽 peer 的新版（install_bundle 该版本）')
  console.log('  2) 没有新版 → 卸载或禁用到上游发布为止（别用版本豁免硬放行）')
} else {
  console.log('\n全部匹配 ✅')
}
process.exit(bad ? 1 : 0)
