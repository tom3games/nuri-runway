// 全項目の自動検証。node verify.mjs（shots/ にスクショを出す）
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5321
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }

async function open(browser, opts = {}, keepTut = false) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await ctx.addInitScript(k => { try { localStorage.clear(); if (k) localStorage.setItem('nr.tut', '1') } catch (e) {} }, !keepTut)
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__nrReady, null, { timeout: 10000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
// 描いた絵の輝度の散らばり（ほぼ単色なら何も描けていない）
const variance = (p, sel) => p.evaluate(sel => {
  const c = document.querySelector(sel), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 13) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
  return Math.round(s2 / n - (s / n) ** 2)
}, sel)

const browser = await chromium.launch()
let p = await open(browser, {}, true)

await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('タイトルが日本語で出ている', async () => { const s = await p.textContent('.logo .main'); expect(s.includes('ランウェイ'), s); return s })
await t('タイトルの見本マネキンが描けている（輝度の散らばり）', async () => { await p.waitForTimeout(300); const v = await variance(p, '#hero'); expect(v > 300, v); return v })
await p.screenshot({ path: ROOT + '/shots/01-title.png' })
await t('タイトル画面ではみ出しがない', async () => { const o = await overflow(p); expect(o.sw <= o.W && !o.bad.length, JSON.stringify(o)) })

// ---------- お題 → ぬり画面
await p.click('#bStart')
await t('お題が回ってから決まる', async () => {
  await p.waitForFunction(() => !document.querySelector('#bThemeGo').disabled, null, { timeout: 4000 })
  const n = await p.textContent('#thName'), id = await p.evaluate(() => nr.S.theme.ja); expect(n === id, n + ' / ' + id); return n
})
await p.screenshot({ path: ROOT + '/shots/02-theme.png' })
await p.click('#bThemeGo')
await t('初回はチュートリアルが出て4枚目で閉じる', async () => {
  expect(await p.isVisible('#tut'), 'not shown'); const first = await p.textContent('#tutT')
  await p.screenshot({ path: ROOT + '/shots/03-tutorial.png' })
  for (let i = 0; i < 4; i++) await p.click('#bTut')
  expect(!(await p.isVisible('#tut')), 'still open'); return first
})
await t('ぬり画面: キャンバスと道具が画面内に全部収まる（390x844）', async () => {
  const r = await p.evaluate(() => { const g = id => document.querySelector(id).getBoundingClientRect(); return { cv: g('#paint'), run: g('#bRunway'), pal: g('#pal'), H: innerHeight } })
  expect(r.cv.height > 300, 'canvas ' + r.cv.height); expect(r.run.bottom <= r.H + 1, 'runway btn ' + r.run.bottom); expect(r.cv.bottom <= r.pal.top, 'overlap')
  return { canvasH: Math.round(r.cv.height), btnBottom: Math.round(r.run.bottom) }
})
await t('ぬり画面ではみ出しがない', async () => { const o = await overflow(p); expect(o.sw <= o.W && !o.bad.length, JSON.stringify(o)) })

// 設計座標 → 画面座標
const toScreen = (x, y) => p.evaluate(([x, y]) => { const r = document.querySelector('#paint').getBoundingClientRect(); return [r.left + x / 300 * r.width, r.top + y / 560 * r.height] }, [x, y])
const covs = () => p.evaluate(() => Object.fromEntries(nr.PARTS.map(q => [q.id, +nr.coverage(nr.S.outfit, q.id).toFixed(3)])))
async function drag(pts) { const s = await toScreen(...pts[0]); await p.mouse.move(...s); await p.mouse.down(); for (const q of pts.slice(1)) { const s2 = await toScreen(...q); await p.mouse.move(...s2, { steps: 6 }) } await p.mouse.up() }

await t('マウスでなぞるとトップスだけがぬれる（腕へはみ出さない）', async () => {
  await drag([[150, 200], [40, 200], [20, 220]])
  const c = await covs(); expect(c.top > 0.02 && c.arms === 0 && c.face === 0, JSON.stringify(c)); return c
})
await t('なぞり始めた部位がゲージに出る', async () => { const v = await p.getAttribute('.pt[data-part="top"]', 'data-cov'); expect(+v > 0.02, v); return v })
await t('バケツでパーツがまるごとぬれる（97%以上）', async () => {
  await p.click('[data-tool="bucket"]'); await p.click('.sw[data-color="3"]')
  const s = await toScreen(122, 380); await p.mouse.click(...s)
  const c = await covs(); expect(c.bottom > 0.97 && c.shoes === 0, JSON.stringify(c)); return c.bottom
})
await t('もどすで直前の状態に戻る', async () => { await p.click('#bUndo'); const c = await covs(); expect(c.bottom === 0, JSON.stringify(c)) })
await t('左右対称: 左腕をなぞると右腕にも描かれる', async () => {
  await p.click('[data-tool="pen"]'); await p.click('[data-size="2"]'); await p.click('#bMirror')
  await drag([[64, 200], [58, 260], [56, 300]])
  const r = await p.evaluate(() => { const c = nr.S.outfit.arms, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, half = c.width / 2; let L = 0, R = 0
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 127) x < half ? L++ : R++
    return { L, R } })
  expect(r.L > 200 && r.R > 200 && Math.abs(r.L - r.R) / r.L < 0.15, JSON.stringify(r)); return r
})
await t('スタンプが押せる（星）', async () => {
  await p.click('#bMirror'); await p.click('[data-tool="stamp"]'); await p.click('[data-stamp="star"]'); await p.click('.sw[data-color="6"]')
  const before = (await covs()).top; const s = await toScreen(170, 240); await p.mouse.click(...s)
  const after = (await covs()).top; expect(after > before, before + ' -> ' + after); return { before, after }
})
await t('けしゴムで消える', async () => {
  await p.click('[data-tool="eraser"]'); const before = (await covs()).top
  await drag([[100, 150], [200, 150], [200, 260], [100, 260]]); const after = (await covs()).top; expect(after < before, before + ' -> ' + after); return { before, after }
})
await p.screenshot({ path: ROOT + '/shots/04-paint.png' })

// ---------- 採点
await t('何もぬらないと0点・大炎上・特別コメント', async () => {
  const r = await p.evaluate(() => { const o = {}; for (const q of nr.PARTS) { const c = document.createElement('canvas'); c.width = nr.S.outfit[q.id].width; c.height = nr.S.outfit[q.id].height; o[q.id] = c } const st = nr.analyze(o); return nr.scoreFrom(st, nr.THEMES[0], 3) })
  expect(r.total === 0 && r.tier === 'disaster' && r.special === 'blank', JSON.stringify(r)); return r.tier
})
// お題の色で全部をぬった衣装を作って採点
const scoreOutfit = (plan, themeId, strokes = 0) => p.evaluate(([plan, themeId, strokes]) => {
  const o = {}
  for (const q of nr.PARTS) { const c = document.createElement('canvas'); c.width = nr.S.outfit[q.id].width; c.height = nr.S.outfit[q.id].height; o[q.id] = c
    const col = plan[q.id]; if (col === undefined) continue
    const x = c.getContext('2d'); x.setTransform(2, 0, 0, 2, -q.box.x * 2, -q.box.y * 2); x.save(); x.clip(q.path)
    if (Array.isArray(col)) { x.fillStyle = PALETTE[col[0]].c; x.fillRect(q.box.x, q.box.y, q.box.w, q.box.h / 2) } else { x.fillStyle = PALETTE[col].c; x.fillRect(q.box.x, q.box.y, q.box.w, q.box.h) }
    x.restore() }
  const keep = [nr.S.strokes, nr.S.stamps, nr.S.buckets]; nr.S.strokes = strokes; nr.S.stamps = 0; nr.S.buckets = 6
  const st = nr.analyze(o); Object.assign(nr.S, { strokes: keep[0], stamps: keep[1], buckets: keep[2] })
  const th = nr.THEMES.find(t => t.id === themeId); return [nr.scoreFrom(st, th, 7), nr.scoreFrom(st, th, 7)]
}, [plan, themeId, strokes])
await t('お題どおりの色で全部ぬり＋手間をかけると伝説（27点以上）', async () => {
  const [r, r2] = await scoreOutfit({ hair: 6, face: 14, top: 5, arms: 9, bottom: 8, shoes: 4 }, 'tropical', 60)
  expect(r.total >= 27 && r.tier === 'legend', JSON.stringify(r)); expect(JSON.stringify(r) === JSON.stringify(r2), 'not deterministic'); return { total: r.total, scores: r.scores, info: r.info }
})
await t('全身ひと色（お題の色）はまあまあ止まり＋パジャマのひとこと', async () => {
  const [r] = await scoreOutfit({ hair: 3, face: 3, top: 3, arms: 3, bottom: 3, shoes: 3 }, 'flamenco', 0)
  expect(r.special === 'mono' && r.total >= 14 && r.total <= 23, JSON.stringify(r)); return { total: r.total, tier: r.tier }
})
await t('お題と違う色で半分だけぬるとブーイング以下', async () => {
  const [r] = await scoreOutfit({ top: [6], bottom: [7], hair: 6 }, 'snow', 5)
  expect(r.total <= 15, JSON.stringify(r)); return { total: r.total, tier: r.tier, info: r.info }
})
await t('点の分布: 5段階すべてに届く', async () => {
  const plans = [[{}, 'snow'], [{ top: 3, bottom: 1, hair: 1 }, 'rock'], [{ hair: 3, face: 3, top: 3, arms: 3, bottom: 3, shoes: 3 }, 'flamenco'], [{ hair: 1, face: 14, top: 3, arms: 12, bottom: 1, shoes: 13 }, 'rock'], [{ hair: 6, face: 14, top: 5, arms: 9, bottom: 8, shoes: 4 }, 'tropical']]
  const tiers = []; for (const [pl, th] of plans) { const [r] = await scoreOutfit(pl, th, 40); tiers.push(r.tier + ':' + r.total) }
  for (const k of ['disaster', 'boo', 'meh', 'great', 'legend']) expect(tiers.some(s => s.startsWith(k)), k + ' missing ' + tiers.join(','))
  return tiers
})

// ---------- ショー（実時間を止めて台本どおりに進める）
async function runShow(page, plan, themeId, name) {
  await page.evaluate(([plan, themeId]) => {
    nr.setTheme(themeId); nr.S.outfit = Object.fromEntries(nr.PARTS.map(q => { const c = document.createElement('canvas'); c.width = q.box.w * 2; c.height = q.box.h * 2; return [q.id, c] }))
    for (const [id, col] of Object.entries(plan)) nr.bucket(id, col)
    nr.S.strokes = 60; nr.dbg.pause(true); nr.startShow()
  }, [plan, themeId])
  await page.waitForTimeout(100)
  const step = async sec => { await page.evaluate(n => { nr.dbg.step(n); nr.dbg.render() }, Math.round(sec * 60)); await page.waitForTimeout(60) }
  await step(3); await page.screenshot({ path: `${ROOT}/shots/${name}-1walk.png` })
  const hidden = await page.evaluate(() => [...document.querySelectorAll('.jc .sc')].map(e => e.textContent).join(''))
  await step(5); await page.screenshot({ path: `${ROOT}/shots/${name}-2judge.png` })
  await step(5.5); await page.screenshot({ path: `${ROOT}/shots/${name}-3react.png` })
  const mid = await page.evaluate(() => ({ splats: nr.SH.splats.length, roses: nr.SH.roses.length, faint: nr.SH.aud.filter(a => a.faint > 0).length, texts: nr.SH.texts.length, expr: nr.SH.expr, tier: nr.S.result.tier, total: nr.S.result.total }))
  await step(3); await page.waitForTimeout(500); await page.screenshot({ path: `${ROOT}/shots/${name}-4result.png` })
  const end = await page.evaluate(() => ({ result: !document.querySelector('#result').hidden, stamp: document.querySelector('#rStamp').textContent, cm: document.querySelectorAll('#rCmts .cm').length, splats: nr.SH.splats.length, roses: nr.SH.roses.length, faint: nr.SH.aud.filter(a => a.faint >= 1).length }))
  return { hidden, mid, end }
}
await t('ショー: 点は発表まで見えない → 低得点はトマトまみれ・泣き顔・大炎上', async () => {
  const r = await runShow(p, { top: 7 }, 'snow', '10-disaster')
  expect(r.hidden === '???', 'scores visible early: ' + r.hidden)
  expect(r.mid.tier === 'disaster' && r.mid.splats >= 8 && r.mid.expr === 'sad' && r.mid.texts > 0, JSON.stringify(r.mid))
  expect(r.end.result && r.end.stamp === '大炎上' && r.end.cm === 3, JSON.stringify(r.end)); return { mid: r.mid, end: r.end }
})
await t('コメントは審査員自身の点に合う（10点なのに低評価を言わない）', async () => {
  const r = await p.evaluate(() => { nr.S.result = { ...nr.S.result, scores: [1, 2, 10], total: 13, tier: 'boo', special: null }; document.querySelector('#result').hidden = false; nr.fillResult(); return [...document.querySelectorAll('#rCmts .cm p')].map(e => e.textContent) })
  const robo = r[2]; expect(!/低|修理|ぬり残し を 多数/.test(robo), robo); return robo
})
await t('大炎上では空から巨大トマトが落ちる', async () => { const n = await p.evaluate(() => nr.SH.splats.filter(s => s.r >= 80).length); expect(n === 1, n) })
await t('ショー: 高得点はバラ・失神する観客・ハートの目・伝説', async () => {
  const r = await runShow(p, { hair: 6, face: 14, top: 5, arms: 9, bottom: 8, shoes: 4 }, 'tropical', '11-legend')
  expect(r.mid.tier === 'legend' && r.mid.roses >= 5 && r.mid.splats === 0 && r.mid.expr === 'love', JSON.stringify(r.mid))
  expect(r.end.stamp === '伝説' && r.end.faint >= 3, JSON.stringify(r.end)); return { mid: r.mid, end: r.end }
})
await t('ショーの画面が描けている（輝度の散らばり）', async () => { const v = await variance(p, '#show'); expect(v > 500, v); return v })
await t('結果画面ではみ出しがない', async () => { const o = await overflow(p); expect(o.sw <= o.W && !o.bad.length, JSON.stringify(o)) })
await t('結果の画像を保存できる（1080x1350・50KB以上）', async () => {
  const r = await p.evaluate(async () => { const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = () => {}; const b = await nr.saveImage(); HTMLAnchorElement.prototype.click = orig
    const bm = await createImageBitmap(b); return { size: b.size, w: bm.width, h: bm.height } })
  expect(r.size > 50000 && r.w === 1080 && r.h === 1350, JSON.stringify(r)); return r
})
await t('スキップしても結果が出る（途中から）', async () => {
  await p.evaluate(() => { nr.dbg.pause(false); nr.S.outfit = nr.S.outfit; nr.startShow() }); await p.waitForTimeout(1200)
  await p.click('#bSkip'); await p.waitForSelector('#result:not([hidden])', { timeout: 3000 })
  return await p.textContent('#rStamp')
})
await t('もう一回ぬるで、白紙のぬり画面に戻る', async () => {
  await p.click('#bAgain'); const c = await covs(); expect(Object.values(c).every(v => v === 0) && await p.isVisible('#paint'), JSON.stringify(c))
})
await t('音: 曲と効果音が鳴っている', async () => {
  const r = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 900)); return { played: nr.Snd.played, level: nr.Snd.level() } })
  expect(r.played['bgm:paint'] && r.played['bgm:runway'] && r.played.splat && r.played.ding && r.played.boo && r.played.applause, JSON.stringify(r.played)); return Object.keys(r.played).length + ' kinds'
})
await t('まっ白のままランウェイへ → 確認が出る', async () => {
  await p.click('#bRunway'); expect(await p.isVisible('#blankDlg'), 'no dialog'); await p.click('#bKeep')
})
await t('通しでエラーが出ていない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })

// ---------- 英語
await t('英語に切り替えると文言・お題・審査員が英語になる', async () => {
  await p.click('#bLang'); const r = await p.evaluate(() => ({ run: document.querySelector('#bRunway').textContent, th: document.querySelector('#pTheme').textContent, pt: document.querySelector('.pt').textContent }))
  expect(r.run.includes('runway') && /[A-Za-z]/.test(r.th) && r.pt.startsWith('Hair'), JSON.stringify(r)); await p.click('#bLang'); return r
})
await p.close()

// ---------- 画面サイズ
for (const [w, h, name] of [[360, 640, 'small'], [844, 390, 'land'], [1440, 900, 'pc'], [768, 1024, 'tab']]) {
  const q = await open(browser, { viewport: { width: w, height: h } })
  await q.click('#bStart'); await q.waitForFunction(() => !document.querySelector('#bThemeGo').disabled); await q.click('#bThemeGo')
  await q.waitForTimeout(200)
  await t(`${name} ${w}x${h}: ぬり画面が収まり、キャンバスが使える大きさ`, async () => {
    const r = await q.evaluate(() => { const g = id => document.querySelector(id).getBoundingClientRect(); return { cv: g('#paint'), run: g('#bRunway'), H: innerHeight, sw: document.documentElement.scrollWidth, W: innerWidth } })
    expect(r.cv.height >= Math.min(260, r.H * 0.5) && r.run.bottom <= r.H + 1 && r.sw <= r.W, JSON.stringify({ cvH: r.cv.height, run: r.run.bottom, H: r.H, sw: r.sw }))
    return { canvasH: Math.round(r.cv.height) }
  })
  await q.screenshot({ path: `${ROOT}/shots/20-paint-${name}.png` })
  await q.evaluate(() => { for (const id of ['hair', 'face', 'top', 'arms', 'bottom', 'shoes']) nr.bucket(id, 4); nr.dbg.pause(true); nr.startShow(); nr.dbg.step(60 * 12.5); nr.dbg.render() })
  await q.waitForTimeout(80); await q.screenshot({ path: `${ROOT}/shots/21-show-${name}.png` })
  await t(`${name}: ショー中のマネキンが画面内に収まる`, async () => {
    const r = await q.evaluate(() => { const m = nr.modelXf(); return { top: Math.round(m.y - 530 * m.sc), bottom: Math.round(m.y), H: innerHeight, judgesTop: Math.round(document.querySelector('#judges').getBoundingClientRect().top) } })
    expect(r.top >= 0 && r.bottom <= r.H, JSON.stringify(r)); return r
  })
  await q.evaluate(() => { nr.dbg.step(60 * 5); nr.dbg.render() }); await q.waitForTimeout(500)
  await t(`${name}: 結果画面ではみ出しがない`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length, JSON.stringify(o)) })
  await q.screenshot({ path: `${ROOT}/shots/22-result-${name}.png` })
  await t(`${name}: エラーなし`, async () => { expect(q.errs.length === 0, q.errs.join('|')) })
  await q.close()
}
await browser.close()

// ---------- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch()
const wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 起動してタッチでぬれる', async () => {
  await wp.tap('#bStart'); await wp.waitForFunction(() => !document.querySelector('#bThemeGo').disabled); await wp.tap('#bThemeGo')
  const s = await wp.evaluate(() => { const r = document.querySelector('#paint').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 380 / 560].map((v, i) => i ? v : v - r.width * 28 / 300) })
  await wp.click('[data-tool="bucket"]'); await wp.touchscreen.tap(...s)
  const c = await wp.evaluate(() => nr.coverage(nr.S.outfit, 'bottom')); expect(c > 0.97, c); return c
})
await t('WebKit: ショーから結果まで通る', async () => {
  await wp.evaluate(() => { nr.dbg.pause(true); nr.startShow(); nr.dbg.step(60 * 17); nr.dbg.render() }); await wp.waitForTimeout(500)
  expect(await wp.isVisible('#result'), 'no result'); await wp.screenshot({ path: ROOT + '/shots/30-webkit-result.png' }); return await wp.textContent('#rStamp')
})
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
