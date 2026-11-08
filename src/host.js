// 亚马逊卖家工具箱 · Host 半边。
// 工具：amazon_suggest（补全 API 长尾扩展）、amazon_fetch_listing（dp 页结构化抓取）。
// 技能：54 个快照（lib/skills.js，rank 600 让位）。webServer 前缀路由：面板目录与关键词工具。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider, readSkills, PLAYWRIGHT_SKILLS, SCRIPT_SKILLS, WEB_SEARCH_SKILLS } from '../lib/skills.js'
import { expandKeywords } from '../lib/suggest.js'
import { fetchListing, isValidAsin } from '../lib/listing.js'
import { MARKET_CODES } from '../lib/marketplaces.js'
import { registerApi } from '../lib/api.js'

export const name = 'amazon-skills' // = cordis.patch.yml 的 id

export const inject = ['tools', 'skills', 'webServer', 'connection']

export const Config = Schema.object({
  defaultMarket: Schema.string().default('us').description('默认亚马逊市场'),
  suggestDelayMs: Schema.number().min(0).max(2000).default(300).description('补全 API 请求间隔（毫秒）'),
})

const configRef = { config: Config }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_DIRS = [join(ROOT, 'skills')]

// 手写参数校验
function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string' },
      data: { type: 'string', description: '可选：结构化结果文本' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

// ---------------------------------------------------------------------------
// 工具 1：amazon_suggest
// ---------------------------------------------------------------------------
export const amazonSuggestTool = {
  name: 'amazon_suggest',
  description:
    '亚马逊关键词长尾扩展：用官方搜索补全 API 把一个种子词扩展成 100~200 个真实买家搜索词（零鉴权）。' +
    '做关键词研究、Listing 优化选词、PPC 广告词组、竞品词对比时使用；也是 keyword-research / listing-optimization / ppc-campaign 技能的数据通道。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['seed'],
    properties: {
      seed: str('种子关键词，如 "building blocks" 或 "积木"（按目标站点语言）'),
      market: str('亚马逊市场代码', { enum: MARKET_CODES }),
      limit: num('返回长尾词上限（默认 200，最多 500）'),
      maxRequests: num('补全请求次数上限（默认 30；每次 1 个前缀/字母变体）'),
    },
  },
  timeoutMs: 60_000,
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    const cfg = configRef.config
    const out = await expandKeywords({
      seed: args.seed,
      market: args.market || cfg.defaultMarket,
      limit: args.limit,
      maxRequests: args.maxRequests,
      delayMs: cfg.suggestDelayMs,
    })
    if (out.keywords.length === 0) {
      // 空状态不是错误
      return result(true, `「${out.seed}」在 ${out.market} 站没有返回任何补全建议。这不是错误：换更通用的种子词、或换市场再试。`)
    }
    return result(
      true,
      `「${out.seed}」在 ${out.market} 站扩展出 ${out.keywords.length} 个长尾词（${out.requests} 次补全请求）。` +
        `建议结合 keyword-research / listing-optimization 技能做竞争分析与选词。`,
      out.keywords.join('\n'),
    )
  },
}

// ---------------------------------------------------------------------------
// 工具 2：amazon_fetch_listing
// ---------------------------------------------------------------------------
export const amazonFetchListingTool = {
  name: 'amazon_fetch_listing',
  description:
    '抓取亚马逊商品详情页并返回结构化字段：标题、品牌、价格、评分、评论数、五点卖点、高清图数量、A+ 有无、BSR 排名、上架日期。' +
    '做竞品分析、Listing 审计、PPC 竞品词、评论分析前的数据采集时使用；也是 listing-optimization / ppc-campaign / competitor-analysis 技能的数据通道。' +
    '注意：亚马逊有反爬，失败时按提示降级（让用户粘贴数据）。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['asin'],
    properties: {
      asin: str('商品 ASIN（10 位字母数字，如 B0CLLNGMQQ）'),
      market: str('亚马逊市场代码', { enum: MARKET_CODES }),
    },
  },
  timeoutMs: 30_000,
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    const cfg = configRef.config
    const out = await fetchListing(args.asin, { market: args.market || cfg.defaultMarket })
    // lib/listing.js 的 extractFields 返回 { found, missing }，整块放在 out.fields 里。
    // 0.1.0 这里直接当扁平对象读（out.fields.title），导致抓成功也一个字段都输不出来。
    const f = out.fields?.found || {}
    const missing = out.fields?.missing || []
    const lines = []
    for (const [key, label] of [
      ['title', '标题'], ['brand', '品牌'], ['price', '价格'], ['rating', '评分'],
      ['reviewCount', '评论数'], ['bsr', 'BSR'], ['dateFirstAvailable', '上架日期'],
      ['hiResImages', '高清图数量'], ['hasAplus', 'A+ 内容'],
    ]) {
      if (f[key] !== undefined && f[key] !== null && f[key] !== '') {
        lines.push(`${label}: ${f[key] === true ? '有' : f[key]}`)
      }
    }
    if (Array.isArray(f.bullets) && f.bullets.length) lines.push('五点卖点:', ...f.bullets.map((b) => `- ${b}`))

    const got = lines.length
    const notes = []
    if (missing.length) {
      notes.push(`未抓到：${missing.join('、')}（亚马逊反爬或页面变体导致，分析时注明数据缺失）`)
    }
    if (got === 0) {
      notes.push('本次一个字段都没解析出来。可能是反爬验证页或页面改版：让用户直接把 Listing 文案粘贴进来，或稍后重试。')
    } else if (got <= 3) {
      notes.push('只解析到少量字段，做 Listing 审计/竞品对比前建议让用户补齐关键信息（标题、五点、价格、评论数）。')
    }
    const body = lines.join('\n') + (notes.length ? `\n\n[提示]\n- ${notes.join('\n- ')}` : '')
    return result(true, `已抓取 ${out.asin}（${out.market}）的商品页，解析到 ${got} 项：`, body)
  },
}

export function apply(ctx, config) {
  configRef.config = config
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(SKILL_DIRS, ROOT)), `${name}: skills`)
  ctx.tools.register(amazonSuggestTool)
  ctx.tools.register(amazonFetchListingTool)
  ctx.effect(() => registerApi(ctx, config), `${name}: routes`)
}

// 供测试使用
export { SKILL_DIRS, readSkills }
