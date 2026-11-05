// 音の割り当て（全部録音素材。出所は CREDITS.md）。game.js はここの sfx / setTrack / tick を呼ぶ
(() => {
  Snd.def({
    tap: 'snd/tap.mp3', undo: 'snd/undo.mp3', brush: ['snd/brush1.mp3', 'snd/brush2.mp3'], bucket: 'snd/bucket.mp3', stamp: ['snd/stamp1.mp3', 'snd/stamp2.mp3', 'snd/stamp3.mp3'],
    ding: 'snd/ding.mp3', hit: 'snd/hit1.mp3', boom: 'snd/boom.mp3', splat: ['snd/splat1.mp3', 'snd/splat2.mp3', 'snd/splat3.mp3'], whoosh: ['snd/whoosh1.mp3', 'snd/whoosh2.mp3'],
    flash: 'snd/flash.mp3', faint: 'snd/faint.mp3', giggle: 'snd/giggle.mp3', crowd: 'snd/crowd.mp3', applause: 'snd/applause.mp3',
  })
  // 最初のタップまでに頼まれていた曲を、音が使えるようになった時点で鳴らし始める
  const init0 = Snd.init
  Snd.init = function () { const first = !this.ctx; init0.call(this); if (first && this.ctx) for (const k in this.loops) { const l = this.loops[k]; if (l && l.url && !l.node) this.loop(k, l.url, l.vol) } }
  const BGM = { title: ['snd/bgm_title.mp3', 0.2], paint: ['snd/bgm_paint.mp3', 0.2], runway: ['snd/bgm_runway.mp3', 0.26], sad: ['snd/bgm_sad.mp3', 0.2] }
  Snd.lastBrush = 0
  Snd.setTrack = function (name) {
    if (this.want === name) return; this.want = name
    const t = name && BGM[name]
    this.loop('bgm', t ? t[0] : null, t ? t[1] : 0, 0.5)
    // ショーの間は客席のざわめきを敷く
    this.loop('amb', name === 'runway' || name === 'sad' ? 'snd/murmur.mp3' : null, 0.1, 0.8)
    if (name && this.ctx) this.played['bgm:' + name] = (this.played['bgm:' + name] || 0) + 1
  }
  Snd.tick = function () {}
  Snd.sfx = function (n, v = 1) {
    if (!this.ctx) return
    const P = (k, o) => this.play(k, o)
    switch (n) {
      case 'tap': P('tap', { vol: 0.55 * v, jitter: 0 }); break
      case 'brush': { const t = this.now(); if (t - this.lastBrush < 0.09) return; this.lastBrush = t; P('brush', { vol: 0.16 * v, jitter: 0.1 }); break }
      case 'bucket': P('bucket', { vol: 0.7 }); break
      case 'stamp': P('stamp', { vol: 0.6 * v }); break
      case 'undo': P('undo', { vol: 0.6 }); break
      case 'roll': P('crowd', { vol: 0.3, rate: 0.95 }); break        // 採点の間、客席がざわつく
      case 'ding': P('ding', { vol: 0.5, rate: Math.pow(2, (v - 5) / 8), jitter: 0 }); break
      case 'hit': P('hit', { vol: 1 }); P('boom', { vol: 0.8 }); this.duck(0.35, 1.2); break
      case 'boo': P('crowd', { vol: 0.75, rate: 0.72, room: 0.3 }); break
      case 'applause': P('applause', { vol: Math.min(1, 0.65 * v) }); break
      case 'cheer': P('crowd', { vol: 0.6, rate: 1.18 }); break
      case 'splat': P('splat', { vol: Math.min(1, 0.65 * v) }); break
      case 'whoosh': P('whoosh', { vol: 0.5 }); break
      case 'flash': P('flash', { vol: 0.28, rate: 1.5 }); break
      case 'cricket': P('giggle', { vol: 0.28 }); break               // しらけた客席のくすくす笑い
      case 'boom': P('boom', { vol: 1, rate: 0.7 }); break
      case 'faint': P('faint', { vol: 0.6 }); break
      case 'spin': P('whoosh', { vol: 0.7, rate: 0.7 }); break
    }
    this.played[n] = (this.played[n] || 0) + 1
  }
})()
