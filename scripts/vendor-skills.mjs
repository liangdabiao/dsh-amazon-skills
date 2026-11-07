// 技能快照 vendor：把上游 Amazon-Skills 仓库的 skills/ 复制进本插件（guizang 模式）。
// ⚠️ 两步操作（不要合并）：本会话沙箱会静默杀掉 node 的 cpSync 大目录复制（exit 127 无输出），
// 因此复制用 bash：cp -r "<上游>/skills" skills && rm -f skills/banner.png
// 然后写 manifest：node scripts/vendor-manifest.mjs
// 本文件保留作为步骤说明；如上游更新，重复上述两步。

import { cpSync, existsSync, readdirSync, statSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = process.argv[2] || 'D:/dsh-research/资料/Amazon-Skills-Liang-main/skills'
const dst = join(root, 'skills')

if (!existsSync(src)) {
  console.error(`[vendor] 上游目录不存在：${src}`)
  process.exit(1)
}

// 全量覆盖前清掉旧快照（保留本插件自己的说明文件不存在——skills/ 整体都是快照）
rmSync(dst, { recursive: true, force: true })
cpSync(src, dst, { recursive: true })

// 排除大图与源仓库级杂物（banner 7.35MB 占 93% 体积）
const EXCLUDE = ['banner.png']
for (const name of EXCLUDE) rmSync(join(dst, name), { force: true })

// 校验：每个技能目录必须含 SKILL.md；统计体积
const names = readdirSync(dst, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(dst, d.name, 'SKILL.md')))
  .map((d) => d.name)
  .sort()

if (names.length === 0) {
  console.error('[vendor] 没有发现任何技能（SKILL.md 缺失？）')
  process.exit(1)
}

let total = 0
for (const name of names) {
  total = dirSize(join(dst, name), total)
}
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
      excluded: EXCLUDE,
      note: '快照随 dsh 插件分发；更新：node scripts/vendor-skills.mjs <上游skills目录>',
      skills: names,
    },
    null,
    2,
  ),
)

console.log(`[vendor] 已复制 ${names.length} 个技能，共 ${(total / 1024).toFixed(0)} KB（排除：${EXCLUDE.join(', ')}）`)
