#!/usr/bin/env node
/**
 * 把第三方 DSH 插件从 npm registry 拉进本仓库的 vendor/ 目录，并留下可核对的溯源记录。
 *
 * 为什么不用 `npm install` / `pnpm add`：
 * - 这里只是**收藏 + 审阅**，不是装进 profile；不需要跑任何安装脚本（那正是供应链风险所在）。
 * - 直接取 registry 的 tarball 并用 registry 声明的 sha512 integrity 校验，能证明"我审的就是
 *   发布出去的那份字节"。
 *
 * 用法：
 *   node tools/fetch-plugin.mjs @linxin666/dsh-pet
 *   node tools/fetch-plugin.mjs @linxin666/dsh-pet@0.4.6 dshmarket
 *   node tools/fetch-plugin.mjs --force --out vendor <spec...>
 *   node tools/fetch-plugin.mjs --list          # 看 vendor 里已有什么
 *
 * 产物：
 *   vendor/<扁平包名>/                 解包后的包内容（package/ 前缀已去掉）
 *   vendor/<扁平包名>/_provenance.json 溯源与校验记录
 *   vendor/index.json                  全部记录的汇总
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const force = argv.includes('--force')
const outIndex = argv.indexOf('--out')
const outDir = resolve(repo, outIndex >= 0 ? argv[outIndex + 1] : 'vendor')
const specs = argv.filter((arg, index) => !arg.startsWith('--') && !(outIndex >= 0 && index === outIndex + 1))

/** 扁平化包名，做 Windows 合法目录名。 */
function flatName(packageName) {
  return packageName.replace('/', '+')
}

/** registry 元数据端点。 */
async function registryMeta(packageName, version) {
  const encoded = packageName.replace('/', '%2F')
  const url = version === undefined
    ? `https://registry.npmjs.org/${encoded}/latest`
    : `https://registry.npmjs.org/${encoded}/${version}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`registry ${response.status} for ${url}`)
  return response.json()
}

/** 校验 registry 声明的 integrity。 */
function verifyIntegrity(buffer, integrity) {
  if (typeof integrity !== 'string' || !integrity.startsWith('sha512-')) return { ok: false, reason: 'no sha512 integrity declared' }
  const expected = integrity.slice('sha512-'.length)
  const actual = createHash('sha512').update(buffer).digest('base64')
  return actual === expected ? { ok: true, actual } : { ok: false, reason: `sha512 mismatch: expected ${expected}, got ${actual}`, actual }
}

/** 用 bsdtar 解包并去掉 package/ 前缀。 */
function extract(tarballPath, destination) {
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })
  const result = spawnSync('tar', ['-xzf', tarballPath, '-C', destination, '--strip-components=1'], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`tar failed: ${result.stderr || result.stdout || result.status}`)
  if (!existsSync(join(destination, 'package.json'))) {
    // 有些 tarball 不带 package/ 前缀，再试一次直接解
    rmSync(destination, { recursive: true, force: true })
    mkdirSync(destination, { recursive: true })
    const retry = spawnSync('tar', ['-xzf', tarballPath, '-C', destination], { encoding: 'utf8' })
    if (retry.status !== 0 || !existsSync(join(destination, 'package.json'))) throw new Error('解包后找不到 package.json')
  }
}

/** 读现有汇总。 */
function readIndex() {
  const path = join(outDir, 'index.json')
  if (!existsSync(path)) return { entries: [] }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return { entries: [] }
  }
}

if (argv.includes('--list')) {
  const index = readIndex()
  if (index.entries.length === 0) console.log(`${outDir} 里还没有插件`)
  for (const entry of index.entries) {
    console.log(`${entry.name}@${entry.version}  ${entry.license ?? '?'}  ${entry.fileCount ?? '?'} files  ${entry.dir}`)
  }
  process.exit(0)
}

if (specs.length === 0) {
  console.error('用法：node tools/fetch-plugin.mjs [--force] [--out vendor] <包名[@版本]...>')
  process.exit(2)
}

mkdirSync(outDir, { recursive: true })
const index = readIndex()

for (const spec of specs) {
  const at = spec.lastIndexOf('@')
  const hasVersion = at > 0
  const packageName = hasVersion ? spec.slice(0, at) : spec
  const version = hasVersion ? spec.slice(at + 1) : undefined

  process.stdout.write(`\n=== ${spec}\n`)
  const meta = await registryMeta(packageName, version)
  const resolved = meta.version
  const dir = join(outDir, flatName(packageName))
  const provenancePath = join(dir, '_provenance.json')

  if (!force && existsSync(provenancePath)) {
    const previous = JSON.parse(readFileSync(provenancePath, 'utf8'))
    if (previous.version === resolved) {
      console.log(`已存在同版本，跳过：${packageName}@${resolved}（--force 可强制重下）`)
      continue
    }
  }

  const tarballUrl = meta.dist?.tarball
  if (typeof tarballUrl !== 'string') throw new Error(`${packageName}@${resolved} 没有 dist.tarball`)
  console.log(`版本 ${resolved}  ←  ${tarballUrl}`)

  const response = await fetch(tarballUrl)
  if (!response.ok) throw new Error(`下载失败 ${response.status}：${tarballUrl}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const integrity = verifyIntegrity(buffer, meta.dist?.integrity)
  console.log(`字节 ${buffer.length}；integrity ${integrity.ok ? '✅ 校验通过' : `❌ ${integrity.reason}`}`)

  const tarballPath = join(outDir, `${flatName(packageName)}.tgz`)
  writeFileSync(tarballPath, buffer)
  extract(tarballPath, dir)
  rmSync(tarballPath, { force: true })

  const provenance = {
    name: meta.name,
    version: resolved,
    spec,
    registry: 'https://registry.npmjs.org',
    tarball: tarballUrl,
    integrity: meta.dist?.integrity,
    integrityVerified: integrity.ok,
    fetchedAt: new Date().toISOString(),
    dir: flatName(packageName),
    license: meta.license,
    description: meta.description,
    repository: meta.repository?.url,
    homepage: meta.homepage,
    deprecated: meta.deprecated,
    fileCount: meta.dist?.fileCount,
    unpackedSize: meta.dist?.unpackedSize,
    nodeEngines: meta.engines,
    dsh: meta.dsh,
    peerDependencies: meta.peerDependencies,
    dependencies: meta.dependencies,
    publishedAt: meta._npmOperationalInternal === undefined ? undefined : meta.time,
    maintainers: meta.maintainers?.map((m) => m.name),
  }
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`)
  console.log(`已归入 ${dir}`)

  index.entries = index.entries.filter((entry) => entry.name !== meta.name)
  index.entries.push({ name: meta.name, version: resolved, license: meta.license, fileCount: meta.dist?.fileCount, dir: flatName(packageName), integrityVerified: integrity.ok, fetchedAt: provenance.fetchedAt })
  index.entries.sort((left, right) => left.name.localeCompare(right.name))
}

writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
console.log(`\nvendor 汇总已更新：${join(outDir, 'index.json')}`)
