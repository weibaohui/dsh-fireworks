'use strict'

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
if (typeof module !== 'undefined' && module.exports) module.exports = FireworkRendererCanvas2D
