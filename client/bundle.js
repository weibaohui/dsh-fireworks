/* Generated from client/cards.js + client/engine.js + client/index.js by scripts/build-client.mjs — do not edit by hand.
 * Regenerate with: npm run build:client
 */
window.__ModuleLoader__.load({
  id: "@weibaohui/dsh-fireworks",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })
    var React = require("react")
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

    /* node-test-export-end */

    /**
     * @weibaohui/dsh-plugin-kit — client source（由消费者构建脚本内联进 bundle，
     * 不经 loader 运行时加载）。对外暴露 PluginKit：
     *
     *   PluginKit.substituteParams(template, params)   — {{key}} 模板插值
     *   PluginKit.makeActionShareDialog(React, opts)   — 返回 ActionShareDialog 组件
     *
     * ActionShareDialog props：
     *   title / hint / rows: [[label, value], ...] / initialPrompt
     *   params: [{ key, label?, placeholder?, multiline?, value? }]  — 可选；模板参数
     *     输入区（idle 态渲染在 prompt 上方），值实时替换进 prompt 的 {{key}} 占位符
     *   completedView: ({ job, output, close, retry }) => node  — 可选；完成态插槽，
     *     提供后 job done 不再渲染默认「输出原文」，改由插槽全权负责（如解析 AI 输出
     *     成可编辑表单 + 创建按钮），Dialog footer 同时置空，操作按钮由插槽自承
     *   run: async (prompt) => { jobId }      — 发起执行
     *   poll: async (jobId) => { status, output, code }
     *   labels: { copy, copied, run, running, done, failed, outputLabel, openSession, close }
     *   onOpenSession: (sessionId) => void                — 可选；job 出现 sessionId 时渲染「打开会话」
     *   onClose
     *
     * 全部样式内联（主题 token + 回退值），消费者无需自带 CSS。
     */
    var PluginKit = (function () {
      function substituteParams(template, params) {
        var out = String(template || '')
        for (var key in (params || {})) out = out.split('{{' + key + '}}').join(String(params[key]))
        return out
      }

      function makeActionShareDialog(React, options) {
        options = options || {}
        var h = React.createElement
        var useState = React.useState
        var useEffect = React.useEffect
        var useRef = React.useRef
        var doFetch = options.fetch || (typeof fetch !== 'undefined' ? fetch : null)
        var inputStyle = { width: '100%', minHeight: 190, resize: 'vertical', fontFamily: 'var(--dsw-font-family)', lineHeight: 1.6, fontSize: 12, background: 'var(--dsw-alias-bg-layer-2,transparent)', color: 'inherit', border: '1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3))', borderRadius: '8px', padding: '10px', boxSizing: 'border-box' }
        var paramStyle = { width: '100%', fontFamily: 'var(--dsw-font-family)', lineHeight: 1.5, fontSize: 13, background: 'var(--dsw-alias-bg-layer-2,transparent)', color: 'inherit', border: '1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3))', borderRadius: '8px', padding: '6px 10px', boxSizing: 'border-box' }
        var btnStyle = { background: 'transparent', color: 'inherit', border: '1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3))', borderRadius: '8px', padding: '5px 12px', fontSize: 13, cursor: 'pointer', font: 'inherit' }
        // 主按钮亮暗跟随：与 skills-management .sk-btn-primary 同款 token 组合
        var primaryStyle = Object.assign({}, btnStyle, { background: 'var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary,#4a7dff))', borderColor: 'transparent', color: 'var(--dsw-alias-label-primary-inverted,#fff)' })

        return function ActionShareDialog(props) {
          var title = props.title
          var hint = props.hint
          var labels = props.labels || {}
          // 模板参数定义（[{key,label,placeholder,multiline,value}]）→ 值表
          var paramDefs = Array.isArray(props.params) ? props.params : []
          var initialParamValues = {}
          for (var pi = 0; pi < paramDefs.length; pi++) {
            var def = paramDefs[pi]
            initialParamValues[def.key] = def.value !== undefined && def.value !== null ? String(def.value) : ''
          }
          var _pv = useState(initialParamValues)
          var paramValues = _pv[0]; var setParamValues = _pv[1]
          var _p = useState(props.initialPrompt || '')
          var prompt = _p[0]; var setPrompt = _p[1]
          // 「上次自动生成的 prompt」ref 镜像：effect 里比较当前 prompt 是否等于它，
          // 判断用户是否手动编辑过——未手改则参数/模板变化可安全覆盖，手改过则保留
          // 手动编辑（ntd ActionButton 的 lastGenerated 同款规则）。旧 dirty 单标记
          // 无法表达「手改后又想让参数替换生效」的场景，且要同时服务 initialPrompt
          // 异步到位的跟随行为，故统一收敛到这一处比较。
          var lastGeneratedRef = useRef(null)
          var _j = useState(null)
          var job = _j[0]; var setJob = _j[1]
          var _b = useState(false)
          var busy = _b[0]; var setBusy = _b[1]
          var _c = useState(false)
          var copied = _c[0]; var setCopied = _c[1]
          var _e = useState('')
          var error = _e[0]; var setError = _e[1]

          // 参数值/模板变化 → 重新生成 prompt；仅当用户未手改时覆盖
          useEffect(function () {
            var generated = substituteParams(props.initialPrompt || '', paramValues)
            var userEdited = lastGeneratedRef.current !== null && prompt !== lastGeneratedRef.current
            lastGeneratedRef.current = generated
            if (!userEdited) setPrompt(generated)
          }, [props.initialPrompt, paramValues])

          useEffect(function () {
            if (job === null || job.status !== 'running' || typeof props.poll !== 'function') return
            var timer = setInterval(function () {
              props.poll(job.jobId).then(function (d) {
                setJob({ jobId: job.jobId, status: d.status, output: d.output || '', code: d.code !== undefined ? d.code : null, sessionId: d.sessionId })
              }).catch(function () {})
            }, 1500)
            return function () { clearInterval(timer) }
          }, [job !== null && job.jobId])

          var setParam = function (key, value) {
            setParamValues(function (prev) {
              var next = {}
              for (var k in prev) next[k] = prev[k]
              next[key] = value
              return next
            })
          }

          var doRun = function () {
            if (typeof props.run !== 'function') return
            setBusy(true); setError('')
            props.run(prompt).then(function (r) {
              setJob({ jobId: r.jobId, status: 'running', output: '', code: null })
            }).catch(function (e) { setError(String(e && e.message)) }).finally(function () { setBusy(false) })
          }
          var canOpenSession = typeof props.onOpenSession === 'function' && job !== null && job.sessionId
          var openSession = function () { props.onOpenSession(job.sessionId) }
          var copy = function () {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(prompt).then(function () { setCopied(true); setTimeout(function () { setCopied(false) }, 1500) }).catch(function () {})
            }
          }
          var statusText = job === null ? '' : job.status === 'running' ? (labels.running || 'running') : job.status === 'done' ? (labels.done || 'done') : (labels.failed || 'failed') + (job.code != null ? ' (' + job.code + ')' : '')
          // 完成态插槽：提供后 job done 由插槽全权渲染（footer 置空，操作按钮插槽自承）
          var completedSlot = typeof props.completedView === 'function' && job !== null && job.status === 'done'

          return h('div', { onClick: function (e) { if (e.target === e.currentTarget && props.onClose) props.onClose() }, style: { position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
            h('div', { style: { width: 'min(640px,92vw)', maxHeight: '86vh', overflow: 'auto', background: 'var(--dsw-alias-bg-layer-1,#fff)', border: '1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3))', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, color: 'var(--dsw-alias-label-primary,inherit)', font: 'var(--dsw-font-family,inherit)' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                h('div', { style: { fontSize: 17, fontWeight: 600 } }, title || ''),
                h('button', { onClick: props.onClose, style: Object.assign({}, btnStyle, { marginLeft: 'auto', width: 28, height: 28, padding: 0, borderRadius: 28 }) }, '✕')),
              hint ? h('div', { style: { fontSize: 12, opacity: .7 } }, hint) : null,
              // 模板参数输入区（idle 态；值实时替换进 prompt，位于 prompt 上方与 ntd 同布局）
              paramDefs.length > 0 ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
                paramDefs.map(function (d) {
                  return h('label', { key: d.key, style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, opacity: .85 } },
                    h('span', null, d.label || d.key),
                    d.multiline
                      ? h('textarea', { value: paramValues[d.key] || '', placeholder: d.placeholder || '', onChange: function (e) { setParam(d.key, e.target.value) }, spellCheck: false, style: Object.assign({}, paramStyle, { minHeight: 64, resize: 'vertical' }) })
                      : h('input', { value: paramValues[d.key] || '', placeholder: d.placeholder || '', onChange: function (e) { setParam(d.key, e.target.value) }, style: paramStyle }))
                })) : null,
              (props.rows || []).length > 0 ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 } },
                props.rows.map(function (r, i) {
                  return r[1] ? h('div', { key: i }, h('b', null, r[0] + '：'), h('span', null, r[1])) : null
                })) : null,
              h('textarea', { value: prompt, onChange: function (e) { setPrompt(e.target.value) }, spellCheck: false, style: inputStyle }),
              error !== '' ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-state-error,#c75050)' } }, error) : null,
              completedSlot
                ? props.completedView({ job: job, output: job.output || '', close: props.onClose, retry: doRun })
                : (job !== null ? h('div', null,
                    h('div', { style: { fontSize: 12, opacity: .7, margin: '4px 0' } }, (labels.outputLabel || 'Output') + ' · ' + statusText),
                    h('pre', { style: { maxHeight: 220, margin: 0, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--dsw-alias-bg-layer-2,transparent)', border: '1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2))', borderRadius: '8px', padding: '8px' } }, job.output || '…')) : null),
              completedSlot ? null : h('div', { style: { display: 'flex', gap: 8 } },
                canOpenSession ? h('button', { onClick: openSession, style: btnStyle }, labels.openSession || 'Open chat') : null,
                h('button', { onClick: copy, style: btnStyle }, copied ? (labels.copied || 'Copied') : (labels.copy || 'Copy')),
                h('button', { onClick: doRun, disabled: busy || (job !== null && job.status === 'running'), style: primaryStyle }, job !== null && job.status === 'running' ? (labels.running || 'Running…') : (labels.run || 'Run')))))
        }
      }

      // ── 共享事件推送枢纽 ─────────────────────────────────────────────────
      // 解决：dsh web 网关是 HTTP/1.1，同源并发只有 ~6 条连接，每个插件自建
      // 永久 SSE 会把预算占满、首页全部排队。全页面只开一条
      // EventSource('/dsh-event-hub/api/stream')，按帧里的 plugin 字段分发。
      // 服务端由任意消费者经 PluginKit.ensureHostHub(ctx, {webServer, connection})
      // 在进程内协调出唯一路由（本包 src/index.js）。
      function ensureClientHub() {
        if (typeof window === 'undefined' || typeof EventSource === 'undefined') return null
        if (window.__dshEventHub) return window.__dshEventHub

        var hubSubscribers = new Map() // plugin -> Set<fn(data, frame)>
        var hubEs = new EventSource('/dsh-event-hub/api/stream')
        hubEs.onmessage = function (msg) {
          var frame
          try { frame = JSON.parse(msg.data) } catch (e) { return }
          if (!frame || typeof frame.plugin !== 'string') return
          var set = hubSubscribers.get(frame.plugin)
          if (!set) return
          set.forEach(function (fn) {
            try { fn(frame.data, frame) } catch (e) { /* 单个订阅者出错不影响其他 */ }
          })
        }

        window.__dshEventHub = {
          subscribe: function (plugin, fn) {
            var set = hubSubscribers.get(plugin)
            if (!set) { set = new Set(); hubSubscribers.set(plugin, set) }
            set.add(fn)
            return function () { set.delete(fn) }
          },
          readyState: function () { return hubEs.readyState },
        }
        return window.__dshEventHub
      }

      /**
       * 订阅某插件的事件流：枢纽就绪则共享连接（零额外连接）；
       * 浏览器不支持时返回 null，调用方自行回退（自有 SSE / 轮询）。
       */
      function connectEvents(plugin, onFrame, onState) {
        var hub = ensureClientHub()
        if (!hub) return null
        var off = hub.subscribe(plugin, function (data, frame) {
          if (onState) { try { onState('live') } catch (e) {} }
          onFrame(data, frame)
        })
        if (onState) { try { onState('live') } catch (e) {} }
        return off
      }

      return { substituteParams: substituteParams, makeActionShareDialog: makeActionShareDialog, ensureClientHub: ensureClientHub, connectEvents: connectEvents }
    })()

    /**
     * dsh-fireworks — Canvas 2D 兜底渲染器（WebGL2 不可用时）
     *
     * 与 WebGL 渲染器同一接口（begin/stamp/flash/end），内部沿用逐段描边的
     * 拖尾实现：星头外晕+内芯双层圆经 lighter 叠加出辉光，拖尾用位置历史
     * 逐段描边（透明浮层不能用渐隐黑矩形，会把页面压暗）。
     * 需要引擎提供位置历史（wantsHistory=true）。
     */

    /* node-test-export-start */
    function createCanvas2DRenderer(canvas) {
      const ctx = canvas.getContext('2d', { alpha: true })
      let vw = 0; let vh = 0; let dpr = 1
      let quality = 1

      const rgba = (r, g, b, a) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`

      return {
        name: 'canvas2d',
        wantsHistory: true,

        resize(cssW, cssH, d) {
          dpr = Math.min(2, d || 1)
          vw = cssW; vh = cssH
          canvas.width = Math.round(cssW * dpr)
          canvas.height = Math.round(cssH * dpr)
        },

        setQuality(q) { quality = q },

        begin() {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.clearRect(0, 0, vw, vh)
          ctx.globalCompositeOperation = 'lighter'
        },

        /**
         * stamp：星头 + 拖尾。history 为扁平 [x0,y0,x1,y1,…]（新到旧含当前点），
         * trailLen/trailFade 控制拖尾段数与衰减；trailDim 压亮度保色相。
         */
        stamp(x, y, size, r, g, b, alpha, bucket, extra) {
          const hist = extra && extra.history
          const trailLen = (extra && extra.trailLen) || 0
          const trailFade = (extra && extra.trailFade) || 0.85
          // 拖尾/光晕用压暗色（additive 已提亮，再打满会洗白）；星头保持白炽
          const trailR = r * 0.72; const trailG = g * 0.72; const trailB = b * 0.72

          const segs = hist ? Math.min(trailLen, hist.length / 2 - 1) : 0
          if (segs > 0) {
            ctx.lineCap = 'round'
            if (quality < 0.75) {
              ctx.strokeStyle = rgba(trailR, trailG, trailB, 1)
              ctx.globalAlpha = alpha * 0.35
              ctx.lineWidth = size * 0.9
              ctx.beginPath()
              ctx.moveTo(hist[0], hist[1])
              for (let i = 1; i < segs + 1; i++) ctx.lineTo(hist[i * 2], hist[i * 2 + 1])
              ctx.stroke()
            } else {
              // i 越大越旧：旧段更细更暗，新段（贴近星头）最亮最粗
              for (let i = segs; i >= 1; i--) {
                ctx.strokeStyle = rgba(trailR, trailG, trailB, 1)
                ctx.globalAlpha = alpha * Math.pow(trailFade, i) * 0.55
                ctx.lineWidth = Math.max(0.4, size * (1 - (i / segs) * 0.7) * 0.8)
                const j = hist.length / 2 - i - 1
                ctx.beginPath()
                ctx.moveTo(hist[j * 2], hist[j * 2 + 1])
                ctx.lineTo(hist[j * 2 + 2], hist[j * 2 + 3])
                ctx.stroke()
              }
            }
          }

          ctx.globalAlpha = alpha * 0.15
          ctx.fillStyle = rgba(r * 0.9 + 0.1, g * 0.9 + 0.1, b * 0.9 + 0.1, 1)
          ctx.beginPath()
          ctx.arc(x, y, size * 2.6, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = alpha
          ctx.fillStyle = rgba(r, g, b, 1)
          ctx.beginPath()
          ctx.arc(x, y, size, 0, Math.PI * 2)
          ctx.fill()
        },

        flash(x, y, radius, alpha) {
          const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
          grad.addColorStop(0, `rgba(255,248,230,${alpha * 0.5})`)
          grad.addColorStop(1, 'rgba(255,248,230,0)')
          ctx.globalAlpha = 1
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.fill()
        },

        end() {
          ctx.globalAlpha = 1
          ctx.globalCompositeOperation = 'source-over'
        },

        clear() {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.clearRect(0, 0, vw, vh)
        },

        dispose() {},
      }
    }
    /* node-test-export-end */

    const FireworkRendererCanvas2D = { createCanvas2DRenderer }

    /**
     * dsh-fireworks — WebGL2 累积缓冲渲染器（GPGPU 路径）
     *
     * 思路（GPU 烟花经典做法，按透明浮层适配）：
     *   每条拖尾不是画出来的，是「攒」出来的——三条累积纹理（短/中/长拖尾
     *   桶），每帧先把上一帧内容乘以衰减系数（指数衰减即丝滑拖尾），再把
     *   本帧粒子以加法混合（ONE, ONE）盖上去；最后三条纹理相加合成到画布。
     *   全部粒子一次 draw call 完成，每帧总 draw call ≈ 9，GPU 开销近零。
     *
     *   桶衰减系数（60fps 基准，帧率无关化在 begin() 里按 dt 折算）：
     *     0 短尾 0.80（牡丹/小星花）  1 中尾 0.88（菊/频闪）  2 长尾 0.94（柳/瀑布）
     *
     *   粒子是点精灵：片元做径向衰减（白炽芯 + 二次方辉光晕），颜色 CPU 侧
     *   随生命演进（白芯→本色→色相漂移）后以顶点属性传入。
     *
     *   透明叠加：累积纹理全程预乘 alpha，合成加法直写画布——页面内容透出，
     *   烟花区域叠加发光。DPR 封顶 1.5（辉光不需要视网膜锐度，纹理内存减半）。
     *
     * 本文件同时跑在浏览器（构建期内联）与 node 语法检查两侧。
     */

    /* node-test-export-start */

    const WEBGL_FADE_BY_BUCKET = [0.84, 0.905, 0.95]

    /**
     * 桶内容衰减到不可见（<1/255）所需的 60fps 等效帧数：ln(255)/-ln(fade)，留余量。
     * begin/end 按 dt 折算的 fadeK 累积进 decay，空桶衰减达标后纹理即纯黑，
     * fade pass 整桶跳过；三桶全达标时 isIdle() 为真，引擎可停摆省电。
     */
    const DECAY_TO_BLACK = [36, 60, 118]

    const VERT_PARTICLE = `#version 300 es
    layout(location=0) in vec2 a_pos;      // px，原点左上
    layout(location=1) in float a_size;    // px
    layout(location=2) in vec4 a_rgba;     // 预乘前颜色 + 透明度
    uniform vec2 u_res;
    out vec4 v_rgba;
    void main() {
      vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      gl_PointSize = a_size;
      v_rgba = a_rgba;
    }`

    const FRAG_PARTICLE = `#version 300 es
    precision mediump float;
    in vec4 v_rgba;
    out vec4 outColor;
    void main() {
      vec2 uv = gl_PointCoord * 2.0 - 1.0;
      float d2 = dot(uv, uv);
      if (d2 > 1.0) discard;
      // 芯部实心、边缘二次方衰减的辉光
      float core = 1.0 - smoothstep(0.0, 0.16, d2);
      float glow = max(0.0, 1.0 - d2);
      glow *= glow;
      float a = clamp(core + glow * 0.55, 0.0, 1.0) * v_rgba.a;
      outColor = vec4(v_rgba.rgb * a, a);   // 预乘输出
    }`

    const VERT_QUAD = `#version 300 es
    layout(location=0) in vec2 a_xy;       // -1..1
    out vec2 v_uv;
    void main() { v_uv = a_xy * 0.5 + 0.5; gl_Position = vec4(a_xy, 0.0, 1.0); }`

    /** 衰减拷贝：out = tex × fade（RGBA 整体乘，预乘 alpha 下颜色与透明度同步衰减）。
     *  8bit 纹理量化陷阱：残值 <~10/255 时 ×0.95 四舍五入回原值，衰减停滞成
     *  永久残影（暗色背景上显形为烟花轮廓）；减一个亚像素常量保证每帧严格
     *  下降、最终真归零。预乘下 rgb≤a，各通道同减不破坏不变式。 */
    const FRAG_FADE = `#version 300 es
    precision mediump float;
    in vec2 v_uv;
    uniform sampler2D u_tex;
    uniform float u_fade;
    out vec4 outColor;
    void main() {
      vec4 c = texture(u_tex, v_uv) * u_fade;
      outColor = max(c - vec4(0.0039), vec4(0.0));   // 0.0039 ≈ 1/255
    }`

    /** 合成：三桶相加（预乘加法），直写画布；u_dim 供浅色主题整体压暗。 */
    const FRAG_COMPOSITE = `#version 300 es
    precision mediump float;
    in vec2 v_uv;
    uniform sampler2D u_tex0;
    uniform sampler2D u_tex1;
    uniform sampler2D u_tex2;
    uniform float u_dim;
    out vec4 outColor;
    void main() {
      vec4 c = texture(u_tex0, v_uv) + texture(u_tex1, v_uv) + texture(u_tex2, v_uv);
      c.rgb *= u_dim;
      outColor = vec4(min(c.rgb, vec3(1.0)), min(c.a, 1.0));
    }`

    /** 爆闪光斑：径向渐变四边形（片元直接算，无需纹理）。 */
    const FRAG_FLASH = `#version 300 es
    precision mediump float;
    in vec2 v_uv;
    uniform vec2 u_center;   // px
    uniform float u_radius;  // px
    uniform vec2 u_res;
    uniform float u_alpha;
    out vec4 outColor;
    void main() {
      vec2 frag = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);
      float d = length(frag - u_center) / max(u_radius, 1.0);
      float a = pow(max(0.0, 1.0 - d), 2.2) * u_alpha;
      outColor = vec4(vec3(1.0, 0.97, 0.9) * a, a);
    }`

    function createWebGLRenderer(canvas) {
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      })
      if (!gl) return null

      // ── 程序 ──────────────────────────────────────────────────────────────
      const compile = (type, src) => {
        const sh = gl.createShader(type)
        gl.shaderSource(sh, src)
        gl.compileShader(sh)
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          const info = gl.getShaderInfoLog(sh)
          gl.deleteShader(sh)
          throw new Error('shader: ' + info)
        }
        return sh
      }
      const program = (vs, fs) => {
        const p = gl.createProgram()
        gl.attachShader(p, compile(gl.VERTEX_SHADER, vs))
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
        gl.linkProgram(p)
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p))
        return p
      }

      let progParticle, progFade, progComposite, progFlash
      try {
        progParticle = program(VERT_PARTICLE, FRAG_PARTICLE)
        progFade = program(VERT_QUAD, FRAG_FADE)
        progComposite = program(VERT_QUAD, FRAG_COMPOSITE)
        progFlash = program(VERT_QUAD, FRAG_FLASH)
      } catch (e) {
        return null   // shader 编译失败 → 回退 Canvas2D
      }

      const uResP = gl.getUniformLocation(progParticle, 'u_res')
      const uTexF = gl.getUniformLocation(progFade, 'u_tex')
      const uFade = gl.getUniformLocation(progFade, 'u_fade')
      const uTexC = [gl.getUniformLocation(progComposite, 'u_tex0'), gl.getUniformLocation(progComposite, 'u_tex1'), gl.getUniformLocation(progComposite, 'u_tex2')]
      const uDim = gl.getUniformLocation(progComposite, 'u_dim')
      let dim = 1
      const uCenter = gl.getUniformLocation(progFlash, 'u_center')
      const uRadius = gl.getUniformLocation(progFlash, 'u_radius')
      const uResF = gl.getUniformLocation(progFlash, 'u_res')
      const uAlphaF = gl.getUniformLocation(progFlash, 'u_alpha')

      // ── 几何 ──────────────────────────────────────────────────────────────
      const quadVbo = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

      const MAX_PARTICLES = 8192
      const FLOATS_PER = 7   // x, y, size, r, g, b, a
      const particleVbo = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, particleVbo)
      gl.bufferData(gl.ARRAY_BUFFER, MAX_PARTICLES * FLOATS_PER * 4, gl.DYNAMIC_DRAW)

      const vaoParticle = gl.createVertexArray()
      gl.bindVertexArray(vaoParticle)
      gl.bindBuffer(gl.ARRAY_BUFFER, particleVbo)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, FLOATS_PER * 4, 0)
      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, FLOATS_PER * 4, 8)
      gl.enableVertexAttribArray(2)
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, FLOATS_PER * 4, 12)

      const vaoQuad = gl.createVertexArray()
      gl.bindVertexArray(vaoQuad)
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      gl.bindVertexArray(null)

      // ── 累积纹理（每桶乒乓两张）────────────────────────────────────────────
      let vw = 0; let vh = 0; let scale = 1
      // 累积纹理实际尺寸（可半分辨率）与 CSS px → 桶纹理 px 的换算
      let bw = 0; let bh = 0; let bscale = 1
      const buckets = [
        { tex: [null, null], fbo: [null, null], read: 0, fade: WEBGL_FADE_BY_BUCKET[0], decay: Infinity },
        { tex: [null, null], fbo: [null, null], read: 0, fade: WEBGL_FADE_BY_BUCKET[1], decay: Infinity },
        { tex: [null, null], fbo: [null, null], read: 0, fade: WEBGL_FADE_BY_BUCKET[2], decay: Infinity },
      ]

      const makeTarget = (w, h) => {
        const tex = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        const fbo = gl.createFramebuffer()
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        return { tex, fbo }
      }

      function allocTargets() {
        for (const b of buckets) {
          for (let i = 0; i < 2; i++) {
            if (b.tex[i]) { gl.deleteTexture(b.tex[i]); gl.deleteFramebuffer(b.fbo[i]) }
            const t = makeTarget(bw, bh)
            b.tex[i] = t.tex; b.fbo[i] = t.fbo
          }
          b.read = 0
          b.decay = Infinity   // 新纹理已清黑：直接视为空闲，不空跑 fade
        }
      }

      // ── 粒子缓冲（按桶分三段填充）──────────────────────────────────────────
      const data = [
        new Float32Array(MAX_PARTICLES * FLOATS_PER),
        new Float32Array(MAX_PARTICLES * FLOATS_PER),
        new Float32Array(MAX_PARTICLES * FLOATS_PER),
      ]
      const counts = [0, 0, 0]
      const flashes = []

      const renderer = {
        name: 'webgl2',
        wantsHistory: false,   // GPU 累积即拖尾，无需 CPU 轨迹历史

        resize(cssW, cssH, dpr) {
          // 累积纹理分辨率封顶（DPR≤1.5 / 长边≤2400）：辉光不需要视网膜锐度
          const cap = Math.min(dpr, 1.5)
          const w = Math.round(cssW * cap)
          const h = Math.round(cssH * cap)
          const longEdge = Math.max(w, h)
          const k = longEdge > 2400 ? 2400 / longEdge : 1
          vw = Math.max(2, Math.round(w * k))
          vh = Math.max(2, Math.round(h * k))
          scale = vw / cssW   // CSS px → 画布纹理 px
          // 大画布累积纹理半分辨率：拖尾/爆闪本就柔和无细节，fade 与粒子盖章的
          // 填充量省 3/4，合成时 LINEAR 放大无感；小窗（角落/侧栏）保持全分辨率
          const trailScale = Math.max(vw, vh) > 1600 ? 0.5 : 1
          bw = Math.max(2, Math.round(vw * trailScale))
          bh = Math.max(2, Math.round(vh * trailScale))
          bscale = scale * trailScale   // CSS px → 累积纹理 px
          canvas.width = vw
          canvas.height = vh
          allocTargets()
        },

        /** 帧开始：计数清零。衰减在各桶 pass 里按 dt 折算。 */
        begin(dt) {
          counts[0] = 0; counts[1] = 0; counts[2] = 0
          flashes.length = 0
          this._fadeK = Math.max(0.5, Math.min(2, dt * 60))   // 帧率无关衰减指数
        },

        /**
         * 盖一枚粒子印章。
         * x/y CSS px；size 星头直径 px；r/g/b∈[0,1]；alpha∈[0,1]；bucket 0/1/2。
         */
        stamp(x, y, size, r, g, b, alpha, bucket) {
          const bi = bucket === 2 ? 2 : bucket === 1 ? 1 : 0
          if (counts[bi] >= MAX_PARTICLES) return
          buckets[bi].decay = 0   // 有内容入桶，重新计时衰减
          const arr = data[bi]
          const o = counts[bi] * FLOATS_PER
          // 点精灵直径 = 星头 × 2.9（辉光晕半径）；CSS px → 累积纹理 px
          arr[o] = x * bscale
          arr[o + 1] = y * bscale
          arr[o + 2] = Math.max(2, size * 2.9 * bscale)
          arr[o + 3] = r
          arr[o + 4] = g
          arr[o + 5] = b
          arr[o + 6] = alpha
          counts[bi] += 1
        },

        /** 爆闪（礼炮白闪）：入短尾桶。 */
        flash(x, y, radius, alpha) {
          buckets[0].decay = 0
          flashes.push([x * bscale, y * bscale, radius * bscale, alpha])
        },

        /** 帧结束：三桶衰减+盖章，合成上屏。已纯黑的空桶整桶跳过。 */
        end() {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.viewport(0, 0, vw, vh)

          // 每桶：fade 拷贝（读→写）→ 加法盖粒子 → 乒乓交换
          for (let bi = 0; bi < 3; bi++) {
            const b = buckets[bi]
            // 空桶衰减累积：达标即纯黑，fade pass 与乒乓都跳过（纹理保持黑）
            if (counts[bi] === 0 && !(bi === 0 && flashes.length > 0)) b.decay += this._fadeK
            if (b.decay > DECAY_TO_BLACK[bi]) continue
            const write = 1 - b.read
            gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo[write])
            gl.viewport(0, 0, bw, bh)
            gl.disable(gl.BLEND)

            // 衰减拷贝
            gl.useProgram(progFade)
            gl.bindVertexArray(vaoQuad)
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, b.tex[b.read])
            gl.uniform1i(uTexF, 0)
            gl.uniform1f(uFade, Math.pow(b.fade, this._fadeK))
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

            // 粒子盖章（加法混合）
            if (counts[bi] > 0) {
              gl.enable(gl.BLEND)
              gl.blendFunc(gl.ONE, gl.ONE)
              gl.useProgram(progParticle)
              gl.uniform2f(uResP, bw, bh)
              gl.bindVertexArray(vaoParticle)
              gl.bindBuffer(gl.ARRAY_BUFFER, particleVbo)
              gl.bufferSubData(gl.ARRAY_BUFFER, 0, data[bi].subarray(0, counts[bi] * FLOATS_PER))
              gl.drawArrays(gl.POINTS, 0, counts[bi])
              gl.disable(gl.BLEND)
            }

            // 爆闪入短尾桶
            if (bi === 0 && flashes.length > 0) {
              gl.enable(gl.BLEND)
              gl.blendFunc(gl.ONE, gl.ONE)
              gl.useProgram(progFlash)
              gl.uniform2f(uResF, bw, bh)
              gl.bindVertexArray(vaoQuad)
              for (const [fx, fy, fr, fa] of flashes) {
                gl.uniform2f(uCenter, fx, fy)
                gl.uniform1f(uRadius, fr)
                gl.uniform1f(uAlphaF, fa)
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
              }
              gl.disable(gl.BLEND)
            }
            b.read = write
          }

          // 合成上屏（加法合三桶，直写不透明 blend 关闭）
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.viewport(0, 0, vw, vh)
          gl.clearColor(0, 0, 0, 0)
          gl.clear(gl.COLOR_BUFFER_BIT)
          gl.useProgram(progComposite)
          gl.uniform1f(uDim, dim)
          gl.bindVertexArray(vaoQuad)
          for (let bi = 0; bi < 3; bi++) {
            gl.activeTexture(gl.TEXTURE0 + bi)
            gl.bindTexture(gl.TEXTURE_2D, buckets[bi].tex[buckets[bi].read])
            gl.uniform1i(uTexC[bi], bi)
          }
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
          gl.bindVertexArray(null)
        },

        clear() {
          for (const b of buckets) {
            for (let i = 0; i < 2; i++) {
              gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo[i])
              gl.clearColor(0, 0, 0, 0)
              gl.clear(gl.COLOR_BUFFER_BIT)
            }
            b.decay = Infinity
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.clearColor(0, 0, 0, 0)
          gl.clear(gl.COLOR_BUFFER_BIT)
        },

        /** 三桶累积纹理是否都已衰减到不可见（引擎据此停摆，让拖尾自然淡出再收工）。 */
        isIdle() {
          for (let bi = 0; bi < 3; bi++) {
            if (buckets[bi].decay <= DECAY_TO_BLACK[bi]) return false
          }
          return true
        },

        /** 浅色主题：整体压暗合成输出，烟花呈墨色线条而非白团。 */
        setDim(v) { dim = Math.max(0.2, Math.min(1, v)) },

        dispose() {
          try {
            const ext = gl.getExtension('WEBGL_lose_context')
            if (ext) ext.loseContext()
          } catch { /* ignore */ }
        },
      }
      return renderer
    }
    /* node-test-export-end */

    const FireworkRendererWebGL = { createWebGLRenderer }

    /**
     * dsh-fireworks — 核心烟花引擎（物理与编排，渲染外包给 renderer）
     *
     * 渲染模型（参考 fireworks-js / 经典 canvas 粒子烟花，按透明浮层重写）：
     *   火箭（Rocket）带火星拖尾升空 → 到达 apex（视口高度比例）爆炸
     *   → 星体（Star）按 shell 花型散布，重力 + 阻尼飞行
     *   → 二级效果：频闪 / 闪烁 / 爆裂 / 十字分裂 / 蕊心 / 爆闪 / 尾端结花。
     *
     * 渲染器双路径（createEngine 自动选择，opts.renderer 可强制）：
     *   webgl2   —— GPGPU：三桶累积纹理衰减出丝滑拖尾，全粒子一次 draw call
     *   canvas2d —— 兜底：位置历史逐段描边拖尾，lighter 叠加双层圆辉光
     * 引擎只做物理与生命周期，每帧以 stamp() 印章接口喂给渲染器。
     *
     * 性能：粒子硬上限、帧时滑动平均驱动自动降质（减星数/减拖尾）、
     * 页面隐藏暂停、WebGL 路径不维护 CPU 轨迹历史（零 GC 压力）。
     *
     * 本文件同时跑在浏览器（构建期内联）与 node 测试（底部导出）两侧；
     * 纯函数段（花型/数学）不触碰 DOM。
     */

    /* node-test-export-start */
    const TAU = Math.PI * 2

    /** 花型向量发生器：给定星序号/总数，返回单位方向 [x, y]（y 向下为正）。 */
    const SHAPES = {
      /** 牡丹/菊/柳/频闪/爆裂等球面弹：均匀球面 + 抖动。 */
      sphere(i, n, rng) {
        const a = (i / n) * TAU + rng() * 0.35
        return [Math.cos(a), Math.sin(a)]
      },
      /** 平面圆环。 */
      ring(i, n, rng) {
        const a = (i / n) * TAU
        const j = 1 + (rng() - 0.5) * 0.06
        return [Math.cos(a) * j, Math.sin(a) * j]
      },
      /** 心形参数曲线（经典 16sin³ 模型，翻转到屏幕坐标）。 */
      heart(i, n, rng) {
        const t = (i / n) * TAU
        const x = 16 * Math.pow(Math.sin(t), 3)
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
        const len = Math.hypot(x, y) || 1
        const j = 1 + (rng() - 0.5) * 0.08
        return [(x / len) * j, (y / len) * j]
      },
      /** 五角星边界。 */
      star(i, n, rng) {
        const per = i / n
        const seg = Math.floor(per * 10)
        const f = per * 10 - seg
        const r1 = 1; const r2 = 0.42
        const a1 = -Math.PI / 2 + (seg * Math.PI) / 5
        const a2 = -Math.PI / 2 + ((seg + 1) * Math.PI) / 5
        const rr1 = seg % 2 === 0 ? r1 : r2
        const rr2 = seg % 2 === 0 ? r2 : r1
        const x = Math.cos(a1) * rr1 + (Math.cos(a2) * rr2 - Math.cos(a1) * rr1) * f
        const y = Math.sin(a1) * rr1 + (Math.sin(a2) * rr2 - Math.sin(a1) * rr1) * f
        const len = Math.hypot(x, y) || 1
        const j = 1 + (rng() - 0.5) * 0.07
        return [(x / len) * j, (y / len) * j]
      },
    }

    /** hsl([0,360),[0,100],[0,100]) → [r,g,b]∈[0,1]。 */
    function hsl2rgb(h, s, l) {
      h = ((h % 360) + 360) % 360 / 360
      s = Math.max(0, Math.min(100, s)) / 100
      l = Math.max(0, Math.min(100, l)) / 100
      if (s === 0) return [l, l, l]
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      const conv = (t) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
      }
      return [conv(h + 1 / 3), conv(h), conv(h - 1 / 3)]
    }

    /**
     * 同色相/饱和度、双亮度一次算出两色 → [r1,g1,b1, r2,g2,b2]。
     * GL 双层盖章（本色 + 亮芯）每星每帧各要一次 hsl→rgb，合并后归一化与
     * conv 闭包只做一遍，数学上与两次调用 hsl2rgb 完全等价。
     */
    function hsl2rgb2(h, s, l1, l2) {
      h = ((h % 360) + 360) % 360 / 360
      s = Math.max(0, Math.min(100, s)) / 100
      l1 = Math.max(0, Math.min(100, l1)) / 100
      l2 = Math.max(0, Math.min(100, l2)) / 100
      if (s === 0) return [l1, l1, l1, l2, l2, l2]
      const q1 = l1 < 0.5 ? l1 * (1 + s) : l1 + s - l1 * s
      const p1 = 2 * l1 - q1
      const q2 = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s
      const p2 = 2 * l2 - q2
      const conv = (t, p, q) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
      }
      return [
        conv(h + 1 / 3, p1, q1), conv(h, p1, q1), conv(h - 1 / 3, p1, q1),
        conv(h + 1 / 3, p2, q2), conv(h, p2, q2), conv(h - 1 / 3, p2, q2),
      ]
    }

    /** hsl → canvas 填充串（带 alpha），canvas2d 路径备用/测试用。 */
    function hsla(h, s, l, a) {
      const [r, g, b] = hsl2rgb(h, s, l)
      return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`
    }

    /** 白炽核心：生命前 15% 把亮度推向近白。 */
    function coreLight(l, t, whiteCore) {
      if (!whiteCore || t > 0.15) return l
      return l + (96 - l) * (1 - t / 0.15)
    }

    /** 拖尾长度 → 累积桶（0 短 / 1 中 / 2 长）。 */
    function trailBucket(trailLen) {
      return trailLen <= 8 ? 0 : trailLen <= 16 ? 1 : 2
    }
    /* node-test-export-end */

    /**
     * createEngine(canvas, opts) → 引擎实例。
     * opts: { intensity=1, maxParticles=1600, renderer='auto'|'webgl2'|'canvas2d' }
     */
    function createEngine(canvas, opts) {
      const options = Object.assign({ intensity: 1, maxParticles: 1300, renderer: 'auto' }, opts)
      const Cards = typeof FireworkCards !== 'undefined' ? FireworkCards : (typeof module !== 'undefined' ? require('./cards.js') : null)

      // ── 渲染器（WebGL2 优先，Canvas2D 兜底）───────────────────────────────
      const makeCanvas2D = () => {
        const f = typeof createCanvas2DRenderer !== 'undefined'
          ? createCanvas2DRenderer
          : (typeof module !== 'undefined' ? require('./renderer-canvas2d.js').createCanvas2DRenderer : null)
        return f(canvas)
      }
      const makeWebGL = () => {
        const f = typeof createWebGLRenderer !== 'undefined'
          ? createWebGLRenderer
          : (typeof module !== 'undefined' ? require('./renderer-webgl.js').createWebGLRenderer : null)
        return f ? f(canvas) : null
      }
      let renderer
      try {
        if (options.renderer === 'canvas2d') renderer = makeCanvas2D()
        else renderer = makeWebGL() || makeCanvas2D()
      } catch {
        // shader 编译失败 / 上下文创建失败 → 回退 Canvas2D
        renderer = makeCanvas2D()
      }
      /** 渲染路径常量：每星每帧不再重复字符串比较。 */
      const isGL = renderer.name === 'webgl2'

      // ── 画布尺寸 ──────────────────────────────────────────────────────────
      let vw = 0; let vh = 0
      /** 尺寸缩放因子：小窗口烟花按比例缩小。 */
      let unit = 1
      function resize() {
        vw = canvas.clientWidth || (typeof innerWidth !== 'undefined' ? innerWidth : 1280)
        vh = canvas.clientHeight || (typeof innerHeight !== 'undefined' ? innerHeight : 800)
        const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1)
        // 尺寸缩放因子：小窗口/区域烟花按比例缩小（下限 0.4 兼容侧边竖条与角落小窗）
        unit = Math.max(0.4, Math.min(1.6, Math.min(vw, vh) / 900))
        renderer.resize(vw, vh, dpr)
      }
      resize()

      // ── 粒子池 ────────────────────────────────────────────────────────────
      const rockets = []   // 升空中的火箭
      const stars = []     // 爆炸后的星体
      const flashes = []   // 爆闪光斑
      let running = false
      let disposed = false
      let enabled = true
      let intensity = options.intensity
      let rafId = 0
      let lastTs = 0
      let lastDt = 0.016
      /** 色调模式：dark（默认）| light（浅色主题：深色墨线、关白炽芯、弱爆闪） */
      let toneMode = 'dark'

      // 自动降质：帧时滑动平均 → 质量系数
      let frameAvg = 16.7
      let quality = 1

      // 定时任务（齐射 volley 用）：{ at, fn }，at 为 performance 时间戳 ms
      const timers = []

      function particleCount() { return stars.length + rockets.length * 8 }
      function budget() { return options.maxParticles * intensity * quality }

      // ── 火箭 ──────────────────────────────────────────────────────────────
      function launchRocket(spec, rng, xFrac) {
        const startX = (xFrac == null ? 0.2 + rng() * 0.6 : xFrac) * vw
        // 爆炸中心不能贴着视口顶边：按预估爆半径留出余量，保证花型完整可见
        const estRadius = spec.speed * unit * spec.starLife * 0.45
        const apexY = Math.max(vh * (1 - spec.rocket.apex), Math.min(estRadius * 0.75, vh * 0.4))
        const startY = vh + 8
        const dist = startY - apexY
        const speed = spec.rocket.speed * unit
        rockets.push({
          spec, rng,
          x: startX, y: startY,
          vx: 0, vy: -speed,
          fuse: dist / speed,          // 秒
          age: 0,
          wobblePhase: rng() * TAU,
          trailAcc: 0,
        })
        // 点火闪光：发射瞬间地面一小团暖光
        flashes.push({ x: startX, y: vh - 6, r: 6, maxR: 26 * unit, age: 0, life: 0.28 })
        ensureRunning()
      }

      // ── 星体工厂 ──────────────────────────────────────────────────────────
      function makeStar(x, y, vx, vy, spec, size, h, s, l, life, opts2) {
        const o = opts2 || {}
        const trailLen = o.trailLen != null ? o.trailLen : Math.max(2, Math.round(spec.trailLen * (quality < 1 ? 0.6 : 1)))
        return {
          x, y, vx, vy,
          age: 0,
          life,
          size,
          h, s, l,
          hueDrift: o.hueDrift != null ? o.hueDrift : spec.hueDrift,
          gravity: o.gravity != null ? o.gravity : spec.gravity * unit,
          drag: o.drag != null ? o.drag : spec.drag,
          trailLen,
          bucket: trailBucket(trailLen),   // trailLen 终身不变，桶归属缓存一次
          trailFade: o.trailFade != null ? o.trailFade : spec.trailFade,
          history: renderer.wantsHistory ? [] : null,
          strobePhase: o.strobePhase != null ? o.strobePhase : 0,
          twinklePhase: o.twinklePhase != null ? o.twinklePhase : 0,
          crackled: !!o.crackled,
          split: !!o.split,
          micro: !!o.micro,
          bloomed: false,
          spec,
        }
      }

      // ── 爆炸 ──────────────────────────────────────────────────────────────
      function explode(spec, rng, x, y) {
        const n = Math.max(4, Math.round(spec.stars * intensity * (0.7 + 0.3 * quality)))
        const shell = spec.shell
        const speedBase = spec.speed * unit
        const phase = Math.floor(rng() * 97)

        // 爆闪（salute）
        if (spec.flash) {
          flashes.push({ x, y, r: 8, maxR: spec.flash.radius * unit, age: 0, life: spec.flash.life })
        }

        // 土星：内球 + 外扁环
        const saturnRingStart = shell === 'saturn' ? Math.floor(n * 0.55) : -1
        // 双环：内外两圈
        const ringSplit = shell === 'doubleRing' ? Math.floor(n / 2) : -1
        // 旋花：切向速度分量
        const swirl = shell === 'tourbillion' ? 0.55 : 0
        // 地雷扇形：向上扇面
        const fan = shell === 'mineFan'

        for (let i = 0; i < n; i++) {
          let dir
          if (shell === 'ring' || shell === 'doubleRing' || (shell === 'saturn' && i >= saturnRingStart)) {
            dir = SHAPES.ring(shell === 'saturn' ? i - saturnRingStart : i, shell === 'saturn' ? n - saturnRingStart : n, rng)
            if (shell === 'saturn') { dir = [dir[0] * 1.25, dir[1] * 0.4] } // 压扁成椭圆环
            if (shell === 'doubleRing' && i >= ringSplit) dir = [dir[0] * 0.6, dir[1] * 0.6]
          } else if (shell === 'heart') {
            dir = SHAPES.heart(i, n, rng)
          } else if (shell === 'star') {
            dir = SHAPES.star(i, n, rng)
          } else if (fan) {
            const a = -Math.PI / 2 + (rng() - 0.5) * 1.5
            dir = [Math.cos(a), Math.sin(a)]
          } else {
            dir = SHAPES.sphere(i, n, rng)
          }

          let sp = speedBase * (0.92 + rng() * 0.16)
          // 球面弹加大速度方差：星体铺满圆盘而非只勾勒轮廓
          if (shell === 'peony' || shell === 'chrysanthemum' || shell === 'willow' || shell === 'strobe' || shell === 'brocade' || shell === 'waterfall' || shell === 'pistil') {
            sp *= 0.72 + rng() * 0.32
          }
          if (shell === 'kamuro') sp *= 0.7 + rng() * 0.3
          if (shell === 'dud' || shell === 'drizzle') sp *= 0.5 + rng() * 0.5
          // 旋花：加切向分量
          let vx = dir[0] * sp; let vy = dir[1] * sp
          if (swirl) {
            vx += -dir[1] * sp * swirl
            vy += dir[0] * sp * swirl * 0.6
          }

          const col = Cards ? Cards.pickColor(spec, rng, i, n, phase) : spec.palette[0]
          stars.push(makeStar(
            x, y, vx, vy, spec,
            spec.starSize * unit * (0.85 + rng() * 0.3),
            col[0], col[1] + spec.saturation, col[2] + spec.lighten,
            spec.starLife * (0.75 + rng() * 0.5),
            { strobePhase: rng() * TAU, twinklePhase: rng() * TAU }
          ))
        }

        // 蕊心：内层第二爆
        if (spec.pistil) {
          const pn = Math.max(6, Math.round(spec.pistil.stars * intensity))
          for (let i = 0; i < pn; i++) {
            const dir = SHAPES.sphere(i, pn, rng)
            const sp = speedBase * spec.pistil.speedRatio * (0.9 + rng() * 0.2)
            const pal = spec.pistil.color
            const col = pal[Math.floor(rng() * pal.length) % pal.length]
            stars.push(makeStar(
              x, y, dir[0] * sp, dir[1] * sp, spec,
              spec.starSize * unit * 0.8,
              col[0], col[1], col[2] + spec.lighten,
              spec.starLife * spec.pistil.lifeRatio * (0.8 + rng() * 0.4),
              { trailLen: 4, twinklePhase: rng() * TAU, crackled: true, split: true, hueDrift: 0 }
            ))
          }
        }
      }

      /** 哑炮特有：弹体暗火坠落。 */
      function spawnFallingShell(x, y, rng, spec) {
        stars.push(makeStar(
          x, y, (rng() - 0.5) * 30, 20,
          Object.assign({}, spec, { strobe: { rate: 6, duty: 0.3 }, twinkle: null, crackle: null, crossette: null }),
          2.4 * unit, 35, 60, 30, 1.6,
          { gravity: 260 * unit, drag: 0.2, trailLen: 5, crackled: true, split: true }
        ))
      }

      // ── 单星更新 ──────────────────────────────────────────────────────────
      function updateStar(st, dt, rng) {
        st.age += dt
        const dragF = Math.exp(-st.drag * dt)
        st.vx *= dragF
        st.vy = st.vy * dragF + st.gravity * dt
        st.x += st.vx * dt
        st.y += st.vy * dt
        if (st.history) {
          st.history.push(st.x, st.y)
          const maxHist = st.trailLen * 2
          if (st.history.length > maxHist) st.history.splice(0, st.history.length - maxHist)
        }

        const spec = st.spec
        const t = st.age / st.life

        // 爆裂：生命到达节点喷微型火星
        if (!st.crackled && spec.crackle && t >= spec.crackle.at && !st.micro) {
          st.crackled = true
          if (particleCount() < budget()) {
            const cn = Math.max(1, Math.round(spec.crackle.count * intensity))
            for (let k = 0; k < cn; k++) {
              const a = rng() * TAU
              const sp = spec.crackle.speed * unit * (0.6 + rng() * 0.8)
              stars.push(makeStar(
                st.x, st.y,
                st.vx * 0.3 + Math.cos(a) * sp,
                st.vy * 0.3 + Math.sin(a) * sp,
                spec, st.size * 0.55,
                st.h + 10, Math.min(100, st.s + 10), Math.min(92, st.l + 14),
                spec.crackle.life * (0.7 + rng() * 0.6),
                { gravity: st.gravity * 1.4, trailLen: 2, strobePhase: rng() * TAU, twinklePhase: rng() * TAU, crackled: true, split: true, micro: true, hueDrift: 0 }
              ))
            }
          }
        }

        // 十字分裂
        if (!st.split && spec.crossette && t >= spec.crossette.at && !st.micro) {
          st.split = true
          const baseA = Math.atan2(st.vy, st.vx) + Math.PI / 2
          const sp = Math.hypot(st.vx, st.vy) * 0.55 + 40 * unit
          for (let k = 0; k < spec.crossette.count; k++) {
            const a = baseA + (k * (spec.crossette.angle || 90) * Math.PI) / 180
            stars.push(makeStar(
              st.x, st.y,
              Math.cos(a) * sp, Math.sin(a) * sp,
              spec, st.size * 0.8,
              st.h, st.s, st.l + 6,
              st.life * 0.55,
              { trailLen: Math.max(3, st.trailLen - 3), strobePhase: st.strobePhase, twinklePhase: st.twinklePhase, split: true }
            ))
          }
          st.life = Math.min(st.life, st.age + 0.12) // 母体熄灭
        }

        // 尾端结花（brocade）：寿终时结一朵微型花
        if (spec.trailBloom && !st.bloomed && t >= 1 && !st.micro) {
          st.bloomed = true
          if (rng() < 0.5 && particleCount() < budget()) {
            stars.push(makeStar(
              st.x, st.y, (rng() - 0.5) * 40, (rng() - 0.5) * 40,
              spec, st.size * 1.3,
              st.h, st.s, Math.min(90, st.l + 10),
              0.4 + rng() * 0.3,
              { gravity: 60 * unit, drag: 1, trailLen: 2, twinklePhase: rng() * TAU, crackled: true, split: true, micro: true, hueDrift: 0 }
            ))
          }
        }
      }

      // ── 单星盖章 ──────────────────────────────────────────────────────────
      function stampStar(st) {
        const spec = st.spec
        const t = st.age / st.life
        let alpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25
        const lightTone = toneMode === 'light'
        // 浅色主题关白炽芯（否则白团盖内容）
        const baseL = coreLight(st.l, t, spec.whiteCore && !lightTone)
        const h = st.h + (st.hueDrift || 0) * st.age

        // 频闪：方波门控
        if (spec.strobe) {
          const gate = (st.age * spec.strobe.rate + st.strobePhase) % 1
          if (gate > spec.strobe.duty) return
        }
        // 闪烁：正弦明暗
        if (spec.twinkle) {
          alpha *= 1 - spec.twinkle.depth * (0.5 + 0.5 * Math.sin(st.age * spec.twinkle.rate * TAU + st.twinklePhase))
        }
        // 微光：快速亮度振荡
        let effLight = baseL
        if (spec.glitter) {
          effLight += spec.glitter.depth * 20 * Math.sin(st.age * spec.glitter.rate * TAU + st.twinklePhase)
        }
        if (alpha <= 0.02) return

        // WebGL 累积会叠加提亮：压低单帧亮度与印章浓度，让白炽核心由重叠自然
        // 形成、色相不被洗白；canvas2d 路径在渲染器内部自行压暗拖尾。
        // 浅色主题：色相加深加饱和成「墨色线条」，在白底上才有对比度。
        let effL = isGL ? Math.min(68, effLight) : effLight
        let effS = st.s
        if (lightTone) { effL = Math.min(58, effLight - 5); effS = Math.min(100, effS + 30) }
        const headAlpha = Math.min(1, alpha * 1.2) * (lightTone ? 0.92 : 1)

        if (!isGL) {
          const [r, g, b] = hsl2rgb(h, effS, effL)
          renderer.stamp(st.x, st.y, st.size, r, g, b, headAlpha, st.bucket, {
            history: st.history,
            trailLen: st.trailLen,
            trailFade: st.trailFade,
          })
          return
        }

        // 双层盖章：亮芯（小而实，色温偏高）+ 软晕（大而淡）。拖尾由亮芯
        // 连续盖章聚成亮线，软晕铺氛围——大星体下亮度不被面积摊薄。
        const [r, g, b, cr, cg, cb] = hsl2rgb2(h, effS, effL, Math.min(85, effL + 12))
        const haloAlpha = headAlpha * 0.3

        // 运动补偿子步盖章：高速星体相邻帧位置差大于星径时，沿运动矢量补盖
        // 中间点（能量按子步数摊薄），累积纹理中的拖尾才连续不成虚线。
        // 自动降质时收紧子步上限并关掉软晕——省一半的正是负载最高的时刻。
        const stepsCap = quality < 0.55 ? 1 : quality < 0.8 ? 2 : 4
        const dx = st.vx * lastDt; const dy = st.vy * lastDt
        const dist = Math.sqrt(dx * dx + dy * dy)
        const steps = Math.min(stepsCap, Math.max(1, Math.ceil(dist / Math.max(2, st.size * 1.2))))
        const stepFade = steps > 1 ? Math.pow(steps, 0.75) : 1
        for (let k = 1; k <= steps; k++) {
          const f = k / steps
          const sx = st.x - dx + dx * f
          const sy = st.y - dy + dy * f
          renderer.stamp(sx, sy, st.size, cr, cg, cb, headAlpha / stepFade, st.bucket, null)
        }
        // 软晕只盖头部一次：大而淡的辉光在拖尾路径上不可分辨，无需子步
        if (quality >= 0.55) {
          renderer.stamp(st.x, st.y, st.size * 2.2, r, g, b, haloAlpha, st.bucket, null)
        }
      }

      // ── 主循环 ────────────────────────────────────────────────────────────
      function frame(ts) {
        if (disposed) return
        rafId = 0
        const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000))
        lastTs = ts
        lastDt = dt
        frameAvg = frameAvg * 0.95 + (dt * 1000) * 0.05
        if (frameAvg > 34) quality = Math.max(0.4, quality - 0.05)
        else if (frameAvg < 20 && quality < 1) quality = Math.min(1, quality + 0.01)
        if (renderer.setQuality) renderer.setQuality(quality)

        // 定时器（齐射）
        for (let i = timers.length - 1; i >= 0; i--) {
          if (ts >= timers[i].at) {
            const job = timers.splice(i, 1)[0]
            try { job.fn() } catch { /* 单次发射失败不影响引擎 */ }
          }
        }

        renderer.begin(dt)

        // 火箭
        for (let i = rockets.length - 1; i >= 0; i--) {
          const r = rockets[i]
          r.age += dt
          r.wobblePhase += dt * 6
          const wob = Math.sin(r.wobblePhase) * (r.spec.rocket.wobble || 0) * unit
          r.x += (r.vx + wob) * dt
          r.y += r.vy * dt
          r.vy += 130 * unit * dt   // 上升微减速

          // 上升火星拖尾
          r.trailAcc += dt * r.spec.rocket.trailRate * (quality < 1 ? 0.6 : 1)
          while (r.trailAcc >= 1) {
            r.trailAcc -= 1
            if (particleCount() < budget()) {
              const tc = r.spec.rocket.trailColor
              stars.push(makeStar(
                r.x + (r.rng() - 0.5) * 3, r.y + 4,
                (r.rng() - 0.5) * 30 * unit, 30 * unit + r.rng() * 40 * unit,
                r.spec, r.spec.rocket.trailSize * unit,
                tc[0], tc[1], tc[2],
                r.spec.rocket.trailLife * (0.7 + r.rng() * 0.6),
                { gravity: r.spec.rocket.trailGravity * unit, drag: 0.6, trailLen: 3, twinklePhase: r.rng() * TAU, crackled: true, split: true, micro: true, hueDrift: 0 }
              ))
            }
          }

          // 火箭头（短尾桶里的暖白亮星）；高速升空按运动矢量补盖中间点防虚线
          if (renderer.wantsHistory) {
            renderer.stamp(r.x, r.y, 2.8 * unit, 1, 0.92, 0.75, 1, 0, null)
          } else {
            const rdx = (r.vx + wob) * dt; const rdy = r.vy * dt
            const rdist = Math.sqrt(rdx * rdx + rdy * rdy)
            const rsteps = Math.min(4, Math.max(1, Math.ceil(rdist / 4)))
            for (let k = 1; k <= rsteps; k++) {
              const f = k / rsteps
              renderer.stamp(r.x - rdx + rdx * f, r.y - rdy + rdy * f, 2.8 * unit, 1, 0.92, 0.75, 0.9 / Math.pow(rsteps, 0.6), 0, null)
            }
          }

          const reachedApex = r.y <= vh * (1 - r.spec.rocket.apex) || r.age >= r.fuse || r.vy > -60 * unit
          if (reachedApex) {
            rockets.splice(i, 1)
            if (r.spec.shell === 'dud') spawnFallingShell(r.x, r.y, r.rng, r.spec)
            explode(r.spec, r.rng, r.x, r.y)
          }
        }

        // 星体
        for (let i = stars.length - 1; i >= 0; i--) {
          const st = stars[i]
          updateStar(st, dt, st.rng || Math.random)
          if (st.age >= st.life || st.y > vh + 40) { stars.splice(i, 1); continue }
          stampStar(st)
        }

        // 爆闪光斑
        for (let i = flashes.length - 1; i >= 0; i--) {
          const f = flashes[i]
          f.age += dt
          const t = f.age / f.life
          if (t >= 1) { flashes.splice(i, 1); continue }
          f.r = f.maxR * (1 - Math.pow(1 - t, 3))
          renderer.flash(f.x, f.y, f.r, (1 - t) * 0.5 * (toneMode === 'light' ? 0.4 : 1))
        }

        renderer.end()

        if (rockets.length || stars.length || flashes.length || timers.length) {
          rafId = requestAnimationFrame(frame)
        } else if (typeof renderer.isIdle === 'function' && !renderer.isIdle()) {
          // 粒子已清空但累积拖尾未衰减完：继续空转让拖尾自然淡出，而非 clear() 骤消
          rafId = requestAnimationFrame(frame)
        } else {
          running = false
          renderer.clear()
        }
      }

      function ensureRunning() {
        if (!running && !disposed && enabled) {
          running = true
          lastTs = (typeof performance !== 'undefined' ? performance.now() : Date.now())
          rafId = requestAnimationFrame(frame)
        }
      }

      // ── 公开 API ──────────────────────────────────────────────────────────
      return {
        /** 发射一枚已解析的 LaunchSpec。x∈[0,1] 为水平位置（缺省随机）。 */
        fire(spec, opts2) {
          if (disposed || !enabled) return
          const o = opts2 || {}
          const rng = Cards && o.seed != null ? Cards.mulberry32(o.seed >>> 0) : Math.random
          // 齐射：主弹 + 延迟副弹
          const shots = spec.volley ? spec.volley.count : 1
          for (let k = 0; k < shots; k++) {
            const delay = k === 0 ? 0 : k * spec.volley.interval + rng() * 0.08
            const spread = spec.volley ? spec.volley.spread : 0
            const xFrac = o.x != null
              ? Math.min(0.95, Math.max(0.05, o.x + (k - (shots - 1) / 2) * spread * 0.3))
              : null
            const go = () => {
              if (spec.rocket.kind === 'mine') {
                const x = (xFrac == null ? 0.25 + rng() * 0.5 : xFrac) * vw
                explode(spec, rng, x, vh - 6)
              } else if (spec.rocket.kind === 'none') {
                const x = (xFrac == null ? 0.25 + rng() * 0.5 : xFrac) * vw
                const y = vh * (1 - (spec.rocket.apex || 0.55))
                explode(spec, rng, x, y)
              } else {
                launchRocket(spec, rng, xFrac)
              }
            }
            if (delay <= 0) go()
            else {
              timers.push({ at: (typeof performance !== 'undefined' ? performance.now() : Date.now()) + delay * 1000, fn: go })
              ensureRunning()
            }
          }
        },

        /** 便捷入口：卡片 + magnitude + seed 直接放。 */
        fireCard(card, mag, seed, opts2) {
          if (!Cards) return
          const rng = Cards.mulberry32((seed == null ? Math.random() * 1e9 : seed) >>> 0)
          this.fire(Cards.resolveCard(card, mag, rng), Object.assign({ seed }, opts2))
        },

        setIntensity(v) { intensity = Math.max(0.1, Math.min(3, v || 1)) },
        /** 色调模式：'dark' | 'light'。浅色主题压暗合成、加深墨色、弱化爆闪。 */
        setToneMode(mode) {
          toneMode = mode === 'light' ? 'light' : 'dark'
          if (renderer.setDim) renderer.setDim(toneMode === 'light' ? 0.72 : 1)
        },
        setEnabled(v) {
          enabled = !!v
          if (!enabled) {
            rockets.length = 0; stars.length = 0; flashes.length = 0; timers.length = 0
            renderer.clear()
          } else ensureRunning()
        },
        resize,
        stats() { return { rockets: rockets.length, stars: stars.length, quality, frameAvg, renderer: renderer.name } },
        dispose() {
          disposed = true
          if (rafId) { try { cancelAnimationFrame(rafId) } catch {} }
          rockets.length = 0; stars.length = 0; flashes.length = 0; timers.length = 0
          renderer.dispose()
        },
      }
    }

    /* node-test-export-start */
    const FireworkEngine = { createEngine, SHAPES, hsla, hsl2rgb }

    /* node-test-export-end */

    'use strict'

    /**
     * dsh-fireworks — Client half
     *
     * 在对话窗口上空挂一块全屏透明画布（position:fixed; pointer-events:none，
     * z-index 低于设置浮层），引擎（client/engine.js）在其中放烟花；庆祝事件
     * 经 EventSource 订阅宿主 SSE（/dsh-fireworks/api/stream）抵达：
     *
     *   { category, magnitude, count, tokens, seq }
     *     → pickVariants(category, count) 从该类卡池加权随机、洗牌袋不放回抽
     *       count 个变种（「一类事件 5 次就随机选 5 种」）
     *     → resolveCard(card, magnitude) 按 token 规模落定参数
     *     → 逐发间隔 160ms 连放
     *
     * 设置页（settings.section）：总开关、全局强度、六类事件独立开关、
     * 试放按钮、引擎实时状态。配置经 /dsh-fireworks/api/config 读写，
     * 宿主持久化到 storageDomain。
     *
     * engine.js / cards.js 由构建脚本内联进本文件所在工厂作用域（bundle 中
     * FireworkCards / createEngine / mulberry32 等为名直接可用）；本文件是
     * 动态插件的源真身，client/bundle.js 由 npm run build:client 生成。
     */

    const LOCALE_NS = 'settings.dshFireworks'

    const ZH = {
      nav: '烟花庆祝',
      title: '烟花庆祝',
      intro: 'agent 编程时，在对话窗口上空放烟花庆祝——开场迎宾、回合礼花、工具星花、里程碑大礼、收工终场、失败哑炮。token 用量决定烟花的大小、高度与绚烂程度。',
      enabled: '放烟花',
      enabledHint: '关闭后所有事件静默，画布收起。',
      intensity: '全局强度',
      intensityHint: '缩放粒子数量与尺寸（0.3–2.5）。低配机器建议 0.6 左右。',
      region: '显示范围',
      regionHint: '烟花只在此区域内绽放；角落区域像小组件，不挡对话内容。',
      regionFullscreen: '全屏',
      regionLeft: '左部侧边栏',
      regionRight: '右部侧边栏',
      regionBottomLeft: '左下角',
      regionBottomRight: '右下角',
      categories: '事件类别',
      catSession: '开场迎宾（新会话）',
      catTurn: '回合礼花（每轮回复完成）',
      catTool: '工具星花（工具调用成功）',
      catMilestone: '里程碑（累计 token 跨档）',
      catFinale: '收工终场（任务全部完成）',
      catFail: '哑炮（工具/回合失败）',
      variants: '{n} 个变种',
      testFire: '试放',
      testAll: '全部试放',
      status: '状态',
      statusLive: '已连接宿主事件流',
      statusConnecting: '正在连接宿主事件流…',
      statusOff: '未连接（宿主插件未启用或页面刚加载）',
      engineStats: '在屏粒子 {stars} · 火箭 {rockets} · 画质 {quality} · 渲染 {renderer}',
      loading: '正在加载配置…',
      save: '保存',
      saved: '已保存 ✓',
      retry: '重试',
      reducedMotion: '检测到系统「减弱动态效果」偏好，烟花已暂停；开启下方「忽略系统减弱动态效果」可强制播放，或在 系统设置 → 辅助功能 → 显示 中关闭该偏好（需刷新页面）。',
      ignoreReducedMotion: '忽略系统「减弱动态效果」',
      ignoreReducedMotionHint: '开启后即使系统偏好减弱动态效果，也照常播放烟花。',
      demoHint: '小贴士：在地址栏加 ?fireworks=demo 可进入循环试放模式。',
    }

    const EN = {
      nav: 'Fireworks',
      title: 'Fireworks Celebration',
      intro: 'Fireworks over the chat window while the agent works — welcome shells, turn peonies, tool sparks, milestone grand shells, finales, and sympathetic duds. Token usage scales size, altitude and brilliance.',
      enabled: 'Fireworks enabled',
      enabledHint: 'When off, every event stays silent and the canvas is hidden.',
      intensity: 'Global intensity',
      intensityHint: 'Scales particle count and size (0.3–2.5). Lower it on weak GPUs.',
      region: 'Display region',
      regionHint: 'Fireworks bloom only inside this region; corner regions feel like widgets.',
      regionFullscreen: 'Fullscreen',
      regionLeft: 'Left sidebar strip',
      regionRight: 'Right sidebar strip',
      regionBottomLeft: 'Bottom-left corner',
      regionBottomRight: 'Bottom-right corner',
      categories: 'Event categories',
      catSession: 'Welcome shells (new session)',
      catTurn: 'Turn peonies (reply completed)',
      catTool: 'Tool sparks (tool call succeeded)',
      catMilestone: 'Milestones (token tiers)',
      catFinale: 'Finale (all tasks completed)',
      catFail: 'Duds (tool/turn failures)',
      variants: '{n} variants',
      testFire: 'Test fire',
      testAll: 'Fire all',
      status: 'Status',
      statusLive: 'Connected to host event stream',
      statusConnecting: 'Connecting to host event stream…',
      statusOff: 'Not connected (host plugin disabled or page just loaded)',
      engineStats: '{stars} particles · {rockets} rockets · quality {quality} · {renderer}',
      loading: 'Loading config…',
      save: 'Save',
      saved: 'Saved ✓',
      retry: 'Retry',
      reducedMotion: 'Your system prefers reduced motion — fireworks are paused. Turn on "Ignore reduced motion" below to force playback, or change the OS accessibility setting (then refresh).',
      ignoreReducedMotion: 'Ignore system "reduce motion"',
      ignoreReducedMotionHint: 'Play fireworks even when the OS prefers reduced motion.',
      demoHint: 'Tip: append ?fireworks=demo to the URL for a looping demo.',
    }

    const LOCALE_DICT = { zh: ZH, en: EN }
    const API = '/dsh-fireworks/api'

    /** 类别顺序（设置页与「全部试放」用）。 */
    const CATEGORY_ORDER = ['session', 'turn', 'tool', 'milestone', 'finale', 'fail']
    const CATEGORY_LABEL_KEYS = {
      session: 'catSession', turn: 'catTurn', tool: 'catTool',
      milestone: 'catMilestone', finale: 'catFinale', fail: 'catFail',
    }

    // ── 漂浮画布 ─────────────────────────────────────────────────────────────

    /**
     * 显示范围：画布不必铺满全屏，可收缩到侧边竖条或角落小窗（角落小组件
     * 式庆祝，不挡对话内容）。引擎坐标系相对画布，收缩后自动适配。
     * 区域键与宿主 REGIONS 枚举一致。
     */
    const REGION_CSS = {
      fullscreen: { top: '0', left: '0', width: '100vw', height: '100vh' },
      left: { top: '0', bottom: '0', left: '0', right: 'auto', width: 'clamp(220px, 24vw, 400px)', height: 'auto' },
      right: { top: '0', bottom: '0', left: 'auto', right: '0', width: 'clamp(220px, 24vw, 400px)', height: 'auto' },
      'bottom-left': { top: 'auto', bottom: '0', left: '0', right: 'auto', width: 'clamp(280px, 38vw, 560px)', height: 'clamp(240px, 46vh, 480px)' },
      'bottom-right': { top: 'auto', bottom: '0', left: 'auto', right: '0', width: 'clamp(280px, 38vw, 560px)', height: 'clamp(240px, 46vh, 480px)' },
    }

    /**
     * 全屏/区域透明画布浮层。pointer-events:none 不挡任何点击；z-index 低于
     * 设置/对话框浮层（2147483000 一带），高于对话内容。
     */
    function mountOverlay() {
      const canvas = document.createElement('canvas')
      canvas.setAttribute('data-dsh-fireworks', '')
      canvas.style.cssText = 'position:fixed;pointer-events:none;z-index:2147482000'
      document.body.appendChild(canvas)

      const engine = createEngine(canvas, { maxParticles: 1300 })

      let region = 'bottom-right'
      const applyRegion = (r) => {
        region = REGION_CSS[r] ? r : 'bottom-right'
        const css = REGION_CSS[region]
        // 先清后设：切换区域时旧的长宽/锚点不能残留
        for (const k of ['top', 'bottom', 'left', 'right', 'width', 'height']) canvas.style[k] = ''
        for (const [k, v] of Object.entries(css)) canvas.style[k] = v
        engine.resize()
      }
      applyRegion(region)

      const onResize = () => engine.resize()
      window.addEventListener('resize', onResize)
      const onVisibility = () => engine.setEnabled(!document.hidden && overlayEnabled)
      document.addEventListener('visibilitychange', onVisibility)

      let overlayEnabled = true
      return {
        engine,
        setEnabled(v) {
          overlayEnabled = !!v
          engine.setEnabled(overlayEnabled && !document.hidden)
          canvas.style.display = overlayEnabled ? '' : 'none'
        },
        setRegion: applyRegion,
        dispose() {
          window.removeEventListener('resize', onResize)
          document.removeEventListener('visibilitychange', onVisibility)
          engine.dispose()
          canvas.remove()
        },
      }
    }

    // ── 主题色调自适应 ────────────────────────────────────────────────────────

    /**
     * 主判据走 dsh 官方主题属性（ThemePresenter 约定）：
     *   html[data-ds-theme-source="light|dark|system"] + body[data-ds-dark-theme]（存在即暗色）
     * 属性缺席（老版本宿主）才回退 elementFromPoint 采样：画布 pointer-events:none，
     * 穿透命中下层页面元素，沿父链找第一个非透明背景色，亮于阈值 → light。
     */
    function detectTone() {
      try {
        const root = document.documentElement
        const body = document.body
        const source = (root.getAttribute('data-ds-theme-source') || '').toLowerCase()
        if (source === 'dark') return 'dark'
        if (source === 'light') return 'light'
        if (body && body.hasAttribute('data-ds-dark-theme')) return 'dark'
        let el = document.elementFromPoint(Math.floor(innerWidth / 2), Math.floor(innerHeight * 0.55))
        let guard = 0
        while (el && guard++ < 12) {
          const bg = getComputedStyle(el).backgroundColor
          const m = bg && bg.match(/rgba?\(([^)]+)\)/)
          if (m) {
            const parts = m[1].split(',').map((s) => Number(s.trim()))
            const [r, g, b] = parts
            const a = parts.length > 3 ? parts[3] : 1
            if (Number.isNaN(r) || a === 0) { el = el.parentElement; continue }
            return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 150 ? 'light' : 'dark'
          }
          el = el.parentElement
        }
      } catch { /* 采样失败保持默认 */ }
      return 'dark'
    }

    // ── 庆祝事件 → 放烟花 ────────────────────────────────────────────────────

    /** 洗牌袋状态（每类别一袋，抽完重洗防重样）。 */
    const bagState = {}

    function dispatchCelebration(overlay, ev) {
      if (!ev || typeof ev !== 'object') return
      const category = ev.category
      const pool = (typeof CARDS_BY_CATEGORY !== 'undefined') && CARDS_BY_CATEGORY[category]
      if (!pool || pool.length === 0) return
      const count = Math.max(1, Math.min(6, Math.round(ev.count || 1)))
      // seed 来自宿主事件序号：同一事件在多客户端/重连后播放同一组变种
      const seed = ((typeof ev.seq === 'number' ? ev.seq : Date.now() % 65536) * 2654435761) >>> 0
      const rng = mulberry32(seed)
      const variants = pickVariants(category, count, rng, bagState)
      const baseMag = typeof ev.magnitude === 'number'
        ? ev.magnitude
        : category === 'tool' ? 0.35 : category === 'fail' ? 0.3 : 0.5
      variants.forEach((card, i) => {
        const mag = Math.min(1, Math.max(0, baseMag * (0.9 + rng() * 0.2)))
        setTimeout(() => {
          try { overlay.engine.fireCard(card, mag, (seed + i * 97) >>> 0) } catch { /* 单发失败不影响后续 */ }
        }, i * 160)
      })
    }

    // ── 设置页 ───────────────────────────────────────────────────────────────

    function FireworksPanel({ t }) {
      const h = React.createElement
      const [config, setConfig] = React.useState(null)
      const [loadError, setLoadError] = React.useState(false)
      const [savedTick, setSavedTick] = React.useState(false)
      const [liveState, setLiveState] = React.useState('connecting')
      const [stats, setStats] = React.useState(null)

      const load = React.useCallback(() => {
        setLoadError(false)
        fetch(API + '/config', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad status'))))
          .then((cfg) => setConfig(cfg))
          .catch(() => setLoadError(true))
      }, [])

      React.useEffect(() => { load() }, [load])

      // 引擎状态轮询（连接状态 + 粒子统计），1s 一次
      React.useEffect(() => {
        const timer = setInterval(() => {
          const rt = window.__dshFireworks
          if (rt) {
            setLiveState(rt.liveState())
            setStats(rt.stats())
          }
        }, 1000)
        return () => clearInterval(timer)
      }, [])

      const save = (next) => {
        setConfig(next)
        fetch(API + '/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }).then((r) => {
          if (!r.ok) throw new Error('bad status')
          setSavedTick(true)
          setTimeout(() => setSavedTick(false), 1500)
          if (window.__dshFireworks) window.__dshFireworks.applyConfig(next)
        }).catch(() => load()) // 保存失败不假装成功：回读宿主真实配置，面板弹回真实状态
      }

      const testFire = (category) => {
        fetch(API + '/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, magnitude: 0.7 }),
        }).catch(() => {})
      }

      if (config === null && !loadError) return h('p', { style: { opacity: 0.7 } }, t('loading'))
      if (loadError && config === null) {
        return h('div', null,
          h('p', { style: { color: 'var(--dsw-alias-label-error, #e06c75)' } }, t('statusOff')),
          h('button', { type: 'button', onClick: load }, t('retry')))
      }

      const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
      const toggleCat = (cat) => save(Object.assign({}, config, {
        categories: Object.assign({}, config.categories, { [cat]: !config.categories[cat] }),
      }))

      const row = { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.15))' }
      const label = { flex: 1, fontSize: '13px' }
      const hint = { display: 'block', opacity: 0.6, fontSize: '12px', marginTop: '2px' }
      const btn = { fontSize: '12px', padding: '3px 10px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))', background: 'transparent', color: 'inherit', cursor: 'pointer' }

      return h('div', { style: { maxWidth: '560px' } },
        h('p', { style: { opacity: 0.75, fontSize: '13px', lineHeight: 1.6 } }, t('intro')),

        reducedMotion && !config.ignoreReducedMotion && h('p', { style: { color: 'var(--dsw-alias-label-warning, #d19a66)', fontSize: '12px' } }, t('reducedMotion')),

        // 总开关
        h('div', { style: row },
          h('span', { style: label }, t('enabled'), h('span', { style: hint }, t('enabledHint'))),
          h('input', {
            type: 'checkbox', checked: !!config.enabled,
            onChange: (e) => save(Object.assign({}, config, { enabled: e.target.checked })),
          })),

        // 忽略系统「减弱动态效果」
        h('div', { style: row },
          h('span', { style: label }, t('ignoreReducedMotion'), h('span', { style: hint }, t('ignoreReducedMotionHint'))),
          h('input', {
            type: 'checkbox', checked: !!config.ignoreReducedMotion,
            onChange: (e) => save(Object.assign({}, config, { ignoreReducedMotion: e.target.checked })),
          })),

        // 全局强度
        h('div', { style: row },
          h('span', { style: label },
            t('intensity'),
            h('span', { style: hint }, t('intensityHint'))),
          h('input', {
            type: 'range', min: 0.3, max: 2.5, step: 0.1, value: config.intensity,
            onChange: (e) => save(Object.assign({}, config, { intensity: Number(e.target.value) })),
          }),
          h('code', { style: { fontSize: '12px', minWidth: '30px', textAlign: 'right' } }, config.intensity.toFixed(1))),

        // 显示范围
        h('div', { style: row },
          h('span', { style: label },
            t('region'),
            h('span', { style: hint }, t('regionHint'))),
          h('select', {
            value: config.region || 'bottom-right',
            style: { fontSize: '12px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))', background: 'transparent', color: 'inherit' },
            onChange: (e) => save(Object.assign({}, config, { region: e.target.value })),
          },
            h('option', { value: 'fullscreen' }, t('regionFullscreen')),
            h('option', { value: 'left' }, t('regionLeft')),
            h('option', { value: 'right' }, t('regionRight')),
            h('option', { value: 'bottom-left' }, t('regionBottomLeft')),
            h('option', { value: 'bottom-right' }, t('regionBottomRight')))),

        // 六类事件开关 + 试放
        h('h4', { style: { margin: '18px 0 4px', fontSize: '13px' } }, t('categories')),
        CATEGORY_ORDER.map((cat) => h('div', { key: cat, style: row },
          h('span', { style: label },
            t(CATEGORY_LABEL_KEYS[cat]),
            h('span', { style: hint }, t('variants', { n: (CARDS_BY_CATEGORY[cat] || []).length }))),
          h('button', { type: 'button', style: btn, onClick: () => testFire(cat) }, t('testFire')),
          h('input', {
            type: 'checkbox',
            checked: !config.categories || config.categories[cat] !== false,
            onChange: () => toggleCat(cat),
          }))),

        // 全部试放
        h('div', { style: { marginTop: '14px' } },
          h('button', {
            type: 'button', style: btn,
            onClick: () => CATEGORY_ORDER.forEach((cat, i) => setTimeout(() => testFire(cat), i * 900)),
          }, '🎆 ' + t('testAll'))),

        // 状态
        h('h4', { style: { margin: '18px 0 4px', fontSize: '13px' } }, t('status')),
        h('p', { style: { fontSize: '12px', opacity: 0.75 } },
          liveState === 'live' ? '🟢 ' + t('statusLive')
            : liveState === 'connecting' ? '🟡 ' + t('statusConnecting')
            : '🔴 ' + t('statusOff')),
        stats && h('p', { style: { fontSize: '12px', opacity: 0.6 } },
          t('engineStats', { stars: stats.stars, rockets: stats.rockets, quality: stats.quality.toFixed(2), renderer: stats.renderer })),
        savedTick && h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-success, #5cd6a8)' } }, t('saved')),
        h('p', { style: { fontSize: '12px', opacity: 0.5, marginTop: '14px' } }, t('demoHint')))
    }

    // ── 插件入口 ─────────────────────────────────────────────────────────────

    module.exports = {
      name: '@weibaohui/dsh-fireworks',
      inject: ['slots', 'locale'],

      apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined) return
        const locale = ctx.get('locale')
        // locale.bind 只做查表，{var} 插值自承（dsh-flow 同款包裹）；
        // 服务缺席时落到内置中文表，最差也只见中文不见裸 key。
        const tRaw = locale && typeof locale.bind === 'function' ? locale.bind(LOCALE_NS) : null
        const t = (key, vars) => {
          let out = (tRaw && tRaw(key)) || ZH[key] || key
          if (vars) for (const [k, v] of Object.entries(vars)) out = out.split('{' + k + '}').join(String(v))
          return out
        }
        if (locale && typeof locale.register === 'function') {
          ctx.effect(() => locale.register(LOCALE_NS, LOCALE_DICT))
        }

        // ── 画布浮层 + 引擎 ────────────────────────────────────────────────
        const overlay = mountOverlay()
        ctx.effect(() => () => overlay.dispose(), 'dsh-fireworks: overlay')

        // ── 配置装载 ───────────────────────────────────────────────────────
        const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
        const applyConfig = (cfg) => {
          if (!cfg || typeof cfg !== 'object') return
          const allowMotion = !reducedMotion || cfg.ignoreReducedMotion === true
          overlay.setEnabled(cfg.enabled !== false && allowMotion)
          overlay.engine.setIntensity(typeof cfg.intensity === 'number' ? cfg.intensity : 1)
          overlay.setRegion(typeof cfg.region === 'string' ? cfg.region : 'bottom-right')
        }
        fetch(API + '/config', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((cfg) => applyConfig(cfg))
          .catch(() => {})

        // ── 主题色调跟随（事件驱动，无轮询）────────────────────────────────
        // dsh 切主题翻动 html/body 的官方主题属性 → MutationObserver 即时捕获；
        // matchMedia 兜住 system 模式下的系统深浅切换与属性缺席宿主。
        const applyTone = () => overlay.engine.setToneMode(detectTone())
        applyTone()
        try {
          const toneMo = new MutationObserver(applyTone)
          toneMo.observe(document.documentElement, { attributes: true })
          if (document.body) toneMo.observe(document.body, { attributes: true })
          const toneMq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')
          if (toneMq && toneMq.addEventListener) toneMq.addEventListener('change', applyTone)
          ctx.effect(() => () => {
            toneMo.disconnect()
            if (toneMq && toneMq.removeEventListener) toneMq.removeEventListener('change', applyTone)
          }, 'dsh-fireworks: tone')
        } catch { /* 保留挂载时探测结果 */ }

        // ── 事件订阅：枢纽优先（dsh-plugin-kit ≥0.4 的共享单连接），缺席回退
        // 自有 SSE——独立安装不受影响 ──────────────────────────────────────
        let liveState = 'connecting'
        let es = null
        const hubOff = connectEvents('dsh-fireworks', (data) => {
          try { dispatchCelebration(overlay, data) } catch { /* 坏帧忽略 */ }
        }, (s) => { liveState = s })
        if (!hubOff && typeof EventSource !== 'undefined') {
          es = new EventSource(API + '/stream')
          es.onopen = () => { liveState = 'live' }
          es.onerror = () => { liveState = 'connecting' } // EventSource 自动重连
          es.onmessage = (msg) => {
            try { liveState = 'live'; dispatchCelebration(overlay, JSON.parse(msg.data)) } catch { /* 坏帧忽略 */ }
          }
        }
        ctx.effect(() => () => {
          if (hubOff) try { hubOff() } catch {}
          if (es) try { es.close() } catch {}
        }, 'dsh-fireworks: events')

        // ── 调试/演示入口 ──────────────────────────────────────────────────
        window.__dshFireworks = {
          fire: (category, magnitude) => dispatchCelebration(overlay, { category: category || 'turn', magnitude: magnitude == null ? 0.7 : magnitude, seq: Date.now() % 65536 }),
          applyConfig,
          stats: () => overlay.engine.stats(),
          liveState: () => liveState,
        }
        ctx.effect(() => () => { try { delete window.__dshFireworks } catch {} }, 'dsh-fireworks: debug api')

        // ?fireworks=demo：循环试放（开发/演示用）
        let demoTimer = null
        try {
          if (typeof location !== 'undefined' && /[?&]fireworks=demo\b/.test(location.search)) {
            let i = 0
            demoTimer = setInterval(() => {
              const cat = CATEGORY_ORDER[i % CATEGORY_ORDER.length]
              i += 1
              dispatchCelebration(overlay, { category: cat, magnitude: 0.4 + (i % 5) * 0.13, count: cat === 'tool' ? 3 : 1, seq: i * 31 })
            }, 2600)
          }
        } catch { /* location 不可用时跳过 */ }
        ctx.effect(() => () => { if (demoTimer) clearInterval(demoTimer) }, 'dsh-fireworks: demo')

        // ── 设置页 ─────────────────────────────────────────────────────────
        slots.inject('settings.section', () => slots.register(
          {
            name: 'settings.section',
            id: '@weibaohui/dsh-fireworks',
            order: 32,
            label: () => t('nav'),
            locale: LOCALE_NS,
          },
          () => React.createElement(FireworksPanel, { t })
        ))
      },
    }
    return module.exports
  }
})
