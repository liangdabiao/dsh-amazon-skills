// 面板数据面：/amazon-skills 前缀路由（技能目录 + 关键词工具 API）。
// 每请求鉴权三件套（connection.requestRejection + Origin 同源 + sec-fetch-site）。
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSkills, PLAYWRIGHT_SKILLS } from './skills.js'
import { expandKeywords } from './suggest.js'
import { MARKET_CODES } from './marketplaces.js'

const BASE = '/amazon-skills'
const SKILL_DIRS = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return 403
  return connection.requestRejection({ headers: req.headers })
}

function readJson(req, max = 16 * 1024) {
  return new Promise((resolve, reject) => {
    if (req.method !== 'POST') return reject(Object.assign(new Error('只接受 POST'), { status: 405 }))
    if (!(req.headers['content-type'] || '').includes('application/json')) {
      return reject(Object.assign(new Error('要 application/json'), { status: 415 }))
    }
    const site = req.headers['sec-fetch-site']
    if (site && site !== 'same-origin' && site !== 'none') {
      return reject(Object.assign(new Error('拒绝跨站请求'), { status: 403 }))
    }
    const origin = req.headers.origin
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
      return reject(Object.assign(new Error('Origin 与 Host 不同源'), { status: 403 }))
    }
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > max) { req.destroy(); return reject(Object.assign(new Error('请求体过大'), { status: 413 })) }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(Object.assign(new Error('JSON 解析失败'), { status: 400 })) }
    })
    req.on('error', reject)
  })
}

/** 技能分类（供面板分组；与 lib/skills.js 的 addendum 分类一致的语义） */
function categorize(name) {
  if (PLAYWRIGHT_SKILLS.includes(name)) return '深度调研'
  if (name === 'amazon-keyword-research' || name === 'amazon-listing-optimization' || name === 'amazon-ppc-campaign') return '核心运营'
  if (name.includes('keyword') || name.includes('search') || name.includes('rank')) return '关键词与搜索'
  if (name.includes('listing') || name.includes('a-plus') || name.includes('content') || name.includes('image') || name.includes('photography') || name.includes('storefront')) return 'Listing 与页面'
  if (name.includes('ppc') || name.includes('advertising') || name.includes('display') || name.includes('dayparting') || name.includes('coupon') || name.includes('deal') || name.includes('promotion') || name.includes('vine') || name.includes('subscribe')) return '广告与促销'
  if (name.includes('fba') || name.includes('shipping') || name.includes('inventory') || name.includes('prep') || name.includes('tariff')) return '物流与费用'
  if (name.includes('review') || name.includes('return')) return '评论与售后'
  return '选品与运营策略'
}

export function registerApi(ctx, config) {
  return ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    async handler(req, res) {
      try {
        const rejection = requestRejection(ctx, req)
        if (typeof rejection === 'number') return json(res, rejection, { error: '未授权' })
        const url = new URL(req.url, 'http://x')
        const path = url.pathname.slice(BASE.length) || '/'

        if (path === '/api/health' && req.method === 'GET') {
          return json(res, 200, { ok: true })
        }
        if (path === '/api/catalog' && req.method === 'GET') {
          const skills = readSkills(SKILL_DIRS).map((s) => ({
            name: s.name,
            description: s.description,
            category: categorize(s.name),
          }))
          return json(res, 200, { count: skills.length, skills })
        }
        if (path === '/api/suggest' && req.method === 'POST') {
          const body = await readJson(req)
          const out = await expandKeywords({
            seed: body.seed,
            market: MARKET_CODES.includes(body.market) ? body.market : config?.defaultMarket || 'us',
            limit: body.limit,
            delayMs: config?.suggestDelayMs ?? 300,
          })
          return json(res, 200, out)
        }
        json(res, 404, { error: 'not found' })
      } catch (err) {
        json(res, typeof err?.status === 'number' ? err.status : 500, { error: err?.message || '内部错误' })
      }
    },
  })
}
