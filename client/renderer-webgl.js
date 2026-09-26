'use strict'

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

/** 衰减拷贝：out = tex × fade（RGBA 整体乘，预乘 alpha 下颜色与透明度同步衰减）。 */
const FRAG_FADE = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_fade;
out vec4 outColor;
void main() { outColor = texture(u_tex, v_uv) * u_fade; }`

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
if (typeof module !== 'undefined' && module.exports) module.exports = FireworkRendererWebGL
