/**
 * dsh-fireworks 离线测试：属性卡完整性、洗牌袋抽取、magnitude 映射、
 * resolveCard 落定、花型向量发生器、宿主 magnitude 一致性。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Cards = require('../client/cards.js')
const Engine = require('../client/engine.js')
const Host = require('../src/index.js')

const CATS = ['session', 'turn', 'tool', 'milestone', 'finale', 'fail']

test('每类事件至少 4 个变种，且 id 全局唯一', () => {
  const ids = new Set()
  for (const c of Cards.ALL_CARDS) {
    assert.ok(!ids.has(c.id), `duplicate card id ${c.id}`)
    ids.add(c.id)
    assert.ok(CATS.includes(c.category), `${c.id} bad category`)
  }
  for (const cat of CATS) {
    assert.ok((Cards.CARDS_BY_CATEGORY[cat] || []).length >= 4, `${cat} needs >= 4 variants`)
  }
})

test('卡片必填字段完整（详尽参数卡）', () => {
  for (const c of Cards.ALL_CARDS) {
    assert.ok(c.name && c.nameEn && c.flavor, `${c.id} missing names/flavor`)
    assert.ok(c.rarity >= 1 && c.rarity <= 5, `${c.id} rarity`)
    assert.ok(Array.isArray(c.rocket.apex) && c.rocket.apex.length === 2, `${c.id} rocket.apex`)
    assert.ok(Array.isArray(c.burst.stars) && c.burst.stars[1] > c.burst.stars[0], `${c.id} burst.stars range`)
    assert.ok(Array.isArray(c.color.palette) && c.color.palette.length >= 1, `${c.id} palette`)
    for (const [h, s, l] of c.color.palette) {
      assert.ok(h >= 0 && h < 360, `${c.id} hue ${h}`)
      assert.ok(s >= 0 && s <= 100 && l >= 0 && l <= 100, `${c.id} s/l`)
    }
    assert.ok(c.burst.trail.len[1] >= c.burst.trail.len[0], `${c.id} trail range`)
    assert.ok(c.scaling && typeof c.scaling.stars === 'string', `${c.id} scaling`)
  }
})

test('洗牌袋：一类事件 5 次不放回抽 5 个不同变种', () => {
  const rng = Cards.mulberry32(42)
  const bag = {}
  const picks = Cards.pickVariants('turn', 5, rng, bag)
  assert.equal(picks.length, 5)
  assert.equal(new Set(picks.map((c) => c.id)).size, 5, 'first 5 must be distinct')
  // 袋中剩余 = 池大小 - 5
  assert.equal(bag.turn.length, Cards.CARDS_BY_CATEGORY.turn.length - 5)
})

test('洗牌袋：抽取数超过池大小自动重洗且不与上一张重复', () => {
  const rng = Cards.mulberry32(7)
  const bag = {}
  const pool = Cards.CARDS_BY_CATEGORY.fail.length
  const picks = Cards.pickVariants('fail', pool + 2, rng, bag)
  assert.equal(picks.length, pool + 2)
  assert.notEqual(picks[pool - 1].id, picks[pool].id, 'no repeat across bag refill boundary')
})

test('同 seed 抽取序列可复现', () => {
  const a = Cards.pickVariants('milestone', 3, Cards.mulberry32(99), {})
  const b = Cards.pickVariants('milestone', 3, Cards.mulberry32(99), {})
  assert.deepEqual(a.map((c) => c.id), b.map((c) => c.id))
})

test('稀有度加权：传说卡（rarity 5）长期频率低于常见卡', () => {
  const rng = Cards.mulberry32(2026)
  const bag = {}
  const counts = {}
  for (let i = 0; i < 400; i++) {
    for (const c of Cards.pickVariants('finale', 1, rng, bag)) {
      counts[c.id] = (counts[c.id] || 0) + 1
    }
  }
  const legendary = Cards.CARDS_BY_CATEGORY.finale.find((c) => c.rarity === 5)
  const common = Cards.CARDS_BY_CATEGORY.finale.find((c) => c.rarity === 2)
  assert.ok(counts[legendary.id] < counts[common.id], `legendary ${counts[legendary.id]} should be < common ${counts[common.id]}`)
})

test('magnitudeOf：0→0，ref→1，单调递增，host 与 cards 同式', () => {
  assert.equal(Cards.magnitudeOf(0, 40000), 0)
  assert.equal(Cards.magnitudeOf(40000, 40000), 1)
  assert.ok(Cards.magnitudeOf(5000, 40000) < Cards.magnitudeOf(20000, 40000))
  assert.equal(Cards.magnitudeOf(1e9, 40000), 1)
  assert.equal(Host.__internals.magnitudeOf(5000, 40000), Cards.magnitudeOf(5000, 40000))
})

test('resolveCard：落定所有区间，mag=0 与 mag=1 拉开差距', () => {
  const card = Cards.CARDS_BY_CATEGORY.turn[0]
  const lo = Cards.resolveCard(card, 0, Cards.mulberry32(1))
  const hi = Cards.resolveCard(card, 1, Cards.mulberry32(1))
  assert.ok(hi.stars > lo.stars, 'token 越多星越多')
  assert.ok(hi.rocket.apex > lo.rocket.apex, 'token 越多飞越高')
  assert.ok(hi.speed > lo.speed, 'token 越多爆速越大')
  assert.ok(hi.lighten > lo.lighten, 'token 越多越亮（艳丽）')
  assert.ok(Number.isFinite(lo.gravity) && lo.trailLen >= 2)
  assert.equal(typeof lo.shell, 'string')
})

test('resolveCard：同 seed 同 mag 结果一致（可复现）', () => {
  const card = Cards.CARDS_BY_CATEGORY.milestone[0]
  const a = Cards.resolveCard(card, 0.6, Cards.mulberry32(123))
  const b = Cards.resolveCard(card, 0.6, Cards.mulberry32(123))
  assert.deepEqual(a, b)
})

test('花型发生器：向量有限且大致归一', () => {
  const rng = Cards.mulberry32(5)
  for (const name of ['sphere', 'ring', 'heart', 'star']) {
    for (let i = 0; i < 20; i++) {
      const [x, y] = Engine.SHAPES[name](i, 20, rng)
      assert.ok(Number.isFinite(x) && Number.isFinite(y), `${name} finite`)
      const len = Math.hypot(x, y)
      assert.ok(len > 0.3 && len < 1.3, `${name} len ${len}`)
    }
  }
})

test('一发多色：bands 归一化 + mixChance 概率门控 + 配比分布', () => {
  const card = Cards.CARDS_BY_CATEGORY.turn.find((c) => c.id === 'peony-gold')
  assert.ok(Array.isArray(card.color.bands), 'peony-gold has bands')

  // 强制启用多色：找一个 rng 首值 < mixChance 的 seed
  let specOn = null; let specOff = null
  for (let seed = 0; seed < 500 && (!specOn || !specOff); seed++) {
    const s = Cards.resolveCard(card, 0.6, Cards.mulberry32(seed))
    if (s.bands && !specOn) specOn = s
    if (!s.bands && !specOff) specOff = s
  }
  assert.ok(specOn && specOff, 'mixChance gates bands on/off across seeds')
  const sum = specOn.bands.reduce((s, b) => s + b.p, 0)
  assert.ok(Math.abs(sum - 1) < 1e-9, `bands p normalized (got ${sum})`)

  // 配比分布：gold 组（h≈38-52）占比 ≈ 0.65
  const rng = Cards.mulberry32(7)
  let gold = 0; const N = 4000
  for (let i = 0; i < N; i++) {
    const [h] = Cards.pickColor(specOn, rng, i, N, 0)
    if (h >= 35 && h <= 55) gold++
  }
  const ratio = gold / N
  assert.ok(Math.abs(ratio - 0.65) < 0.06, `gold ratio ${ratio} ≈ 0.65`)
})

test('宿主配置校验：坏输入回退默认', () => {
  const cfg = Host.__internals.normalizeConfig({ enabled: 'yes', intensity: 99, categories: { turn: false, bogus: 1 } })
  assert.equal(cfg.enabled, true)
  assert.equal(cfg.intensity, 2.5)
  assert.equal(cfg.categories.turn, false)
  assert.equal(cfg.categories.fail, true)
  assert.equal(Host.__internals.normalizeConfig(null).enabled, true)
})

test('宿主配置校验：region 枚举', () => {
  assert.equal(Host.__internals.normalizeConfig({ region: 'right' }).region, 'right')
  assert.equal(Host.__internals.normalizeConfig({ region: 'bottom-left' }).region, 'bottom-left')
  assert.equal(Host.__internals.normalizeConfig({ region: 'bogus' }).region, 'fullscreen')
  assert.equal(Host.__internals.normalizeConfig({}).region, 'fullscreen')
})
