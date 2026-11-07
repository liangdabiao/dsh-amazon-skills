// Amazon 自动补全 API 封装（数据通道来自原项目 amazon-keyword-research，零鉴权公开接口）。
// 扩展策略：前缀变体（"" best cheap top…）× 字母后缀（kw a..z）→ 节流抓取 → 去重排序。
// 请求只发往 MARKETPLACES 表内的官方域名（硬编码白名单，无 SSRF 面）。
import { marketOf, MARKETPLACES } from './marketplaces.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 单次补全请求：返回建议词数组 */
export async function fetchSuggestions(domain, mid, prefix, fetchImpl = fetch) {
  const url = `https://completion.${domain}/api/2017/suggestions?mid=${mid}&alias=aps&prefix=${encodeURIComponent(prefix)}`
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`补全 API 返回 HTTP ${res.status}（${domain}）`)
  const data = await res.json()
  return (data?.suggestions || []).map((s) => s.value).filter(Boolean)
}

/**
 * 长尾关键词扩展。
 * @param opts {seed, market='us', prefixes?, letterSuffix=true, delayMs=300, maxRequests=30, limit=200, fetchImpl?}
 * @returns {seed, market, keywords: string[], requests: number}
 */
export async function expandKeywords(opts = {}) {
  const seed = String(opts.seed || '').trim()
  if (!seed) throw new Error('缺少种子关键词 seed')
  const market = marketOf(opts.market || 'us')
  if (!market) throw new Error(`未知市场：${opts.market}（可用：${Object.keys(MARKETPLACES).join('/')}）`)

  const prefixes = Array.isArray(opts.prefixes) && opts.prefixes.length
    ? opts.prefixes.slice(0, 8)
    : ['', 'best ', 'cheap ', 'top ']
  const letterSuffix = opts.letterSuffix !== false
  const delayMs = Math.max(0, Math.min(2000, Number(opts.delayMs ?? 300)))
  const maxRequests = Math.max(1, Math.min(40, Number(opts.maxRequests ?? 30)))
  const limit = Math.max(10, Math.min(500, Number(opts.limit ?? 200)))
  const fetchImpl = opts.fetchImpl || fetch

  const requests = []
  for (const prefix of prefixes) requests.push(prefix + seed)
  if (letterSuffix) {
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') requests.push(`${seed} ${ch}`)
  }

  const found = new Set()
  let used = 0
  for (const prefix of requests.slice(0, maxRequests)) {
    let words = []
    try {
      words = await fetchSuggestions(market.domain, market.mid, prefix, fetchImpl)
    } catch (err) {
      if (used === 0) {
        throw new Error(`补全 API 请求失败（${market.domain}）：${err.message}。网络受限环境可能无法直连亚马逊，可稍后重试或换市场。`)
      }
      break // 已有部分结果时容忍单次失败
    }
    used++
    for (const word of words) found.add(word)
    if (delayMs) await sleep(delayMs)
  }

  const keywords = [...found]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit)
  return { seed, market: opts.market || 'us', keywords, requests: used }
}
