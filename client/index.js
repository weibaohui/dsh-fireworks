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
    const hubOff = typeof PluginKit !== 'undefined' && typeof PluginKit.connectEvents === 'function'
      ? PluginKit.connectEvents('dsh-fireworks', (data) => {
        try { dispatchCelebration(overlay, data) } catch { /* 坏帧忽略 */ }
      }, (s) => { liveState = s })
      : null
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
