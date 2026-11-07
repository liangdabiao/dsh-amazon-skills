// 亚马逊 12 个市场的补全 API 参数（来自原项目 research.sh 的 case 表）
export const MARKETPLACES = {
  us: { domain: 'amazon.com', mid: 'ATVPDKIKX0DER', label: '美国' },
  uk: { domain: 'amazon.co.uk', mid: 'A1F83G8C2ARO7P', label: '英国' },
  de: { domain: 'amazon.de', mid: 'A1PA6795UKMFR9', label: '德国' },
  fr: { domain: 'amazon.fr', mid: 'A13V1IB3VIYZZH', label: '法国' },
  it: { domain: 'amazon.it', mid: 'APJ6JRA9NG5V4', label: '意大利' },
  es: { domain: 'amazon.es', mid: 'A1RKKUPIHCS9HS', label: '西班牙' },
  jp: { domain: 'amazon.co.jp', mid: 'A1VC38T7YXB528', label: '日本' },
  ca: { domain: 'amazon.ca', mid: 'A2EUQ1WTGCTBG2', label: '加拿大' },
  au: { domain: 'amazon.com.au', mid: 'A39IBJ37TRP1C6', label: '澳大利亚' },
  in: { domain: 'amazon.in', mid: 'A21TJRUUN4KGV', label: '印度' },
  mx: { domain: 'amazon.com.mx', mid: 'A1AM78C64UM0Y8', label: '墨西哥' },
  br: { domain: 'amazon.com.br', mid: 'A2Q3Y263D00KWC', label: '巴西' },
}

export const MARKET_CODES = Object.keys(MARKETPLACES)

export function marketOf(code) {
  return MARKETPLACES[code] || null
}
