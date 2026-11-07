// ============================================================================
// 亚马逊卖家工具箱 · 浏览器半边（Client）。
// React 组件挂 main 槽：Tab1 技能目录（54 技能分类/搜索）、Tab2 关键词扩展器
// （种子词 → 补全 API 长尾表，可一键复制）。数据来自 Host 的 /amazon-skills/api/*。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect, useCallback } = require('react')

const PANEL_ID = 'amazon-skills' // = cordis.patch.yml 的 id
const BASE = 'amazon-skills' // = host.js 的 webServer 前缀（相对路径 fetch）

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#d98e04' }),
    h('path', { d: 'M6.5 14.5c2 2.4 4.2 3.5 5.5 3.5s3.5-1.1 5.5-3.5', stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round' }),
    h('circle', { cx: 9, cy: 8, r: 1.6, fill: '#fff' }),
    h('circle', { cx: 15, cy: 8, r: 1.6, fill: '#ffe08a' }))
}

async function fetchJson(path, body) {
  const res = await fetch(BASE + path, body === undefined
    ? {}
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

// ---------- Tab 1：技能目录 ----------
function CatalogTab() {
  const [catalog, setCatalog] = useState(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')

  useEffect(() => {
    fetchJson('/api/catalog').then(setCatalog).catch((e) => setCatalog({ error: e.message, skills: [], count: 0 }))
  }, [])

  if (!catalog) return h('div', { style: styles.muted }, '加载中…')
  if (catalog.error) return h('div', { style: styles.error }, catalog.error)

  const categories = ['全部', ...[...new Set(catalog.skills.map((s) => s.category))]]
  const filtered = catalog.skills.filter((s) =>
    (category === '全部' || s.category === category) &&
    (!query.trim() || s.name.includes(query.toLowerCase()) || s.description.includes(query)))

  return h('div', null,
    h('div', { style: styles.row },
      h('input', {
        placeholder: `搜索 ${catalog.count} 个技能…`, value: query, onChange: (e) => setQuery(e.target.value), style: { ...styles.input, flex: 1 },
      }),
      h('select', { value: category, onChange: (e) => setCategory(e.target.value), style: styles.input },
        categories.map((c) => h('option', { key: c, value: c }, c)))),
    h('div', { style: styles.skillList },
      filtered.map((s) => h('div', { key: s.name, style: styles.skillCard },
        h('div', { style: styles.skillName }, '/' + s.name),
        h('div', { style: styles.skillCategory }, s.category),
        h('div', { style: styles.skillDesc }, s.description.length > 160 ? s.description.slice(0, 160) + '…' : s.description))),
      filtered.length === 0 ? h('div', { style: styles.muted }, '没有匹配的技能。') : null),
    h('div', { style: { ...styles.muted, marginTop: 8 } }, '在对话里用 /技能名 或自然语言触发；Host 工具（amazon_suggest / amazon_fetch_listing）为技能提供真实数据。'))
}

// ---------- Tab 2：关键词扩展器 ----------
const MARKETS = ['us', 'uk', 'de', 'fr', 'it', 'es', 'jp', 'ca', 'au', 'in', 'mx', 'br']

function SuggestTab() {
  const [seed, setSeed] = useState('')
  const [market, setMarket] = useState('us')
  const [keywords, setKeywords] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const expand = async () => {
    if (!seed.trim()) return
    setBusy(true)
    setError('')
    setKeywords(null)
    setCopied(false)
    try {
      const out = await fetchJson('/api/suggest', { seed: seed.trim(), market })
      setKeywords(out)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const copyAll = () => {
    if (!keywords?.keywords?.length) return
    navigator.clipboard?.writeText(keywords.keywords.join('\n')).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000) },
      () => {})
  }

  return h('div', null,
    h('div', { style: styles.row },
      h('input', { placeholder: '种子关键词，如 building blocks', value: seed, onChange: (e) => setSeed(e.target.value), style: { ...styles.input, flex: 1 }, onKeyDown: (e) => { if (e.key === 'Enter') expand() } }),
      h('select', { value: market, onChange: (e) => setMarket(e.target.value), style: styles.input },
        MARKETS.map((m) => h('option', { key: m, value: m }, m))),
      h('button', { style: styles.button, onClick: expand, disabled: busy || !seed.trim() }, busy ? '扩展中…' : '扩展长尾词')),
    error ? h('div', { style: styles.error }, error) : null,
    keywords ? h('div', null,
      h('div', { style: styles.row },
        h('span', { style: styles.sectionTitle }, `「${keywords.seed}」扩展出 ${keywords.keywords.length} 个长尾词（${keywords.requests} 次请求）`),
        h('button', { style: styles.buttonSecondary, onClick: copyAll }, copied ? '已复制 ✓' : '复制全部')),
      h('div', { style: styles.keywordGrid },
        keywords.keywords.map((kw) => h('span', { key: kw, style: styles.keyword }, kw)))) : null,
    !keywords && !error ? h('div', { style: styles.muted }, '输入种子词后扩展：官方补全 API（真实买家搜索词聚合），30 次变体请求约需 10 秒。') : null)
}

// ---------- 主面板 ----------
function Panel() {
  const [tab, setTab] = useState('catalog')
  return h('div', { style: styles.wrap },
    h('style', null, ''),
    h('div', { style: styles.row },
      h('button', { style: tab === 'catalog' ? styles.tabActive : styles.tab, onClick: () => setTab('catalog') }, '📚 技能目录'),
      h('button', { style: tab === 'suggest' ? styles.tabActive : styles.tab, onClick: () => setTab('suggest') }, '🔍 关键词扩展')),
    tab === 'catalog' ? h(CatalogTab) : h(SuggestTab))
}

const styles = {
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  input: { padding: '6px 10px', border: '1px solid #d9d9de', borderRadius: 8, background: '#fff', color: '#1a1a1a', outline: 'none' },
  button: { padding: '6px 14px', border: 'none', borderRadius: 8, background: '#d98e04', color: '#fff', cursor: 'pointer', fontSize: 13 },
  buttonSecondary: { padding: '6px 14px', border: '1px solid #d9d9de', borderRadius: 8, background: '#f0f0f2', color: '#1a1a1a', cursor: 'pointer', fontSize: 13 },
  tab: { padding: '8px 16px', border: '1px solid #d9d9de', borderRadius: 8, background: '#fff', color: '#1a1a1a', cursor: 'pointer', fontSize: 13 },
  tabActive: { padding: '8px 16px', border: '1px solid #d98e04', borderRadius: 8, background: '#fcf3e2', color: '#8a5a00', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  sectionTitle: { fontWeight: 700 },
  muted: { color: '#8a8a92' },
  error: { color: '#c0392b' },
  skillList: { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' },
  skillCard: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 10 },
  skillName: { fontWeight: 700, color: '#8a5a00' },
  skillCategory: { display: 'inline-block', marginLeft: 8, padding: '1px 8px', borderRadius: 999, background: '#fcf3e2', color: '#8a5a00', fontSize: 11 },
  skillDesc: { marginTop: 4, color: '#4a4a50', lineHeight: 1.5 },
  keywordGrid: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  keyword: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 999, padding: '4px 12px' },
}

function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 9, label: () => '卖家工具箱' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots']
exports.apply = apply
