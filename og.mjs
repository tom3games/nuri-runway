// SNS用サムネ og.png（1200x630）。node og.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5323' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' })
await p.addInitScript(() => { try { localStorage.setItem('nr.tut', '1') } catch (e) {} })
await p.goto('http://localhost:5323/'); await p.waitForFunction(() => window.__nrReady)
await p.evaluate(() => document.fonts.ready)
// 左にマネキンが投げられている所、右にタイトル
await p.evaluate(() => {
  nr.setTheme('snow'); for (const [id, c] of Object.entries({ hair: 5, top: 7, bottom: 13, shoes: 3 })) nr.bucket(id, c)
  nr.S.strokes = 2; nr.dbg.pause(true); nr.startShow(); nr.dbg.step(60 * 13.4); nr.dbg.render()
})
await p.addStyleTag({ content: `#mc,#judges,#bSkip,#corner,#totalBox{display:none!important}#show{transform:translateX(-200px)}
  body::after{content:'';position:fixed;inset:0 0 0 52%;background:linear-gradient(90deg,rgba(26,11,36,0),rgba(26,11,36,.92) 18%);z-index:30}` })
await p.evaluate(() => {
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:40px;top:0;bottom:0;width:520px;z-index:31;display:flex;flex-direction:column;justify-content:center;gap:22px;color:#fff;text-align:center'
  d.innerHTML = `<div style="font-family:'Dela Gothic One';font-size:92px;line-height:1.05;text-shadow:0 6px 0 #a3185a,0 0 30px rgba(255,79,154,.7)">ぬりぬり<br><span style="color:#f5c84c">ランウェイ</span></div>
  <div style="font-weight:900;font-size:30px;font-family:'Zen Maru Gothic'">マネキンをぬって、ショーに出せ。<br>点が低いと、トマトが飛んでくる。</div>`
  document.body.appendChild(d)
})
await p.waitForTimeout(400)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok')
