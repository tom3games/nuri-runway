// SNS用サムネ og.png（1200x630）。node og.mjs
// 左にトマトを投げられるマネキン、右にタイトルと、辛口JKの点と一言
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5323' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' }); await muteContext(ctx)
const p = await ctx.newPage()
// 乱数を固定して毎回同じ絵にする（客の吹き出しが重なる回を避ける。OGSEED で変えられる）
await p.addInitScript(seed => { let a = seed; Math.random = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }; try { localStorage.setItem('nr.tut', '1') } catch (e) {} }, +(process.env.OGSEED || 7))
await p.goto('http://localhost:5323/'); await p.waitForFunction(() => window.__nrReady)
await p.evaluate(() => document.fonts.ready)
const jk = await p.evaluate(() => {
  nr.setTheme('snow'); for (const [id, c] of Object.entries({ hair: 5, top: 7, bottom: 13, shoes: 3 })) nr.bucket(id, c)
  nr.S.strokes = 2; nr.dbg.pause(true); nr.startShow(); nr.dbg.step(60 * 13.4); nr.dbg.render()
  const j = [...document.querySelectorAll('.jc')].find(e => /JK/.test(e.textContent)) || document.querySelector('.jc[data-j="3"]')
  return { face: j.querySelector('.face').innerHTML, score: j.querySelector('.sc').textContent.trim() }
})
await p.addStyleTag({ content: `#mc,#judges,#bSkip,#corner,#totalBox{display:none!important}#show{transform:translateX(-240px)}
  body::after{content:'';position:fixed;inset:0 0 0 46%;background:linear-gradient(90deg,rgba(26,11,36,0),rgba(26,11,36,.94) 16%);z-index:30}` })
await p.evaluate(jk => {
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:30px;top:0;bottom:0;width:640px;z-index:31;display:flex;flex-direction:column;justify-content:center;gap:16px;color:#fff'
  d.innerHTML = `<div style="font-family:'Dela Gothic One';font-size:78px;line-height:1.04;text-align:center;text-shadow:0 6px 0 #a3185a,0 0 26px rgba(255,79,154,.7)">ぬりぬり<br><span style="color:#f5c84c">ランウェイ</span></div>
  <div style="font-weight:900;font-size:26px;line-height:1.4;text-align:center;font-family:'Zen Maru Gothic'">マネキンをぬって、ショーに出せ。<br>点が低いと、トマトが飛んでくる。</div>
  <div style="display:flex;align-items:center;gap:16px;margin-top:10px">
    <div style="flex:none;width:150px;height:150px;border-radius:50%;box-shadow:0 0 0 5px #f5c84c,0 0 34px rgba(245,200,76,.5);overflow:hidden" class="face" data-mood="bad">${jk.face}</div>
    <div style="flex:1;transform:rotate(-1.5deg)">
      <div style="font-family:'Zen Maru Gothic';font-weight:900;font-size:24px;color:#f5c84c;margin:0 0 6px 6px">辛口JK ミオの採点　<span style="font-family:'Dela Gothic One';font-weight:400;font-size:40px;color:#ff5a6a">${jk.score}</span><span style="font-size:22px"> / 10</span></div>
      <div style="background:#fff;color:#1a0b24;font-family:'Zen Maru Gothic';font-weight:900;font-size:44px;padding:12px 20px 14px;border-radius:18px 18px 18px 4px;white-space:nowrap">親が選んだ服？</div>
    </div>
  </div>`
  document.body.appendChild(d)
  const f = d.querySelector('svg'); if (f) { f.style.width = '100%'; f.style.height = '100%'; f.style.display = 'block' }
}, jk)
await p.waitForTimeout(400)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok', jk.score)
