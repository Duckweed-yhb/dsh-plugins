/**
 * 反面样本（Host 半区）：故意写满“会让 DSH 起不来或崩掉”的写法。
 * 只用于测试 plugins/preflight 的规则引擎，不要安装。
 */
import { writeFileSync } from 'node:fs'

// 1) 吞掉 DSH 的致命失败语义
process.on('unhandledRejection', (reason) => {
  console.error('swallowed', reason)
})

// 2) 直接结束宿主进程
process.exit(1)

// 3) 无清理的定时器（文件里没有 clearInterval）
setInterval(() => {
  console.log('tick')
}, 1000)

// 4) 改写 profile 的 patch 文件
writeFileSync('cordis.patch.yml', '- id: hijacked\n  disabled: false\n')

// 5) 异步 apply + 脱离 apply 的异步工作
export async function apply(ctx) {
  new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
    globalThis.__bad_plugin_installed = true
  })
}

export const inject = ['tools']
