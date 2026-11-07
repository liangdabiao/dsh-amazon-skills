// 写技能快照 manifest（快照本体由 scripts/vendor-skills.mjs 用 bash cp 复制——见文件头注释）。
// 用法：node scripts/vendor-manifest.mjs
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dst = join(root, 'skills')

const names = readdirSync(dst, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(dst, d.name, 'SKILL.md')))
  .map((d) => d.name)
  .sort()

if (names.length === 0) {
  console.error('[manifest] 没有发现任何技能（先复制快照）')
  process.exit(1)
}

let total = 0
for (const name of names) total = dirSize(join(dst, name), total)
function dirSize(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    acc += entry.isFile() ? statSync(p).size : 0
    if (entry.isDirectory()) acc = dirSize(p, acc)
  }
  return acc
}

writeFileSync(
  join(dst, 'manifest.json'),
  JSON.stringify(
    {
      source: 'Amazon-Skills-Liang（上游 nexscope-ai/Amazon-Skills）',
      license: 'MIT — 见 skills/LICENSE（Copyright (c) 2026 Nexscope AI），本插件保留其声明',
      vendoredAt: new Date().toISOString(),
      skillCount: names.length,
      totalBytes: total,
      excluded: ['banner.png'],
      note: '快照随 dsh 插件分发；更新：bash 复制上游 skills/ 后运行本脚本',
      skills: names,
    },
    null,
    2,
  ),
)
console.log(`[manifest] ${names.length} 个技能，共 ${(total / 1024).toFixed(0)} KB`)
