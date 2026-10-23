// 文言・お題・審査員。ゲームの処理は game.js
'use strict'

// 16色。お題の「テーマ色」はこの番号で指す
const PALETTE = [
  { c: '#ffffff', ja: 'しろ', en: 'White' },
  { c: '#25232b', ja: 'くろ', en: 'Black' },
  { c: '#9aa0a8', ja: 'はいいろ', en: 'Gray' },
  { c: '#e53935', ja: 'あか', en: 'Red' },
  { c: '#ff7eb6', ja: 'ピンク', en: 'Pink' },
  { c: '#ff9a1f', ja: 'オレンジ', en: 'Orange' },
  { c: '#ffe14d', ja: 'きいろ', en: 'Yellow' },
  { c: '#9be15d', ja: 'きみどり', en: 'Lime' },
  { c: '#2e9e4f', ja: 'みどり', en: 'Green' },
  { c: '#56ccf2', ja: 'みずいろ', en: 'Sky' },
  { c: '#2f5bea', ja: 'あお', en: 'Blue' },
  { c: '#1b2a6b', ja: 'こん', en: 'Navy' },
  { c: '#8e44ad', ja: 'むらさき', en: 'Purple' },
  { c: '#8d5a3b', ja: 'ちゃいろ', en: 'Brown' },
  { c: '#ead5b2', ja: 'ベージュ', en: 'Beige' },
  { c: '#d4af37', ja: 'きんいろ', en: 'Gold' },
]

// お題。colors はテーマに合う色（PALETTE の番号）
const THEMES = [
  { id: 'tropical', ja: '南国バカンス', en: 'Tropical Vacation', kja: '太陽・ヤシの木・青い海', ken: 'Sun, palm trees, blue sea', colors: [6, 5, 7, 8, 9, 4] },
  { id: 'snow', ja: '雪の女王', en: 'The Snow Queen', kja: '氷・雪の結晶・つめたい夜', ken: 'Ice, snowflakes, a cold night', colors: [0, 9, 10, 2, 12] },
  { id: 'flamenco', ja: '情熱のフラメンコ', en: 'Passionate Flamenco', kja: 'バラ・情熱・夜の舞台', ken: 'Roses, passion, a night stage', colors: [3, 1, 15, 4] },
  { id: 'forest', ja: '森の妖精', en: 'Forest Fairy', kja: '葉っぱ・木の実・木もれ日', ken: 'Leaves, nuts, sunbeams', colors: [8, 7, 13, 14, 6] },
  { id: 'space', ja: '宇宙アイドル', en: 'Space Idol', kja: '銀河・ネオン・ステージ', ken: 'Galaxy, neon, the big stage', colors: [12, 11, 4, 9, 1, 15] },
  { id: 'newyear', ja: '和のお正月', en: 'Japanese New Year', kja: '紅白・金屏風・おめでたい', ken: 'Red and white, gold screens, luck', colors: [3, 0, 15, 1] },
  { id: 'cafe', ja: 'パリのカフェ', en: 'Paris Cafe', kja: 'カフェオレ・ベレー帽・石だたみ', ken: 'Cafe au lait, berets, cobblestones', colors: [14, 13, 11, 0, 1] },
  { id: 'halloween', ja: 'ハロウィンの夜', en: 'Halloween Night', kja: 'かぼちゃ・おばけ・満月', ken: 'Pumpkins, ghosts, full moon', colors: [5, 1, 12, 7] },
  { id: 'candy', ja: 'お菓子の国', en: 'Candy Kingdom', kja: 'マカロン・ソーダ・チョコ', ken: 'Macarons, soda, chocolate', colors: [4, 9, 6, 0, 13] },
  { id: 'rock', ja: 'ロックスター', en: 'Rock Star', kja: '革ジャン・ギター・爆音', ken: 'Leather jackets, guitars, noise', colors: [1, 3, 2, 0] },
  { id: 'pirate', ja: '海賊船長', en: 'Pirate Captain', kja: '宝箱・ドクロの旗・荒波', ken: 'Treasure, skull flags, rough seas', colors: [13, 1, 3, 15, 0] },
  { id: 'lunch', ja: '給食当番', en: 'School Lunch Duty', kja: '白衣・マスク・カレーの香り', ken: 'White coat, mask, curry smell', colors: [0, 2, 14] },
  { id: 'signal', ja: '信号機', en: 'Traffic Light', kja: '止まれ・注意・進め', ken: 'Stop, caution, go', colors: [3, 6, 8, 1] },
  { id: 'bride', ja: '花嫁', en: 'The Bride', kja: 'ドレス・ブーケ・ベール', ken: 'Dress, bouquet, veil', colors: [0, 14, 15, 4] },
]

// 審査員
const JUDGES = [
  { id: 'madame', ja: 'マダム・ガブリエラ', en: 'Madame Gabriela', rja: 'テーマに厳しい', ren: 'Strict about the theme' },
  { id: 'gal', ja: 'ギャル審査員 ルナ', en: 'Luna the Gyaru', rja: '盛りを見る', ren: 'Loves it bold' },
  { id: 'robo', ja: 'ロボ審査員 J-300', en: 'Judge-Bot J-300', rja: 'ぬり残しを許さない', ren: 'Hates unpainted spots' },
]

// 合計点（30点満点）の段階
const TIERS = [
  { id: 'disaster', min: 0, ja: '大炎上', en: 'TOTAL DISASTER' },
  { id: 'boo', min: 9, ja: 'ブーイング', en: 'BOOED' },
  { id: 'meh', min: 16, ja: 'まあまあ', en: 'MEH' },
  { id: 'great', min: 22, ja: '大喝采', en: 'STANDING OVATION' },
  { id: 'legend', min: 27, ja: '伝説', en: 'LEGENDARY' },
]

// 審査員ごとのコメント。tier ごとに数個から選ぶ。{t} はお題名
const COMMENTS = {
  madame: {
    disaster: { ja: ['これのどこが{t}ですの？ 帰ってよろしくてよ。', 'わたくしの目が腐りましたわ。弁償してくださる？'], en: ['How is this {t}? You may leave.', 'My eyes are ruined. Who pays for that?'] },
    boo: { ja: ['{t}を辞書で引いてから出直しなさい。', 'テーマを読んでいらして？ 読んでいないわね。'], en: ['Look up "{t}" in a dictionary, then come back.', 'Did you read the theme? You did not.'] },
    meh: { ja: ['{t}…と言われれば、まあ見えなくもないわ。', '悪くはないわ。良くもないけれど。'], en: ['{t}... if you squint, I suppose.', 'Not bad. Not good either.'] },
    great: { ja: ['これぞ{t}。わたくしが着たいくらいよ。', 'ブラボー。色の選び方に品があるわ。'], en: ['This IS {t}. I want to wear it myself.', 'Bravo. Your colors have class.'] },
    legend: { ja: ['……涙が止まりませんわ。今日から{t}の教科書はこれよ。', 'わたくしの50年の審査人生で、一番の{t}ですわ。'], en: ['...I cannot stop crying. This is now the textbook of {t}.', 'The finest {t} in my fifty years of judging.'] },
  },
  gal: {
    disaster: { ja: ['え、まって、これ服？ 裸じゃね？', 'ないないないない。マジでない。'], en: ['Wait, is that even clothes?', 'No no no no. Absolutely not.'] },
    boo: { ja: ['地味すぎて寝そうだったんだけど。', 'もっと盛ってこ？ 色ケチりすぎ。'], en: ['So plain I almost fell asleep.', 'Go bolder! Why so stingy with color?'] },
    meh: { ja: ['ふつーにアリ。ふつーに。', '惜しい！ あと一色ほしかった〜。'], en: ['It works. Like, normally.', 'So close! One more color, babe.'] },
    great: { ja: ['え、かわいすぎん？ 写真撮っていい？', 'センス爆発してる！ 優勝候補じゃん！'], en: ['Too cute! Can I take a pic?', 'Your sense just exploded! Total contender!'] },
    legend: { ja: ['無理無理無理、尊すぎて息できない。', 'ちょ、これ私のインスタのアイコンにする。'], en: ['I literally cannot breathe. Too precious.', 'This is my new profile picture. Done.'] },
  },
  robo: {
    disaster: { ja: ['ピピッ。ぬり残し率、測定不能。エラー。エラー。', '判定：これは マネキン です。服 では ありません。'], en: ['Beep. Unpainted area: off the charts. Error. Error.', 'Verdict: this is a mannequin. Not an outfit.'] },
    boo: { ja: ['ぬり残しを 多数 検出。修理 を 推奨 します。', '完成度 低。再提出 を 要求 します。'], en: ['Many unpainted spots detected. Repair advised.', 'Low completion. Resubmission required.'] },
    meh: { ja: ['完成度 中。ギリギリ 合格 ライン です。', 'ぬり残し 少々。許容 範囲 内。ピピ。'], en: ['Completion: medium. Barely passing.', 'Minor gaps. Within tolerance. Beep.'] },
    great: { ja: ['完成度 高。回路 が 少し 熱く なりました。', 'すき間 ゼロ に 近い。評価 します。'], en: ['High completion. My circuits feel warm.', 'Nearly zero gaps. Respect.'] },
    legend: { ja: ['ピーーーー。感動 回路 が オーバーヒート しました。', '計算 不能 な 美しさ。私 は 今日 から 人間 に なりたい。'], en: ['Beeeeep. Emotion circuit overheating.', 'Beauty beyond calculation. I want to be human.'] },
  },
}

// 特別なひとこと（条件に当たったら最初の審査員の代わりに言う）
const SPECIAL = {
  blank: { ja: '何も着ていないじゃない！ 警備員を呼んで！', en: 'There are no clothes at all! Call security!' },
  mono: { ja: '全身ひと色はパジャマよ、坊や。', en: 'One color head to toe is pajamas, darling.' },
}

// 観客の声
const SHOUTS = {
  disaster: { ja: ['帰れー！', '金返せ！', 'ブーー！', '目が！ 目がぁ！', 'トマト投げろ！'], en: ['Go home!', 'Refund!', 'BOOO!', 'My eyes!', 'Throw tomatoes!'] },
  boo: { ja: ['ブー！', 'なにそれ〜', 'ねむい…', '次いこ次！'], en: ['Boo!', 'What is that?', 'So sleepy...', 'Next!'] },
  meh: { ja: ['まあまあ', 'ふーん', 'パチパチ…', 'わるくない'], en: ['Okay', 'Hmm', 'Clap... clap...', 'Not bad'] },
  great: { ja: ['キャー！', 'かわいい！', '最高！', 'こっち向いて！'], en: ['Kyaa!', 'So cute!', 'Amazing!', 'Look here!'] },
  legend: { ja: ['神！', '優勝！', '泣いた', '一生ついていく！', '結婚して！'], en: ['GOD TIER!', 'WINNER!', 'I am crying', 'I would follow you forever!', 'Marry me!'] },
}

// 画面の文言
const STR = {
  ja: {
    title: 'ぬりぬりランウェイ',
    sub: 'マネキンをぬって、ショーに出せ',
    lead: 'このマネキンくんは、服を一着も持っていない。君がぬって、ランウェイに立たせてあげよう。',
    start: 'ショーに出る', how: '遊び方', back: 'もどる',
    themeIs: '今日のお題', themeGo: 'ぬりはじめる', reroll: 'お題を変える',
    parts: { hair: 'かみ', face: 'かお', top: 'トップス', arms: 'うで', bottom: 'ボトムス', shoes: 'くつ' },
    tools: { pen: 'ペン', bucket: 'バケツ', stamp: 'スタンプ', eraser: 'けしゴム' },
    mirror: '左右対称', undo: 'もどす', runway: 'ランウェイへ',
    confirmBlankT: 'まだ何もぬっていません', confirmBlank: 'このまま出ると、たぶん何か投げられます。',
    goAnyway: 'それでも出る', keep: 'ぬりにもどる',
    mc0: 'エントリーナンバー1番、マネキンくん！', mc1: 'お題は「{t}」！',
    judging: '審査中…', total: '合計', points: '点',
    again: 'もう一回ぬる', next: '次のお題へ', save: '画像を保存', toTitle: 'タイトル',
    skip: 'スキップ',
    tut: [
      ['ぬりたい所を{tap}', 'かみ・かお・トップスなど、パーツごとに線の外へはみ出さずにぬれます。'],
      ['色と道具をえらぶ', 'バケツならパーツが一発でぬれます。スタンプで柄も入れられます。'],
      ['お題に合わせて全部ぬる', '下のゲージが100%になるまでぬると、ロボ審査員がよろこびます。'],
      ['できたらランウェイへ', '3人の審査員が採点します。観客の反応は…覚悟しておこう。'],
    ],
    tapPc: 'ドラッグ', tapSp: '指でなぞる',
    tutNext: 'つぎへ', tutDone: 'はじめる',
    howT: '遊び方',
    howList: [
      'お題が出たら、マネキンくんをぬって服を作ります。ぬれるのはパーツの中だけ。はみ出しません。',
      'ペンは太さ3段階。バケツはパーツをまるごと1色に。スタンプはハート・星・水玉。',
      '左右対称をオンにすると、反対側にも同じ線が引かれます。',
      '審査員は3人。マダムはお題に合う色か、ギャルは色の数と盛り、ロボはぬり残しを見ます。',
      '合計30点満点。点が低いとトマトが飛んできます。高いと…お楽しみに。',
    ],
    storyMc: '司会のボンジュール',
    saved: '保存しました',
    lang: 'EN', mute: '音', bootFail: '起動できませんでした',
    stamps: { heart: 'ハート', star: '星', dot: '水玉' },
    sizes: ['細', '中', '太'],
    score: '{n}点',
    mcTier: { disaster: 'これは…放送事故です！ カメラ止めて！', boo: '会場が…冷え切っております…', meh: 'えー、拍手がまばらです！', great: '会場総立ち！ ブラボー！', legend: '伝説の誕生です！ 救急車も呼んで！' },
  },
  en: {
    title: 'Paint Runway',
    sub: 'Paint a mannequin. Hit the runway.',
    lead: 'This mannequin owns zero clothes. Paint an outfit on it and send it down the runway.',
    start: 'Enter the show', how: 'How to play', back: 'Back',
    themeIs: "Today's theme", themeGo: 'Start painting', reroll: 'Another theme',
    parts: { hair: 'Hair', face: 'Face', top: 'Top', arms: 'Arms', bottom: 'Bottoms', shoes: 'Shoes' },
    tools: { pen: 'Pen', bucket: 'Bucket', stamp: 'Stamp', eraser: 'Eraser' },
    mirror: 'Mirror', undo: 'Undo', runway: 'To the runway',
    confirmBlankT: 'Nothing is painted yet', confirmBlank: 'If you go like this, things will probably be thrown at you.',
    goAnyway: 'Go anyway', keep: 'Keep painting',
    mc0: 'Entry number one: Mannequin-kun!', mc1: 'The theme is "{t}"!',
    judging: 'Judging...', total: 'Total', points: 'pts',
    again: 'Paint again', next: 'Next theme', save: 'Save image', toTitle: 'Title',
    skip: 'Skip',
    tut: [
      ['{tap} the part to paint', 'Hair, face, top and more. Paint stays inside each part.'],
      ['Pick a color and a tool', 'The bucket fills a whole part at once. Stamps add patterns.'],
      ['Paint everything to fit the theme', 'Fill the gauges to 100% and the robot judge will be happy.'],
      ['Then hit the runway', 'Three judges score you. The crowd... brace yourself.'],
    ],
    tapPc: 'Drag on', tapSp: 'Swipe on',
    tutNext: 'Next', tutDone: "Let's go",
    howT: 'How to play',
    howList: [
      'Get a theme, then paint the mannequin to make an outfit. Paint stays inside each part.',
      'Pen has 3 sizes. Bucket fills a part with one color. Stamps: heart, star, dots.',
      'Turn on Mirror to draw the same line on the other side.',
      'Three judges: Madame checks the theme colors, Luna wants bold color, the robot hates gaps.',
      '30 points max. Low scores get tomatoes. High scores get... you will see.',
    ],
    storyMc: 'MC Bonjour',
    saved: 'Saved',
    lang: '日本語', mute: 'Sound', bootFail: 'Failed to start',
    stamps: { heart: 'Heart', star: 'Star', dot: 'Dots' },
    sizes: ['S', 'M', 'L'],
    score: '{n}',
    mcTier: { disaster: 'This is a broadcast accident! Cut the cameras!', boo: 'The room has gone... ice cold...', meh: 'Um, a few scattered claps!', great: 'Standing ovation! Bravo!', legend: 'A legend is born! Someone call an ambulance!' },
  },
}
