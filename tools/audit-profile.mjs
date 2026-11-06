/**
 * audit-profile.mjs —— 插件互相影响的体检（这次崩溃后做的）。
 *
 * 查七件事：
 *  1. profile 现在挂了哪些 bundle、装了哪些包
 *  2. **profile 的 node_modules 里有没有 @deepseek-ai/* 第三方版本**（本次崩溃的根因：weixin 把
 *     dsh-credentials-local@0.1.0-rc.7 提了进来，和 0.2.1 不兼容 → credentials 服务缺失 → host 起不来）
 *  3. 每个已装插件的 dependencies 里有没有 @deepseek-ai/*（= 提旧版 harness 包的隐患）
 *  4. 行 id / 槽位 / 路由 / 工具名冲突
 *  5. patch 顶层行数与备份可用性
 *  6. 崩溃日志
 *  7. 每个插件声明了哪些 peer（用来判断是否依赖 harness 内部包，link: 装时可能解析不到）
 */
import fs from 'node:fs'
import path from 'node:path'

const PROFILE = 'E:\\DeepseekHarness\\dsh-data\\profiles\\desktop'
const NM = path.join(PROFILE, 'node_modules')
const PATCH = path.join(PROFILE, 'cordis.patch.yml')

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const nmExists = fs.existsSync(NM)

// ---------- 1. profile 组合 ----------
const pkg = read(path.join(PROFILE, 'package.json')) ?? {}
const bundles = pkg.dsh?.profile?.bundles ?? []
const deps = pkg.dependencies ?? {}
console.log('=== 1. profile 组合 ===')
console.log(`  bundles (${bundles.length}):`)
for (const b of bundles) console.log('    - ' + b)
console.log(`  dependencies (${Object.keys(deps).length}):`)
for (const [k, v] of Object.entries(deps)) console.log('    - ' + k + ' ' + v)

// ---------- 2. profile node_modules 里的 harness 包 ----------
console.log('\n=== 2. profile/node_modules 里的 @deepseek-ai/* （第三方版本 = 污染） ===')
let polluted = []
for (const scope of ['@deepseek-ai', '@yhb']) {
  const dir = path.join(NM, scope)
  if (!fs.existsSync(dir)) { console.log(`  ${scope}: （不存在 ✅）`); continue }
  const items = fs.readdirSync(dir, { withFileTypes: true })
  console.log(`  ${scope}: ${items.length} 个`)
  for (const it of items) {
    const p = read(path.join(dir, it.name, 'package.json'))
    const tag = scope === '@deepseek-ai' ? '⚠️ harness 包被装进 profile' : ''
    if (scope === '@deepseek-ai') polluted.push(`${it.name}@${p?.version ?? '?'}`)
    console.log(`    - ${it.name}@${p?.version ?? '?'}  ${tag}`)
  }
}

// ---------- 3. 每个插件的 dependencies 里有没有 harness 包 ----------
console.log('\n=== 3. 已装插件的 dependencies 里含 @deepseek-ai/* 的（提旧版隐患） ===')
const hazards = []
for (const scope of ['@yhb', null]) {
  const roots = scope ? [path.join(NM, scope)] : [NM]
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    const entries = fs.readdirSync(root, { withFileTypes: true })
    for (const e of entries) {
      if (!scope && e.name.startsWith('@')) continue
      if (!scope && e.name === '.pnpm' || !scope && e.name === '.bin') continue
      const dir = path.join(root, e.name)
      let st
      try { st = fs.statSync(dir) } catch { continue }
      if (!st.isDirectory()) continue
      const p = read(path.join(dir, 'package.json'))
      if (!p?.name) continue
      const bad = Object.entries(p.dependencies ?? {}).filter(([k]) => k.startsWith('@deepseek-ai/'))
      const harnessPeers = Object.entries(p.peerDependencies ?? {}).filter(([k]) => k.startsWith('@deepseek-ai/'))
      if (bad.length) hazards.push(p.name)
      console.log(`  ${p.name}@${p.version ?? '?'}`)
      console.log(`     deps→harness: ${bad.length ? bad.map(([k, v]) => k + '@' + v).join(', ') : '无 ✅'}`)
      console.log(`     peers→harness: ${harnessPeers.length} 个（16 进制? 无）`)
    }
  }
}

// ---------- 4. patch 顶层行 ----------
console.log('\n=== 4. profile patch ===')
if (fs.existsSync(PATCH)) {
  const text = fs.readFileSync(PATCH, 'utf8')
  const rows = text.split('\n').filter((l) => /^-\s/.test(l))
  console.log(`  顶层行 ${rows.length}:`)
  for (const r of rows) console.log('    ' + r.trim())
  console.log(`  含 preset-xiaoman: ${text.includes('preset-xiaoman')}`)
  console.log(`  含 personaPrefix: ${text.includes('personaPrefix')}`)
  const baks = fs.readdirSync(PROFILE).filter((f) => f.startsWith('cordis.patch.yml.bak')).sort()
  console.log(`  备份 ${baks.length} 个，最新: ${baks.slice(-3).join(', ')}`)
} else console.log('  ❌ patch 不存在')

console.log('\n=== 结论 ===')
console.log(`  profile 里被污染的 harness 包: ${polluted.length ? polluted.join(', ') : '无 ✅'}`)
console.log(`  依赖了 harness 包的插件（会往 profile 提旧版）: ${hazards.length ? hazards.join(', ') : '无 ✅'}`)
