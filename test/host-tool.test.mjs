// Host 工具层回归测试：amazon_fetch_listing 必须把 {found, missing} 正确摊平输出。
// 0.1.0 的 bug：直接把 out.fields 当扁平对象读，抓成功也一个字段都输不出来。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'amazon-host-test-'))

const { amazonFetchListingTool, amazonSuggestTool } = await import('../src/host.js')

const HTML = `
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

const withFetch = async (impl, fn) => {
  const original = globalThis.fetch
  globalThis.fetch = impl
  try { return await fn() } finally { globalThis.fetch = original }
}

test('amazon_fetch_listing：抓到的字段真的出现在输出里（不再被 {found} 包着丢掉）', async () => {
  const out = await withFetch(
    async () => ({ ok: true, status: 200, text: async () => HTML }),
    () => amazonFetchListingTool.execute({ asin: 'B0CLLNGMQQ', market: 'us' }),
  )
  assert.equal(out.ok, true)
  assert.match(out.summary, /解析到 \d+ 项/)
  for (const piece of ['标题: Wooden Building Blocks Set', '品牌: JOYIN', '价格: $29.99', '评分: 4.6', '评论数: 1,234 ratings', '五点卖点', 'BSR:', 'A+ 内容: 有', '高清图数量: 1']) {
    assert.ok(out.data.includes(piece), `输出里缺「${piece}」：\n${out.data}`)
  }
  assert.ok(!/未抓到：title/.test(out.data), '抓到的字段不该出现在未抓到清单里')
})

test('amazon_fetch_listing：没解析到字段时要明确提示（反爬/改版）', async () => {
  const out = await withFetch(
    async () => ({ ok: true, status: 200, text: async () => '<html><span id="productTitle">X</span></html>' }),
    () => amazonFetchListingTool.execute({ asin: 'B0CLLNGMQQ', market: 'us' }),
  )
  assert.equal(out.ok, true)
  assert.match(out.summary, /解析到 1 项/)
  assert.match(out.data, /未抓到：/)
  assert.match(out.data, /只解析到少量字段|一个字段都没解析出来/)
})

test('amazon_suggest：参数校验与市场错误信息可读', async () => {
  await assert.rejects(() => amazonSuggestTool.execute({ seed: 'x', market: 'zz' }), /market 只能是/)
  await assert.rejects(() => amazonSuggestTool.execute({ seed: 'x', oops: 1 }), /未知参数 oops/)
})
