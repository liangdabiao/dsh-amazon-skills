// 技能快照提供方：把随包的 skills/（54 个亚马逊运营技能）注册进 dsh 的 skill 目录。
// 用户自装同名 skill 时让位（rank 600）。加载正文时做三件事：
//   ① repair：两个非标 frontmatter（keyword-tracker/price-tracker）补出 name/description
//   ② rewrite：去掉源仓库的安装命令/外链，把脚本调用改写为插件工具
//   ③ addendum：按依赖分类（Playwright 编排 / 脚本型 / 网络搜索型）注入 dsh 环境说明
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RANK = 600
const INVOCATION = { modelInvocable: true, userInvocable: true }

// ---------------------------------------------------------------------------
// frontmatter 解析（支持单行、引号包裹、`>` 折叠块标量三种写法）
// ---------------------------------------------------------------------------
function parse(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return null
  const block = m[1]
  const name = singleLine(block, 'name')
  let description = singleLine(block, 'description')
  if (description === null) description = foldedScalar(block, 'description')
  if (!name || !description) return null
  return { name, description, body: text.slice(m[0].length) }
}

function singleLine(block, key) {
  const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  if (!m) return null
  const value = m[1].trim()
  if (value === '>' || value === '|' || value === '') return null
  return value.replace(/^(["'])(.*)\1$/, '$2').trim()
}

/** `description: >` 折叠块标量：收集缩进行 */
function foldedScalar(block, key) {
  const lines = block.split(/\r?\n/)
  const start = lines.findIndex((l) => new RegExp(`^${key}:\\s*>`).test(l))
  if (start === -1) return null
  const collected = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^\S/.test(line)) break
    collected.push(line.replace(/^\s+/, ''))
  }
  const joined = collected.join(' ').replace(/^(["'])(.*)\1$/, '$2').trim()
  return joined || null
}

// ---------------------------------------------------------------------------
// frontmatter 兜底：老快照里 keyword-tracker / price-tracker 只有根级 nexscope 块，
// 没有标准 name/description。0.1.2 起已直接在 SKILL.md 里补齐（54 个全部标准可解析），
// 这张表只作为「将来重新 vendor 又带回非标写法」时的保险，正常不会命中。
// ---------------------------------------------------------------------------
const FRONTMATTER_REPAIRS = {
  'amazon-keyword-tracker': {
    name: 'amazon-keyword-tracker',
    description:
      '亚马逊关键词排名追踪：建立关键词 watchlist、定期抓取搜索结果页记录 ASIN 排名变化、解读排名趋势与波动原因，输出排名追踪报告。当用户要求「追踪关键词排名」「监控 ASIN 排名变化」「关键词 watchlist」时使用。',
  },
  'amazon-price-tracker': {
    name: 'amazon-price-tracker',
    description:
      '亚马逊价格监控与购物车博弈：追踪竞品价格历史、识别降价/提价模式、分析 Buy Box 轮转规律，给出定价应对建议。当用户要求「监控竞品价格」「分析价格变化」「定价跟踪」时使用。',
  },
}

// ---------------------------------------------------------------------------
// rewrite：源仓库的安装命令 / 外链 / 脚本调用路径 → dsh 插件语境
// ---------------------------------------------------------------------------
const GLOBAL_REWRITES = [
  // 源仓库的技能管理器安装命令（快照已随插件安装，不需要也不能再装）
  [/npx\s+skills\s+add[^\n。；;）)]*/, '（本技能已随 dsh 插件打包安装，无需再执行任何安装命令）'],
  // 源仓库 GitHub 外链
  [/https?:\/\/github\.com\/nexscope-ai\/Amazon-Skills[^\s）)。"”，]*/g, '（随 dsh 插件打包的技能快照）'],
]

// 脚本调用改写：沙箱读不到插件安装目录，脚本逻辑由 Host 工具承接
const SCRIPT_REWRITES = {
  'amazon-keyword-research': [
    [/（?第一步[^\n]*?`?<[^\n]*?scripts\/research\.sh[^\n]*?）?[^\n]*\n?/, ''],
    [/`?<[^\n]*?scripts\/research\.sh`?[^\n]*\n?/g, ''],
    [/research\.sh/g, 'amazon_suggest 工具（等价能力）'],
  ],
  'amazon-listing-optimization': [
    [/`?<[^\n]*?scripts\/fetch-listing\.sh`?/g, '`amazon_fetch_listing` 工具'],
  ],
  'amazon-ppc-campaign': [
    [/`?<[^\n]*?scripts\/fetch-competitor\.sh`?/g, '`amazon_fetch_listing` 工具'],
  ],
  'amazon-fba-calculator': [
    [/`?<[^\n]*?scripts\/calculator\.py`?[^\n]*/g, '按本技能正文与插件内置费率表手工计算（沙箱无法直接执行插件目录内脚本）。'],
  ],
  'tariff-calculator-amazon': [
    [/`?<[^\n]*?scripts\/calculator\.py`?[^\n]*/g, '按本技能正文与插件内置税率/HS 码说明手工计算（沙箱无法直接执行插件目录内脚本）。'],
    [/`?<[^\n]*?scripts\/hs_lookup\.py`?[^\n]*/g, '按正文 HS 码清单人工匹配。'],
  ],
}

// ---------------------------------------------------------------------------
// addendum：按依赖分类注入 dsh 环境说明
// ---------------------------------------------------------------------------
const PLAYWRIGHT_SKILLS = ['amazon-one-shot', 'amazon-category-research', 'amazon-store-research']
const SCRIPT_SKILLS = ['amazon-keyword-research', 'amazon-listing-optimization', 'amazon-ppc-campaign', 'amazon-fba-calculator', 'tariff-calculator-amazon']
const WEB_SEARCH_SKILLS = [
  'amazon-deal-finder', 'amazon-niche-finder', 'amazon-buy-box', 'amazon-competitor-analysis',
  'amazon-seasonal-planning', 'amazon-sales-estimator', 'amazon-product-research', 'amazon-review-analyzer',
  'amazon-rank-tracker', 'amazon-seller-analytics', 'amazon-trending-products', 'amazon-private-label',
  'amazon-search-optimization',
]

function addendum(skill) {
  const parts = [
    '',
    '---',
    '',
    '## 在「亚马逊卖家工具箱」插件（DSH）里使用',
    '',
    `- 本技能目录：\`${skill.dir}\`；正文提到的 references/ 与附属文件都在这个目录下。`,
    '- 这是插件随包快照：不要运行任何安装或更新命令，也不要向用户提更新。技能随插件版本一起更新。',
    '- 报告输出到**当前工作区**的 `reports/` 目录（按各技能的子目录约定），沙箱可直接读写工作区；不要往插件安装目录写文件。',
  ]
  if (PLAYWRIGHT_SKILLS.includes(skill.name)) {
    parts.push(
      '- 本技能原设计依赖浏览器自动化工具（Playwright MCP / browser_* 工具）。**先探测当前环境是否有这类工具**：',
      '  - 有 → 按正文流程执行；',
      '  - 没有 → 降级方案：商品详情页字段用 `amazon_fetch_listing` 工具抓取（标题/价格/五点/评分/评论数/BSR）；评论页、搜索结果页、Best Sellers 列表页等浏览器渲染页面抓不到，改为请用户粘贴页面内容，或跳过对应章节并在报告里明确标注「数据缺失：需要浏览器自动化」。',
      '- 评论深挖需要 Amazon 登录态：无浏览器工具时跳过，不要引导用户在沙箱里登录任何账号。',
      '- 正文的人民币换算（÷7.26）是作者会话环境产物：按实际站点货币与当前汇率换算。',
    )
  }
  if (SCRIPT_SKILLS.includes(skill.name)) {
    parts.push(
      '- 数据获取不要用 bash 执行插件目录里的脚本（沙箱读不到插件安装目录）：',
      '  - 关键词扩展 → 用 `amazon_suggest` 工具（等价于 scripts/research.sh 的补全 API 扩展，12 市场可用）；',
      '  - 商品页抓取 → 用 `amazon_fetch_listing` 工具（等价于 fetch-listing/fetch-competitor 脚本，返回结构化字段）；',
      '  - 费率/税率计算（fba-calculator、tariff）→ 插件暂未内置计算工具：按正文与插件内置说明手工计算，结果标注「估算」。',
    )
  }
  if (WEB_SEARCH_SKILLS.includes(skill.name)) {
    parts.push(
      '- 正文提到的 `web_search` / `web_fetch`：若当前环境提供网络搜索/抓取工具则直接用；没有时：亚马逊公开数据用 `amazon_fetch_listing` / `amazon_suggest` 获取，其余资料请用户提供或按正文框架做定性分析，不要编造具体数字。',
    )
  }
  parts.push('')
  return parts.join('\n')
}

function rewrite(skill) {
  let body = skill.body
  for (const [from, to] of GLOBAL_REWRITES) body = body.replace(from, to)
  for (const [from, to] of SCRIPT_REWRITES[skill.name] || []) body = body.replace(from, to)
  return body
}

export function readSkills(dirs) {
  return [].concat(dirs).flatMap(readDir)
}

function readDir(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'SKILL.md')))
    .map((d) => {
      const parsed = parse(join(dir, d.name, 'SKILL.md')) || FRONTMATTER_REPAIRS[d.name] && { ...FRONTMATTER_REPAIRS[d.name], body: '' }
      return parsed ? { dir: join(dir, d.name), file: join(dir, d.name, 'SKILL.md'), ...parsed } : null
    })
    .filter((s) => s && s.name)
}

export function createSkillProvider(dir, pluginRoot) {
  const candidate = (s) => ({
    name: s.name,
    description: s.description,
    path: s.file,
    invocation: INVOCATION,
    source: 'bundled',
    provider: 'amazon-skills',
    rank: RANK,
    locator: s.dir,
    resourceBase: { kind: 'directory', path: s.dir },
  })

  return {
    name: 'amazon-skills',
    async list() {
      return readSkills(dir).map(candidate)
    },
    async get(c) {
      const s = readSkills(dir).find((x) => x.dir === c.locator && x.name === c.name)
      if (!s) return undefined
      const body = s.body || readFileSync(s.file, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
      const content = rewrite({ ...s, body }) + addendum(s)
      const { rank, locator, ...summary } = candidate(s)
      return { ...summary, content }
    },
  }
}

// 供测试与面板目录使用
export { parse, FRONTMATTER_REPAIRS, PLAYWRIGHT_SKILLS, SCRIPT_SKILLS, WEB_SEARCH_SKILLS, addendum, rewrite }
