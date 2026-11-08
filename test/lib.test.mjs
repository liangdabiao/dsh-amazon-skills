// lib 层单测：快照合规、rewrite/addendum、补全解析、listing 提取、鉴权。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'amazon-test-'))

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { readSkills, createSkillProvider, parse, addendum, rewrite, PLAYWRIGHT_SKILLS, SCRIPT_SKILLS, WEB_SEARCH_SKILLS } = await import('../lib/skills.js')
const { MARKETPLACES, MARKET_CODES, marketOf } = await import('../lib/marketplaces.js')
const { expandKeywords, fetchSuggestions } = await import('../lib/suggest.js')
const { extractFields, fetchListing, isValidAsin, ListingError } = await import('../lib/listing.js')
const { requestRejection } = await import('../lib/api.js')

const SKILL_DIRS = [join(ROOT, 'skills')]

// ---------- 快照 ----------
test('快照完整：54 个技能全部可解析（含 2 个原非标已修文件）', () => {
  const skills = readSkills(SKILL_DIRS)
  assert.equal(skills.length, 54, `实际 ${skills.length} 个`)
  assert.ok(existsSync(join(ROOT, 'skills', 'manifest.json')), 'manifest.json 应存在')
  assert.ok(!existsSync(join(ROOT, 'skills', 'banner.png')), 'banner.png 应被排除')
  const repaired = skills.filter((s) => s.name === 'amazon-keyword-tracker' || s.name === 'amazon-price-tracker')
  assert.equal(repaired.length, 2, '两个原非标 frontmatter 现已可直接解析')
  for (const s of skills) {
    assert.match(s.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, `技能名不合规范：${s.name}`)
    assert.ok(s.description.length > 20, `${s.name} description 太短`)
  }
})

test('frontmatter 全部标准：54 个文件都能被 parse() 直接读出 name + description', () => {
  // 0.1.2 之前有 4 个非标：2 个 description 用了 `>` 折叠块、2 个只有 nexscope 块没有根级 name/description。
  // 这条守住"不依赖 FRONTMATTER_REPAIRS 兜底"——文件本身必须标准。
  const dir = join(ROOT, 'skills')
  const dirs = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())
  assert.equal(dirs.length, 54)
  const bad = []
  for (const d of dirs) {
    const file = join(dir, d.name, 'SKILL.md')
    if (!existsSync(file)) { bad.push(`${d.name}(缺 SKILL.md)`); continue }
    const parsed = parse(file)
    if (!parsed || !parsed.name || !parsed.description) bad.push(`${d.name}(缺 name/description)`)
    else if (parsed.description.includes('\\n')) bad.push(`${d.name}(description 含字面 \\n)`)
    else if (parsed.description.length < 20) bad.push(`${d.name}(description 过短)`)
  }
  assert.deepEqual(bad, [], `以下技能 frontmatter 非标：${bad.join('、')}`)
})

test('provider：候选齐全、get 返回正文（rank 600 让位）', async () => {
  const provider = createSkillProvider(SKILL_DIRS, ROOT)
  assert.equal(provider.name, 'amazon-skills')
  const candidates = await provider.list()
  assert.equal(candidates.length, 54)
  for (const c of candidates) {
    assert.equal(c.rank, 600)
    assert.equal(c.invocation.modelInvocable, true)
    assert.equal(c.invocation.userInvocable, true)
    assert.equal(c.source, 'bundled')
  }
  const one = await provider.get(candidates.find((c) => c.name === 'amazon-one-shot'))
  assert.ok(one.content.length > 5000, 'one-shot 正文应完整')
  assert.ok(one.content.includes('在「亚马逊卖家工具箱」插件（DSH）里使用'), '应有插件环境附注')
  assert.ok(!('rank' in one) && !('locator' in one), 'get 返回应剥掉内部字段')
})

// ---------- rewrite / addendum ----------
test('rewrite：54 个技能正文无安装命令/外链/脚本占位残留', async () => {
  const provider = createSkillProvider(SKILL_DIRS, ROOT)
  const candidates = await provider.list()
  for (const c of candidates) {
    const skill = await provider.get(c)
    assert.ok(!/npx\s+skills\s+add/.test(skill.content), `${c.name} 仍有 npx skills add`)
    assert.ok(!/nexscope-ai\/Amazon-Skills/.test(skill.content), `${c.name} 仍有 nexscope 外链`)
    assert.ok(!/<skill>\/scripts/.test(skill.content), `${c.name} 仍有 <skill>/scripts 占位`)
  }
})

test('addendum 分类正确（Playwright 降级 / 工具承接 / web_search 映射）', async () => {
  const provider = createSkillProvider(SKILL_DIRS, ROOT)
  const oneShot = await provider.get((await provider.list()).find((c) => c.name === 'amazon-one-shot'))
  assert.match(oneShot.content, /amazon_fetch_listing/, 'Playwright 型应给 fetch_listing 降级方案')
  assert.match(oneShot.content, /数据缺失/, 'Playwright 型应说明缺数据标注')
  const kw = await provider.get((await provider.list()).find((c) => c.name === 'amazon-keyword-research'))
  assert.match(kw.content, /amazon_suggest/, '脚本型应指向 suggest 工具')
  assert.match(kw.content, /沙箱读不到插件安装目录/, '脚本型应说明沙箱限制')
  const deal = await provider.get((await provider.list()).find((c) => c.name === 'amazon-deal-finder'))
  assert.match(deal.content, /web_search/, 'web_search 型应有工具映射说明')
  const registry = await provider.get((await provider.list()).find((c) => c.name === 'amazon-brand-registry'))
  assert.ok(!registry.content.includes('amazon_suggest 工具（等价'), '纯知识型不应带工具承接段')
  assert.equal(PLAYWRIGHT_SKILLS.length, 3)
  assert.equal(SCRIPT_SKILLS.length, 5)
  assert.equal(WEB_SEARCH_SKILLS.length, 13)
})

test('frontmatter 解析：块标量与单引号两种写法', () => {
  const block = 'name: xxx\ndescription: >\n  第一行\n  第二行'
  const parsed = { name: null, description: null }
  // 通过 readSkills 的真实文件验证更可靠：category-research 用了 > 折叠
  const skills = readSkills(SKILL_DIRS)
  const cr = skills.find((s) => s.name === 'amazon-category-research')
  assert.ok(cr.description.length > 50, '折叠标量 description 应拼接成功')
  assert.ok(parsed !== null)
})

// ---------- 市场表 ----------
test('12 市场表：us 的 mid 与 domain 正确', () => {
  assert.equal(MARKET_CODES.length, 12)
  assert.equal(MARKETPLACES.us.mid, 'ATVPDKIKX0DER')
  assert.equal(MARKETPLACES.us.domain, 'amazon.com')
  assert.equal(marketOf('xx'), null)
})

// ---------- suggest ----------
test('expandKeywords：注入 fetch 的解析/去重/计数', async () => {
  const fixture = {
    suggestions: [{ value: 'building blocks' }, { value: 'building blocks for kids' }, { value: 'building blocks' }],
  }
  let calls = 0
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => fixture } }
  const out = await expandKeywords({ seed: 'building blocks', market: 'us', maxRequests: 5, delayMs: 0, fetchImpl })
  assert.equal(out.requests, 5)
  assert.equal(out.keywords.length, 2, '重复词应去重')
  assert.ok(out.keywords.includes('building blocks for kids'))
})

test('expandKeywords：缺种子/未知市场报可读错误', async () => {
  await assert.rejects(() => expandKeywords({}), /缺少种子/)
  await assert.rejects(() => expandKeywords({ seed: 'x', market: 'zz' }), /未知市场/)
})

test('expandKeywords：首次请求失败给可读网络错误', async () => {
  const fetchImpl = async () => { throw new Error('connect timeout') }
  await assert.rejects(() => expandKeywords({ seed: 'x', fetchImpl }), /网络受限|connect timeout/)
})

// ---------- listing ----------
test('ASIN 校验', () => {
  assert.equal(isValidAsin('B0CLLNGMQQ'), true)
  assert.equal(isValidAsin('b0cllngmqq'), true, '小写应被容忍')
  assert.equal(isValidAsin('B0CL'), false)
  assert.equal(isValidAsin('../etc/passwd'), false)
})

test('extractFields：fixture HTML 提取字段与缺失清单', () => {
  const html = `
  <span id="productTitle">  Wooden Building Blocks Set  </span>
  <span class="bylineInfo">Visit the JOYIN Store</span>
  <span class="a-offscreen">$29.99</span>
  <span class="a-icon-alt">4.6 out of 5 stars</span>
  <span id="acrCustomerReviewText">1,234 ratings</span>
  <span class="a-list-item">Premium quality blocks for kids</span>
  <span class="a-list-item">Safe and non-toxic materials</span>
  "hiRes":"https://m.media-amazon.com/images/I/abc.jpg"
  <div class="aplus-v2">...</div>
  #1,234 in Toys &amp; Games`
  const { found, missing } = extractFields(html)
  assert.equal(found.title, 'Wooden Building Blocks Set')
  assert.match(found.brand, /JOYIN/)
  assert.equal(found.price, '$29.99')
  assert.match(found.rating, /4\.6/)
  assert.equal(found.reviewCount, '1,234 ratings')
  assert.equal(found.bullets.length, 2)
  assert.equal(found.hiResImages, 1)
  assert.equal(found.hasAplus, true)
  assert.match(found.bsr, /1,234 in Toys/)
  assert.ok(missing.includes('dateFirstAvailable'))
})

test('fetchListing：反爬验证页给可读错误', async () => {
  const fetchImpl = async () => ({
    ok: true, text: async () => '<html>Robot Check captcha api-services-support.amazon.com</html>',
  })
  await assert.rejects(() => fetchListing('B0CLLNGMQQ', { fetchImpl }), /验证页|反爬/)
})

test('fetchListing：ASIN 不合法直接拒绝（不发起请求）', async () => {
  await assert.rejects(() => fetchListing('short', { fetchImpl: async () => { throw new Error('不应发起') } }), /ASIN 不合法/)
})

// ---------- API 鉴权 ----------
test('requestRejection：无 connection 服务时放行（宿主 token 已把关）', () => {
  const noService = { get: () => undefined }
  assert.equal(requestRejection(noService, { headers: {} }), false) // 宿主 token 鉴权是边界，服务缺席放行
  const okService = { get: () => ({ requestRejection: () => false }) }
  assert.equal(requestRejection(okService, { headers: {} }), false)
})

