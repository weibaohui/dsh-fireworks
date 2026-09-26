'use strict'

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
if (typeof module !== 'undefined' && module.exports) module.exports = FireworkEngine
/* node-test-export-end */
