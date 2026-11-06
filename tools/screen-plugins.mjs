/**
 * screen-plugins.mjs —— 批量"体检"候选插件（安装前第一道：只读 npm 元数据）。
 *
 * 判据（都是踩坑换来的，不是拍脑袋）：
 *   1. peer 要求 vs 当前 harness：不满足 → 加载器会红牌，装了等于白装（gate 1.3.2 就是这么废的）
 *   2. `dsh.client.inject` 里出现 `@deepseek-ai/dsh-client-runtime` → 外壳里不存在这个模块 id，
 *      当年的 sidebar-balance 就是因为它 + 启动期占槽位，把 web boot 直接打崩
 *   3. 体积：>10MB 的单插件意味着塞了整包前端资源（better-sidebar 就是 18MB），
 *      它要动 DOM ⇒ 跟现有侧栏/主题抢地盘的几率高
 *   4. 依赖数：0 依赖最稳；大量运行时依赖 = 更多升级断点
 *
 * 只读 registry 元数据，不下载、不安装。深查（源码级）另跑 gate 扫描 + plugin_preflight。
 *
 * 用法：node screen-plugins.mjs name1 name2 ...
 */
import fs from 'node:fs'

const HARNESS = '0.2.1-rc.2'
const KNOWN_BAD_INJECT = '@deepseek-ai/dsh-client-runtime'

function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v).trim())
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null } : null
}
function cmp(a, b) {
  for (const k of ['major', 'minor', 'patch']) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1
  if (a.pre === b.pre) return 0
  if (a.pre === null) return 1
  if (b.pre === null) return -1
  return a.pre < b.pre ? -1 : a.pre > b.pre ? 1 : 0
}
function satisfies(range, version) {
  const v = parse(version)
  if (!v) return { ok: null, why: '版本号看不懂' }
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
  if (r === '' || r === '*' || r === 'latest') return { ok: true, why: '任意' }
  if (r.startsWith('^')) {
    const lo = parse(r.slice(1))
    if (!lo) return { ok: null, why: 'range 看不懂' }
    const hi = lo.major > 0 ? { major: lo.major + 1, minor: 0, patch: 0, pre: null } : { major: 0, minor: lo.minor + 1, patch: 0, pre: null }
    return { ok: cmp(v, lo) >= 0 && cmp(v, hi) < 0, why: `${r} 上界 ${hi.major}.${hi.minor}.${hi.patch}` }
  }
  if (r.startsWith('<=')) { const hi = parse(r.slice(2)); return hi ? { ok: cmp(v, hi) <= 0, why: r } : { ok: null, why: 'range 看不懂' } }
  if (r.startsWith('<')) { const hi = parse(r.slice(1)); return hi ? { ok: cmp(v, hi) < 0, why: r } : { ok: null, why: 'range 看不懂' } }
  if (r.startsWith('>') && !r.startsWith('>=')) { const lo = parse(r.slice(1)); return lo ? { ok: cmp(v, lo) > 0, why: r } : { ok: null, why: 'range 看不懂' } }  if (r.startsWith('>=')) {
    const lo = parse(r.slice(2))
    return lo ? { ok: cmp(v, lo) >= 0, why: r } : { ok: null, why: 'range 看不懂' }
  }
  if (r.startsWith('~')) {
    const lo = parse(r.slice(1))
    if (!lo) return { ok: null, why: 'range 看不懂' }
    return { ok: cmp(v, lo) >= 0 && cmp(v, { major: lo.major, minor: lo.minor + 1, patch: 0, pre: null }) < 0, why: r }
  }
  const ex = parse(r)
  return ex ? { ok: cmp(v, ex) === 0, why: r } : { ok: null, why: 'range 看不懂' }
}

const names = process.argv.slice(2)
if (!names.length) {
  console.log('用法：node screen-plugins.mjs <npm 包名...>')
  process.exit(0)
}

const PROVIDED = new Set(['@deepseek-ai/dsh-fs', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-credentials', '@deepseek-ai/dsh-settings', '@deepseek-ai/dsh-skill', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-typert-protocol', '@deepseek-ai/dsh-launch-environment'])

async function meta(name) {
  for (const candidate of [name, name.toLowerCase()]) {
    try {
      const r = await fetch('https://registry.npmjs.org/' + encodeURIComponent(candidate) + '/latest')
      if (r.status === 200) {
        const j = await r.json()
        if (j.name) return j
      }
    } catch {}
  }
  return null
}

const rows = []
for (const name of names) {
  const m = await meta(name)
  if (!m) { rows.push({ name, missing: true }); continue }
  const dsh = m.dsh ?? {}
  const client = dsh.client ?? null
  const inject = client?.inject ?? []
  const peers = m.peerDependencies ?? {}
  const dshPeers = Object.entries(peers).filter(([k]) => k.startsWith('@deepseek-ai/'))
  const peerProblems = []
  for (const [k, range] of dshPeers) {
    if (!PROVIDED.has(k)) continue
    const r = satisfies(range, HARNESS)
    if (r.ok === false) peerProblems.push(`${k} ${range}（${r.why}）`)
  }
  const sizeMB = m.dist?.unpackedSize ? Math.round(m.dist.unpackedSize / 1024 / 1024 * 10) / 10 : null
  const flags = []
  if (inject.includes(KNOWN_BAD_INJECT)) flags.push('⛔ inject 含不存在的 dsh-client-runtime')
  if (peerProblems.length) flags.push('⛔ peer 与 ' + HARNESS + ' 不匹配')
  if (sizeMB !== null && sizeMB > 10) flags.push(`⚠️ 体积 ${sizeMB}MB`)
  if (Object.keys(m.dependencies ?? {}).length > 8) flags.push(`⚠️ 运行时依赖 ${Object.keys(m.dependencies).length} 个`)
  rows.push({ name: m.name, version: m.version, client: client ? (inject.length ? inject.join(',') : '（无 inject）') : '无（宿主-only）', dshPeers, peerProblems, sizeMB, flags })
}

console.log(`harness ${HARNESS}\n`)
for (const r of rows) {
  if (r.missing) { console.log(`❓ ${r.name} —— npm 上找不到（名字可能不对）\n`); continue }
  const verdict = r.flags.length ? r.flags.join('；') : '✅ 元数据无红旗'
  console.log(`${r.name} @${r.version}`)
  console.log(`   ${verdict}`)
  console.log(`   客户端：${r.client}`)
  if (r.sizeMB !== null) console.log(`   体积：${r.sizeMB}MB`)
  if (r.dshPeers.length) console.log(`   dsh peer：${r.dshPeers.map(([k, v]) => k.replace('@deepseek-ai/', '') + ' ' + v).join(' / ')}`)
  console.log('')
}
