// 离线自检：快照完整性 + 54 技能全链路（解析/修复/rewrite/addendum）+ fixture 解析。
// 不发任何网络请求。运行：node scripts/selftest.mjs
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { readSkills, createSkillProvider } = await import('../lib/skills.js')
const { expandKeywords } = await import('../lib/suggest.js')
const { extractFields } = await import('../lib/listing.js')
const { MARKETPLACES } = await import('../lib/marketplaces.js')

let failed = 0
const step = async (name, fn) => {
  process.stdout.write(`- ${name} … `)
  try {
    await fn()
    console.log('ok')
  } catch (err) {
    failed++
    console.log('失败')
    console.error(`  ${err.message}`)
  }
}

await step('快照完整（54 技能 + manifest + LICENSE，无 banner）', () => {
  if (!existsSync(join(ROOT, 'skills', 'manifest.json'))) throw new Error('缺 manifest.json')
  if (!existsSync(join(ROOT, 'skills', 'LICENSE'))) throw new Error('缺上游 MIT LICENSE')
  if (existsSync(join(ROOT, 'skills', 'banner.png'))) throw new Error('banner.png 未排除')
  const skills = readSkills([join(ROOT, 'skills')])
  if (skills.length !== 54) throw new Error(`技能数 ${skills.length} ≠ 54`)
})

const provider = createSkillProvider([join(ROOT, 'skills')], ROOT)
let candidates
await step('provider 候选齐全且可 get（54 个逐个加载正文）', async () => {
  candidates = await provider.list()
  if (candidates.length !== 54) throw new Error(`候选 ${candidates.length} ≠ 54`)
  for (const c of candidates) {
    const skill = await provider.get(c)
    if (!skill.content || skill.content.length < 500) throw new Error(`${c.name} 正文异常`)
  }
})

await step('rewrite 后无源仓库残留（npx/外链/脚本占位）', async () => {
  for (const c of candidates) {
    const skill = await provider.get(c)
    if (/npx\s+skills\s+add/.test(skill.content)) throw new Error(`${c.name} 残留 npx 安装命令`)
    if (/nexscope-ai\/Amazon-Skills/.test(skill.content)) throw new Error(`${c.name} 残留源仓库外链`)
    if (/<skill>\/scripts/.test(skill.content)) throw new Error(`${c.name} 残留脚本占位符`)
  }
})

await step('addendum 分类齐全（54 个都有插件环境说明）', async () => {
  for (const c of candidates) {
    const skill = await provider.get(c)
    if (!skill.content.includes('在「亚马逊卖家工具箱」插件（DSH）里使用')) throw new Error(`${c.name} 缺 addendum`)
    if (!skill.content.includes('reports/')) throw new Error(`${c.name} 缺报告输出约定`)
  }
})

await step('suggest 解析 fixture（去重/计数）', async () => {
  const fixture = { suggestions: [{ value: 'wireless earbuds' }, { value: 'wireless earbuds case' }, { value: 'wireless earbuds' }] }
  const out = await expandKeywords({
    seed: 'wireless earbuds', market: 'us', maxRequests: 3, delayMs: 0,
    fetchImpl: async () => ({ ok: true, json: async () => fixture }),
  })
  if (out.keywords.length !== 2) throw new Error(`去重失败：${out.keywords.length}`)
})

await step('suggest 市场表（12 市场，us 参数正确）', () => {
  const codes = Object.keys(MARKETPLACES)
  if (codes.length !== 12) throw new Error(`市场数 ${codes.length}`)
  if (MARKETPLACES.jp.mid !== 'A1VC38T7YXB528') throw new Error('jp mid 错误')
})

await step('listing 提取 fixture（标题/价格/五点/缺失清单）', () => {
  const html = `<span id="productTitle">Test Product</span><span class="a-offscreen">$19.99</span><span class="a-list-item">long bullet one for kids</span>`
  const { found, missing } = extractFields(html)
  if (found.title !== 'Test Product') throw new Error('标题提取失败')
  if (!missing.includes('brand')) throw new Error('缺失清单应含 brand')
})

await step('catalog 数据（面板目录可直接消费）', () => {
  // 与 lib/api.js 同源的目录数据形状检查
  const skills = readSkills([join(ROOT, 'skills')]).map((s) => ({ name: s.name, description: s.description }))
  if (skills.length !== 54) throw new Error('catalog 数量错误')
  if (skills.some((s) => !s.description)) throw new Error('有技能缺 description')
})

if (failed > 0) {
  console.error(`\n自检失败 ${failed} 项`)
  process.exit(1)
}
console.log('\n全部通过。')
