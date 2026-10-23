// ぬりぬりランウェイ 本体。文言とお題は data.js
'use strict'
const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)]
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }

// ---------- 状態
const S = {
  lang: 'ja', view: 'title', theme: null, lastTheme: null,
  tool: 'pen', size: 1, stamp: 'heart', color: 4, mirror: false,
  outfit: null, undo: [], strokes: 0, stamps: 0, buckets: 0,
  result: null,
}
const T = k => { const v = STR[S.lang][k]; return v === undefined ? STR.ja[k] : v }
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '')
const themeName = th => S.lang === 'ja' ? th.ja : th.en

// ---------- マネキンの形（設計座標 300x560）
const MW = 300, MH = 560
function mirrorD(d) { return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${MW - +x},${y}`) }
const ARM_L = 'M92,146 C78,148 70,156 66,176 L52,262 C50,280 48,300 50,318 C52,330 66,332 70,320 L74,300 L82,262 L96,190 Z'
const SHOE_L = 'M100,490 L144,490 L146,512 C146,522 140,526 130,526 L92,526 C84,526 84,516 92,512 Z'
const PARTS = [
  // 描く順（奥から手前）
  { id: 'arms', d: [ARM_L, mirrorD(ARM_L)], box: { x: 46, y: 142, w: 208, h: 194 } },
  { id: 'bottom', d: ['M98,262 L202,262 C208,290 208,310 204,330 L196,494 L160,494 L154,330 L146,330 L140,494 L104,494 L96,330 C92,310 92,290 98,262 Z'], box: { x: 90, y: 258, w: 120, h: 240 } },
  { id: 'shoes', d: [SHOE_L, mirrorD(SHOE_L)], box: { x: 82, y: 486, w: 136, h: 44 } },
  { id: 'top', d: ['M90,146 C110,134 190,134 210,146 L216,176 C212,206 204,236 202,266 L98,266 C96,236 88,206 84,176 Z'], box: { x: 82, y: 132, w: 136, h: 136 } },
  { id: 'face', d: ['M139,116 L139,146 L161,146 L161,116 Z', 'M112,84 A38,46 0 1,0 188,84 A38,46 0 1,0 112,84 Z'], line: ['M139,124 L139,146 L161,146 L161,124', 'M112,84 A38,46 0 1,0 188,84 A38,46 0 1,0 112,84 Z'], box: { x: 110, y: 36, w: 80, h: 112 } },
  { id: 'hair', d: ['M104,86 C96,26 204,26 196,86 C192,70 180,58 166,56 C150,64 128,62 116,58 C108,66 106,76 104,86 Z'], box: { x: 94, y: 28, w: 112, h: 62 } },
]
const PART_ORDER_UI = ['hair', 'face', 'top', 'arms', 'bottom', 'shoes']
const PART_W = { hair: 0.13, face: 0.12, top: 0.24, arms: 0.13, bottom: 0.24, shoes: 0.14 }
const PS = 3 // ぬり用キャンバスの解像度（設計1pxあたり）。拡大しても粗く見えないよう3倍
const BASE = '#e7ddd2', LINE = '#3a2a3e'
for (const p of PARTS) { p.path = new Path2D(); for (const d of p.d) p.path.addPath(new Path2D(d)); p.linePath = new Path2D(); for (const d of p.line || p.d) p.linePath.addPath(new Path2D(d)) }
const PART = Object.fromEntries(PARTS.map(p => [p.id, p]))

// パーツごとの「中かどうか」の表（ぬり率の計算用）
for (const p of PARTS) {
  const c = document.createElement('canvas'); c.width = p.box.w * PS; c.height = p.box.h * PS
  const x = c.getContext('2d'); x.setTransform(PS, 0, 0, PS, -p.box.x * PS, -p.box.y * PS); x.fillStyle = '#000'; x.fill(p.path)
  const d = x.getImageData(0, 0, c.width, c.height).data, m = new Uint8Array(c.width * c.height); let n = 0
  for (let i = 0; i < m.length; i++) if (d[i * 4 + 3] > 127) { m[i] = 1; n++ }
  p.mask = m; p.maskN = n
}

function newOutfit() {
  const o = {}
  for (const p of PARTS) { const c = document.createElement('canvas'); c.width = p.box.w * PS; c.height = p.box.h * PS; o[p.id] = c }
  return o
}
function partCtx(outfit, id) {
  const p = PART[id], x = outfit[id].getContext('2d')
  x.setTransform(PS, 0, 0, PS, -p.box.x * PS, -p.box.y * PS); return x
}
function partAt(x, y) {
  for (let i = PARTS.length - 1; i >= 0; i--) if (hitCtx.isPointInPath(PARTS[i].path, x, y)) return PARTS[i].id
  return null
}
const hitCtx = document.createElement('canvas').getContext('2d')

// ---------- マネキンを描く。ctx は設計座標に合わせて呼ぶ側で変換しておく
function drawModel(ctx, outfit, o = {}) {
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  for (const p of PARTS) {
    ctx.fillStyle = BASE; ctx.fill(p.path)
    if (outfit) ctx.drawImage(outfit[p.id], p.box.x, p.box.y, p.box.w, p.box.h)
  }
  // うっすら影で立体感
  ctx.save(); ctx.clip(PART.top.path); const g = ctx.createLinearGradient(84, 0, 216, 0)
  g.addColorStop(0, 'rgba(0,0,0,.16)'); g.addColorStop(.35, 'rgba(0,0,0,0)'); g.addColorStop(.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.18)')
  ctx.fillStyle = g; ctx.fillRect(80, 130, 140, 140); ctx.restore()
  ctx.strokeStyle = LINE; ctx.lineWidth = 2.6
  for (const p of PARTS) ctx.stroke(p.linePath)
  // ズボンの股と靴の中心線
  ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(150, 290); ctx.lineTo(150, 330); ctx.stroke()
  drawFace(ctx, o.expr || 'neutral', o.t || 0)
  if (o.splats) for (const s of o.splats) drawSplat(ctx, s)
  ctx.restore()
}
function drawFace(ctx, expr, t) {
  const ink = LINE
  const line = (fn, w = 2.6) => { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = w + 2.4; ctx.beginPath(); fn(); ctx.stroke(); ctx.strokeStyle = ink; ctx.lineWidth = w; ctx.beginPath(); fn(); ctx.stroke(); ctx.restore() }
  const dot = (x, y, r) => { ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, 7); ctx.fill(); ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.restore() }
  const blush = () => { ctx.save(); ctx.fillStyle = 'rgba(255,90,140,.35)'; for (const x of [128, 172]) { ctx.beginPath(); ctx.ellipse(x, 98, 7, 4, 0, 0, 7); ctx.fill() } ctx.restore() }
  if (expr === 'neutral') { dot(136, 84, 2.8); dot(164, 84, 2.8); line(() => { ctx.arc(150, 98, 8, 0.2 * Math.PI, 0.8 * Math.PI) }) }
  else if (expr === 'smug') { line(() => { ctx.moveTo(129, 84); ctx.lineTo(141, 82) }); line(() => { ctx.moveTo(159, 82); ctx.lineTo(171, 84) }); line(() => { ctx.moveTo(140, 104); ctx.quadraticCurveTo(152, 108, 160, 100) }); blush() }
  else if (expr === 'happy') {
    line(() => { ctx.arc(136, 87, 6, 1.1 * Math.PI, 1.9 * Math.PI) }); line(() => { ctx.arc(164, 87, 6, 1.1 * Math.PI, 1.9 * Math.PI) })
    ctx.save(); ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(138, 98); ctx.quadraticCurveTo(150, 118, 162, 98); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff6f8f'; ctx.beginPath(); ctx.ellipse(150, 106, 6, 3, 0, 0, 7); ctx.fill(); ctx.restore(); blush()
  } else if (expr === 'love') {
    for (const x of [136, 164]) { ctx.save(); ctx.fillStyle = '#ff2f6d'; ctx.translate(x, 84); const s = 1 + 0.15 * Math.sin(t * 10); ctx.scale(s, s); heartPath(ctx, 0, 0, 9); ctx.fill(); ctx.restore() }
    ctx.save(); ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(136, 98); ctx.quadraticCurveTo(150, 122, 164, 98); ctx.closePath(); ctx.fill(); ctx.restore(); blush()
  } else if (expr === 'sad') {
    line(() => { ctx.moveTo(130, 80); ctx.lineTo(141, 84) }); line(() => { ctx.moveTo(170, 80); ctx.lineTo(159, 84) })
    line(() => { ctx.moveTo(138, 108); ctx.quadraticCurveTo(144, 100, 150, 106); ctx.quadraticCurveTo(156, 100, 162, 108) })
    ctx.save(); ctx.fillStyle = 'rgba(80,170,255,.85)'
    for (const x of [134, 166]) { const k = (t * 1.8) % 1; ctx.beginPath(); ctx.ellipse(x, 90 + k * 26, 3.4, 5, 0, 0, 7); ctx.fill(); ctx.fillRect(x - 2, 88, 4, k * 24) }
    ctx.restore()
  } else if (expr === 'shock') {
    for (const x of [136, 164]) { ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(x, 84, 7, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x, 84, 2.4, 0, 7); ctx.fill(); ctx.restore() }
    ctx.save(); ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(150, 106, 6, 8, 0, 0, 7); ctx.fill(); ctx.restore()
  }
}
function heartPath(ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y + r * 0.9)
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.35)
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.6, y - r * 0.1, x, y + r * 0.9); ctx.closePath()
}
function starPath(ctx, x, y, r) {
  ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) } ctx.closePath()
}
function drawSplat(ctx, s) {
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 0.92
  const col = s.kind === 'egg' ? '#ffd23a' : s.kind === 'cabbage' ? '#7bc043' : '#d7261e'
  ctx.fillStyle = col; ctx.beginPath()
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = s.r * (i % 2 ? 0.6 : 1) * (0.85 + 0.3 * ((s.seed * (i + 3)) % 1)); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) }
  ctx.closePath(); ctx.fill()
  if (s.kind === 'egg') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-s.r * 0.3, -s.r * 0.2, s.r * 0.5, s.r * 0.35, 0.4, 0, 7); ctx.fill(); ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.arc(s.r * 0.1, s.r * 0.05, s.r * 0.32, 0, 7); ctx.fill() }
  else { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-s.r * 0.25, -s.r * 0.3, s.r * 0.22, s.r * 0.12, -0.5, 0, 7); ctx.fill() }
  // したたり
  ctx.fillStyle = col; ctx.fillRect(-2, 0, 4, s.r * 0.9 + s.drip); ctx.beginPath(); ctx.arc(0, s.r * 0.9 + s.drip, 3, 0, 7); ctx.fill()
  ctx.restore()
}

// ---------- ぬり
const SIZES = [4, 10, 22]
function stampAt(x, ctx, px, py, kind) {
  ctx.fillStyle = PALETTE[S.color].c
  if (kind === 'heart') { heartPath(ctx, px, py, 9); ctx.fill() }
  else if (kind === 'star') { starPath(ctx, px, py, 11); ctx.fill() }
  else { for (const [dx, dy] of [[0, 0], [-10, -9], [10, -9], [-10, 9], [10, 9]]) { ctx.beginPath(); ctx.arc(px + dx, py + dy, 3.6, 0, 7); ctx.fill() } }
}
function pushUndo(ids) {
  S.undo.push(ids.map(id => ({ id, img: S.outfit[id].getContext('2d').getImageData(0, 0, S.outfit[id].width, S.outfit[id].height) })))
  if (S.undo.length > 20) S.undo.shift()
  $('#bUndo').disabled = false
}
function doUndo() {
  const u = S.undo.pop(); if (!u) return
  for (const e of u) S.outfit[e.id].getContext('2d').putImageData(e.img, 0, 0)
  $('#bUndo').disabled = !S.undo.length; Snd.sfx('undo'); updateParts(); paintDirty = true
}
function bucket(id, color) {
  const x = partCtx(S.outfit, id), p = PART[id]
  x.save(); x.clip(p.path); x.globalCompositeOperation = 'source-over'; x.fillStyle = PALETTE[color].c; x.fillRect(p.box.x, p.box.y, p.box.w, p.box.h); x.restore()
}
// ストロークの開始。mirror なら反対側も
let cur = null
function strokeBegin(x, y) {
  // 拡大中は選んだパーツだけにぬる（パーツの外から描き始めても、はみ出さずにそのパーツへ）
  const id = S.zoom || partAt(x, y); if (!id) return false
  const targets = [{ id, mx: false }]
  if (S.mirror && S.tool !== 'bucket') { const mid = S.zoom || partAt(MW - x, y); if (mid && Math.abs(MW - x - x) > 2) targets.push({ id: mid, mx: true }) }
  pushUndo([...new Set(targets.map(t => t.id))])
  if (S.tool === 'bucket') { bucket(id, S.color); S.buckets++; Snd.sfx('bucket'); setActivePart(id); cur = null; updateParts(); paintDirty = true; return true }
  cur = { targets, lx: x, ly: y, acc: 0 }
  if (S.tool === 'stamp') { S.stamps++; dab(x, y, true); Snd.sfx('stamp') } else { if (S.tool === 'pen') S.strokes++; dab(x, y, false) }
  setActivePart(id); paintDirty = true; return true
}
function dab(x, y, isStamp, fx, fy) {
  for (const t of cur.targets) {
    const ctx = partCtx(S.outfit, t.id), p = PART[t.id]
    const X = t.mx ? MW - x : x, FX = fx === undefined ? X : (t.mx ? MW - fx : fx), FY = fy === undefined ? y : fy
    ctx.save(); ctx.clip(p.path)
    if (isStamp) stampAt(null, ctx, X, y, S.stamp)
    else {
      ctx.globalCompositeOperation = S.tool === 'eraser' ? 'destination-out' : 'source-over'
      ctx.strokeStyle = ctx.fillStyle = PALETTE[S.color].c; ctx.lineWidth = SIZES[S.size] * (S.tool === 'eraser' ? 1.4 : 1); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.beginPath(); ctx.moveTo(FX, FY); ctx.lineTo(X + 0.01, y); ctx.stroke()
    }
    ctx.restore()
  }
}
function strokeMove(x, y) {
  if (!cur) return
  if (S.tool === 'stamp') {
    cur.acc += Math.hypot(x - cur.lx, y - cur.ly); cur.lx = x; cur.ly = y
    if (cur.acc > 24) { cur.acc = 0; dab(x, y, true); S.stamps++; Snd.sfx('stamp', 0.4) }
  } else { dab(x, y, false, cur.lx, cur.ly); cur.lx = x; cur.ly = y; Snd.sfx('brush') }
  paintDirty = true
}
function strokeEnd() { if (!cur) return; cur = null; updateParts() }

// ぬり率と色の集計
function nearestColor(r, g, b) {
  let best = 0, bd = 1e9
  for (let i = 0; i < PALETTE.length; i++) { const c = PALETTE[i].rgb, d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2; if (d < bd) { bd = d; best = i } }
  return best
}
for (const p of PALETTE) p.rgb = [1, 3, 5].map(i => parseInt(p.c.slice(i, i + 2), 16))
function coverage(outfit, id) {
  const p = PART[id], d = outfit[id].getContext('2d').getImageData(0, 0, outfit[id].width, outfit[id].height).data
  let n = 0; for (let i = 0; i < p.mask.length; i++) if (p.mask[i] && d[i * 4 + 3] > 127) n++
  return n / p.maskN
}
function analyze(outfit = S.outfit) {
  const st = { cov: {}, hist: new Array(PALETTE.length).fill(0), histP: {}, strokes: S.strokes, stamps: S.stamps, buckets: S.buckets }
  for (const p of PARTS) {
    const d = outfit[p.id].getContext('2d').getImageData(0, 0, outfit[p.id].width, outfit[p.id].height).data
    const h = new Array(PALETTE.length).fill(0); let n = 0
    for (let i = 0; i < p.mask.length; i++) {
      if (!p.mask[i] || d[i * 4 + 3] <= 127) continue
      n++; if (i % 3) continue
      h[nearestColor(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])]++
    }
    st.cov[p.id] = n / p.maskN; st.histP[p.id] = h
    // 部位の大きさの差で全体の色の比率が偏らないよう、重みで足す
    const tot = h.reduce((a, b) => a + b, 0) || 1
    for (let i = 0; i < h.length; i++) st.hist[i] += h[i] / tot * PART_W[p.id] * st.cov[p.id]
  }
  return st
}
// 採点（同じ絵なら同じ点）
function scoreFrom(st, theme, seed = 1) {
  const cov = PARTS.reduce((a, p) => a + PART_W[p.id] * st.cov[p.id], 0)
  const minCov = Math.min(...PARTS.map(p => st.cov[p.id]))
  const tot = st.hist.reduce((a, b) => a + b, 0) || 1, share = st.hist.map(v => v / tot)
  const themeShare = theme.colors.reduce((a, i) => a + share[i], 0)
  const nColors = share.filter(v => v >= 0.03).length
  const doms = new Set(PARTS.filter(p => st.cov[p.id] > 0.3).map(p => { const h = st.histP[p.id]; return h.indexOf(Math.max(...h)) }))
  const detail = Math.min(1, Math.log10(1 + st.strokes + st.stamps * 0.5 + st.buckets * 0.5) / 1.6)
  const cs = nColors === 0 ? 0 : nColors === 1 ? 0.15 : nColors === 2 ? 0.5 : nColors <= 6 ? 1 : nColors <= 8 ? 0.8 : 0.6
  const varParts = Math.min(1, Math.max(0, doms.size - 1) / 3)
  const raw = [
    10 * Math.pow(cov, 0.7) * (0.1 + 0.9 * Math.min(1, themeShare / 0.85)),
    10 * Math.pow(cov, 0.8) * (0.45 * cs + 0.3 * detail + 0.25 * varParts),
    10 * Math.pow(0.45 * cov + 0.55 * minCov, 1.3),
  ]
  const r = rng(seed)
  const scores = raw.map(v => cov < 0.02 ? 0 : clamp(Math.round(v + (r() - 0.5) * 1.4), 0, 10))
  const total = scores.reduce((a, b) => a + b, 0)
  let tier = TIERS[0]; for (const t of TIERS) if (total >= t.min) tier = t
  const special = cov < 0.02 ? 'blank' : (nColors === 1 && cov > 0.5) ? 'mono' : null
  return { scores, total, tier: tier.id, special, info: { cov: +cov.toFixed(3), minCov: +minCov.toFixed(3), themeShare: +themeShare.toFixed(3), nColors, doms: doms.size, detail: +detail.toFixed(2) } }
}
function seedOf(st) { let h = 2166136261; const s = JSON.stringify([st.cov, st.hist.map(v => +v.toFixed(4)), st.strokes, st.stamps]); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

// ---------- 音（素材なし。WebAudio で全部鳴らす）
const Snd = {
  ctx: null, muted: false, next: 0, step: 0, track: null, want: null, switchAt: 0, played: {}, lastBrush: 0,
  TEMPO: { title: 120, paint: 96, runway: 128, sad: 72 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      this.ctx = new AC()
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.master.connect(this.an); this.an.connect(this.ctx.destination)
      this.bgm = this.ctx.createGain(); this.bgm.gain.value = 0.0001; this.bgm.connect(this.master)
      const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, len)
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      if (this.want) { const w = this.want; this.want = null; this.setTrack(w) }
    } catch (e) { this.ctx = null }
  },
  setMute(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7 },
  tone(f, t0, dur, type = 'square', vol = 0.2, dest, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.02)
  },
  noise(t0, dur, vol, freq, type = 'highpass', dest, q) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02)
  },
  now() { return this.ctx ? this.ctx.currentTime : 0 },
  level() { if (!this.an) return 0; const d = new Float32Array(this.an.fftSize); this.an.getFloatTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); return m },
  mtof: m => 440 * Math.pow(2, (m - 69) / 12),
  mark(n) { this.played[n] = (this.played[n] || 0) + 1 },
  setTrack(name) {
    if (this.want === name) return
    this.want = name; if (!this.ctx) return
    const now = this.ctx.currentTime, g = this.bgm.gain
    g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, now + 0.25)
    this.switchAt = now + 0.27
  },
  tick() {
    if (!this.ctx) return; const c = this.ctx
    if (this.switchAt && c.currentTime >= this.switchAt) {
      this.track = this.want; this.step = 0; this.next = c.currentTime + 0.05; this.switchAt = 0
      const g = this.bgm.gain; g.cancelScheduledValues(c.currentTime); g.setValueAtTime(0.0001, c.currentTime); g.linearRampToValueAtTime(0.26, c.currentTime + 0.35)
      if (this.track) this.mark('bgm:' + this.track)
    }
    if (!this.track || this.switchAt) return
    const spb = 60 / this.TEMPO[this.track] / 4
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05
    while (this.next < c.currentTime + 0.25) { this['p_' + this.track](this.step, this.next); this.next += spb; this.step++ }
  },
  kick(t, v = 0.7) { this.tone(150, t, 0.16, 'sine', v, this.bgm, 42) },
  clap(t, v = 0.2) { for (const d of [0, 0.012, 0.024]) this.noise(t + d, 0.09, v, 1500, 'bandpass', this.bgm) },
  hat(t, v = 0.06, open) { this.noise(t, open ? 0.12 : 0.03, v, 8000, 'highpass', this.bgm) },
  bass(n, t, dur = 0.18, vol = 0.45, type = 'triangle') { this.tone(this.mtof(n), t, dur, type, vol, this.bgm) },
  pad(n, t, dur, vol = 0.04) { this.tone(this.mtof(n), t, dur, 'sine', vol, this.bgm); this.tone(this.mtof(n) * 2.005, t, dur * 0.6, 'sine', vol * 0.3, this.bgm) },
  stab(ns, t, dur = 0.14, vol = 0.04) {
    if (!this.ctx) return; const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain()
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(600, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    for (const n of ns) for (const d of [-8, 8]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.mtof(n); o.detune.value = d; o.connect(f); o.start(t); o.stop(t + dur + 0.02) }
    f.connect(g); g.connect(this.bgm)
  },
  // タイトル: おしゃれなハウス（Am7 - Fmaj7 - G - Em7）
  p_title(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16, ph = Math.floor(i / 64) % 2
    const root = [45, 41, 43, 40][bar], ch = [[57, 60, 64, 67], [57, 60, 64, 65], [55, 59, 62, 67], [55, 59, 62, 64]][bar]
    if (s % 4 === 0) this.kick(t, 0.6); if (s === 4 || s === 12) this.clap(t, 0.12); if (s % 4 === 2) this.hat(t, 0.07, true); else if (s % 2) this.hat(t, 0.03)
    if ([0, 3, 6, 10, 14].includes(s)) this.bass(root + (s === 14 ? 12 : 0), t, 0.16, 0.4)
    if (s === 2 || s === 7 || s === 11) this.stab(ch, t, 0.12, 0.03)
    const mel = [[76, -1, 79, -1, 81, 79, -1, 76], [77, -1, 76, -1, 72, -1, 74, -1], [74, -1, 79, -1, 83, 81, -1, 79], [76, -1, -1, 74, 76, -1, -1, -1]]
    if (ph === 1 && s % 2 === 0) { const n = mel[bar][s / 2]; if (n > 0) this.tone(this.mtof(n), t, 0.2, 'triangle', 0.05, this.bgm) }
  },
  // ぬり: のんびりローファイ（Cmaj7 - Am7 - Dm7 - G7）
  p_paint(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const root = [36, 33, 38, 31][bar], ch = [[60, 64, 67, 71], [57, 60, 64, 67], [57, 60, 62, 65], [55, 59, 62, 65]][bar]
    if (s === 0 || s === 10) this.kick(t, 0.4); if (s === 4 || s === 12) this.clap(t, 0.06); if (s % 2 === 0) this.hat(t, s % 4 ? 0.035 : 0.02)
    if (s === 0) for (const n of ch) this.pad(n, t, 1.6, 0.03)
    if (s === 0) this.bass(root, t, 0.5, 0.32, 'sine'); if (s === 7) this.bass(root + 7, t, 0.3, 0.26, 'sine')
    const mel = [72, 76, 79, 76, 74, 77, 81, 77]
    if (s === 6 || s === 14) this.tone(this.mtof(mel[(bar * 2 + (s === 14)) % 8]), t, 0.35, 'sine', 0.05, this.bgm)
  },
  // ランウェイ: 4つ打ち（Fm - Db - Eb - C）
  p_runway(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const root = [41, 37, 39, 36][bar], ch = [[65, 68, 72], [65, 68, 73], [63, 67, 70], [64, 67, 72]][bar]
    if (s % 4 === 0) this.kick(t, 0.75); if (s === 4 || s === 12) this.clap(t, 0.16); if (s % 4 === 2) this.hat(t, 0.09, true); else this.hat(t, 0.025)
    if (s % 2 === 1) this.bass(root + (s % 4 === 3 ? 12 : 0), t, 0.11, 0.42, 'sawtooth')
    if (s === 0 || s === 6 || s === 10) this.stab(ch, t, 0.16, 0.035)
  },
  // 残念: 物悲しいワルツ風（Am - Dm - E - Am）
  p_sad(i, t) {
    const bar = Math.floor(i / 12) % 4, s = i % 12
    const ch = [[57, 60, 64], [57, 62, 65], [56, 59, 64], [57, 60, 64]][bar], root = [33, 38, 40, 33][bar]
    if (s === 0) this.bass(root, t, 0.8, 0.3, 'sine'); if (s === 4 || s === 8) for (const n of ch) this.tone(this.mtof(n), t, 0.4, 'triangle', 0.02, this.bgm)
    const mel = [[76, 74, 72], [74, 72, 69], [71, 69, 68], [69, -1, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.tone(this.mtof(n), t, 0.5, 'sine', 0.06, this.bgm) }
  },
  // 効果音
  sfx(name, v = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime; this.mark(name)
    switch (name) {
      case 'tap': this.tone(880, t, 0.06, 'triangle', 0.12 * v); break
      case 'brush': if (t - this.lastBrush < 0.07) return; this.lastBrush = t; this.noise(t, 0.06, 0.05 * v, 2500, 'bandpass', null, 1.2); break
      case 'bucket': this.tone(300, t, 0.25, 'sine', 0.35, null, 900); this.noise(t + 0.05, 0.2, 0.08, 1200, 'lowpass'); break
      case 'stamp': this.tone(660, t, 0.08, 'square', 0.08 * v, null, 990); break
      case 'undo': this.tone(700, t, 0.08, 'triangle', 0.12, null, 400); break
      case 'roll': for (let k = 0; k < 40; k++) this.noise(t + k * 0.04, 0.05, 0.05 + k * 0.004, 1800, 'bandpass'); break
      case 'ding': { const f = 440 * Math.pow(2, (v - 5) / 8); this.tone(f, t, 0.5, 'triangle', 0.3); this.tone(f * 2, t + 0.06, 0.4, 'sine', 0.15); break }
      case 'hit': this.tone(110, t, 0.5, 'sine', 0.8, null, 40); this.noise(t, 0.6, 0.3, 3000, 'lowpass'); this.tone(523, t, 0.6, 'square', 0.08); this.tone(659, t, 0.6, 'square', 0.06); break
      case 'boo': for (let k = 0; k < 9; k++) { const f = 105 + Math.random() * 40; this.tone(f, t + Math.random() * 0.2, 1.4, 'sawtooth', 0.04, null, f * 0.7) } this.noise(t, 1.4, 0.12, 500, 'lowpass'); break
      case 'applause': for (let k = 0; k < 90 * v; k++) this.noise(t + Math.random() * 2.2 * v, 0.03, 0.08, 1800 + Math.random() * 2000, 'bandpass', null, 0.8); break
      case 'cheer': this.noise(t, 2.2, 0.16, 1200, 'bandpass', null, 0.6); for (let k = 0; k < 4; k++) { const s = t + k * 0.35; this.tone(1800, s, 0.35, 'sine', 0.06, null, 2600) } break
      case 'splat': this.noise(t, 0.18, 0.4 * v, 700, 'lowpass'); this.tone(140, t, 0.16, 'sine', 0.3 * v, null, 50); break
      case 'whoosh': this.noise(t, 0.3, 0.05, 900, 'bandpass', null, 2); break
      case 'flash': this.noise(t, 0.04, 0.08, 6000); this.tone(1800, t, 0.03, 'square', 0.03); break
      case 'cricket': for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) this.tone(4200, t + k * 0.6 + j * 0.05, 0.03, 'sine', 0.05); break
      case 'boom': this.tone(80, t, 0.8, 'sine', 0.6, null, 30); this.noise(t, 0.8, 0.25, 1500, 'lowpass'); break
      case 'faint': this.tone(600, t, 0.4, 'triangle', 0.1, null, 150); break
      case 'spin': this.tone(400, t, 0.25, 'triangle', 0.08, null, 1200); break
    }
  },
}

// ---------- 顔アイコン（SVG）
const FACES = {
  mc: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#5b3df5"/><circle cx="32" cy="36" r="17" fill="#f6d2b6"/><path d="M14 26c4-14 32-14 36 0-8-5-28-5-36 0z" fill="#1d1424"/><rect x="18" y="8" width="28" height="10" rx="3" fill="#1d1424"/><rect x="12" y="16" width="40" height="5" rx="2.5" fill="#1d1424"/><circle cx="26" cy="35" r="2.4" fill="#1d1424"/><circle cx="38" cy="35" r="2.4" fill="#1d1424"/><path d="M22 43q5 3 10 0q5 3 10 0" stroke="#1d1424" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M27 48q5 4 10 0" stroke="#c0392b" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M24 56h16l-8 6z" fill="#f5c84c"/></svg>`,
  madame: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#8e44ad"/><circle cx="32" cy="22" r="16" fill="#c7a5ff"/><circle cx="20" cy="30" r="9" fill="#c7a5ff"/><circle cx="44" cy="30" r="9" fill="#c7a5ff"/><circle cx="32" cy="38" r="14" fill="#f6d2b6"/><rect x="20" y="31" width="10" height="7" rx="3" fill="#1d1424"/><rect x="34" y="31" width="10" height="7" rx="3" fill="#1d1424"/><path d="M30 34h4" stroke="#1d1424" stroke-width="2"/><path class="m-ok" d="M27 45q5 4 10 0" stroke="#c0182e" stroke-width="3" fill="none" stroke-linecap="round"/><path class="m-bad" d="M27 47q5-4 10 0" stroke="#c0182e" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="18" cy="44" r="3" fill="#f5c84c"/><circle cx="46" cy="44" r="3" fill="#f5c84c"/></svg>`,
  gal: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#ff4f9a"/><path d="M12 40c-2-22 12-30 20-30s22 8 20 30l-6-2-2-14H18l-2 14z" fill="#ffd36b"/><circle cx="32" cy="36" r="14" fill="#f3c2a0"/><path d="M18 24c6-6 22-6 28 0-6 2-22 2-28 0z" fill="#ffd36b"/><circle cx="26" cy="35" r="3" fill="#1d1424"/><circle cx="38" cy="35" r="3" fill="#1d1424"/><path d="M22 31l3-2M42 31l-3-2" stroke="#1d1424" stroke-width="1.6"/><path class="m-ok" d="M27 42q5 6 10 0z" fill="#c0182e"/><path class="m-bad" d="M27 45h10" stroke="#c0182e" stroke-width="3" stroke-linecap="round"/><circle cx="22" cy="41" r="2.6" fill="#ff8fb8"/><circle cx="42" cy="41" r="2.6" fill="#ff8fb8"/><path d="M46 14l3 3-3 3-3-3z" fill="#fff"/></svg>`,
  robo: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#2c1a8f"/><path d="M32 8v8" stroke="#9aa0a8" stroke-width="3"/><circle cx="32" cy="7" r="3.4" fill="#ff4f9a"/><rect x="14" y="16" width="36" height="32" rx="7" fill="#c9d0db"/><rect x="18" y="22" width="28" height="13" rx="4" fill="#1d1424"/><circle class="m-ok" cx="26" cy="28.5" r="3.4" fill="#5cf2a5"/><circle class="m-ok" cx="38" cy="28.5" r="3.4" fill="#5cf2a5"/><path class="m-bad" d="M22 26l8 5M30 26l-8 5M34 26l8 5M42 26l-8 5" stroke="#ff4040" stroke-width="2.4"/><rect x="22" y="40" width="20" height="4" rx="2" fill="#7b8291"/><rect x="10" y="26" width="4" height="10" rx="2" fill="#9aa0a8"/><rect x="50" y="26" width="4" height="10" rx="2" fill="#9aa0a8"/></svg>`,
}
function faceEl(id, mood = 'ok') { return `<div class="face" data-mood="${mood}">${FACES[id]}</div>` }
const faceStyle = document.createElement('style')
faceStyle.textContent = '.face[data-mood=ok] .m-bad,.face[data-mood=bad] .m-ok{display:none}.face svg,.mcFace svg{width:100%;height:100%;display:block}'
document.head.appendChild(faceStyle)

// ---------- 画面の切り替え
const VIEWS = ['vTitle', 'vTheme', 'vPaint', 'vShow', 'vHow']
function go(v) {
  S.view = v
  for (const id of VIEWS) $('#' + id).hidden = id !== v
  document.body.classList.toggle('party', v === 'vTitle')
  window.scrollTo(0, 0)
  Snd.setTrack({ vTitle: 'title', vTheme: 'title', vHow: 'title', vPaint: 'paint', vShow: 'runway' }[v])
  if (v === 'vPaint') requestAnimationFrame(layoutPaint)
  if (v === 'vShow') resizeShow()
}
function applyLang() {
  document.documentElement.lang = S.lang
  for (const el of $$('[data-t]')) {
    const k = el.dataset.t
    if (k === 'title') { el.innerHTML = S.lang === 'ja' ? 'ぬりぬり<b>ランウェイ</b>' : 'Paint <b>Runway</b>'; continue }
    el.textContent = T(k)
  }
  document.title = T('title')
  $('#langTxt').textContent = T('lang')
  $('#howList').innerHTML = T('howList').map(s => `<li>${s}</li>`).join('')
  $('#jList').innerHTML = JUDGES.map(j => `<div>${faceEl(j.id)}${S.lang === 'ja' ? j.ja : j.en}<small>${S.lang === 'ja' ? j.rja : j.ren}</small></div>`).join('')
  buildPaintUI()
  if (S.theme) showTheme(false)
  if (S.result && !$('#result').hidden) fillResult()
}

// ---------- お題
function rollTheme() {
  let th; do th = pick(THEMES); while (th === S.lastTheme && THEMES.length > 1)
  S.lastTheme = th; S.theme = th; return th
}
function showTheme(anim) {
  const th = S.theme
  const set = t => { $('#thName').textContent = themeName(t); $('#thKw').textContent = S.lang === 'ja' ? t.kja : t.ken }
  $('#thMc').textContent = S.lang === 'ja' ? `今日のショーのお題は「${th.ja}」。マネキンくんに着せる服を、ぬって作ってあげて！` : `Tonight's theme is "${th.en}". Paint an outfit for Mannequin-kun!`
  $('#pTheme').textContent = themeName(th); $('#pKw').textContent = S.lang === 'ja' ? th.kja : th.ken
  if (!anim) { set(th); return }
  const card = $('#themeCard'); card.classList.add('spin'); $('#bThemeGo').disabled = true; let k = 0
  const iv = setInterval(() => { set(pick(THEMES)); Snd.sfx('tap', 0.5); if (++k > 12) { clearInterval(iv); card.classList.remove('spin'); set(th); Snd.sfx('ding', 9); $('#bThemeGo').disabled = false } }, 80)
}

// ---------- ぬり画面
const TOOL_ICONS = {
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  bucket: '<path d="M5 11l7-7 7 7-7 7z"/><path d="M19 15c1.5 2 1.5 4 0 4s-1.5-2 0-4z"/>',
  stamp: '<path d="M12 4l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5-4.5 2.5 1-5L4.8 9.2l5-.6z"/>',
  eraser: '<path d="M8 20h12"/><path d="M4 15l9-9 6 6-7 7H8z"/>',
}
const STAMP_ICONS = {
  heart: '<path d="M12 19s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 7 2.5C19 14.5 12 19 12 19z"/>',
  star: '<path d="M12 4l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5-4.5 2.5 1-5L4.8 9.2l5-.6z"/>',
  dot: '<circle cx="12" cy="12" r="2.5"/><circle cx="6" cy="7" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="6" cy="17" r="2"/><circle cx="18" cy="17" r="2"/>',
}
function buildPaintUI() {
  $('#parts').innerHTML = `<button class="pt all" type="button" data-part=""><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>${T('whole')}</button>` +
    PART_ORDER_UI.map(id => `<button class="pt" type="button" data-part="${id}">${T('parts')[id]}<div class="bar"><i></i></div></button>`).join('')
  setActivePart(activePart)
  $('#toolRow').innerHTML = Object.keys(TOOL_ICONS).map(k => `<button class="tool${S.tool === k ? ' on' : ''}" type="button" data-tool="${k}" aria-label="${T('tools')[k]}"><svg viewBox="0 0 24 24">${TOOL_ICONS[k]}</svg><span>${T('tools')[k]}</span></button>`).join('')
  $('#pal').innerHTML = PALETTE.map((p, i) => `<button class="sw${S.color === i ? ' on' : ''}" type="button" data-color="${i}" style="background:${p.c}" aria-label="${S.lang === 'ja' ? p.ja : p.en}"></button>`).join('')
  buildSub(); updateParts()
}
function buildSub() {
  const row = $('#subRow')
  if (S.tool === 'stamp') row.innerHTML = Object.keys(STAMP_ICONS).map(k => `<button class="tool${S.stamp === k ? ' on' : ''}" type="button" data-stamp="${k}" aria-label="${T('stamps')[k]}"><svg viewBox="0 0 24 24">${STAMP_ICONS[k]}</svg><span>${T('stamps')[k]}</span></button>`).join('')
  else if (S.tool === 'bucket') row.innerHTML = `<button class="tool on" type="button" disabled style="opacity:1;background:transparent;color:inherit"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="${PALETTE[S.color].c}" stroke="#fff"/></svg><span>${S.lang === 'ja' ? PALETTE[S.color].ja : PALETTE[S.color].en}</span></button>`
  else row.innerHTML = SIZES.map((s, i) => `<button class="tool${S.size === i ? ' on' : ''}" type="button" data-size="${i}" aria-label="${T('sizes')[i]}"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="${[2.2, 4.5, 8][i]}" fill="currentColor" stroke="none"/></svg><span>${T('sizes')[i]}</span></button>`).join('')
}
let activePart = null
function setActivePart(id) { activePart = id; for (const b of $$('.pt')) b.classList.toggle('on', b.dataset.part === (S.zoom || '') && (!!S.zoom || !b.dataset.part)) }
// 表示範囲（設計座標）。パーツを選ぶとそのパーツへ寄る
const FULL = { x: 0, y: 0, w: MW, h: MH }
S.vw = { ...FULL }; S.vwT = { ...FULL }; S.zoom = null
// 腕と靴は左右で1パーツ。拡大は片側ずつ（左→右→全体）
const SIDES = { arms: { l: { x: 46, y: 142, w: 52, h: 194 }, r: { x: 202, y: 142, w: 52, h: 194 } }, shoes: { l: { x: 82, y: 486, w: 66, h: 44 }, r: { x: 152, y: 486, w: 66, h: 44 } } }
function zoomRect(id, side) {
  if (!id) return { ...FULL }
  const b = (SIDES[id] && side) ? SIDES[id][side] : PART[id].box, pad = 14, cx = b.x + b.w / 2, cy = b.y + b.h / 2
  let w = Math.max(b.w + pad * 2, (b.h + pad * 2) * MW / MH, MW / 3.2); w = Math.min(w, MW)
  const h = w * MH / MW
  return { x: clamp(cx - w / 2, 0, MW - w), y: clamp(cy - h / 2, -20, MH - h + 20), w, h }
}
function setZoom(id, side) {
  S.zoom = id || null; S.side = S.zoom && SIDES[S.zoom] ? (side || 'l') : null
  S.vwT = zoomRect(S.zoom, S.side); activePart = S.zoom
  setActivePart(S.zoom); paintDirty = true
  for (const b of $$('.pt .side')) b.remove()
  if (S.side) { const b = $(`.pt[data-part="${S.zoom}"]`); if (b) b.insertAdjacentHTML('afterbegin', `<b class="side">${T('side')[S.side]}</b>`) }
}
function cycleZoom(id) {
  if (!id) return setZoom(null)
  if (id !== S.zoom) return setZoom(id, 'l')
  if (S.side === 'l') return setZoom(id, 'r')
  setZoom(null)
}
function updateParts() {
  if (!S.outfit) return
  for (const b of $$('.pt')) { if (!b.dataset.part) continue; const c = coverage(S.outfit, b.dataset.part); b.querySelector('i').style.width = Math.round(c * 100) + '%'; b.classList.toggle('full', c > 0.97); b.dataset.cov = c.toFixed(3) }
}
let paintDirty = true, pScale = 1
function layoutPaint() {
  const box = $('#pBox'), cv = $('#paint')
  if ($('#vPaint').hidden) return
  // 空き領域から実寸を計算して入れる（高さの連鎖に頼らない）
  const bw = box.clientWidth, bh = box.clientHeight
  const h = Math.max(160, Math.min(bh, bw * MH / MW * 1.0)), w = h * MW / MH
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
  pScale = cv.width / MW; paintDirty = true
}
function renderPaint(t) {
  if (!paintDirty || $('#vPaint').hidden) return; paintDirty = false
  const cv = $('#paint'), x = cv.getContext('2d')
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height)
  // 表示範囲を目標へなめらかに寄せる
  const v = S.vw, g = S.vwT, k = 0.22
  for (const key of ['x', 'y', 'w', 'h']) { v[key] += (g[key] - v[key]) * k; if (Math.abs(g[key] - v[key]) < 0.05) v[key] = g[key] }
  if (v.x !== g.x || v.y !== g.y || v.w !== g.w) paintDirty = true
  const zs = pScale * MW / v.w
  x.setTransform(zs, 0, 0, zs, -v.x * zs, -v.y * zs)
  // 床の影
  x.fillStyle = 'rgba(60,30,70,.12)'; x.beginPath(); x.ellipse(150, 532, 80, 10, 0, 0, 7); x.fill()
  drawModel(x, S.outfit, { expr: 'neutral', t })
  // 拡大中は他のパーツを薄くして、ぬれる場所を分かりやすく
  if (S.zoom) { x.save(); const m = new Path2D(); m.rect(-50, -50, MW + 100, MH + 100); m.addPath(PART[S.zoom].path); x.fillStyle = 'rgba(250,244,236,.62)'; x.fill(m, 'evenodd'); x.restore() }
  if (activePart) { x.save(); x.setLineDash([6, 5]); x.lineDashOffset = -t * 20; x.strokeStyle = '#ff4f9a'; x.lineWidth = 2; x.stroke(PART[activePart].path); x.restore(); paintDirty = true }
  if (S.mirror) { x.save(); x.setLineDash([4, 6]); x.strokeStyle = 'rgba(91,61,245,.5)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(150, 20); x.lineTo(150, 540); x.stroke(); x.restore() }
}
function toDesign(e) { const r = $('#paint').getBoundingClientRect(), v = S.vw; return [v.x + (e.clientX - r.left) / r.width * v.w, v.y + (e.clientY - r.top) / r.height * v.h] }
function bindPaint() {
  const cv = $('#paint'); let pid = null
  cv.addEventListener('pointerdown', e => { Snd.init(); if (pid !== null) return; const [x, y] = toDesign(e); if (strokeBegin(x, y)) { pid = e.pointerId; try { cv.setPointerCapture(pid) } catch (er) {} } e.preventDefault() })
  cv.addEventListener('pointermove', e => { if (e.pointerId !== pid) return; const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; for (const ev of (evs.length ? evs : [e])) { const [x, y] = toDesign(ev); strokeMove(x, y) } })
  const end = e => { if (e.pointerId !== pid) return; pid = null; strokeEnd() }
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end)
  $('#parts').addEventListener('click', e => { const b = e.target.closest('.pt'); if (!b) return; cycleZoom(b.dataset.part); Snd.sfx(S.zoom ? 'spin' : 'tap') })
  $('#toolRow').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (!b) return; S.tool = b.dataset.tool; for (const x of $$('[data-tool]')) x.classList.toggle('on', x === b); buildSub(); Snd.sfx('tap') })
  $('#subRow').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return
    if (b.dataset.size) S.size = +b.dataset.size; if (b.dataset.stamp) S.stamp = b.dataset.stamp
    buildSub(); Snd.sfx('tap')
  })
  $('#pal').addEventListener('click', e => { const b = e.target.closest('.sw'); if (!b) return; S.color = +b.dataset.color; for (const x of $$('.sw')) x.classList.toggle('on', x === b); if (S.tool === 'eraser') { S.tool = 'pen'; buildPaintUI() } else buildSub(); Snd.sfx('tap') })
  $('#bMirror').addEventListener('click', () => { S.mirror = !S.mirror; $('#bMirror').classList.toggle('on', S.mirror); $('#bMirror').setAttribute('aria-pressed', S.mirror); paintDirty = true; Snd.sfx('tap') })
  $('#bUndo').addEventListener('click', doUndo)
  window.addEventListener('keydown', e => { if (!$('#vPaint').hidden && (e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); doUndo() } })
}
function startPaint(fresh) {
  if (fresh || !S.outfit) { S.outfit = newOutfit(); S.undo = []; S.strokes = S.stamps = S.buckets = 0; $('#bUndo').disabled = true }
  setZoom(null); S.vw = { ...FULL }; go('vPaint'); updateParts()
  let seen = null; try { seen = localStorage.getItem('nr.tut') } catch (e) {}
  if (!seen) openTut()
}

// ---------- チュートリアル
let tutI = 0
function openTut() { tutI = 0; $('#tut').hidden = false; drawTut() }
function drawTut() {
  const st = T('tut')[tutI], coarse = matchMedia('(pointer:coarse)').matches
  $('#tutStep').textContent = `${tutI + 1} / ${T('tut').length}`
  $('#tutT').textContent = st[0].replace('{tap}', coarse ? T('tapSp') : T('tapPc'))
  $('#tutP').textContent = st[1]
  $('#bTut').textContent = tutI === T('tut').length - 1 ? T('tutDone') : T('tutNext')
}
function nextTut() { Snd.init(); Snd.sfx('tap'); if (++tutI >= T('tut').length) { $('#tut').hidden = true; try { localStorage.setItem('nr.tut', '1') } catch (e) {} } else drawTut() }

// ---------- ショー
const SH = { t: 0, paused: false, events: [], parts: [], proj: [], texts: [], aud: [], splats: [], roses: [], expr: 'neutral', z: 0, shake: 0, flash: 0, res: null, W: 0, H: 0, dpr: 1, turn: 0, gold: 0, fireworks: [] }
function resizeShow() {
  const cv = $('#show'), dpr = Math.min(2, window.devicePixelRatio || 1)
  SH.W = window.innerWidth; SH.H = window.innerHeight; SH.dpr = dpr
  cv.width = Math.round(SH.W * dpr); cv.height = Math.round(SH.H * dpr)
}
function geom() {
  const W = SH.W, H = SH.H
  const short = H < 500 && W > H
  const vy = H * (short ? 0.22 : 0.3), backW = W * 0.1, frontW = Math.min(W * 0.66, H * (short ? 1.1 : 0.7))
  const frontY = H * (short ? 0.95 : 0.8), mh = short ? H * 0.74 : Math.min(H * 0.55, W * 1.15)
  return { W, H, vx: short ? W * 0.42 : W / 2, vy, backW, frontW, frontY, mh, short }
}
// 奥行き z(0..1) での画面位置
function depth(z) {
  const g = geom(), k = Math.pow(z, 1.6)
  return { y: lerp(g.vy + g.H * 0.05, g.frontY, k), w: lerp(g.backW, g.frontW, k), s: lerp(0.24, 1, k) }
}
function modelXf() {
  const g = geom(), d = depth(SH.z)
  const hpx = g.mh * d.s
  const sc = hpx / 530, bob = SH.walking ? Math.abs(Math.sin(SH.t * 7)) * 6 * d.s : 0
  return { x: g.vx, y: d.y - bob, sc, d }
}
function buildAudience() {
  SH.aud = []
  const r = rng(77)
  const g = geom(), rows = clamp(Math.ceil((g.W / 2 - g.frontW / 2) / 54) + 1, 3, 8)
  for (const side of [-1, 1]) for (let row = 0; row < rows; row++) for (let i = 0; i < 9; i++) {
    const z = (i + (row % 2) * 0.5) / 8.5
    SH.aud.push({ side, row, z, hue: Math.floor(r() * 360), ph: r() * 6, hair: r() < 0.5, faint: 0, fainting: false, cheer: 0, sleep: false, phone: r() < 0.3 })
  }
  SH.aud.sort((a, b) => a.z - b.z || b.row - a.row)
}
function audPos(a) {
  const g = geom(), d = depth(a.z)
  const x = g.vx + a.side * (d.w / 2 + (18 + a.row * 34) * d.s * 1.6)
  const y = d.y + a.row * 6 * d.s
  return { x, y, s: d.s * 1.5 }
}
function startShow() {
  S.result = (() => { const st = analyze(); const r = scoreFrom(st, S.theme, seedOf(st)); r.st = st; return r })()
  Object.assign(SH, { turnT: undefined, flashes: [], t: 0, events: [], parts: [], proj: [], texts: [], splats: [], roses: [], expr: 'smug', z: 0, shake: 0, flash: 0, walking: false, turn: 0, gold: 0, fireworks: [], tier: null, finished: false })
  buildAudience()
  $('#result').hidden = true; $('#judges').classList.add('off'); $('#totalBox').classList.remove('on'); $('#mc').style.opacity = 1; $('#bSkip').hidden = false
  $('#judges').innerHTML = JUDGES.map((j, i) => `<div class="jc" data-j="${i}">${faceEl(j.id)}<div class="nm">${S.lang === 'ja' ? j.ja : j.en}</div><div class="sc hidden"><span>?</span></div></div>`).join('')
  $('#mcTxt').textContent = T('mc0')
  go('vShow')
  const R = S.result, ev = (t, fn) => SH.events.push({ t, fn, done: false })
  ev(0.8, () => { SH.walking = true; Snd.sfx('cheer') })
  ev(1.8, () => { $('#mcTxt').textContent = fmt(T('mc1'), { t: themeName(S.theme) }) })
  ev(5.0, () => { SH.walking = false; SH.turnT = 0; Snd.sfx('spin') })
  ev(6.0, () => { $('#mcTxt').textContent = T('judging'); $('#judges').classList.remove('off'); Snd.setTrack(null) })
  ev(6.3, () => Snd.sfx('roll'))
  R.scores.forEach((s, i) => ev(7.9 + i * 0.9, () => revealJudge(i, s)))
  ev(10.6, () => { $('#totalNum').textContent = R.total; $('#totalBox').classList.add('on'); Snd.sfx('hit'); SH.shake = 10; SH.flash = 1 })
  ev(11.0, () => startReaction(R.tier))
  ev(13.6, () => $('#totalBox').classList.remove('on'))
  ev(16.0, () => finishShow())
}
function revealJudge(i, s) {
  const el = $(`.jc[data-j="${i}"] .sc`); el.classList.remove('hidden'); el.classList.add('flip'); el.innerHTML = `<span>${s}</span>`
  $(`.jc[data-j="${i}"] .face`).dataset.mood = s >= 6 ? 'ok' : 'bad'
  Snd.sfx('ding', s)
}
const TIER_EXPR = { disaster: 'sad', boo: 'shock', meh: 'neutral', great: 'happy', legend: 'love' }
function startReaction(tier) {
  SH.tier = tier; SH.expr = TIER_EXPR[tier]; $('#mcTxt').textContent = T('mcTier')[tier]
  const big = { disaster: 22, boo: 9, meh: 0, great: 0, legend: 0 }[tier]
  for (let k = 0; k < big; k++) SH.events.push({ t: SH.t + 0.15 + k * (tier === 'disaster' ? 0.12 : 0.28), fn: () => throwAt(pick(['tomato', 'tomato', 'egg', tier === 'disaster' ? 'cabbage' : 'tomato'])), done: false })
  if (tier === 'disaster') { SH.events.push({ t: SH.t + 2.6, fn: () => throwAt('giant'), done: false }); Snd.sfx('boo'); setTimeout(() => Snd.sfx('boo'), 900); Snd.setTrack('sad') }
  if (tier === 'boo') { Snd.sfx('boo'); Snd.setTrack('sad'); for (const a of SH.aud) if (Math.random() < 0.2) a.sleep = true }
  if (tier === 'meh') { Snd.sfx('applause', 0.35); Snd.sfx('cricket'); for (const a of SH.aud) if (Math.random() < 0.25) a.sleep = true; Snd.setTrack('paint') }
  if (tier === 'great') { Snd.sfx('applause', 1); Snd.sfx('cheer'); for (const a of SH.aud) a.cheer = 1; for (let k = 0; k < 10; k++) SH.events.push({ t: SH.t + 0.3 + k * 0.3, fn: () => throwAt('rose'), done: false }); Snd.setTrack('title') }
  if (tier === 'legend') {
    Snd.sfx('applause', 1.6); Snd.sfx('cheer'); setTimeout(() => Snd.sfx('cheer'), 1200); SH.gold = 1
    for (const a of SH.aud) { a.cheer = 1; if (Math.random() < 0.35) a.fainting = SH.t + 0.5 + Math.random() * 2.5 }
    for (let k = 0; k < 26; k++) SH.events.push({ t: SH.t + 0.2 + k * 0.14, fn: () => throwAt(pick(['rose', 'rose', 'bouquet'])), done: false })
    for (let k = 0; k < 6; k++) SH.events.push({ t: SH.t + 0.4 + k * 0.6, fn: () => firework(), done: false })
    confetti(160); Snd.setTrack('title')
  }
  const sh = SHOUTS[tier][S.lang]
  const n = { disaster: 14, boo: 8, meh: 4, great: 10, legend: 16 }[tier]
  for (let k = 0; k < n; k++) SH.events.push({ t: SH.t + 0.2 + k * 0.32, fn: () => { const a = pick(SH.aud), p = audPos(a); SH.texts.push({ x: p.x, y: p.y - 60 * p.s, s: pick(sh), life: 1.8, vy: -30, bad: tier === 'disaster' || tier === 'boo' }) }, done: false })
  for (const el of $$('#judges .face')) if (tier === 'disaster' || tier === 'boo') el.dataset.mood = 'bad'; else if (tier !== 'meh') el.dataset.mood = 'ok'
}
// 観客から投げる。当たる場所はマネキンの体の上（設計座標）
function throwAt(kind) {
  const a = pick(SH.aud.filter(a => a.row < 2)), p = audPos(a), m = modelXf()
  const tx = kind === 'rose' || kind === 'bouquet' ? 150 + (Math.random() - 0.5) * 220 : 110 + Math.random() * 80
  const ty = kind === 'rose' || kind === 'bouquet' ? 545 + Math.random() * 30 : 60 + Math.random() * 380
  if (kind === 'giant') {
    SH.proj.push({ kind, sx: m.x, sy: -200, tx: 150, ty: 200, t: 0, dur: 1.1, arc: 0, rot: 0 }); Snd.sfx('whoosh'); return
  }
  SH.proj.push({ kind, sx: p.x, sy: p.y - 40 * p.s, tx, ty, t: 0, dur: 0.7 + Math.random() * 0.25, arc: 140 + Math.random() * 120, rot: Math.random() * 6 })
  a.throwT = SH.t; Snd.sfx('whoosh')
}
function confetti(n) {
  const g = geom(), cols = ['#ff4f9a', '#f5c84c', '#5b3df5', '#56ccf2', '#fff', '#9be15d']
  for (let i = 0; i < n; i++) SH.parts.push({ x: Math.random() * g.W, y: -20 - Math.random() * g.H * 0.6, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 120, life: 6, c: pick(cols), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, kind: 'conf', sz: 5 + Math.random() * 6 })
}
function firework() {
  const g = geom(), x = g.W * (0.15 + Math.random() * 0.7), y = g.H * (0.08 + Math.random() * 0.2), c = pick(['#ff4f9a', '#f5c84c', '#56ccf2', '#c7a5ff'])
  for (let i = 0; i < 46; i++) { const a = i / 46 * Math.PI * 2, v = 120 + Math.random() * 90; SH.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.4, c, kind: 'spark', sz: 3 }) }
  Snd.sfx('boom')
}
function finishShow() {
  if (SH.finished) return; SH.finished = true
  $('#bSkip').hidden = true; $('#mc').style.opacity = 0; $('#judges').classList.add('off'); $('#totalBox').classList.remove('on')
  fillResult(); $('#result').hidden = false
}
function skipShow() {
  if (SH.finished) return
  // 未実行の出来事を全部すませてから結果へ
  SH.walking = false; SH.z = 1
  for (const e of SH.events) if (!e.done && e.t <= 11.0) { e.done = true; e.fn() }
  // 投げ物は着弾済みにする
  for (const e of SH.events) if (!e.done) { e.done = true; const before = SH.proj.length; e.fn(); if (SH.proj.length > before) landAll() }
  landAll(); SH.t = Math.max(SH.t, 16); finishShow()
}
function landAll() { for (const p of SH.proj.splice(0)) land(p) }
function land(p) {
  const m = modelXf()
  if (p.kind === 'rose' || p.kind === 'bouquet') { SH.roses.push({ x: p.tx, y: p.ty, rot: Math.random() * 6, kind: p.kind }); return }
  if (p.kind === 'giant') {
    SH.splats.push({ kind: 'tomato', x: 150, y: 200, r: 90, rot: 0, seed: Math.random(), drip: 0, vd: 30 }); SH.shake = 24; Snd.sfx('splat', 2); Snd.sfx('boom'); SH.expr = 'shock'; setTimeout(() => { if (SH.tier === 'disaster') SH.expr = 'sad' }, 900)
  } else {
    SH.splats.push({ kind: p.kind === 'egg' ? 'egg' : p.kind === 'cabbage' ? 'cabbage' : 'tomato', x: p.tx, y: p.ty, r: 14 + Math.random() * 12, rot: Math.random() * 6, seed: Math.random(), drip: 0, vd: 8 + Math.random() * 14 })
    SH.shake = Math.max(SH.shake, 5); Snd.sfx('splat')
  }
  // 飛び散り
  const sx = m.x + (p.tx - 150) * m.sc, sy = m.y + (p.ty - 530) * m.sc
  const c = p.kind === 'egg' ? '#ffd23a' : p.kind === 'cabbage' ? '#7bc043' : '#d7261e'
  for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 160; SH.parts.push({ x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0.8, c, kind: 'drop', sz: 3 + Math.random() * 4 }) }
}
// 固定60Hzで進める
function updateShow(dt) {
  SH.t += dt
  for (const e of SH.events) if (!e.done && SH.t >= e.t) { e.done = true; e.fn() }
  if (SH.walking) { SH.z = clamp((SH.t - 0.8) / 4.2, 0, 1); if (Math.random() < 0.06) { SH.flashes = (SH.flashes || []); SH.flashes.push({ a: pick(SH.aud), life: 0.18 }); Snd.sfx('flash') } }
  if (SH.turnT !== undefined && SH.turnT < 1) SH.turnT = Math.min(1, SH.turnT + dt / 0.7)
  for (const p of SH.proj) p.t += dt / p.dur
  for (let i = SH.proj.length - 1; i >= 0; i--) if (SH.proj[i].t >= 1) land(SH.proj.splice(i, 1)[0])
  for (const p of SH.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.kind === 'conf' ? 20 : 420) * dt; if (p.kind === 'conf') { p.vx *= 0.99; p.rot += p.vr * dt } p.life -= dt }
  for (let i = SH.parts.length - 1; i >= 0; i--) if (SH.parts[i].life <= 0 || SH.parts[i].y > SH.H + 40) SH.parts.splice(i, 1)
  for (const tx of SH.texts) { tx.y += tx.vy * dt; tx.life -= dt }
  for (let i = SH.texts.length - 1; i >= 0; i--) if (SH.texts[i].life <= 0) SH.texts.splice(i, 1)
  for (const s of SH.splats) if (s.drip < 30) s.drip += s.vd * dt * 0.4
  if (SH.flashes) { for (const f of SH.flashes) f.life -= dt; SH.flashes = SH.flashes.filter(f => f.life > 0) }
  if ((SH.tier === 'great' || SH.tier === 'legend') && Math.random() < (SH.tier === 'legend' ? 0.5 : 0.2)) { SH.flashes = SH.flashes || []; SH.flashes.push({ a: pick(SH.aud), life: 0.15 }) }
  for (const a of SH.aud) if (a.fainting && SH.t > a.fainting && a.faint < 1) { if (a.faint === 0) Snd.sfx('faint'); a.faint = Math.min(1, a.faint + dt * 2.5) }
  SH.shake *= Math.pow(0.02, dt); SH.flash = Math.max(0, SH.flash - dt * 2.5)
  if (SH.tier === 'legend' && SH.finished && Math.random() < 0.01) firework()
  if (SH.tier === 'legend' && Math.random() < 0.02 && SH.parts.length < 300) confetti(6)
}
function renderShow() {
  const cv = $('#show'), x = cv.getContext('2d'), g = geom(), { W, H } = g
  x.setTransform(SH.dpr, 0, 0, SH.dpr, 0, 0)
  const sh = SH.shake; x.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh)
  // 奥の壁
  const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2a0f3a'); bg.addColorStop(0.45, '#160820'); bg.addColorStop(1, '#0b0410')
  x.fillStyle = bg; x.fillRect(-30, -30, W + 60, H + 60)
  // 大画面
  const sw = Math.min(W * 0.62, 520), shh = Math.min(H * 0.13, 110), sx = g.vx - sw / 2, sy = Math.max(Math.min(g.vy - shh - 6, g.frontY - g.mh - shh - 14), 8)
  if (!g.short && !SH.finished) {
  x.fillStyle = '#05020a'; roundRect(x, sx - 6, sy - 6, sw + 12, shh + 12, 14); x.fill()
  const sg = x.createLinearGradient(sx, 0, sx + sw, 0); sg.addColorStop(0, '#5b3df5'); sg.addColorStop(0.5, '#ff4f9a'); sg.addColorStop(1, '#f5c84c')
  x.fillStyle = sg; x.globalAlpha = 0.9; roundRect(x, sx, sy, sw, shh, 10); x.fill(); x.globalAlpha = 1
  x.fillStyle = 'rgba(0,0,0,.18)'; for (let yy = sy; yy < sy + shh; yy += 4) x.fillRect(sx, yy, sw, 1.5)
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'
  x.font = `900 ${Math.round(shh * 0.2)}px 'Zen Maru Gothic',sans-serif`; x.fillText('NURI NURI COLLECTION', g.vx, sy + shh * 0.28)
  x.font = `${Math.round(shh * 0.36)}px 'Dela Gothic One',sans-serif`; fitText(x, themeName(S.theme), g.vx, sy + shh * 0.66, sw - 30)
  }
  // ライト
  for (const k of [-1, 1]) {
    const lx = g.vx + k * W * 0.35, a = Math.sin(SH.t * 0.9 + k) * 0.25
    x.save(); x.translate(lx, -10); x.rotate(-k * 0.35 + a); const lg = x.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, k < 0 ? 'rgba(255,120,190,.35)' : 'rgba(140,170,255,.3)'); lg.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = lg; x.beginPath(); x.moveTo(-8, 0); x.lineTo(8, 0); x.lineTo(W * 0.18, H); x.lineTo(-W * 0.18, H); x.fill(); x.restore()
  }
  // ランウェイ
  const back = depth(0), front = depth(1.15)
  x.fillStyle = '#efe3f5'; x.beginPath(); x.moveTo(g.vx - back.w / 2, back.y); x.lineTo(g.vx + back.w / 2, back.y); x.lineTo(g.vx + front.w / 2, front.y); x.lineTo(g.vx - front.w / 2, front.y); x.closePath(); x.fill()
  const rg = x.createLinearGradient(0, back.y, 0, front.y); rg.addColorStop(0, 'rgba(60,20,80,.55)'); rg.addColorStop(1, 'rgba(60,20,80,0)'); x.fillStyle = rg; x.fill()
  x.strokeStyle = '#f5c84c'; x.lineWidth = 3; x.stroke()
  for (let k = 0; k <= 10; k++) { const d = depth(k / 10 * 1.15); x.fillStyle = 'rgba(255,79,154,.55)'; x.beginPath(); x.arc(g.vx - d.w / 2, d.y, 3 * d.s + 1, 0, 7); x.arc(g.vx + d.w / 2, d.y, 3 * d.s + 1, 0, 7); x.fill() }
  // 床に落ちたバラ
  const m = modelXf()
  for (const r of SH.roses) drawRose(x, m.x + (r.x - 150) * m.sc, m.y + (r.y - 530) * m.sc, m.sc * (r.kind === 'bouquet' ? 1.6 : 1), r.rot)
  // スポットライト
  const sp = x.createRadialGradient(m.x, m.y - 260 * m.sc, 10, m.x, m.y - 200 * m.sc, 360 * m.sc)
  sp.addColorStop(0, SH.gold ? 'rgba(255,230,150,.45)' : 'rgba(255,255,255,.25)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = sp; x.fillRect(0, 0, W, H)
  // 観客（奥から）。モデルより奥の客 → モデル → 手前の客
  const behind = SH.aud.filter(a => a.z < SH.z + 0.02), front2 = SH.aud.filter(a => a.z >= SH.z + 0.02)
  for (const a of behind) drawAud(x, a)
  // マネキン
  x.save(); x.translate(m.x, m.y)
  const tsx = SH.turnT !== undefined && SH.turnT < 1 ? Math.cos(SH.turnT * Math.PI * 2) : 1
  const sway = SH.walking ? Math.sin(SH.t * 3.5) * 0.04 : 0
  x.rotate(sway); x.scale(m.sc * tsx, m.sc)
  x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(0, 4, 90, 14, 0, 0, 7); x.fill()
  x.translate(-150, -530)
  drawModel(x, S.outfit, { expr: SH.expr, t: SH.t, splats: SH.splats })
  x.restore()
  for (const a of front2) drawAud(x, a)
  // 飛んでいる物
  for (const p of SH.proj) {
    const ex = m.x + (p.tx - 150) * m.sc, ey = m.y + (p.ty - 530) * m.sc, k = p.t
    const px = lerp(p.sx, ex, k), py = lerp(p.sy, ey, k) - Math.sin(k * Math.PI) * p.arc
    const sc = p.kind === 'giant' ? 3 + k * 2 : 1
    drawThrown(x, p.kind, px, py, sc * Math.max(0.6, m.sc * 1.1), p.rot + k * 8)
  }
  for (const p of SH.parts) {
    x.globalAlpha = clamp(p.life * 2, 0, 1); x.fillStyle = p.c
    if (p.kind === 'conf') { x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.fillRect(-p.sz / 2, -p.sz / 4, p.sz, p.sz / 2); x.restore() }
    else { x.beginPath(); x.arc(p.x, p.y, p.sz, 0, 7); x.fill() }
  }
  x.globalAlpha = 1
  for (const f of SH.flashes || []) { const p = audPos(f.a); const r = 30 * p.s; const fg = x.createRadialGradient(p.x, p.y - 50 * p.s, 0, p.x, p.y - 50 * p.s, r * 2); fg.addColorStop(0, 'rgba(255,255,255,.95)'); fg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = fg; x.fillRect(p.x - r * 2, p.y - 50 * p.s - r * 2, r * 4, r * 4) }
  for (const t of SH.texts) {
    x.globalAlpha = clamp(t.life, 0, 1); x.font = `900 ${Math.round(clamp(W * 0.04, 15, 24))}px 'Zen Maru Gothic',sans-serif`
    const w = x.measureText(t.s).width + 18, hh = 30
    x.fillStyle = t.bad ? '#2a0a0a' : '#fff'; roundRect(x, t.x - w / 2, t.y - hh / 2, w, hh, 15); x.fill()
    x.fillStyle = t.bad ? '#ff6a4a' : '#c0186a'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t.s, t.x, t.y + 1)
  }
  x.globalAlpha = 1
  if (SH.flash > 0) { x.fillStyle = `rgba(255,255,255,${SH.flash * 0.5})`; x.fillRect(-30, -30, W + 60, H + 60) }
}
function fitText(x, s, cx, cy, maxW) { let sz = parseFloat(x.font); const fam = x.font.replace(/^.*?px\s*/, ''); while (x.measureText(s).width > maxW && sz > 10) { sz -= 1; x.font = `${sz}px ${fam}` } x.fillText(s, cx, cy) }
function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath() }
function drawAud(x, a) {
  const p = audPos(a), s = p.s, t = SH.t
  const jump = a.cheer ? Math.abs(Math.sin(t * 8 + a.ph)) * 10 * s : Math.sin(t * 2 + a.ph) * 1.5 * s
  x.save(); x.translate(p.x, p.y)
  if (a.faint) { x.rotate(a.side * a.faint * 1.4); x.translate(0, a.faint * 10 * s) }
  x.translate(0, -jump)
  const body = `hsl(${a.hue},45%,${28 + a.row * 4}%)`, skin = `hsl(${(a.hue * 7) % 40 + 15},45%,${70 - (a.hue % 3) * 8}%)`
  x.fillStyle = body; roundRect(x, -16 * s, -34 * s, 32 * s, 40 * s, 12 * s); x.fill()
  // 腕（喜ぶと上がる・投げる時は振りかぶる）
  const throwing = a.throwT && t - a.throwT < 0.35
  x.strokeStyle = body; x.lineWidth = 7 * s; x.lineCap = 'round'
  if (a.cheer || throwing) { x.beginPath(); x.moveTo(-12 * s, -28 * s); x.lineTo(-20 * s, -58 * s); x.moveTo(12 * s, -28 * s); x.lineTo(20 * s, (throwing ? -64 : -58) * s); x.stroke() }
  x.fillStyle = skin; x.beginPath(); x.arc(0, -46 * s, 12 * s, 0, 7); x.fill()
  if (a.hair) { x.fillStyle = `hsl(${a.hue + 180},30%,20%)`; x.beginPath(); x.arc(0, -50 * s, 12.5 * s, Math.PI, 0); x.fill() }
  // 顔
  x.fillStyle = '#1d1424'; x.strokeStyle = '#1d1424'; x.lineWidth = 1.6 * s
  if (a.faint > 0.5) { for (const d of [-4, 4]) { x.beginPath(); x.moveTo((d - 2) * s, -48 * s); x.lineTo((d + 2) * s, -44 * s); x.moveTo((d + 2) * s, -48 * s); x.lineTo((d - 2) * s, -44 * s); x.stroke() } }
  else if (a.sleep) { x.beginPath(); x.moveTo(-6 * s, -46 * s); x.lineTo(-2 * s, -46 * s); x.moveTo(2 * s, -46 * s); x.lineTo(6 * s, -46 * s); x.stroke(); x.font = `900 ${Math.round(12 * s)}px sans-serif`; x.fillStyle = '#c8bcd2'; x.fillText('z', 14 * s, (-60 - (t * 10 + a.ph * 5) % 12) * s) }
  else { for (const d of [-4, 4]) { x.beginPath(); x.arc(d * s, -47 * s, 1.6 * s, 0, 7); x.fill() } x.beginPath(); if (SH.tier === 'disaster' || SH.tier === 'boo') x.arc(0, -38 * s, 3.5 * s, 1.15 * Math.PI, 1.85 * Math.PI); else x.arc(0, -42 * s, 3.5 * s, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke() }
  if (a.phone && (SH.walking || a.cheer)) { x.fillStyle = '#111'; roundRect(x, 10 * s, -70 * s, 9 * s, 14 * s, 2 * s); x.fill(); x.fillStyle = '#9fd8ff'; x.fillRect(11.5 * s, -68 * s, 6 * s, 9 * s) }
  x.restore()
}
function drawThrown(x, kind, px, py, s, rot) {
  x.save(); x.translate(px, py); x.rotate(rot); x.scale(s, s)
  if (kind === 'tomato' || kind === 'giant') { x.fillStyle = '#e0261e'; x.beginPath(); x.arc(0, 0, 11, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.4)'; x.beginPath(); x.arc(-4, -4, 3, 0, 7); x.fill(); x.fillStyle = '#2e9e4f'; starPath(x, 0, -10, 5); x.fill() }
  else if (kind === 'egg') { x.fillStyle = '#fffaf0'; x.strokeStyle = '#d8cbb0'; x.lineWidth = 1.5; x.beginPath(); x.ellipse(0, 0, 8, 11, 0, 0, 7); x.fill(); x.stroke() }
  else if (kind === 'cabbage') { x.fillStyle = '#8fd14f'; x.beginPath(); x.arc(0, 0, 12, 0, 7); x.fill(); x.strokeStyle = '#5a9a2a'; x.lineWidth = 1.5; x.beginPath(); x.arc(-3, 0, 8, -1, 1.5); x.stroke() }
  else drawRose(x, 0, 0, kind === 'bouquet' ? 1.6 : 1, 0)
  x.restore()
}
function drawRose(x, px, py, s, rot) {
  x.save(); x.translate(px, py); x.rotate(rot); x.scale(s, s)
  x.strokeStyle = '#2e7d32'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(0, 0); x.lineTo(16, 10); x.stroke()
  x.fillStyle = '#4caf50'; x.beginPath(); x.ellipse(9, 2, 4, 2, 0.6, 0, 7); x.fill()
  x.fillStyle = '#e8174f'; x.beginPath(); x.arc(0, 0, 6.5, 0, 7); x.fill(); x.strokeStyle = '#a00c35'; x.lineWidth = 1.2; x.beginPath(); x.arc(0, 0, 3.5, 0, 5); x.stroke()
  x.restore()
}

// ---------- 結果
function commentFor(jid, tier, i) {
  const R = S.result
  if (i === 0 && R.special) return SPECIAL[R.special][S.lang]
  // コメントはその審査員自身の点で選ぶ（合計が低くても10点を付けた審査員はほめる）
  const sc = R.scores[i], own = sc <= 2 ? 'disaster' : sc <= 4 ? 'boo' : sc <= 6 ? 'meh' : sc <= 8 ? 'great' : 'legend'
  const list = COMMENTS[jid][own][S.lang], idx = (R.total + i * 3) % list.length
  return fmt(list[idx], { t: themeName(S.theme) })
}
function fillResult() {
  const R = S.result, tier = TIERS.find(t => t.id === R.tier)
  const st = $('#rStamp'); st.className = 'stamp ' + R.tier; st.textContent = S.lang === 'ja' ? tier.ja : tier.en
  $('#rTotal').textContent = R.total
  $('#rCmts').innerHTML = JUDGES.map((j, i) => `<div class="cm">${faceEl(j.id, R.scores[i] >= 6 ? 'ok' : 'bad')}<div><div class="who"><span>${S.lang === 'ja' ? j.ja : j.en}</span><b>${R.scores[i]}</b></div><p>${commentFor(j.id, R.tier, i)}</p></div></div>`).join('')
}
// 結果を1枚の画像に
async function saveImage() {
  const R = S.result, tier = TIERS.find(t => t.id === R.tier)
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d')
  const g = x.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, '#5a1f6e'); g.addColorStop(1, '#1a0b24'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350)
  try { await document.fonts.ready } catch (e) {}
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = "64px 'Dela Gothic One',sans-serif"; x.fillText(T('title'), 540, 110)
  x.font = "900 34px 'Zen Maru Gothic',sans-serif"; x.fillStyle = '#f5c84c'; x.fillText(`${T('themeIs')}: ${themeName(S.theme)}`, 540, 170)
  x.save(); x.translate(540 - 150 * 1.75, 210); x.scale(1.75, 1.75); x.fillStyle = 'rgba(0,0,0,.3)'; x.beginPath(); x.ellipse(150, 532, 90, 12, 0, 0, 7); x.fill()
  drawModel(x, S.outfit, { expr: TIER_EXPR[R.tier], t: 0.3, splats: SH.splats }); x.restore()
  x.save(); x.translate(820, 330); x.rotate(-0.14); x.strokeStyle = x.fillStyle = { disaster: '#ff5a3c', boo: '#ff8a5c', meh: '#c8bcd2', great: '#f5c84c', legend: '#ffffff' }[R.tier]
  x.lineWidth = 10; x.font = "84px 'Dela Gothic One',sans-serif"; const tw = x.measureText(S.lang === 'ja' ? tier.ja : tier.en).width + 50
  roundRect(x, -tw / 2, -70, tw, 120, 18); x.stroke(); x.fillText(S.lang === 'ja' ? tier.ja : tier.en, 0, 18); x.restore()
  x.fillStyle = '#fff'; x.font = "900 40px 'Zen Maru Gothic',sans-serif"; x.fillText(`${T('total')} ${R.total} / 30`, 540, 1225)
  x.font = "900 26px 'Zen Maru Gothic',sans-serif"; x.fillStyle = '#d9c3e0'
  x.fillText(JUDGES.map((j, i) => `${S.lang === 'ja' ? j.ja.split(' ').pop() : j.en.split(' ').pop()} ${R.scores[i]}`).join('   '), 540, 1275)
  x.fillText('tom3games.github.io/nuri-runway', 540, 1322)
  const blob = await new Promise(r => c.toBlob(r, 'image/png'))
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nuri-runway.png'; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(T('saved')); return blob
}
function toast(s) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = s; document.body.appendChild(d); setTimeout(() => d.remove(), 1600) }

// ---------- タイトルの見本マネキン
const SAMPLE = newOutfit()
;(() => {
  const fill = (id, c) => { const x = partCtx(SAMPLE, id), p = PART[id]; x.save(); x.clip(p.path); x.fillStyle = PALETTE[c].c; x.fillRect(p.box.x, p.box.y, p.box.w, p.box.h); x.restore() }
  fill('hair', 12); fill('top', 4); fill('bottom', 11); fill('shoes', 15); fill('arms', 4); fill('face', 14)
  const t = partCtx(SAMPLE, 'top'); t.save(); t.clip(PART.top.path); t.fillStyle = '#fff'
  for (let y = 150; y < 270; y += 22) for (let x = 90 + (y % 44 ? 11 : 0); x < 215; x += 22) { heartPath(t, x, y, 5); t.fill() }
  t.restore()
  const b = partCtx(SAMPLE, 'bottom'); b.save(); b.clip(PART.bottom.path); b.strokeStyle = '#f5c84c'; b.lineWidth = 4; b.beginPath(); b.moveTo(96, 290); b.lineTo(206, 290); b.stroke(); b.restore()
})()
function renderHero(t) {
  if ($('#vTitle').hidden) return
  const c = $('#hero'), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height)
  const sc = c.height / 560 * 0.98; x.translate(c.width / 2, 8 + Math.sin(t * 2.2) * 4); x.rotate(Math.sin(t * 1.3) * 0.025); x.scale(sc, sc); x.translate(-150, 0)
  x.fillStyle = 'rgba(0,0,0,.3)'; x.beginPath(); x.ellipse(150, 532, 80, 10, 0, 0, 7); x.fill()
  drawModel(x, SAMPLE, { expr: Math.floor(t / 3) % 2 ? 'smug' : 'happy', t })
}

// ---------- 背景の観客シルエット
;(() => {
  let d = '', x = 0; const r = rng(5)
  while (x < 1200) { const w = 34 + r() * 30, h = 50 + r() * 30; d += `M${x},100 L${x},${100 - h * 0.55} Q${x + w / 2},${100 - h * 0.7} ${x + w},${100 - h * 0.55} L${x + w},100 Z M${x + w / 2},${100 - h * 0.62} m-${w * 0.28},0 a${w * 0.28},${w * 0.28} 0 1,0 ${w * 0.56},0 a${w * 0.28},${w * 0.28} 0 1,0 -${w * 0.56},0 `; x += w - 6 }
  $('#crowdPath').setAttribute('d', d)
})()

// ---------- ループ（演出は固定60Hz）
let acc = 0, lastT = performance.now()
const STEP = 1 / 60
function loop() {
  const now = performance.now(); let dt = (now - lastT) / 1000; lastT = now; if (dt > 0.25) dt = 0.25
  if (!$('#vShow').hidden && !SH.paused) { acc += dt; while (acc >= STEP) { updateShow(STEP); acc -= STEP } } else acc = 0
  const t = now / 1000
  renderHero(t); renderPaint(t)
  if (!$('#vShow').hidden) renderShow()
  Snd.tick()
  requestAnimationFrame(loop)
}

// ---------- 起動
function boot() {
  try { const l = localStorage.getItem('nr.lang'); S.lang = l || ((navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en') } catch (e) { S.lang = (navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en' }
  try { if (localStorage.getItem('nr.mute') === '1') { Snd.muted = true; $('#icOn').hidden = true; $('#icOff').hidden = false } } catch (e) {}
  for (const el of $$('[data-face]')) el.innerHTML = FACES[el.dataset.face]
  S.outfit = newOutfit()
  applyLang(); bindPaint()
  const on = (id, fn) => $(id).addEventListener('click', e => { Snd.init(); fn(e) })
  on('#bStart', () => { Snd.sfx('tap'); rollTheme(); go('vTheme'); showTheme(true) })
  on('#bReroll', () => { rollTheme(); showTheme(true) })
  on('#bThemeGo', () => { Snd.sfx('tap'); startPaint(true) })
  on('#bHow', () => { Snd.sfx('tap'); go('vHow') })
  on('#bHowBack', () => { Snd.sfx('tap'); go('vTitle') })
  on('#bTut', nextTut)
  on('#bRunway', () => { Snd.sfx('tap'); const st = analyze(); const cov = PARTS.reduce((a, p) => a + PART_W[p.id] * st.cov[p.id], 0); if (cov < 0.02) $('#blankDlg').hidden = false; else startShow() })
  on('#bKeep', () => { $('#blankDlg').hidden = true })
  on('#bGoAnyway', () => { $('#blankDlg').hidden = true; startShow() })
  on('#bSkip', skipShow)
  on('#bAgain', () => { Snd.sfx('tap'); startPaint(true) })
  on('#bNext', () => { Snd.sfx('tap'); rollTheme(); go('vTheme'); showTheme(true) })
  on('#bSave', () => saveImage())
  on('#bTitle', () => { Snd.sfx('tap'); go('vTitle') })
  on('#bLang', () => { S.lang = S.lang === 'ja' ? 'en' : 'ja'; try { localStorage.setItem('nr.lang', S.lang) } catch (e) {} applyLang(); if (!$('#tut').hidden) drawTut() })
  on('#bMute', () => { Snd.setMute(!Snd.muted); $('#icOn').hidden = Snd.muted; $('#icOff').hidden = !Snd.muted; try { localStorage.setItem('nr.mute', Snd.muted ? '1' : '0') } catch (e) {} })
  window.addEventListener('resize', () => { layoutPaint(); if (!$('#vShow').hidden) resizeShow() })
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); acc = 0 })
  go('vTitle')
  requestAnimationFrame(loop)
  window.__nrReady = true
}

// 検証用の窓口
window.nr = {
  fillResult, modelXf, geom, S, SH, PARTS, THEMES, analyze, scoreFrom, seedOf, coverage, partAt, startShow, skipShow, saveImage, Snd,
  bucket: (id, c) => { pushUndo([id]); bucket(id, c); S.buckets++; updateParts(); paintDirty = true },
  stroke: (pts, opt = {}) => { Object.assign(S, opt); if (!strokeBegin(...pts[0])) return false; for (const p of pts.slice(1)) strokeMove(...p); strokeEnd(); return true },
  setTheme: id => { S.theme = THEMES.find(t => t.id === id); showTheme(false) },
  setZoom, PS,
  dbg: { pause: v => { SH.paused = v }, step: n => { for (let i = 0; i < n; i++) updateShow(STEP) }, render: () => renderShow() },
}
boot()
