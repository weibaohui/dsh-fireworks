'use strict'

/**
 * dsh-fireworks — 烟花属性卡（Firework Cards）
 *
 * 每张卡描述「一类烟花的一个变种」的全部物理与视觉参数；引擎（engine.js）
 * 只消费 resolveCard() 产出的具体发射谱（LaunchSpec），卡片本身保持纯数据。
 *
 * ── 卡片模型 ──
 *   category   事件类别：session 开场 / turn 回合 / tool 工具 /
 *              milestone 里程碑 / finale 终场 / fail 哑炮
 *   rarity     稀有度 1..5，抽取权重 = 1 / rarity（传说更少出现）
 *   数值区间   [min, max] 由 magnitude（token 规模 0..1）插值后加抖动；
 *              scaling 指定每个维度用的曲线（linear / sqrt / log）。
 *
 * ── 单位约定 ──
 *   速度 px/s，重力 px/s²，寿命 s，角度 deg，高度 = 视口高度比例 (0..1)，
 *   色相 h∈[0,360) 饱和度 s∈[0,100] 亮度 l∈[0,100]。
 *
 * 本文件同时跑在浏览器（构建期内联进 bundle 工厂作用域）与 node 测试
 * （底部 CommonJS 导出）两侧，不得引用 DOM。
 */

/* node-test-export-start */
// ── 确定性随机（mulberry32）──────────────────────────────────────────────
/** 同一 seed 产出同一序列：宿主批量事件→客户端播放可复现，测试可断言。 */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 区间取值。mag 按 curve 插值，再加 ±jitter 比例的均匀抖动。 */
function ranged(range, mag, rng, curve, jitter) {
  const lo = Array.isArray(range) ? range[0] : range
  const hi = Array.isArray(range) ? range[1] : range
  let m = mag
  if (curve === 'sqrt') m = Math.sqrt(mag)
  else if (curve === 'log') m = Math.log2(1 + mag) // mag∈[0,1] → [0,1]
  let v = lo + (hi - lo) * Math.min(1, Math.max(0, m))
  if (jitter && rng) v += (rng() * 2 - 1) * jitter * (hi - lo || Math.abs(hi) || 1)
  return v
}

// ── 类别 ─────────────────────────────────────────────────────────────────
const CATEGORIES = {
  session:   { label: '开场迎宾', labelEn: 'Welcome',     defaultIntensity: 0.6 },
  turn:      { label: '回合礼花', labelEn: 'Turn',        defaultIntensity: 1.0 },
  tool:      { label: '工具星花', labelEn: 'Tool',        defaultIntensity: 0.5 },
  milestone: { label: '里程碑',   labelEn: 'Milestone',   defaultIntensity: 1.4 },
  finale:    { label: '收工终场', labelEn: 'Finale',      defaultIntensity: 1.8 },
  fail:      { label: '哑炮',     labelEn: 'Dud',         defaultIntensity: 0.4 },
}

// ── 调色板库（[h, s, l]）─────────────────────────────────────────────────
const PALETTES = {
  gold:        [[45, 100, 62], [38, 100, 55], [52, 95, 70]],
  pureGold:    [[48, 100, 58], [43, 100, 50]],
  silver:      [[210, 12, 82], [220, 18, 72], [200, 8, 88]],
  rainbow:     [[0, 92, 60], [35, 95, 58], [60, 95, 60], [130, 80, 55], [200, 90, 62], [265, 85, 66], [320, 85, 64]],
  emerald:     [[155, 85, 52], [140, 90, 45], [170, 75, 60]],
  sapphire:    [[215, 90, 60], [205, 95, 52], [228, 85, 68]],
  crimson:     [[350, 95, 55], [10, 92, 58], [340, 85, 62]],
  violet:      [[275, 85, 65], [290, 80, 58], [255, 75, 70]],
  azure:       [[195, 95, 60], [185, 90, 68], [210, 85, 55]],
  mint:        [[160, 80, 62], [150, 85, 55]],
  lime:        [[85, 90, 58], [100, 85, 62]],
  rose:        [[335, 90, 62], [325, 85, 68]],
  amber:       [[30, 100, 55], [20, 95, 50], [40, 100, 60]],
  pearl:       [[45, 25, 88], [200, 20, 86], [330, 18, 88]],
  iceBlue:     [[200, 70, 75], [210, 60, 82]],
  ash:         [[220, 6, 42], [210, 5, 34], [200, 4, 50]],
  aurora:      [[150, 90, 60], [190, 95, 62], [260, 90, 66], [300, 85, 64]],
  flame:       [[15, 100, 55], [45, 100, 58], [0, 95, 52]],
  whiteHot:    [[0, 0, 96], [50, 30, 92]],
}

// ── 公共默认值 ───────────────────────────────────────────────────────────
const DEFAULT_ROCKET = {
  kind: 'rocket',
  apex: [0.45, 0.75],
  speed: [620, 860],
  wobble: 4,
  trailRate: 90,
  trailColor: [42, 90, 62],
  trailLife: [0.25, 0.5],
  trailGravity: 120,
  trailSize: [0.8, 1.6],
  crackleOnAscent: false,
}

const DEFAULT_BURST = {
  shell: 'peony',
  stars: [90, 160],
  speed: [180, 320],
  spread: 1,
  ringThickness: 0.14,
  gravity: 42,
  drag: 0.55,
  starLife: [1.4, 2.2],
  starSize: [1.4, 2.6],
  trail: { len: [6, 12], fade: 0.82 },
  asymmetry: 0,
}

const DEFAULT_SCALING = { stars: 'sqrt', apex: 'linear', speed: 'sqrt', vivid: 'linear' }

/** 深合并（数组视为整体替换）。 */
function merge(base, over) {
  const out = {}
  for (const k of Object.keys(base)) out[k] = base[k]
  for (const k of Object.keys(over || {})) {
    const b = base[k]; const o = over[k]
    out[k] = (b && o && typeof b === 'object' && typeof o === 'object' && !Array.isArray(b) && !Array.isArray(o))
      ? merge(b, o) : o
  }
  return out
}

/** 卡片工厂：补全缺省段，得到完整卡。 */
function card(partial) {
  const full = merge({
    rarity: 1,
    flavor: '',
    rocket: DEFAULT_ROCKET,
    burst: DEFAULT_BURST,
    color: { palette: PALETTES.gold, mode: 'random', hueDrift: 0, lighten: [0, 14], whiteCore: false, saturation: [0, 0] },
    effects: { strobe: null, twinkle: null, crackle: null, glitter: null, crossette: null, pistil: null, flash: null, trailBloom: false },
    scaling: DEFAULT_SCALING,
    volley: null,
  }, partial)
  full.rocket = merge(DEFAULT_ROCKET, partial.rocket || {})
  full.burst = merge(DEFAULT_BURST, partial.burst || {})
  return full
}

/* node-test-export-end */

// ══════════════════════════════════════════════════════════════════════════
// session · 开场迎宾 —— 新会话诞生，轻盈优雅的中低空无尾迎宾弹
// ══════════════════════════════════════════════════════════════════════════
const SESSION_CARDS = [
  card({
    id: 'silver-cocoon', name: '银茧迎宾', nameEn: 'Silver Cocoon',
    category: 'session', rarity: 1, flavor: '一枚银白的茧在窗前轻轻绽开，欢迎开工。',
    rocket: { apex: [0.4, 0.6], speed: [560, 700], trailRate: 60 },
    burst: { shell: 'peony', stars: [70, 110], speed: [170, 240], starLife: [1.3, 1.9], trail: { len: [4, 8], fade: 0.8 } },
    color: { palette: PALETTES.silver, mode: 'random', lighten: [4, 12], whiteCore: true,
      bands: [{ palette: PALETTES.silver, p: 0.75 }, { palette: PALETTES.azure, p: 0.25 }], mixChance: 0.6 },
    effects: { twinkle: { rate: 3, depth: 0.35 } },
  }),
  card({
    id: 'azure-gate', name: '青门初开', nameEn: 'Azure Gate',
    category: 'session', rarity: 2, flavor: '一道青色圆环缓缓张开，像推开的门。',
    rocket: { apex: [0.45, 0.62], speed: [600, 720] },
    burst: { shell: 'ring', stars: [60, 90], speed: [210, 280], ringThickness: 0.1, starLife: [1.2, 1.8], gravity: 30 },
    color: { palette: PALETTES.azure, mode: 'uniform', lighten: [6, 14] },
    effects: { glitter: { rate: 6, depth: 0.5 } },
  }),
  card({
    id: 'violet-mist', name: '紫雾晨星', nameEn: 'Violet Mist',
    category: 'session', rarity: 2, flavor: '紫色的绒球在低空散开，像未散的晨雾。',
    rocket: { apex: [0.35, 0.52], speed: [520, 640] },
    burst: { shell: 'kamuro', stars: [110, 150], speed: [110, 180], gravity: 55, starLife: [1.8, 2.6], trail: { len: [8, 14], fade: 0.86 } },
    color: { palette: PALETTES.violet, mode: 'random', lighten: [2, 10] },
    effects: { twinkle: { rate: 2.2, depth: 0.4 } },
  }),
  card({
    id: 'spring-willow', name: '春柳拂晓', nameEn: 'Spring Willow',
    category: 'session', rarity: 1, flavor: '嫩金色的柳丝垂下来，新的一天开始了。',
    rocket: { apex: [0.5, 0.68], speed: [620, 760] },
    burst: { shell: 'willow', stars: [80, 120], speed: [190, 260], gravity: 78, starLife: [2.4, 3.4], trail: { len: [12, 20], fade: 0.9 } },
    color: { palette: PALETTES.lime, mode: 'gradient', hueDrift: 18, lighten: [2, 8],
      bands: [{ palette: PALETTES.lime, p: 0.7 }, { palette: PALETTES.gold, p: 0.3 }], mixChance: 0.5 },
    effects: null,
  }),
  card({
    id: 'twin-spark', name: '双子星', nameEn: 'Twin Spark',
    category: 'session', rarity: 3, flavor: '两圈细小的光环内外相扣，成双成对。',
    rocket: { apex: [0.42, 0.6], speed: [580, 700] },
    burst: { shell: 'doubleRing', stars: [80, 110], speed: [170, 260], ringThickness: 0.09, starLife: [1.3, 1.9], gravity: 28 },
    color: { palette: PALETTES.pearl, mode: 'split', lighten: [6, 12] },
    effects: { strobe: { rate: 8, duty: 0.55 } },
  }),
]

// ══════════════════════════════════════════════════════════════════════════
// turn · 回合礼花 —— 每完成一轮回复放一枚，token 越多越大越艳
// ══════════════════════════════════════════════════════════════════════════
const TURN_CARDS = [
  card({
    id: 'peony-gold', name: '金牡丹', nameEn: 'Golden Peony',
    category: 'turn', rarity: 1, flavor: '最经典的金色牡丹，干净利落的一个圆。',
    rocket: { apex: [0.5, 0.82], speed: [640, 900] },
    burst: { shell: 'peony', stars: [100, 230], speed: [200, 360], starLife: [1.4, 2.4], starSize: [1.5, 3] },
    color: { palette: PALETTES.gold, mode: 'random', lighten: [4, 18], whiteCore: true,
      bands: [{ palette: PALETTES.gold, p: 0.65 }, { palette: PALETTES.crimson, p: 0.35 }], mixChance: 0.65 },
    effects: { crackle: { at: 0.62, count: [2, 4], speed: [40, 90], life: [0.25, 0.5] } },
  }),
  card({
    id: 'chrys-rainbow', name: '七彩菊', nameEn: 'Rainbow Chrysanthemum',
    category: 'turn', rarity: 2, flavor: '七色长须的菊花，拖着虹彩的尾巴。',
    rocket: { apex: [0.52, 0.85], speed: [660, 920] },
    burst: { shell: 'chrysanthemum', stars: [120, 260], speed: [210, 370], starLife: [1.6, 2.6], trail: { len: [10, 18], fade: 0.86 } },
    color: { palette: PALETTES.rainbow, mode: 'rainbow', hueDrift: 10, lighten: [6, 20] },
    effects: { twinkle: { rate: 2.6, depth: 0.3 } },
  }),
  card({
    id: 'emerald-strobe', name: '翡翠频闪', nameEn: 'Emerald Strobe',
    category: 'turn', rarity: 2, flavor: '翡翠色的星星急促地明灭，像夏夜的萤火。',
    rocket: { apex: [0.48, 0.8], speed: [620, 880] },
    burst: { shell: 'strobe', stars: [90, 200], speed: [190, 330], starLife: [1.8, 3], gravity: 36 },
    color: { palette: PALETTES.emerald, mode: 'random', lighten: [4, 16],
      bands: [{ palette: PALETTES.emerald, p: 0.8 }, { palette: PALETTES.lime, p: 0.2 }], mixChance: 0.55 },
    effects: { strobe: { rate: 9, duty: 0.5 } },
  }),
  card({
    id: 'crimson-pistil', name: '绯蕊', nameEn: 'Crimson Pistil',
    category: 'turn', rarity: 3, flavor: '绯红花瓣裹着一颗银白的蕊心。',
    rocket: { apex: [0.5, 0.84], speed: [640, 900] },
    burst: { shell: 'pistil', stars: [110, 230], speed: [200, 350], starLife: [1.5, 2.4] },
    color: { palette: PALETTES.crimson, mode: 'random', lighten: [4, 16], whiteCore: true },
    effects: { pistil: { stars: [24, 44], color: PALETTES.silver, speedRatio: 0.42, lifeRatio: 0.8 } },
  }),
  card({
    id: 'sapphire-willow', name: '蓝柳', nameEn: 'Sapphire Willow',
    category: 'turn', rarity: 2, flavor: '蓝宝石色的柳条低垂，久久不肯散去。',
    rocket: { apex: [0.55, 0.86], speed: [660, 900] },
    burst: { shell: 'willow', stars: [100, 220], speed: [200, 320], gravity: 84, starLife: [2.6, 3.8], trail: { len: [14, 24], fade: 0.9 } },
    color: { palette: PALETTES.sapphire, mode: 'gradient', hueDrift: -8, lighten: [2, 12],
      bands: [{ palette: PALETTES.sapphire, p: 0.72 }, { palette: PALETTES.silver, p: 0.28 }], mixChance: 0.6 },
    effects: { glitter: { rate: 5, depth: 0.4 } },
  }),
  card({
    id: 'amber-crossette', name: '琥珀十字', nameEn: 'Amber Crossette',
    category: 'turn', rarity: 3, flavor: '琥珀色的流星飞到半途，齐齐裂成十字。',
    rocket: { apex: [0.5, 0.8], speed: [640, 860] },
    burst: { shell: 'crossette', stars: [26, 44], speed: [170, 280], starLife: [1.6, 2.4], trail: { len: [8, 14], fade: 0.85 } },
    color: { palette: PALETTES.amber, mode: 'random', lighten: [4, 14],
      bands: [{ palette: PALETTES.amber, p: 0.7 }, { palette: PALETTES.gold, p: 0.3 }], mixChance: 0.6 },
    effects: { crossette: { at: 0.55, count: 4, angle: 90 }, crackle: { at: 0.8, count: [1, 2], speed: [30, 70], life: [0.2, 0.4] } },
  }),
]

// ══════════════════════════════════════════════════════════════════════════
// tool · 工具星花 —— 工具调用成功的小巧速弹，可成批连放
// ══════════════════════════════════════════════════════════════════════════
const TOOL_CARDS = [
  card({
    id: 'mint-pop', name: '薄荷脆响', nameEn: 'Mint Pop',
    category: 'tool', rarity: 1, flavor: '一小朵薄荷色的脆响，清清爽爽。',
    rocket: { apex: [0.3, 0.5], speed: [520, 680], trailRate: 50 },
    burst: { shell: 'peony', stars: [36, 60], speed: [140, 220], starLife: [0.9, 1.4], starSize: [1.1, 2] },
    color: { palette: PALETTES.mint, mode: 'random', lighten: [6, 14],
      bands: [{ palette: PALETTES.mint, p: 0.75 }, { palette: PALETTES.azure, p: 0.25 }], mixChance: 0.5 },
    effects: { crackle: { at: 0.6, count: [1, 2], speed: [30, 60], life: [0.2, 0.35] } },
  }),
  card({
    id: 'sky-comet', name: '天彗', nameEn: 'Sky Comet',
    category: 'tool', rarity: 2, flavor: '一颗彗星斜斜划过，尾巴末端散成细星。',
    rocket: { apex: [0.36, 0.58], speed: [560, 720], wobble: 9, trailRate: 130, trailLife: [0.35, 0.6] },
    burst: { shell: 'comet', stars: [18, 30], speed: [90, 150], starLife: [0.8, 1.3] },
    color: { palette: PALETTES.azure, mode: 'uniform', lighten: [8, 16], whiteCore: true },
    effects: null,
  }),
  card({
    id: 'pearl-drop', name: '珍珠落', nameEn: 'Pearl Drop',
    category: 'tool', rarity: 1, flavor: '一圈细小的珍珠轻轻洒落。',
    rocket: { apex: [0.3, 0.48], speed: [500, 640] },
    burst: { shell: 'ring', stars: [30, 48], speed: [130, 200], ringThickness: 0.12, starLife: [0.9, 1.4], gravity: 40 },
    color: { palette: PALETTES.pearl, mode: 'uniform', lighten: [6, 12] },
    effects: { twinkle: { rate: 4, depth: 0.4 } },
  }),
  card({
    id: 'lime-fizz', name: '青柠气泡', nameEn: 'Lime Fizz',
    category: 'tool', rarity: 1, flavor: '青柠味的气泡咕嘟一下冒开来。',
    rocket: { apex: [0.28, 0.44], speed: [480, 620] },
    burst: { shell: 'kamuro', stars: [50, 80], speed: [90, 150], gravity: 60, starLife: [1.1, 1.7], trail: { len: [5, 9], fade: 0.84 } },
    color: { palette: PALETTES.lime, mode: 'random', lighten: [6, 14] },
    effects: null,
  }),
  card({
    id: 'rose-pin', name: '玫瑰针', nameEn: 'Rose Pin',
    category: 'tool', rarity: 2, flavor: '玫瑰色的细针一闪一闪，别在夜幕上。',
    rocket: { apex: [0.32, 0.52], speed: [520, 660] },
    burst: { shell: 'strobe', stars: [40, 64], speed: [130, 210], starLife: [1.1, 1.8], starSize: [1, 1.8], gravity: 34 },
    color: { palette: PALETTES.rose, mode: 'random', lighten: [6, 14],
      bands: [{ palette: PALETTES.rose, p: 0.7 }, { palette: PALETTES.amber, p: 0.3 }], mixChance: 0.55 },
    effects: { strobe: { rate: 11, duty: 0.45 } },
  }),
]

// ══════════════════════════════════════════════════════════════════════════
// milestone · 里程碑 —— 累计 token 跨档时的庆典大礼
// ══════════════════════════════════════════════════════════════════════════
const MILESTONE_CARDS = [
  card({
    id: 'grand-brocade', name: '大锦冠', nameEn: 'Grand Brocade',
    category: 'milestone', rarity: 2, flavor: '金线织成的巨大锦冠，占满半边夜空。',
    rocket: { apex: [0.6, 0.88], speed: [720, 980], trailRate: 120 },
    burst: { shell: 'brocade', stars: [220, 380], speed: [240, 420], starLife: [2, 3.2], trail: { len: [12, 22], fade: 0.88 }, starSize: [1.6, 3] },
    color: { palette: PALETTES.pureGold, mode: 'random', lighten: [8, 22], whiteCore: true,
      bands: [{ palette: PALETTES.pureGold, p: 0.6 }, { palette: PALETTES.crimson, p: 0.4 }], mixChance: 0.7 },
    effects: { glitter: { rate: 7, depth: 0.55 }, trailBloom: true },
  }),
  card({
    id: 'heart-of-flame', name: '烈焰之心', nameEn: 'Heart of Flame',
    category: 'milestone', rarity: 4, flavor: '一颗燃烧的心形，为坚持到现在的你。',
    rocket: { apex: [0.55, 0.8], speed: [680, 900] },
    burst: { shell: 'heart', stars: [130, 190], speed: [180, 300], starLife: [1.8, 2.8], gravity: 34 },
    color: { palette: PALETTES.flame, mode: 'gradient', hueDrift: 6, lighten: [8, 20], whiteCore: true },
    effects: { glitter: { rate: 5, depth: 0.4 }, pistil: { stars: [30, 50], color: PALETTES.pureGold, speedRatio: 0.3, lifeRatio: 0.9 } },
  }),
  card({
    id: 'starforge', name: '铸星', nameEn: 'Starforge',
    category: 'milestone', rarity: 4, flavor: '蓝白色的五角星锤落成型，火花四溅。',
    rocket: { apex: [0.56, 0.82], speed: [700, 920] },
    burst: { shell: 'star', stars: [110, 170], speed: [190, 310], starLife: [1.7, 2.6], gravity: 32 },
    color: { palette: PALETTES.iceBlue, mode: 'uniform', lighten: [10, 22], whiteCore: true },
    effects: { strobe: { rate: 7, duty: 0.6 }, crackle: { at: 0.7, count: [2, 4], speed: [40, 80], life: [0.25, 0.45] } },
  }),
  card({
    id: 'saturn-crown', name: '土星冠', nameEn: 'Saturn Crown',
    category: 'milestone', rarity: 5, flavor: '一颗金球套着银环，像加冕的土星。',
    rocket: { apex: [0.58, 0.84], speed: [700, 940] },
    burst: { shell: 'saturn', stars: [180, 280], speed: [200, 340], starLife: [1.8, 2.8], ringThickness: 0.1 },
    color: { palette: PALETTES.gold, mode: 'split', lighten: [8, 20], whiteCore: true },
    effects: { glitter: { rate: 6, depth: 0.5 } },
  }),
  card({
    id: 'thunder-salute', name: '雷鸣礼炮', nameEn: 'Thunder Salute',
    category: 'milestone', rarity: 3, flavor: '先一道白闪照亮夜空，再洒落金雨。',
    rocket: { apex: [0.5, 0.78], speed: [680, 900] },
    burst: { shell: 'salute', stars: [60, 100], speed: [220, 360], starLife: [1.2, 2], starSize: [1.8, 3.2] },
    color: { palette: PALETTES.whiteHot, mode: 'random', lighten: [10, 24], whiteCore: true,
      bands: [{ palette: PALETTES.whiteHot, p: 0.5 }, { palette: PALETTES.gold, p: 0.5 }], mixChance: 0.75 },
    effects: { flash: { radius: [180, 320], life: [0.22, 0.4] }, crackle: { at: 0.3, count: [3, 6], speed: [50, 110], life: [0.3, 0.6] } },
  }),
]

// ══════════════════════════════════════════════════════════════════════════
// finale · 收工终场 —— 任务全部完成时的多弹齐射
// ══════════════════════════════════════════════════════════════════════════
const FINALE_CARDS = [
  card({
    id: 'cosmos-finale', name: '寰宇终章', nameEn: 'Cosmos Finale',
    category: 'finale', rarity: 2, flavor: '七彩重瓣三连发，为这场协作谢幕。',
    rocket: { apex: [0.6, 0.88], speed: [700, 960], trailRate: 110 },
    burst: { shell: 'chrysanthemum', stars: [200, 340], speed: [230, 400], starLife: [1.8, 3], trail: { len: [12, 20], fade: 0.87 } },
    color: { palette: PALETTES.rainbow, mode: 'rainbow', hueDrift: 12, lighten: [8, 22], whiteCore: true },
    effects: { pistil: { stars: [36, 60], color: PALETTES.silver, speedRatio: 0.4, lifeRatio: 0.85 }, twinkle: { rate: 3, depth: 0.3 } },
    volley: { count: [3, 3], interval: [0.28, 0.4], spread: 0.5 },
  }),
  card({
    id: 'golden-age', name: '黄金时代', nameEn: 'Golden Age',
    category: 'finale', rarity: 3, flavor: '金柳与瀑布交替垂落，像一场金色大雨。',
    rocket: { apex: [0.62, 0.9], speed: [720, 980] },
    burst: { shell: 'waterfall', stars: [180, 300], speed: [190, 320], gravity: 70, starLife: [3, 4.6], trail: { len: [18, 30], fade: 0.92 } },
    color: { palette: PALETTES.pureGold, mode: 'gradient', hueDrift: 14, lighten: [6, 18],
      bands: [{ palette: PALETTES.pureGold, p: 0.68 }, { palette: PALETTES.amber, p: 0.32 }], mixChance: 0.65 },
    effects: { glitter: { rate: 6, depth: 0.45 }, crackle: { at: 0.75, count: [2, 3], speed: [30, 70], life: [0.3, 0.5] } },
    volley: { count: [3, 4], interval: [0.32, 0.46], spread: 0.55 },
  }),
  card({
    id: 'aurora-dance', name: '极光之舞', nameEn: 'Aurora Dance',
    category: 'finale', rarity: 4, flavor: '旋花带着极光的色带旋转升空。',
    rocket: { apex: [0.58, 0.86], speed: [700, 940] },
    burst: { shell: 'tourbillion', stars: [140, 240], speed: [170, 290], starLife: [2, 3.2], gravity: 26, trail: { len: [10, 18], fade: 0.88 } },
    color: { palette: PALETTES.aurora, mode: 'rainbow', hueDrift: 24, lighten: [8, 20] },
    effects: { twinkle: { rate: 2.4, depth: 0.35 } },
    volley: { count: [3, 4], interval: [0.3, 0.42], spread: 0.5 },
  }),
  card({
    id: 'dragon-pearl', name: '龙戏珠', nameEn: 'Dragon & Pearl',
    category: 'finale', rarity: 4, flavor: '十字金蛇盘旋，护送一颗银珠升天。',
    rocket: { apex: [0.6, 0.86], speed: [700, 940] },
    burst: { shell: 'crossette', stars: [40, 64], speed: [190, 300], starLife: [1.8, 2.6], trail: { len: [10, 16], fade: 0.86 } },
    color: { palette: PALETTES.gold, mode: 'random', lighten: [8, 18], whiteCore: true },
    effects: { crossette: { at: 0.5, count: 4, angle: 90 }, pistil: { stars: [40, 60], color: PALETTES.silver, speedRatio: 0.25, lifeRatio: 1.1 } },
    volley: { count: [2, 3], interval: [0.34, 0.48], spread: 0.45 },
  }),
  card({
    id: 'thousand-stars', name: '千星落幕', nameEn: 'Thousand Stars',
    category: 'finale', rarity: 5, flavor: '千颗频闪的星缀满夜空，是最隆重的告别。',
    rocket: { apex: [0.64, 0.9], speed: [740, 1000], trailRate: 130 },
    burst: { shell: 'strobe', stars: [300, 480], speed: [220, 400], starLife: [2.4, 3.8], gravity: 30, starSize: [1.2, 2.4] },
    color: { palette: PALETTES.rainbow, mode: 'random', lighten: [10, 24], whiteCore: true },
    effects: { strobe: { rate: 8, duty: 0.5 }, glitter: { rate: 5, depth: 0.4 } },
    volley: { count: [2, 3], interval: [0.4, 0.55], spread: 0.6 },
  }),
]

// ══════════════════════════════════════════════════════════════════════════
// fail · 哑炮 —— 工具/回合失败时的幽默安慰弹（克制的暗色系）
// ══════════════════════════════════════════════════════════════════════════
const FAIL_CARDS = [
  card({
    id: 'dud', name: '哑炮', nameEn: 'Dud',
    category: 'fail', rarity: 1, flavor: '升上去，没响。火星稀稀落落掉下来。',
    rocket: { apex: [0.35, 0.55], speed: [560, 700], trailRate: 60 },
    burst: { shell: 'dud', stars: [14, 24], speed: [40, 90], starLife: [0.9, 1.5], gravity: 120, starSize: [1, 1.8] },
    color: { palette: PALETTES.amber, mode: 'random', lighten: [-18, -8] },
    effects: null,
  }),
  card({
    id: 'cold-rain', name: '冷雨', nameEn: 'Cold Rain',
    category: 'fail', rarity: 1, flavor: '一小片蓝色的冷雨，替失败叹口气。',
    rocket: { apex: [0.3, 0.45], speed: [500, 620], trailRate: 40 },
    burst: { shell: 'drizzle', stars: [40, 70], speed: [60, 110], gravity: 90, starLife: [1.4, 2.2], starSize: [0.8, 1.4], trail: { len: [4, 8], fade: 0.88 } },
    color: { palette: PALETTES.iceBlue, mode: 'random', lighten: [-14, -4] },
    effects: null,
  }),
  card({
    id: 'ash-fall', name: '落灰', nameEn: 'Ash Fall',
    category: 'fail', rarity: 2, flavor: '灰烬无声地飘落，明天再战。',
    rocket: { kind: 'none' },
    burst: { shell: 'waterfall', stars: [50, 90], speed: [30, 70], gravity: 40, starLife: [2.4, 3.6], starSize: [0.9, 1.6], trail: { len: [10, 18], fade: 0.92 } },
    color: { palette: PALETTES.ash, mode: 'random', lighten: [-10, 0] },
    effects: { twinkle: { rate: 1.6, depth: 0.3 } },
  }),
  card({
    id: 'smoke-puff', name: '一缕烟', nameEn: 'A Puff of Smoke',
    category: 'fail', rarity: 2, flavor: '噗——只冒了一小团烟。',
    rocket: { apex: [0.28, 0.42], speed: [460, 580], trailRate: 30 },
    burst: { shell: 'peony', stars: [18, 30], speed: [50, 100], starLife: [0.7, 1.1], gravity: 30, starSize: [1.6, 2.8] },
    color: { palette: PALETTES.ash, mode: 'random', lighten: [-6, 4] },
    effects: { crackle: { at: 0.5, count: [1, 1], speed: [20, 40], life: [0.2, 0.3] } },
  }),
]

/* node-test-export-start */
const ALL_CARDS = [...SESSION_CARDS, ...TURN_CARDS, ...TOOL_CARDS, ...MILESTONE_CARDS, ...FINALE_CARDS, ...FAIL_CARDS]

const CARDS_BY_CATEGORY = {}
for (const c of ALL_CARDS) {
  if (!CARDS_BY_CATEGORY[c.category]) CARDS_BY_CATEGORY[c.category] = []
  CARDS_BY_CATEGORY[c.category].push(c)
}

/**
 * 洗牌袋抽取：一类事件要放 count 次时，从该类别卡池不放回地抽 count 张。
 *
 * 稀有度的实现：洗袋时每张卡以 min(1, 2.2/rarity) 的概率入袋（常见卡每袋
 * 必有，传说卡约 44% 的袋才出现一次），袋内再按指数键（-ln(u)·rarity）
 * 加权排序。于是长期频率随稀有度下降，而同一袋内绝不重复——「一类事件
 * N 次 → 随机抽 N 个不同变种」始终成立。袋空重洗，新袋首卡与上一张相同
 * 时换到袋尾防连重。bagState 由调用方持有：{ category: [cards…] }。
 */
function refillBag(pool, rng, exclude) {
  let candidates = pool
  if (exclude && exclude.size > 0 && exclude.size < pool.length) {
    candidates = pool.filter((c) => !exclude.has(c))
  }
  let bag = candidates.filter((c) => rng() < Math.min(1, 2.2 / c.rarity))
  if (bag.length === 0) bag = candidates.slice()
  return bag
    .map((c) => ({ c, key: -Math.log(Math.max(rng(), 1e-9)) * c.rarity }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.c)
}

function pickVariants(category, count, rng, bagState) {
  const pool = CARDS_BY_CATEGORY[category] || []
  if (pool.length === 0 || count <= 0) return []
  if (!bagState[category] || bagState[category].length === 0) {
    bagState[category] = refillBag(pool, rng)
  }
  const out = []
  const drawn = new Set()
  while (out.length < count) {
    if (bagState[category].length === 0) {
      // 批次中段补袋：排除本批已抽的卡，保证同一批不重复
      bagState[category] = refillBag(pool, rng, drawn)
      const nb = bagState[category]
      if (nb.length > 1 && nb[0] === out[out.length - 1]) nb.push(nb.shift())
    }
    const next = bagState[category].shift()
    out.push(next)
    drawn.add(next)
  }
  return out
}

/** 调色板取色：mode 决定每颗星的选色方式；bands 多色配比优先。返回 [h,s,l]。 */
function pickColor(spec, rng, starIndex, starTotal, phase) {
  // 一发多色：bands 按概率配比把星群分成若干色组（每颗星独立抽签）
  const bands = spec.bands || (spec.color && spec.color.bands)
  if (Array.isArray(bands) && bands.length > 1) {
    let r = rng()
    for (const band of bands) {
      r -= band.p
      if (r <= 0) {
        const bp = band.palette
        return bp[Math.floor(rng() * bp.length) % bp.length]
      }
    }
    const last = bands[bands.length - 1].palette
    return last[Math.floor(rng() * last.length) % last.length]
  }
  const pal = spec.palette || spec.color.palette
  const mode = spec.colorMode || spec.color.mode
  if (mode === 'uniform') return pal[Math.floor(rng() * pal.length) % pal.length]
  if (mode === 'rainbow') return pal[starIndex % pal.length]
  if (mode === 'split') return pal[(phase || 0) % pal.length]
  if (mode === 'gradient') {
    const t = starTotal > 1 ? starIndex / (starTotal - 1) : 0
    const a = pal[0]; const b = pal[pal.length - 1]
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  }
  return pal[Math.floor(rng() * pal.length) % pal.length] // 'random'
}

// ── 全局调校 ─────────────────────────────────────────────────────────────
// 少而精：星数减半、星体放大——动画更流畅，颗颗分明、色彩更艳丽；
// token 缩放（magnitude 插值）不受影响，大 token 依旧更大更高更艳。
const TUNE = { stars: 0.5, size: 1.65, pistil: 0.6 }

/**
 * resolveCard —— 卡片 → 具体发射谱（LaunchSpec）。
 * mag ∈ [0,1]（token 规模）；rng 为 mulberry32 实例（seed 来自宿主事件）。
 * 产出全部区间已落定、引擎可直接消费的纯数值对象。
 */
function resolveCard(c, mag, rng) {
  const sc = c.scaling
  const r = (range, curve, jitter) => ranged(range, mag, rng, curve, jitter == null ? 0.12 : jitter)
  const rocket = {
    kind: c.rocket.kind,
    apex: r(c.rocket.apex, sc.apex),
    speed: r(c.rocket.speed, 'sqrt'),
    wobble: (c.rocket.wobble || 0) * (0.6 + rng() * 0.8),
    trailRate: c.rocket.trailRate,
    trailColor: c.rocket.trailColor,
    trailLife: r(c.rocket.trailLife, 'linear'),
    trailGravity: c.rocket.trailGravity,
    trailSize: r(c.rocket.trailSize, 'linear'),
    crackleOnAscent: !!c.rocket.crackleOnAscent,
  }
  const fx = c.effects || {}
  // 一发多色：本弹按 mixChance 概率启用 bands 配比（缺省 0.65）；p 归一化
  let bands = null
  const cb = c.color.bands
  if (Array.isArray(cb) && cb.length > 1) {
    const chance = c.color.mixChance != null ? c.color.mixChance : 0.65
    if (rng() < chance) {
      const total = cb.reduce((s, b) => s + Math.max(0, b.p || 0), 0) || 1
      bands = cb.map((b) => ({ palette: b.palette, p: Math.max(0, b.p || 0) / total }))
    }
  }
  const spec = {
    cardId: c.id, name: c.name, nameEn: c.nameEn, category: c.category,
    rocket,
    shell: c.burst.shell,
    stars: Math.max(4, Math.round(r(c.burst.stars, sc.stars, 0.1) * TUNE.stars)),
    speed: r(c.burst.speed, sc.speed),
    spread: c.burst.spread,
    ringThickness: c.burst.ringThickness,
    gravity: c.burst.gravity * (0.9 + rng() * 0.2),
    drag: c.burst.drag,
    starLife: r(c.burst.starLife, 'linear'),
    starSize: r(c.burst.starSize, sc.vivid) * TUNE.size,
    trailLen: Math.max(2, Math.round(r(c.burst.trail.len, 'linear'))),
    trailFade: c.burst.trail.fade,
    asymmetry: c.burst.asymmetry || 0,
    palette: c.color.palette,
    colorMode: c.color.mode,
    bands,
    hueDrift: c.color.hueDrift,
    lighten: r(c.color.lighten, sc.vivid, 0.2),
    saturation: r(c.color.saturation, sc.vivid, 0.2),
    whiteCore: !!c.color.whiteCore,
    strobe: fx.strobe ? { rate: fx.strobe.rate * (0.85 + rng() * 0.3), duty: fx.strobe.duty } : null,
    twinkle: fx.twinkle ? { rate: fx.twinkle.rate * (0.85 + rng() * 0.3), depth: fx.twinkle.depth } : null,
    crackle: fx.crackle ? { at: fx.crackle.at, count: Math.round(r(fx.crackle.count, 'linear')), speed: r(fx.crackle.speed, 'linear'), life: r(fx.crackle.life, 'linear') } : null,
    glitter: fx.glitter ? { rate: fx.glitter.rate, depth: fx.glitter.depth } : null,
    crossette: fx.crossette ? { at: fx.crossette.at, count: fx.crossette.count, angle: fx.crossette.angle } : null,
    pistil: fx.pistil ? { stars: Math.round(r(fx.pistil.stars, sc.stars) * TUNE.pistil), color: fx.pistil.color, speedRatio: fx.pistil.speedRatio, lifeRatio: fx.pistil.lifeRatio } : null,
    flash: fx.flash ? { radius: r(fx.flash.radius, 'sqrt'), life: r(fx.flash.life, 'linear') } : null,
    trailBloom: !!fx.trailBloom,
    volley: c.volley ? {
      count: Math.max(1, Math.round(r(c.volley.count, 'linear', 0))),
      interval: r(c.volley.interval, 'linear'),
      spread: c.volley.spread,
    } : null,
  }
  return spec
}

/** token 数 → magnitude 0..1。ref 为「满规模」参考值（output tokens）。 */
function magnitudeOf(tokens, ref) {
  const R = ref > 0 ? ref : 40000
  const t = Math.max(0, tokens || 0)
  return Math.min(1, Math.log2(1 + t) / Math.log2(1 + R))
}

const FireworkCards = {
  CATEGORIES,
  PALETTES,
  ALL_CARDS,
  CARDS_BY_CATEGORY,
  TUNE,
  mulberry32,
  pickVariants,
  pickColor,
  resolveCard,
  magnitudeOf,
}
if (typeof module !== 'undefined' && module.exports) module.exports = FireworkCards
/* node-test-export-end */
