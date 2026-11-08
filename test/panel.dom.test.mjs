// 面板 DOM 冒烟（jsdom）：技能卡点击必须能"跳到对话并填好 /技能名"。
// 这条链路 0.1.0 根本没有（卡片是静态 div），用户点不动 —— 这里锁死。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require_ = createRequire(join(ROOT, 'package.json'))

let deps = null
try {
  deps = {
    JSDOM: require_('jsdom').JSDOM,
    React: require_('react'),
    createRoot: require_('react-dom/client').createRoot,
    act: require_('react').act,
  }
} catch {
  deps = null
}

test('面板：点技能卡 → uiWorkspace.startSession 预填 /技能名', { skip: deps ? false : '未安装 jsdom/react/react-dom，跳过' }, async () => {
  const { JSDOM, React, createRoot, act } = deps
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'http://127.0.0.1:61448/',
    pretendToBeVisual: true,
  })
  const { window } = dom
  globalThis.window = window
  globalThis.document = window.document
  globalThis.HTMLElement = window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const catalog = {
    count: 3,
    skills: [
      { name: 'amazon-one-shot', description: '一站式深度亚马逊产品调研', category: '深度调研' },
      { name: 'amazon-ppc-campaign', description: 'PPC 广告搭建与优化', category: '核心运营' },
      { name: 'amazon-fba-calculator', description: 'FBA 费用明细', category: '物流与费用' },
    ],
  }
  const fetchCalls = []
  globalThis.fetch = window.fetch = async (url) => {
    const target = String(url)
    fetchCalls.push(target)
    if (target.includes('/api/catalog')) return { ok: true, status: 200, json: async () => catalog }
    return { ok: true, status: 200, json: async () => ({}) }
  }

  // 载入真实 dist/client.js
  let factory = null
  window.__ModuleLoader__ = { load: ({ factory: f }) => { factory = f } }
  new Function(readFileSync(join(ROOT, 'dist', 'client.js'), 'utf8'))()
  const mod = factory((spec) => {
    if (spec === 'react') return React
    throw new Error(`bundle 请求了白名单外的模块：${spec}`)
  })
  assert.ok(mod.inject.includes('uiWorkspace'), 'client 必须 inject uiWorkspace 才能开对话')

  let Panel = null
  const starts = []
  const ctx = {
    slots: {
      inject: (_name, fn) => fn(),
      register: (desc, comp) => { if (desc.name === 'main') Panel = comp },
    },
    uiWorkspace: { startSession: (...args) => starts.push(args) },
  }
  mod.apply(ctx)
  assert.equal(typeof Panel, 'function', '面板应注册到 main slot')

  const root = createRoot(document.getElementById('app'))
  await act(async () => { root.render(React.createElement(Panel)) })
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  assert.ok(fetchCalls.some((u) => u.includes('/api/catalog')), '应拉取技能目录')

  const cards = [...document.querySelectorAll('[role="button"]')]
  assert.ok(cards.length >= 3, `技能卡应可点击（role=button），实际 ${cards.length}`)
  const target = cards.find((el) => el.textContent.includes('/amazon-one-shot'))
  assert.ok(target, '应找到 amazon-one-shot 技能卡')

  await act(async () => {
    target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
  })
  assert.equal(starts.length, 1, '点击应调用一次 startSession')
  const [sessionArg, options] = starts[0]
  assert.equal(sessionArg, undefined, '应开新对话（不指定已有 session）')
  assert.equal(options.prompt, '/amazon-one-shot ', '预填草稿应为 /技能名 + 空格')
  assert.equal(options.whenDraftExists, 'replace', '已有草稿时替换')

  // 键盘可达：Enter 也应触发（卡片 role=button + tabIndex）
  starts.length = 0
  await act(async () => {
    target.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
  })
  assert.equal(starts.length, 1, 'Enter 键也应触发')
  assert.equal(starts[0][1].prompt, '/amazon-one-shot ')

  await act(async () => { root.unmount() })
})
