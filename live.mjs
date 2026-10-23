// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）
import { chromium, webkit } from 'playwright'
const URL0 = 'https://tom3games.github.io/nuri-runway/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts }), p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__nrReady, null, { timeout: 15000 })
  await p.click('#bStart'); await p.waitForFunction(() => !document.querySelector('#bThemeGo').disabled); await p.click('#bThemeGo')
  for (let i = 0; i < 4; i++) await p.click('#bTut')
  await p.click('[data-tool="bucket"]')
  const s = await p.evaluate(() => { const r = document.querySelector('#paint').getBoundingClientRect(); return [r.left + r.width * 122 / 300, r.top + r.height * 380 / 560] })
  await p.mouse.click(...s)
  await p.click('#bRunway'); await p.waitForTimeout(4000); await p.screenshot({ path: `shots/live-${name}.png` })
  await p.click('#bSkip'); await p.waitForSelector('#result:not([hidden])', { timeout: 20000 })
  const stamp = await p.textContent('#rStamp')
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: stamp=${stamp} og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
// ログアウト状態でリポジトリ・更新履歴に個人のIDが出ていないか
const b = await chromium.launch(), p = await b.newPage()
for (const u of ['https://github.com/tom3games/nuri-runway', 'https://github.com/tom3games/nuri-runway/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} tmk4men=${/tmk4men/i.test(await p.content()) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
