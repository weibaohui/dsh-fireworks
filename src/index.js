'use strict'

/**
 * dsh-fireworks — Host half
 *
 * 把 agent 的工作节奏翻译成烟花节目单：
 *
 *   session/created   → session   开场迎宾（顶层会话，子 agent 不重复放）
 *   turn/end          → turn      回合礼花；token 用量（本回合累计
 *                                 assistant/message 的 output + 0.2×input）
 *                                 经 log 曲线映射成 magnitude（0..1），
 *                                 决定烟花的大小、高度与绚烂程度
 *   tool/result ok    → tool      工具星花；1.4s 窗口内合批，一次 N 连放
 *   tool/result error → fail      哑炮（2s 合批，每次最多 2 发，克制）
 *   累计 output 跨档  → milestone 里程碑（2k/8k/20k/50k/120k/300k）
 *   todo/write 全完成 → finale    收工终场（每会话 5 分钟冷却）
 *
 * 庆祝事件经 SSE（GET /dsh-fireworks/api/stream）广播给所有客户端浮层；
 * 客户端按类别从属性卡组里加权随机抽变种播放。配置存 storageDomain
 * （域 dsh_fireworks），经 GET/POST /dsh-fireworks/api/config 读写。
 *
 * 路由信任栅栏沿用 dsh-flow 同款：connection.requestRejection 的
 * Host/Origin 检查 + 浏览器认证。零 npm 运行时依赖。
 */

/** 里程碑档位（会话累计 output tokens）。 */
const MILESTONE_TIERS = [2000, 8000, 20000, 50000, 120000, 300000]

// 共享事件推送枢纽（@weibaohui/dsh-plugin-kit ≥0.4）：库缺席（未安装）时为
// undefined，广播回退自有 SSE 通道——独立安装不受影响。
let ensureHostHub
try { ({ ensureHostHub } = require('@weibaohui/dsh-plugin-kit')) } catch { /* 库缺席 */ }

/** turn 礼花的「满规模」token 参考值（magnitudeOf 的 ref）。 */
const TURN_TOKEN_REF = 40000

/** 工具星花合批窗口 ms；单批上限（对应「一类事件 N 次抽 N 个变种」）。 */
const TOOL_BATCH_MS = 1400
const TOOL_BATCH_MAX = 6

/** 哑炮合批窗口与上限（失败不该太吵闹）。 */
const FAIL_BATCH_MS = 2000
const FAIL_BATCH_MAX = 2

/** finale 每会话冷却 ms。 */
const FINALE_COOLDOWN_MS = 5 * 60 * 1000

/** 全局限流：令牌桶，5s 补满 10 枚，防止子 agent 风暴把屏幕放成白昼。 */
const THROTTLE_CAPACITY = 10
const THROTTLE_REFILL_MS = 5000

const DEFAULT_CONFIG = {
  enabled: true,
  intensity: 1,          // 0.3..2.5 全局强度（粒子数/尺寸缩放）
  region: 'bottom-right',  // 显示范围：fullscreen | left | right | bottom-left | bottom-right
  ignoreReducedMotion: false,  // true 时无视系统「减弱动态效果」偏好照常播放
  categories: {
    session: true,
    turn: true,
    tool: true,
    milestone: true,
    finale: true,
    fail: true,
  },
}

/** 显示范围合法值（客户端 REGION_CSS 同名键）。 */
const REGIONS = ['fullscreen', 'left', 'right', 'bottom-left', 'bottom-right']

const CONFIG_KEY = 'config'
const MAX_BODY_BYTES = 16 * 1024

/** magnitude：token 数 → 0..1（log2 曲线，与客户端 cards.js 同式）。 */
function magnitudeOf(tokens, ref) {
  const R = ref > 0 ? ref : TURN_TOKEN_REF
  const t = Math.max(0, tokens || 0)
  return Math.min(1, Math.log2(1 + t) / Math.log2(1 + R))
}

/** 读取 usage 对象中的正整数字段。 */
function usageNum(usage, key) {
  const v = usage && typeof usage === 'object' ? usage[key] : 0
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/** 配置校验：宽松合并，坏字段回退默认值。 */
function normalizeConfig(raw) {
  const out = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  if (!raw || typeof raw !== 'object') return out
  if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled
  if (typeof raw.intensity === 'number' && Number.isFinite(raw.intensity)) {
    out.intensity = Math.min(2.5, Math.max(0.3, raw.intensity))
  }
  if (typeof raw.region === 'string' && REGIONS.includes(raw.region)) {
    out.region = raw.region
  }
  if (typeof raw.ignoreReducedMotion === 'boolean') out.ignoreReducedMotion = raw.ignoreReducedMotion
  if (raw.categories && typeof raw.categories === 'object') {
    for (const k of Object.keys(out.categories)) {
      if (typeof raw.categories[k] === 'boolean') out.categories[k] = raw.categories[k]
    }
  }
  return out
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

module.exports = {
  name: 'dsh-fireworks',
  inject: ['webServer', 'connection', 'storageDomain'],

  // 供离线测试断言；Cordis 忽略多余导出属性。
  __internals: { magnitudeOf, normalizeConfig, MILESTONE_TIERS, TURN_TOKEN_REF },

  apply(ctx) {
    // ── 配置持久化 ───────────────────────────────────────────────────────
    const domainPromise = ctx.storageDomain.open({
      name: 'dsh_fireworks',
      version: 1,
      // 坏记录挪备份视为缺失，不让整个域打不开
      invalidRecords: 'backup-and-skip',
      // valueSchema 是 open 时逐条 parse 存量记录的契约：缺了它，表里一旦
      // 有记录整个域就打不开（open 失败 → configTable 永远 null → 保存只
      // 落内存）。形状归一由本文件 normalizeConfig 负责，这里只做透传。
      tables: { config: { valueSchema: { parse: (v) => v } } },
    })
    let configTable = null
    let config = DEFAULT_CONFIG
    domainPromise.then((domain) => {
      configTable = domain.table('config')
      const stored = configTable.get(CONFIG_KEY)
      if (stored && typeof stored === 'object') config = normalizeConfig(stored)
    }).catch(() => { /* 存储不可用时用内存默认配置 */ })
    ctx.effect(() => () => {
      domainPromise.then((domain) => domain.close()).catch(() => {})
    }, 'dsh-fireworks: storage close')

    // ── SSE 订阅集 ───────────────────────────────────────────────────────
    const subscribers = new Set()
    let seq = 0

    const broadcast = (payload) => {
      // 共享事件枢纽（dsh-plugin-kit ≥0.4）在就优先发布——全页面只占一条
      // SSE；库缺席（未安装）时回退自有 SSE 通道，独立安装不受影响
      try {
        const hub = ensureHostHub && ensureHostHub(ctx, { webServer: ctx.webServer, connection: ctx.connection })
        if (hub && typeof hub.publish === 'function') hub.publish('dsh-fireworks', payload)
      } catch { /* 枢纽缺席/出错不拖垮庆祝逻辑 */ }
      if (subscribers.size === 0) return
      seq += 1
      const frame = `id: ${seq}\ndata: ${JSON.stringify(Object.assign({ seq }, payload))}\n\n`
      for (const res of subscribers) {
        try { res.write(frame) } catch { subscribers.delete(res) }
      }
    }

    // ── 全局限流（令牌桶）────────────────────────────────────────────────
    let tokens = THROTTLE_CAPACITY
    let lastRefill = Date.now()
    const allow = () => {
      const now = Date.now()
      tokens = Math.min(THROTTLE_CAPACITY, tokens + (now - lastRefill) / THROTTLE_REFILL_MS * THROTTLE_CAPACITY)
      lastRefill = now
      if (tokens < 1) return false
      tokens -= 1
      return true
    }

    /** 庆祝事件入口：类别开关 + 限流 + 广播。 */
    const celebrate = (category, payload) => {
      if (!config.enabled) return
      if (config.categories && config.categories[category] === false) return
      if (!allow()) return
      broadcast(Object.assign({ category, at: Date.now() }, payload))
    }

    // ── 会话状态与事件分类 ───────────────────────────────────────────────
    /** sessionId → { turnTokens, totalOutput, tier, okPending, okTimer, failPending, failTimer, finaleAt } */
    const sessionState = new Map()
    const stateOf = (id) => {
      let st = sessionState.get(id)
      if (!st) {
        st = { turnTokens: 0, totalOutput: 0, tier: 0, okPending: 0, okTimer: null, failPending: 0, failTimer: null, finaleAt: 0 }
        sessionState.set(id, st)
      }
      return st
    }

    const flushToolBatch = (id, st) => {
      if (st.okTimer) { clearTimeout(st.okTimer); st.okTimer = null }
      if (st.okPending > 0) {
        // 「一类事件 N 次 → 客户端从该类别卡池随机抽 N 个变种」
        celebrate('tool', { count: Math.min(TOOL_BATCH_MAX, st.okPending), sessionId: id })
        st.okPending = 0
      }
    }
    const flushFailBatch = (id, st) => {
      if (st.failTimer) { clearTimeout(st.failTimer); st.failTimer = null }
      if (st.failPending > 0) {
        celebrate('fail', { count: Math.min(FAIL_BATCH_MAX, st.failPending), sessionId: id })
        st.failPending = 0
      }
    }

    const onSessionEvent = (session, event) => {
      try {
        if (!session || typeof session.id !== 'string') return
        if (!event || typeof event !== 'object') return
        const id = session.id
        const data = event.data && typeof event.data === 'object' ? event.data : {}
        const st = stateOf(id)

        switch (event.type) {
          case 'assistant/message': {
            const usage = data.usage
            if (usage && typeof usage === 'object') {
              const out = usageNum(usage, 'outputTokens')
              const inp = usageNum(usage, 'inputTokens')
              const cr = usageNum(usage, 'cacheReadTokens')
              const cw = usageNum(usage, 'cacheWriteTokens')
              st.turnTokens += out + 0.2 * (inp + cr + cw)
              st.totalOutput += out
              // 里程碑：累计 output 跨档
              if (st.tier < MILESTONE_TIERS.length && st.totalOutput >= MILESTONE_TIERS[st.tier]) {
                st.tier += 1
                celebrate('milestone', {
                  tier: st.tier,
                  tokens: st.totalOutput,
                  magnitude: Math.min(1, 0.45 + st.tier * 0.11),
                  sessionId: id,
                })
              }
            }
            break
          }

          case 'turn/end': {
            const t = Math.round(st.turnTokens)
            st.turnTokens = 0
            if (t > 0) {
              celebrate('turn', { tokens: t, magnitude: magnitudeOf(t, TURN_TOKEN_REF), sessionId: id })
            }
            break
          }

          case 'tool/result': {
            const message = data.message && typeof data.message === 'object' ? data.message : {}
            if (message.isError === true) {
              st.failPending += 1
              if (!st.failTimer) st.failTimer = setTimeout(() => flushFailBatch(id, st), FAIL_BATCH_MS)
            } else {
              st.okPending += 1
              if (!st.okTimer) st.okTimer = setTimeout(() => flushToolBatch(id, st), TOOL_BATCH_MS)
              if (st.okPending >= TOOL_BATCH_MAX) flushToolBatch(id, st)
            }
            break
          }

          case 'todo/write': {
            const todos = Array.isArray(data.todos) ? data.todos : []
            const done = todos.filter((item) => item && item.status === 'completed').length
            const now = Date.now()
            if (todos.length >= 2 && done === todos.length && now - st.finaleAt > FINALE_COOLDOWN_MS) {
              st.finaleAt = now
              celebrate('finale', { count: 3, magnitude: 0.85, sessionId: id })
            }
            break
          }

          default:
            break
        }
      } catch { /* 庆祝逻辑绝不能把宿主带崩 */ }
    }

    ctx.effect(() => {
      const disposeEvent = ctx.on('session/event', onSessionEvent)
      const disposeCreated = ctx.on('session/created', (session) => {
        try {
          // 只给顶层线程放迎宾花；子 agent（带 parentSession）归并到父线程
          const header = session && session.header
          if (header && typeof header.parentSession === 'string' && header.parentSession !== '') return
          celebrate('session', { magnitude: 0.5, sessionId: session && session.id })
        } catch { /* ignore */ }
      })
      return () => {
        try { disposeEvent() } catch {}
        try { disposeCreated() } catch {}
        for (const st of sessionState.values()) {
          if (st.okTimer) clearTimeout(st.okTimer)
          if (st.failTimer) clearTimeout(st.failTimer)
        }
        sessionState.clear()
      }
    }, 'dsh-fireworks: session event classification')

    // ── HTTP / SSE 路由 ──────────────────────────────────────────────────
    ctx.effect(() => {
      const disposeRoute = ctx.webServer.register({
        kind: 'prefix',
        path: '/dsh-fireworks/api',
        handler: async (req, res) => {
          const rejection = ctx.connection.requestRejection(req)
          if (rejection !== undefined) {
            res.writeHead(rejection)
            res.end()
            return
          }
          try {
            const url = new URL(req.url || '/', 'http://dsh.local')
            const apiPath = url.pathname.replace(/\/+$/, '')
            const sendJson = (status, payload) => {
              res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify(payload))
            }

            // GET /dsh-fireworks/api/stream → SSE 庆祝事件直播（全局，不按会话分）
            if (req.method === 'GET' && apiPath.endsWith('/dsh-fireworks/api/stream')) {
              res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no',
              })
              res.write('retry: 3000\n\n')
              subscribers.add(res)
              const heartbeat = setInterval(() => { try { res.write(': ping\n\n') } catch {} }, 25000)
              req.on('close', () => {
                clearInterval(heartbeat)
                subscribers.delete(res)
              })
              return
            }

            // GET /dsh-fireworks/api/config → 当前配置
            if (req.method === 'GET' && apiPath.endsWith('/dsh-fireworks/api/config')) {
              sendJson(200, config)
              return
            }

            // POST /dsh-fireworks/api/config → 保存配置
            if (req.method === 'POST' && apiPath.endsWith('/dsh-fireworks/api/config')) {
              const body = await readBody(req, MAX_BODY_BYTES)
              let parsed
              try { parsed = JSON.parse(body) } catch { sendJson(400, { error: 'bad json' }); return }
              config = normalizeConfig(parsed)
              // 先等存储域就绪再落盘：启动瞬间的保存不能因 configTable 未
              // 就位而漏写；存储不可用时 domainPromise 拒绝 → 降级内存
              try { await domainPromise; if (configTable) await configTable.put(CONFIG_KEY, config) } catch { /* 降级内存 */ }
              sendJson(200, config)
              return
            }

            // POST /dsh-fireworks/api/test { category?, magnitude? } → 试放一枚
            if (req.method === 'POST' && apiPath.endsWith('/dsh-fireworks/api/test')) {
              const body = await readBody(req, MAX_BODY_BYTES)
              let parsed = {}
              try { parsed = JSON.parse(body || '{}') } catch { /* 空体允许 */ }
              const category = typeof parsed.category === 'string' && parsed.category in DEFAULT_CONFIG.categories
                ? parsed.category : 'turn'
              const magnitude = typeof parsed.magnitude === 'number'
                ? Math.min(1, Math.max(0, parsed.magnitude)) : 0.65
              broadcast({ category, magnitude, tokens: 0, test: true, at: Date.now() })
              sendJson(200, { ok: true, category, magnitude })
              return
            }

            sendJson(404, { error: `no route for ${req.method} ${apiPath}` })
          } catch (e) {
            try {
              res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ error: (e && e.message) || 'internal error' }))
            } catch { /* res 可能已部分写出 */ }
          }
        },
      })
      return () => {
        try { if (typeof disposeRoute === 'function') disposeRoute() } catch {}
        for (const res of subscribers) { try { res.end() } catch {} }
        subscribers.clear()
      }
    }, 'dsh-fireworks: api')
  },
}
