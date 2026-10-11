/**
 * 插件预检规则引擎（纯 Node，不依赖任何 DSH 包）。
 *
 * 目的：在一个 DSH 插件被 DSH 装载之前，静态读取它的清单、patch、Host 半区与浏览器半区
 * 代码，找出**已知会让 DSH 崩溃、起不来或破坏 profile** 的模式，给出风险等级、证据行和
 * 处置建议。
 *
 * 两条重要的自我约束：
 * 1. 本文件只做只读扫描（readFileSync + 正则），不写文件、不起定时器、不发网络请求、
 *    不注册任何进程级钩子——因为“防崩溃的插件”自己绝不能成为崩溃源。
 * 2. 规则是**启发式**的：命中的是“值得人工看一眼的地方”，不是定罪。所以每条都给出
 *    证据位置，并明确标注严重度的含义。
 *
 * 严重度含义：
 * - high   ：官方文档里明确会导致「终止启动 / 致命退出」或直接破坏 profile 的写法。
 * - medium ：有条件才会出事（无清理的定时器、脱离 apply 的异步、被禁用的客户端依赖…），
 *            或需要人工确认的高风险能力。
 * - low    ：稳健性/规范问题，通常不致命。
 * - info   ：提示。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

/** 扫描上限，防止把大包读爆内存。 */
export const DEFAULT_CAPS = {
  /** 单个包最多读多少个 JS 文件。 */
  maxFiles: 60,
  /** 单个文件最多读多少字节（超出只读头部，仍能命中大部分规则）。 */
  maxBytesPerFile: 256 * 1024,
  /** 单个包最多读多少字节。 */
  maxTotalBytes: 4 * 1024 * 1024,
}

/** 覆盖这些行 id 等于把官方关键行顶掉，其中前两个是 Web 的 required 条目。 */
export const CRITICAL_ROW_IDS = new Set([
  'modules',
  'connection',
  'tools',
  'session',
  'system-prompt',
  'agent',
  'agent-loop',
  'web-runtime',
  'web-startup',
])

/** 允许被 require 的 Harness 客户端包（作者手册只放行这些基线模块）。 */
const ALLOWED_CLIENT_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/dsh-client-ui-slots',
])

/**
 * 扫描前把「注释」和「正则字面量」里的字符抹成空格，字符串字面量保留。
 *
 * 为什么需要：
 * - 注释里写 `process.exit()` 只是文档，不该判成高危；
 * - 本文件自己就包含大量规则正则，如果不抹掉正则字面量，扫描自己时会命中自己（自指误报）。
 * - 字符串字面量必须保留，因为好几条规则要看字符串内容（`process.on('unhandledRejection')`、
 *   `require('@deepseek-ai/...')`、`load({ id: '...' })`）。
 *
 * 换行符原样保留，因此行号与原文一一对应，证据行可以直接回原文取。
 *
 * @param text - 原始文件内容。
 * @returns 长度与行数与原文一致、但注释与正则字面量已被抹白的文本。
 */
export function stripCommentsAndRegex(text) {
  const out = []
  const blank = (count) => {
    for (let n = 0; n < count; n++) out.push(' ')
  }
  let i = 0
  let lastSig = ''
  let lastWord = ''
  const REGEX_ALLOWED_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>'])
  const REGEX_ALLOWED_WORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await', 'case'])
  const wordChar = /[\w$]/

  while (i < text.length) {
    const c = text[i]
    const d = text[i + 1]

    // 字符串字面量：原样保留（含换行）
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      out.push(c)
      i++
      while (i < text.length) {
        const ch = text[i]
        if (ch === '\\') {
          out.push(ch, text[i + 1] ?? '')
          i += 2
          continue
        }
        out.push(ch)
        i++
        if (ch === quote) break
      }
      lastSig = quote
      lastWord = ''
      continue
    }

    // 行注释
    if (c === '/' && d === '/') {
      while (i < text.length && text[i] !== '\n' && text[i] !== '\r') {
        out.push(' ')
        i++
      }
      continue
    }

    // 块注释
    if (c === '/' && d === '*') {
      out.push('  ')
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out.push(text[i] === '\n' || text[i] === '\r' ? text[i] : ' ')
        i++
      }
      out.push('  ')
      i += 2
      continue
    }

    // 正则字面量（用「上一个有效字符/关键字」判断这里是除法还是正则）
    if (c === '/' && (REGEX_ALLOWED_AFTER.has(lastSig) || REGEX_ALLOWED_WORDS.has(lastWord))) {
      out.push(' ')
      i++
      let inClass = false
      while (i < text.length) {
        const ch = text[i]
        if (ch === '\\') {
          blank(2)
          i += 2
          continue
        }
        if (ch === '\n' || ch === '\r') break
        if (ch === '[') inClass = true
        else if (ch === ']') inClass = false
        else if (ch === '/' && !inClass) {
          blank(1)
          i++
          break
        }
        blank(1)
        i++
      }
      // 吃掉 flags
      while (i < text.length && /[a-z]/i.test(text[i])) {
        blank(1)
        i++
      }
      lastSig = ')'
      lastWord = ''
      continue
    }

    out.push(c)
    if (!/\s/.test(c)) {
      lastSig = c
      if (wordChar.test(c)) lastWord += c
      else lastWord = ''
    }
    i++
  }
  return out.join('')
}

/**
 * 在「已抹白注释与正则」的文本上，再把**字符串字面量的内容**抹白。
 *
 * 为什么需要（来自一次真实误报）：`dsh-plugin-gate` 的 `lib/rules.js` 把
 * `child_process.exec(...)` 写在**规则说明字符串**里，我原来的扫描只看"注释+正则"是否抹白，
 * 于是把这段文档文本判成了 high "启动外部进程"——两个高危全假。
 * 所以：**纯代码形态的规则**（能不能起进程、有没有 process.exit、定时器、动态求值…）
 * 应当在"字符串也抹白"的文本上匹配；而**本来就要看字符串内容**的规则
 * （`process.on('unhandledRejection')`、`require('@deepseek-ai/...')`、写 `cordis.patch.yml`…）
 * 保留字符串。规则用 `strings: 'ignore'` 声明自己属于前者。
 *
 * @param text - stripCommentsAndRegex 的结果。
 * @returns 字符串内容被抹成空格、长度与行数不变的文本。
 */
export function stripStringLiterals(text) {
  const out = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      out.push(' ')
      i++
      while (i < text.length) {
        const ch = text[i]
        if (ch === '\\') {
          out.push(' ')
          if (text[i + 1] !== undefined) out.push(' ')
          i += 2
          continue
        }
        if (ch === '\n' || ch === '\r') {
          // 未闭合的模板字符串：保留换行，行号不漂移
          out.push(ch)
          i++
          continue
        }
        out.push(' ')
        i++
        if (ch === quote) break
      }
      continue
    }
    out.push(c)
    i++
  }
  return out.join('')
}

/**
 * 在「已抹白」的文本上匹配，回到「原文」取证据行。
 *
 * @param stripped - stripCommentsAndRegex / stripStringLiterals 的结果。
 * @param raw - 原始文件内容。
 * @param regex - 单行规则。
 * @param limit - 最多取几条证据。
 * @returns { line, text } 列表，text 取自原文（给人看的是真实代码）。
 */
function evidenceIn(stripped, raw, regex, limit = 4) {
  const strippedLines = stripped.split(/\r\n|[\n\r\u2028\u2029]/u)
  const rawLines = raw.split(/\r\n|[\n\r\u2028\u2029]/u)
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`)
  const hits = []
  for (let index = 0; index < strippedLines.length && hits.length < limit; index++) {
    re.lastIndex = 0
    if (re.test(strippedLines[index])) {
      hits.push({ line: index + 1, text: (rawLines[index] ?? '').trim().slice(0, 200) })
    }
  }
  return hits
}

/** 取某个片段在第几行（用于把“值不一致”这类发现定位到行）。 */
function lineOf(text, needle) {
  const index = text.indexOf(needle)
  if (index < 0) return 1
  return text.slice(0, index).split(/\r\n|[\n\r\u2028\u2029]/u).length
}

/**
 * 规则表。每条规则的作用域决定它对哪些文件生效：
 * - 'manifest'：清单/patch 级检查（由 scanPackage 直接调用 test(manifestCtx)）
 * - 'host'    ：Host 半区代码
 * - 'client'  ：浏览器半区代码
 * - 'any'     ：任意被扫描的 JS
 */
const CODE_RULES = [
  {
    id: 'process-crash-hooks',
    scope: 'any',
    severity: 'high',
    title: '注册了进程级崩溃钩子',
    why: '注册进程级崩溃钩子会改变 DSH 的致命失败语义：它会吞掉本该释放应用并退出的致命错误，让进程带病运行，也让崩溃归因失效。',
    advice: '删掉这类钩子，让 DSH 自己处理致命失败；需要观测就用 ctx.logger 或官方的通知渠道。',
    re: /process\s*\.\s*(on|once|addListener)\s*\(\s*['"`](unhandledRejection|uncaughtException|unhandledException)['"`]/,
  },
  {
    id: 'process-exit',
    scope: 'any',
    strings: 'ignore',
    severity: 'high',
    title: '直接结束宿主进程',
    why: '进程级 exit/abort 会连坐整个 DSH：用户的其他会话、未保存的会话日志、正在跑的工具一起没了。',
    advice: '插件不应该拥有结束 DSH 的权力；用错误返回或日志表达失败。',
    re: /process\s*\.\s*(exit|abort|kill)\s*\(/,
  },
  {
    id: 'child-process',
    scope: 'any',
    strings: 'ignore',
    severity: 'high',
    title: '启动外部进程',
    why: 'Host 代码在宿主进程内运行且不受工作区沙箱约束，spawn/exec 等于以你的用户权限执行任意程序；插件自带的构建脚本也会在安装时被判为待批准脚本。',
    advice: '确认你真的信任这个包；装之前先看它 spawn 了什么。',
    // 注意 `(?<![\w.])`：`regex.exec(` 是正则的方法，不是 child_process 的 exec。
    re: /(child_process|(?<![\w.])(execSync|spawnSync|execFileSync)\s*\(|(?<![\w.])(spawn|exec|execFile)\s*\()/,
  },
  {
    id: 'profile-write',
    scope: 'any',
    severity: 'high',
    title: '写 profile 的清单或 patch 文件',
    why: '手写 profile 的 package.json / cordis.patch.yml / pnpm-workspace.yaml 会和插件管理器的写入冲突，是“DSH 起不来”的常见原因。',
    advice: '这些文件只应由插件管理器与 Loader 写。',
    re: /(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream)\s*\([^)]{0,200}(cordis\.patch\.yml|package\.json|pnpm-workspace\.yaml|cordis\.yml)/,
  },
  {
    id: 'timer-without-cleanup',
    scope: 'any',
    strings: 'ignore',
    severity: 'medium',
    title: '定时器（需确认有清理）',
    why: '脱离 apply 生命周期的定时器在插件卸载后仍会跑，触发已释放的资源 = 未捕获异常 = 致命退出。',
    advice: '定时器必须在 apply 内创建并通过 ctx.effect / ctx.on 返回的清理函数清除。',
    re: /\b(setInterval|setTimeout)\s*\(/,
    escalate: { when: (text) => !/\b(clearInterval|clearTimeout)\s*\(/.test(text), to: 'high', note: '文件里找不到对应的 clearInterval/clearTimeout' },
  },
  {
    id: 'detached-async',
    scope: 'any',
    strings: 'ignore',
    severity: 'medium',
    title: '脱离 apply 的异步工作',
    why: '官方失败矩阵：脱离 apply() 的异步任务产生未处理 rejection 是最常见的一类「致命错误：释放应用并非零退出」。',
    advice: '把异步工作放进 apply 并在 effect 清理里等它结束/取消（AbortSignal），不要 fire-and-forget。',
    re: /(\bnew\s+Promise\s*\(|\.then\s*\(|\bqueueMicrotask\s*\(|\bvoid\s+\(?\s*async\b)/,
  },
  {
    id: 'async-apply',
    scope: 'host',
    strings: 'ignore',
    severity: 'medium',
    title: 'apply 是 async（异步 apply）',
    why: '异步 apply 抛出的异常只会在结算后暴露：required 条目会「结算后终止启动」，optional 条目则留下半挂载状态。',
    advice: '保持 apply 同步；需要异步初始化就放进 ctx.effect 并自行处理失败。',
    custom: (stripped, ctx) => evidenceIn(stripped, ctx.raw, /async\s+(function\s+)?apply\b/),
  },
  {
    id: 'dynamic-code',
    scope: 'any',
    strings: 'ignore',
    severity: 'medium',
    title: '动态求值',
    why: 'eval / new Function 让静态审查失效，也是任意代码执行的入口。',
    advice: '确认为什么需要动态代码；多数场景可以用显式分支替代。',
    re: /\beval\s*\(|\bnew\s+Function\s*\(/,
  },
  {
    id: 'global-mutation',
    scope: 'any',
    strings: 'ignore',
    severity: 'medium',
    title: '改写全局对象',
    why: '污染 globalThis 会影响同进程的其他插件，且卸载后不会恢复。',
    advice: '把状态放在插件自己的 effect 作用域里。',
    re: /(globalThis|global|window)\s*\.\s*[A-Za-z_$][\w$]*\s*=[^=]/,
  },
  {
    id: 'listener-without-disposer',
    scope: 'any',
    strings: 'ignore',
    severity: 'low',
    title: '监听/注册可能没有配套的清理',
    why: '注册了 ctx.on / addEventListener 却没有 ctx.effect 形式的清理，卸载后会残留。',
    advice: '每个注册都返回清理函数，并交给 ctx.effect 拥有。',
    re: /\bctx\s*\.\s*on\s*\(|\baddEventListener\s*\(/,
    escalate: { when: (text) => !/\bctx\s*\.\s*effect\s*\(/.test(text), to: 'medium', note: '文件里找不到 ctx.effect' },
  },
  {
    id: 'client-id-mismatch',
    scope: 'client',
    severity: 'high',
    title: '客户端模块 id 与包名不一致',
    why: 'window.__ModuleLoader__.load({ id }) 的 id 必须等于包名，否则浏览器半区挂不上去，或者会顶掉同 id 的其他模块。',
    advice: '把 load({ id }) 改成与 package.json 的 name 完全一致。',
    custom: (stripped, codeCtx) => {
      const declared = /__ModuleLoader__\s*\.\s*load\s*\(\s*\{[\s\S]{0,400}?id\s*:\s*['"`]([^'"`]+)['"`]/u.exec(codeCtx.raw)?.[1]
      if (declared === undefined) return []
      if (declared === codeCtx.packageName) return []
      return [{ line: lineOf(codeCtx.raw, declared), text: `load id = "${declared}"，包名 = "${codeCtx.packageName ?? '(未知)'}"` }]
    },
  },
  {
    id: 'client-missing-wrapper',
    scope: 'client',
    severity: 'high',
    title: '浏览器半区不是 ModuleLoader 工厂格式',
    why: 'DSH 只认 window.__ModuleLoader__.load({ id, factory }) 这种已打包格式；写成普通 ESM 会在页面里加载失败。',
    advice: '按 templates/decoration/client.js 的形式手写工厂包装。',
    custom: (text) => (text.includes('__ModuleLoader__') ? [] : [{ line: 1, text: '（文件中没有出现 __ModuleLoader__）' }]),
  },
  {
    id: 'client-harness-import',
    scope: 'client',
    severity: 'medium',
    title: 'require 了 Harness 客户端包',
    why: '官方明确禁止：这些包随时会变，且一个抛异常的组件会让整个槽位条目崩掉（控制台 slot entry crashed）。',
    advice: '只 require react / react/jsx-runtime 与 slots 这类基线模块，其他控件自己画。',
    re: /require\s*\(\s*['"`]@deepseek-ai\/dsh-client-[^'"`]*['"`]/,
    custom: (stripped, ctx) => evidenceIn(stripped, ctx.raw, /require\s*\(\s*['"`](@deepseek-ai\/[^'"`]*|react[^'"`]*)['"`]/)
      .filter((hit) => {
        const spec = /['"`]([^'"`]+)['"`]/.exec(hit.text)?.[1] ?? ''
        return !ALLOWED_CLIENT_MODULES.has(spec)
      }),
  },
  {
    id: 'client-dom-write',
    scope: 'client',
    strings: 'ignore',
    severity: 'medium',
    title: '直接操作页面 DOM',
    why: '在组件外写 DOM、替换应用根节点或写 document.body，会和 DSH 的渲染与主题机制打架。',
    advice: '渲染只走槽位；样式用主题令牌，不要往 body 追加节点。',
    re: /document\s*\.\s*(body|documentElement|write)\b/,
  },
  {
    id: 'unhandled-rejection-listeners',
    scope: 'any',
    severity: 'medium',
    title: '自行安装 error/unhandledRejection 监听',
    why: '在 window 或全局注册错误监听并吞掉错误，会让页面看起来正常但状态已坏。',
    advice: '交给框架；插件只处理自己知道的失败。',
    re: /addEventListener\s*\(\s*['"`](error|unhandledrejection)['"`]/,
  },
]

/** 清单级规则：ctx = { manifest, dir, patch, patchPath, clientEntry, hostEntry, fileTexts }。 */
const MANIFEST_RULES = [
  {
    id: 'manifest-identity',
    severity: 'high',
    title: '清单缺少 name/version',
    why: '插件管理器与 Loader 都靠包名定位这一行；缺失会让安装/启用失败。',
    advice: '补上非空的 name 与 version。',
    test: (ctx) => (typeof ctx.manifest?.name === 'string' && ctx.manifest.name.length > 0 && typeof ctx.manifest?.version === 'string' && ctx.manifest.version.length > 0 ? [] : [{ line: 1, text: 'package.json 缺少 name 或 version' }]),
  },
  {
    id: 'host-entry-missing',
    severity: 'high',
    title: '找不到 Host 半区入口',
    why: 'Loader 要 import 包的主入口；入口不存在 = 条目直接加载失败。',
    advice: '在 exports["."] 或 main 里指向一个真实存在的 JS 文件。',
    test: (ctx) => (ctx.hostEntry === undefined ? [{ line: 1, text: 'exports["."] / main 未指向存在的文件' }] : []),
  },
  {
    id: 'bundle-patch-empty',
    severity: 'high',
    title: 'bundle patch 为空或只有注释',
    why: '官方文档：空文件或仅含注释的 patch 会导致启动失败。',
    advice: '写成 `- insert: [...]` 的合法数组，或者干脆不要声明 dsh.bundle.patch。',
    test: (ctx) => (ctx.patch === undefined ? [] : ctx.patch.stripComments.trim().length === 0 ? [{ line: 1, text: 'patch 没有有效内容' }] : []),
  },
  {
    id: 'bundle-patch-missing',
    severity: 'high',
    title: 'dsh.bundle.patch 指向的文件不存在',
    why: '声明了 bundle 却读不到 patch，组合时会报错。',
    advice: '修正路径或补上文件。',
    test: (ctx) => (ctx.patchDeclared !== undefined && ctx.patch === undefined ? [{ line: 1, text: `dsh.bundle.patch = ${ctx.patchDeclared} 不存在` }] : []),
  },
  {
    id: 'bundle-patch-no-rows',
    severity: 'medium',
    title: 'patch 里没解析到任何 insert 行',
    why: '没有行就没有插件被挂载，安装会「成功但什么都没发生」。',
    advice: '确认 patch 用了 `- insert:` 且每行有 id 与 name。',
    test: (ctx) => (ctx.patch !== undefined && ctx.patch.rows.length === 0 ? [{ line: 1, text: '未匹配到 `- id:` 行' }] : []),
  },
  {
    id: 'row-id-collision',
    severity: 'high',
    title: '行 id 与已挂载的条目重名',
    why: '同 id 的 patch 会覆盖/顶掉已有那一行；如果顶掉的是官方关键行，DSH 直接起不来。',
    advice: '换一个独有的行 id。',
    test: (ctx) => ctx.collisions,
  },
  {
    id: 'row-overrides-critical',
    severity: 'high',
    title: '行 id 命中了官方关键行',
    why: 'Web 的 required 条目（modules、connection 等）失败会让 Web 无法启动。',
    advice: '不要复用这些 id；用你自己独有的名字。',
    test: (ctx) => ctx.criticalRows,
  },
  {
    id: 'client-declared-without-export',
    severity: 'high',
    title: '声明了 dsh.client 但没有 ./client 导出',
    why: '客户端模块系统按 exports["./client"] 找浏览器半区；找不到时这一行会在页面里加载失败。',
    advice: '补上 exports["./client"] 指向真实文件。',
    test: (ctx) => (ctx.manifest?.dsh?.client !== undefined && ctx.clientEntry === undefined ? [{ line: 1, text: 'dsh.client 已声明，但 exports["./client"] 缺失或文件不存在' }] : []),
  },
  {
    id: 'client-platform',
    severity: 'medium',
    title: 'dsh.client.platform 不是 web',
    why: '当前是 Web/桌面 profile，platform 不匹配的浏览器半区不会被加载。',
    advice: '把 platform 改成 web。',
    test: (ctx) => (ctx.manifest?.dsh?.client !== undefined && ctx.manifest.dsh.client.platform !== 'web' ? [{ line: 1, text: `dsh.client.platform = ${String(ctx.manifest.dsh.client.platform)}` }] : []),
  },
  {
    id: 'icon-problem',
    severity: 'low',
    title: '插件图标缺失或过大',
    why: '图标只影响插件页展示；超过 256 KiB 或越界的路径会被拒绝并产生诊断。',
    advice: '放一个 ≤256 KiB 的 SVG/PNG 并声明顶层 icon。',
    test: (ctx) => (ctx.icon === undefined ? [{ line: 1, text: 'package.json 没有声明 icon' }] : ctx.icon.tooLarge ? [{ line: 1, text: `icon 过大：${ctx.icon.bytes} 字节` }] : []),
  },
  {
    id: 'locale-missing',
    severity: 'info',
    title: '缺少展示用 locale 文件',
    why: '插件页卡片会退回用包名/description 显示，不影响功能。',
    advice: '想让它好看点就加 locale/zh.json 与 locale/en.json 的 meta.title/description。',
    test: (ctx) => (ctx.localeFiles.length === 0 ? [{ line: 1, text: '没有 locale/*.json' }] : []),
  },
]

/** 判断某个 exports 值指向的文件（支持字符串与 { default } 形式）。 */
function resolveExportTarget(dir, value) {
  if (typeof value === 'string') return join(dir, value)
  if (value && typeof value === 'object') {
    return resolveExportTarget(dir, value.default ?? value.import ?? value.require)
  }
  return undefined
}

/** 收集包内需要扫描的 JS 文件（按上限截断）。 */
function collectFiles(dir, caps) {
  const files = []
  const skip = new Set(['node_modules', '.git', '.cache', 'dist', 'coverage'])
  const walk = (current, depth) => {
    if (files.length >= caps.maxFiles || depth > 4) return
    let entries
    try {
      entries = statSync(current).isDirectory() ? readdirSync(current) : []
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= caps.maxFiles) return
      if (skip.has(entry)) continue
      const full = join(current, entry)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) walk(full, depth + 1)
      else if (/\.(js|mjs|cjs)$/u.test(entry)) files.push(full)
    }
  }
  walk(dir, 0)
  return files
}

/** 读文本，超限只读头部。 */
function readText(path, caps, budget) {
  try {
    const stat = statSync(path)
    const take = Math.min(stat.size, caps.maxBytesPerFile, Math.max(0, budget.left))
    if (take <= 0) return undefined
    const buffer = readFileSync(path)
    budget.left -= Math.min(buffer.length, take)
    const text = buffer.subarray(0, take).toString('utf8')
    return { text, truncated: buffer.length > take, bytes: buffer.length }
  } catch {
    return undefined
  }
}

/** 去掉 YAML 注释，用来判断 patch 是否“实际为空”。 */
function stripYamlComments(text) {
  return text
    .split(/\r\n|[\n\r\u2028\u2029]/u)
    .map((line) => line.replace(/(^|\s)#.*$/u, ''))
    .join('\n')
    .trim()
}

/** 从 patch 文本里抓行 id 与模块名（轻量正则，不引入 YAML 解析器）。 */
function parsePatchRows(text) {
  const rows = []
  const clean = text
    .split(/\r\n|[\n\r\u2028\u2029]/u)
    .map((line) => line.replace(/(^|\s)#.*$/u, ''))
    .join('\n')
  const rowRe = /-\s*id:\s*['"]?([^\s'"#]+)['"]?([\s\S]*?)(?=\n\s*-\s*id:|\n\s*-\s*(?:insert|override|config|disabled)|$)/gu
  let match
  while ((match = rowRe.exec(clean)) !== null) {
    const [, id, rest] = match
    const name = /name:\s*['"]?([^\s'"#]+)['"]?/u.exec(rest)?.[1]
    rows.push({ id, name })
  }
  return rows
}

/**
 * 从声明的入口出发，沿**相对** import/require 走一遍，得到"真正会被加载的文件"集合。
 *
 * 为什么需要（来自一次真实的噪声反馈）：`@linxin666/dsh-pet` 把 `lib/types` 下的 js
 * 以未打包源码副本的形式一起发布，而 `exports` 并不暴露它们 → 同一段逻辑在
 * `lib/client.js` 与 `lib/types/client/*.js` 里各出现一次，我的报告因此把每条都算两遍。
 * 只跟着相对说明符走，是为了不误判——第三方包名解析不了，硬猜会漏掉真代码。
 *
 * @param rootDir - 包目录。
 * @param entries - 声明的入口文件绝对路径。
 * @param maxFiles - 最多跟多少个文件。
 * @returns 绝对路径集合（含入口本身）。
 */
function walkRelativeImports(rootDir, entries, maxFiles) {
  const seen = new Set()
  const queue = entries.filter((entry) => typeof entry === 'string')
  const specRe = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/gu
  while (queue.length > 0 && seen.size < maxFiles) {
    const file = queue.shift()
    const absolute = resolve(file)
    if (seen.has(absolute) || !existsSync(absolute)) continue
    seen.add(absolute)
    let text
    try {
      if (statSync(absolute).size > 512 * 1024) continue
      text = readFileSync(absolute, 'utf8')
    } catch {
      continue
    }
    for (const match of text.matchAll(specRe)) {
      const base = resolve(dirname(absolute), match[1])
      for (const candidate of [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, join(base, 'index.js'), join(base, 'index.mjs')]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          queue.push(candidate)
          break
        }
      }
    }
  }
  return seen
}

/**
 * 扫描一个插件包目录。
 *
 * @param dir - 包目录（含 package.json）的绝对路径。
 * @param options - { knownRowIds: Map<rowId, moduleName|undefined>, caps }
 * @returns 结构化报告。
 */
export function scanPackage(dir, options = {}) {
  const caps = { ...DEFAULT_CAPS, ...(options.caps ?? {}) }
  const target = resolve(dir)
  const findings = []
  const push = (finding) => findings.push(finding)

  // ---- 清单 ----
  const manifestPath = join(target, 'package.json')
  let manifest
  let manifestError
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      manifestError = String(error)
    }
  } else {
    manifestError = 'package.json 不存在'
  }
  if (manifestError !== undefined) {
    return {
      target,
      name: undefined,
      version: undefined,
      kind: 'unknown',
      verdict: 'high-risk',
      counts: { high: 1, medium: 0, low: 0, info: 0 },
      findings: [{
        id: 'manifest-unreadable',
        severity: 'high',
        title: '读不到插件清单',
        why: '没有合法 package.json 就不是一个可安装的插件包。',
        advice: '确认路径指向包目录本身。',
        evidence: [{ line: 1, text: manifestError }],
      }],
      rows: [],
      filesScanned: [],
    }
  }

  // ---- 入口 ----
  const hostEntry = resolveExportTarget(target, manifest.exports?.['.']) ?? (manifest.main !== undefined ? join(target, manifest.main) : undefined)
  const hostEntryExists = hostEntry !== undefined && existsSync(hostEntry)
  const clientEntryRaw = resolveExportTarget(target, manifest.exports?.['./client'])
  const clientEntryExists = clientEntryRaw !== undefined && existsSync(clientEntryRaw)

  // ---- patch ----
  const patchDeclared = manifest.dsh?.bundle?.patch
  let patch
  if (typeof patchDeclared === 'string' && existsSync(join(target, patchDeclared))) {
    const raw = readFileSync(join(target, patchDeclared), 'utf8')
    patch = { path: join(target, patchDeclared), text: raw, stripComments: stripYamlComments(raw), rows: parsePatchRows(raw) }
  }

  // ---- 图标 / locale ----
  let icon
  if (typeof manifest.icon === 'string') {
    const iconPath = join(target, manifest.icon)
    if (existsSync(iconPath)) {
      const bytes = statSync(iconPath).size
      icon = { path: iconPath, bytes, tooLarge: bytes > 256 * 1024 }
    }
  }
  const localeFiles = ['locale/zh.json', 'locale/en.json'].filter((p) => existsSync(join(target, p)))

  // ---- 行 id 冲突 ----
  const knownRowIds = options.knownRowIds ?? new Map()
  const collisions = []
  const criticalRows = []
  for (const row of patch?.rows ?? []) {
    const owner = knownRowIds.get(row.id)
    const sameModule = typeof owner === 'string' && typeof row.name === 'string' && owner === row.name
    if (owner !== undefined && !sameModule) {
      collisions.push({ line: 1, text: `行 id "${row.id}" 已被 ${owner} 占用` })
    }
    if (CRITICAL_ROW_IDS.has(row.id)) criticalRows.push({ line: 1, text: `行 id "${row.id}" 是官方关键行` })
  }

  // ---- 清单规则 ----
  const manifestCtx = {
    manifest,
    dir: target,
    patch,
    patchDeclared,
    hostEntry: hostEntryExists ? hostEntry : undefined,
    clientEntry: clientEntryExists ? clientEntryRaw : undefined,
    icon,
    localeFiles,
    collisions,
    criticalRows,
  }
  for (const rule of MANIFEST_RULES) {
    const hits = rule.test(manifestCtx) ?? []
    if (hits.length > 0) {
      push({ id: rule.id, severity: rule.severity, title: rule.title, why: rule.why, advice: rule.advice, evidence: hits })
    }
  }

  // ---- 代码扫描 ----
  const collected = collectFiles(target, caps)
  const budget = { left: caps.maxTotalBytes }
  const filesScanned = []
  const roles = new Map()
  if (hostEntryExists) roles.set(resolve(hostEntry), 'host')
  if (clientEntryExists) roles.set(resolve(clientEntryRaw), 'client')

  // 只审"入口可达图"上的文件：未被打包/未导出、也没被入口相对引入的 .js 通常是
  // 源码副本或死代码，重复计入只会制造噪声（真实案例见 walkRelativeImports 注释）。
  const declaredEntries = [hostEntryExists ? hostEntry : undefined, clientEntryExists ? clientEntryRaw : undefined]
    .filter((entry) => typeof entry === 'string')
  const hasDeclaredEntry = declaredEntries.length > 0
  const reachable = hasDeclaredEntry ? walkRelativeImports(target, declaredEntries, Math.max(caps.maxFiles, 40)) : new Set()
  const files = hasDeclaredEntry && reachable.size > 0
    ? collected.filter((file) => reachable.has(resolve(file)))
    : collected
  const skippedUndeclared = collected.length - files.length

  for (const file of files) {
    const read = readText(file, caps, budget)
    if (read === undefined) continue
    const role = roles.get(resolve(file)) ?? (file.endsWith(`${sep}client.js`) || file.endsWith('/client.js') ? 'client' : 'any')
    filesScanned.push({ path: relative(target, file), role, bytes: read.bytes, truncated: read.truncated })
    const stripped = stripCommentsAndRegex(read.text)
    const strippedNoStrings = stripStringLiterals(stripped)
    const isBundle = /__ModuleLoader__\s*\.\s*load\s*\(/.test(stripped)
    const codeCtx = { raw: read.text, packageName: manifest.name, file, role, relPath: relative(target, file) }
    for (const rule of CODE_RULES) {
      if (rule.scope !== 'any' && rule.scope !== role) continue
      const haystack = rule.strings === 'ignore' ? strippedNoStrings : stripped
      const hits = rule.custom !== undefined ? rule.custom(haystack, codeCtx) : evidenceIn(haystack, read.text, rule.re)
      if (hits.length === 0) continue
      let severity = rule.severity
      let note = rule.note
      if (rule.escalate !== undefined && rule.escalate.when(haystack)) {
        severity = rule.escalate.to
        note = rule.escalate.note
      }
      push({
        id: rule.id,
        severity,
        title: rule.title,
        why: rule.why,
        advice: rule.advice,
        note,
        bundle: isBundle ? true : undefined,
        evidence: hits.map((hit) => ({ ...hit, file: relative(target, file) })),
      })
    }
  }

  // ---- 判定 ----
  const counts = { high: 0, medium: 0, low: 0, info: 0 }
  for (const finding of findings) counts[finding.severity] += 1
  const verdict = counts.high > 0 ? 'high-risk' : counts.medium > 0 ? 'caution' : 'ok'
  const kind = patch !== undefined ? 'bundle' : manifest.dsh?.client !== undefined ? 'ui-plugin' : 'host-plugin'

  return {
    target,
    name: manifest.name,
    version: manifest.version,
    kind,
    verdict,
    counts,
    findings: findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    rows: patch?.rows ?? [],
    filesScanned,
    filesSkipped: skippedUndeclared,
  }
}

/** 严重度排序权重。 */
function severityRank(severity) {
  return { high: 0, medium: 1, low: 2, info: 3 }[severity] ?? 9
}

/** 把报告渲染成给人和模型看的 markdown。 */
export function renderReport(report, options = {}) {
  const head = `### 预检结果：${report.name ?? '(未知包名)'}${report.version !== undefined ? ` @ ${report.version}` : ''}`
  const lines = [head, '']
  const badge = { ok: '✅ 通过', caution: '⚠️ 需要留意', 'high-risk': '⛔ 高风险' }[report.verdict] ?? report.verdict
  lines.push(`- 结论：**${badge}**（high ${report.counts.high} / medium ${report.counts.medium} / low ${report.counts.low} / info ${report.counts.info}）`)
  lines.push(`- 目录：\`${report.target}\``)
  lines.push(`- 类型：${report.kind}${report.rows.length > 0 ? `；插入 ${report.rows.length} 行：${report.rows.map((r) => `\`${r.id}\``).join('、')}` : ''}`)
  if (options.filesScanned !== false) {
    lines.push(`- 已扫描：${report.filesScanned.length} 个 JS 文件${report.filesScanned.some((f) => f.truncated) ? '（部分文件超限只读了头部）' : ''}`)
  }
  if (report.filesSkipped > 0) {
    lines.push(`- 跳过：${report.filesSkipped} 个不在入口可达图上的 JS 文件（多为未被 \`exports\` 暴露的源码副本或死代码，**未审阅**）`)
  }
  lines.push('')
  if (report.findings.length === 0) {
    lines.push('没有命中任何已知风险模式。注意：这是静态启发式检查，不能替代真机试跑。')
  }
  for (const finding of report.findings) {
    lines.push(`#### [${finding.severity}] ${finding.title}`)
    lines.push(`- 为什么危险：${finding.why}`)
    if (finding.note !== undefined) lines.push(`- 本包情况：${finding.note}`)
    for (const hit of finding.evidence.slice(0, 4)) {
      lines.push(`  - \`${hit.file ?? 'package.json'}:${hit.line}\` ${hit.text}`)
    }
    if (finding.bundle === true) lines.push('- 注：该文件是打包产物，命中项可能来自被内联的第三方依赖。')
    lines.push(`- 建议：${finding.advice}`)
    lines.push('')
  }
  const risky = report.findings.filter((f) => f.severity === 'high' || f.severity === 'medium')
  if (risky.length > 0 && report.rows.length > 0) {
    lines.push('#### 想先禁用再说的话，把这段写进 profile 的 `cordis.patch.yml`（或用侧栏插件页关掉对应行）')
    lines.push('```yaml')
    for (const row of report.rows) {
      lines.push(`- id: ${row.id}`)
      if (row.name !== undefined) lines.push(`  name: ${row.name}`)
      lines.push('  disabled: true')
    }
    lines.push('```')
  }
  return lines.join('\n')
}
