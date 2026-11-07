// 亚马逊商品页（/dp/{ASIN}）抓取与结构化字段提取。
// 域名限定 MARKETPLACES 白名单；UA 伪装 Chrome 120（与原项目 fetch-listing.sh 一致）；
// 字段提取 = 把脚本的 grep/sed 规则移植为 JS 正则；识别反爬验证页并给出可读错误。
import { marketOf } from './marketplaces.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const MAX_HTML = 3 * 1024 * 1024

/** ASIN：10 位大写字母数字（B0 开头最常见） */
export function isValidAsin(asin) {
  return typeof asin === 'string' && /^[A-Z0-9]{10}$/.test(asin.trim().toUpperCase())
}

export class ListingError extends Error {}

export async function fetchListing(asin, { market = 'us', fetchImpl = fetch } = {}) {
  if (!isValidAsin(asin)) throw new ListingError(`ASIN 不合法：${asin}（应为 10 位字母数字，如 B0CLLNGMQQ）`)
  const m = marketOf(market)
  if (!m) throw new ListingError(`未知市场：${market}`)
  const url = `https://www.${m.domain}/dp/${asin.trim().toUpperCase()}`

  const res = await fetchImpl(url, {
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new ListingError(`抓取失败：HTTP ${res.status}（${url}）。亚马逊可能限流，稍后重试。`)
  const html = (await res.text()).slice(0, MAX_HTML)

  if (/api-services-support\.amazon\.com|Robot Check|captcha/i.test(html) && !/productTitle/.test(html)) {
    throw new ListingError('亚马逊返回了验证页（反爬）。请稍后重试、换网络，或让用户直接粘贴 Listing 文案。')
  }
  if (!/productTitle/.test(html)) {
    throw new ListingError('页面结构异常（未找到标题节点）。ASIN 可能不存在或页面已变化。')
  }

  const fields = extractFields(html)
  return { asin: asin.trim().toUpperCase(), market, url, fields }
}

/** 从 dp 页 HTML 提取核心 Listing 字段（对应 fetch-listing.sh 的 grep 清单） */
export function extractFields(html) {
  const text = (regex) => {
    const m = html.match(regex)
    return m ? decodeEntities(m[1].trim()).slice(0, 500) : null
  }
  const title = text(/<span[^>]*id="productTitle"[^>]*>([\s\S]*?)<\/span>/)
  const brand = text(/<span[^>]*class="[^"]*bylineInfo[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.replace(/^Visit the | Brand Store$/g, '') || null
  const price = text(/<span[^>]*class="a-offscreen"[^>]*>([\s\S]*?)<\/span>/)
  const rating = text(/<span[^>]*class="a-icon-alt"[^>]*>([\s\S]*?)<\/span>/)
  const reviewCount = text(/<span[^>]*id="acrCustomerReviewText"[^>]*>([\s\S]*?)<\/span>/)
  const bullets = [...html.matchAll(/<span[^>]*class="a-list-item"[^>]*>\s*([^<]{20,500}?)\s*<\/span>/g)]
    .map((m) => decodeEntities(m[1]))
    .filter((b) => !/^[-–—]/.test(b) && !/import/i.test(b) && b.length > 15)
    .slice(0, 8)
  const hiResImages = (html.match(/"hiRes":"https:[^"]+"/g) || []).length
  const hasAplus = /aplus-v2|aplus-module/.test(html)
  const bsr = text(/(#[\d,]+\s+in\s+[^<(\n]{3,80})/) || text(/ranked?[^\d<]*([\d,]+\s+in\s+[^<(\n]{3,80})/i)
  const dateFirstAvailable = text(/Date First Available\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/) || text(/Date First Available[\s\S]*?<\/b>\s*([\w\s,\d]{6,30})</)

  const found = {}
  if (title) found.title = title
  if (brand) found.brand = brand
  if (price) found.price = price
  if (rating) found.rating = rating
  if (reviewCount) found.reviewCount = reviewCount
  if (bullets.length) found.bullets = bullets
  if (hiResImages) found.hiResImages = hiResImages
  if (hasAplus) found.hasAplus = true
  if (bsr) found.bsr = bsr.replace(/#/, '#')
  if (dateFirstAvailable) found.dateFirstAvailable = dateFirstAvailable

  const wanted = ['title', 'brand', 'price', 'rating', 'reviewCount', 'bullets', 'bsr', 'dateFirstAvailable']
  const missing = wanted.filter((key) => !(key in found))
  return { found, missing }
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
}
