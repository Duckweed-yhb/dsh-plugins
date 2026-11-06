/**
 * fork-plugin.mjs —— 把第三方 DSH 插件 fork 进本工作区，改名成 @yhb/dsh-plugin-*。
 *
 * 只改"加载器/清单认得出的三处"，其余内部标识（CSS 键、localStorage 键、事件名、i18n 命名空间、
 * 路由前缀、离线 CLI 的状态键）**保持上游原样**——它们是自洽字符串，乱改只会制造 host↔client 不一致。
 *
 * 用法：
 *   node fork-plugin.mjs --src <上游包目录> --slug savepoint [--row yhb-savepoint]
 * 产出：<plugins>/<slug>/  （package.json name=@yhb/dsh-plugin-<slug>，patch 行 id 默认 yhb-<slug>）
 * 行为：不覆盖已存在的目标目录；改完打印"剩余旧名引用"供人工判断哪些该留。
 */
import fs from 'node:fs'
import path from 'node:path'

const PLUGINS = 'E:\\future\\yhb\\05-学习资源\\dsh-plugins\\plugins'
const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }

const SRC = arg('--src')
const SLUG = arg('--slug')
if (!SRC || !SLUG) {
  console.log('用法：node fork-plugin.mjs --src <上游目录> --slug <名字> [--row <行id>]')
  process.exit(0)
}
const DST = path.join(PLUGINS, SLUG)
const ROW_NEW = arg('--row', 'yhb-' + SLUG)

if (!fs.existsSync(path.join(SRC, 'package.json'))) throw new Error('上游目录里没有 package.json：' + SRC)
if (fs.existsSync(DST)) throw new Error('目标目录已存在，先清理：' + DST)

const upstream = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8'))
const OLD = upstream.name
const NEW = '@yhb/dsh-plugin-' + SLUG
if (!OLD) throw new Error('上游 package.json 没有 name')

fs.cpSync(SRC, DST, { recursive: true })

// 1) package.json
const pkgPath = path.join(DST, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
pkg.name = NEW
pkg.private = true
pkg.description = '[fork] ' + (upstream.description ?? '') + ' （上游 ' + OLD + '@' + upstream.version + '）'
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

// 2) cordis.patch.yml：替换插入行的 id 与 name（保留其余行，比如 disabled 的官方行覆盖）
const patchPath = path.join(DST, 'cordis.patch.yml')
if (fs.existsSync(patchPath)) {
  let patch = fs.readFileSync(patchPath, 'utf8')
  patch = patch.replace(new RegExp("(^\\s*-\\s*id:\\s*)" + OLD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm'), '$1' + ROW_NEW)
  patch = patch.replace(new RegExp("(^\\s*-\\s*id:\\s*[\\w-]+\\s*\\n\\s*name:\\s*['\"])" + OLD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(['\"])", 'm'), '$1' + NEW + '$2')
  patch = patch.replace(new RegExp("(name:\\s*['\"])" + OLD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(['\"])", 'g'), '$1' + NEW + '$2')
  fs.writeFileSync(patchPath, patch, 'utf8')
}

// 3) 客户端加载器 id（只认 `id: "<上游包名>"` 这一种形态）
let loaderIdChanged = -1
const clientPath = path.join(DST, 'lib', 'client.js')
if (fs.existsSync(clientPath)) {
  const t = fs.readFileSync(clientPath, 'utf8')
  const re = new RegExp('id:\\s*"' + OLD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"')
  const m = t.match(re)
  if (m) {
    fs.writeFileSync(clientPath, t.replace(re, 'id: "' + NEW + '"'), 'utf8')
    loaderIdChanged = 1
  } else loaderIdChanged = 0
}

// 4) 上游文档另存，别覆盖自己的 README
for (const [from, to] of [['README.md', 'README.upstream.md'], ['README.en.md', 'README.upstream.en.md']]) {
  const f = path.join(DST, from)
  if (fs.existsSync(f)) fs.renameSync(f, path.join(DST, to))
}

// 报告
const leftovers = []
for (const f of walk(DST)) {
  if (!/\.(js|mjs|json|yml|yaml|md)$/.test(f)) continue
  const t = fs.readFileSync(f, 'utf8')
  const n = (t.match(new RegExp(OLD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length
  if (n) leftovers.push(`${path.relative(DST, f)} ×${n}`)
}
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(full)
    else if (e.isFile()) yield full
  }
}
console.log('fork 完成 → ' + DST)
console.log(`  name: ${OLD} → ${NEW}`)
console.log(`  patch 行 id: ${ROW_NEW}`)
console.log(`  客户端加载器 id: ${loaderIdChanged === 1 ? '已改' : loaderIdChanged === 0 ? '⚠️ 没找到 id: "' + OLD + '"（需人工确认）' : '无 client.js'}`)
console.log('  剩余上游名引用（内部自洽字符串，通常应保留）：' + (leftovers.length ? '\n    ' + leftovers.slice(0, 12).join('\n    ') : '无'))
