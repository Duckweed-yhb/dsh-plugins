// Read an app.asar archive without any dependency. Usage:
//   node asar-tool.mjs count <asar>
//   node asar-tool.mjs list <asar> <regex> [limit]
//   node asar-tool.mjs extract <asar> <entryPath> <outFile>
import fs from 'node:fs'

const [, , cmd, asarPath, ...rest] = process.argv

function readHeader (file) {
  const fd = fs.openSync(file, 'r')
  const sizeBuf = Buffer.alloc(8)
  fs.readSync(fd, sizeBuf, 0, 8, 0)
  const headerSize = sizeBuf.readUInt32LE(4)
  const buf = Buffer.alloc(headerSize)
  fs.readSync(fd, buf, 0, headerSize, 8)
  const text = buf.toString('utf8')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('header not found')
  const header = JSON.parse(text.slice(start, end + 1))
  return { fd, header, dataOffset: 8 + headerSize }
}

let ctx
try {
  ctx = readHeader(asarPath)
} catch (err) {
  console.error('header read failed:', err.message)
  process.exit(1)
}
const { fd, header, dataOffset } = ctx

function* walk (node, prefix) {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const p = prefix ? `${prefix}/${name}` : name
    if (entry.files) yield* walk(entry, p)
    else yield { path: p, size: entry.size, offset: Number(entry.offset) }
  }
}

const all = [...walk(header, '')]

if (cmd === 'count') {
  console.log('entries:', all.length)
  const tops = new Map()
  for (const e of all) {
    const top = e.path.split('/').slice(0, 2).join('/')
    tops.set(top, (tops.get(top) ?? 0) + 1)
  }
  for (const [k, v] of [...tops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    console.log(String(v).padStart(7), k)
  }
} else if (cmd === 'list') {
  const re = new RegExp(rest[0], 'i')
  const limit = Number(rest[1] ?? 60)
  const hits = all.filter(e => re.test(e.path))
  console.log('matched:', hits.length)
  for (const h of hits.slice(0, limit)) console.log(String(h.size).padStart(9), h.path)
} else if (cmd === 'extract') {
  const target = all.find(e => e.path === rest[0])
  if (!target) { console.error('not found:', rest[0]); process.exit(1) }
  const buf = Buffer.alloc(target.size)
  fs.readSync(fd, buf, 0, target.size, dataOffset + target.offset)
  fs.writeFileSync(rest[1], buf)
  console.log('wrote', rest[1], target.size)
} else {
  console.error('unknown command')
  process.exit(1)
}
