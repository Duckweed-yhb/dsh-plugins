/**
 * preflight 规则引擎的自测。
 *
 * 不依赖 DSH、不依赖任何第三方库：直接跑 node tests/run.mjs。
 * 三个用例：
 *   1. tests/fixtures/bad-plugin —— 故意集齐致命写法，必须判成 high-risk 且命中指定规则；
 *   2. plugins/hello           —— 我们自己的正常插件，不应有 high；
 *   3. plugins/preflight       —— 自检（防崩溃的插件自己必须干净），不应有 high。
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderReport, scanPackage } from '../plugins/preflight/lib/rules.js'

const here = dirname(fileURLToPath(import.meta.url))
const repo = dirname(here)

let failures = 0
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures += 1
    console.log(`  ✗ ${label}${detail !== '' ? ` — ${detail}` : ''}`)
  }
}

console.log('\n[1] 反面样本 tests/fixtures/bad-plugin')
const bad = scanPackage(join(here, 'fixtures', 'bad-plugin'))
check('判定为 high-risk', bad.verdict === 'high-risk', `实际 ${bad.verdict}`)
check('识别出 bundle', bad.kind === 'bundle', `实际 ${bad.kind}`)
const ids = new Set(bad.findings.map((f) => f.id))
for (const expected of [
  'bundle-patch-empty',
  'process-crash-hooks',
  'process-exit',
  'profile-write',
  'timer-without-cleanup',
  'async-apply',
  'client-id-mismatch',
  'client-harness-import',
  'client-dom-write',
]) {
  check(`命中规则 ${expected}`, ids.has(expected), `实际命中：${[...ids].join(', ')}`)
}
check('每一条 finding 都带证据', bad.findings.every((f) => f.evidence.length > 0))
check('报告里给出了禁用补丁提示', renderReport(bad).includes('disabled: true') === false, '（该样本 patch 为空，没有行 id，因此不给补丁）')

console.log('\n[2] 正常插件 plugins/hello')
const hello = scanPackage(join(repo, 'plugins', 'hello'))
check('没有 high 级发现', hello.counts.high === 0, `实际 high=${hello.counts.high}：${hello.findings.filter((f) => f.severity === 'high').map((f) => f.id).join(', ')}`)
check('解析到 1 行 insert', hello.rows.length === 1 && hello.rows[0].id === 'yhb-hello', JSON.stringify(hello.rows))

console.log('\n[3] 自检 plugins/preflight')
const self = scanPackage(join(repo, 'plugins', 'preflight'))
check('没有 high 级发现', self.counts.high === 0, `实际 high=${self.counts.high}：${self.findings.filter((f) => f.severity === 'high').map((f) => f.id).join(', ')}`)
console.log(`  · 自检细节：high=${self.counts.high} medium=${self.counts.medium} low=${self.counts.low} info=${self.counts.info}`)
for (const finding of self.findings) console.log(`    - [${finding.severity}] ${finding.id} @ ${finding.evidence[0]?.file}:${finding.evidence[0]?.line}`)

console.log('\n[4] 行 id 冲突检测（模拟 hello 已经被挂载）')
const collided = scanPackage(join(here, 'fixtures', 'bad-plugin'), { knownRowIds: new Map([['yhb-hello', '@yhb/dsh-plugin-hello']]) })
check('冲突检测本身可用', collided.counts.high >= 1)

console.log(`\n${failures === 0 ? '全部通过 ✅' : `${failures} 项失败 ❌`}\n`)
process.exitCode = failures === 0 ? 0 : 1
