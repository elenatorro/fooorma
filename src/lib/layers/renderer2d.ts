import type { Gradient, Layer, ShapeEffect, ShapeTransform } from './types'

// ── Gradient helpers ──────────────────────────────────────────────────────────

function hexToRgba(hex: string, opacity: number): string {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

function makeGradient(
  ctx: CanvasRenderingContext2D,
  gradient: Gradient,
  left: number, top: number, pw: number, ph: number,
): CanvasGradient {
  let cg: CanvasGradient
  if (gradient.type === 'linear') {
    const rad = gradient.angle * Math.PI / 180
    const cx = left + pw / 2
    const cy = top  + ph / 2
    const len = Math.abs(pw * Math.sin(rad)) + Math.abs(ph * Math.cos(rad))
    const x0 = cx - (len / 2) * Math.sin(rad)
    const y0 = cy - (len / 2) * Math.cos(rad)
    const x1 = cx + (len / 2) * Math.sin(rad)
    const y1 = cy + (len / 2) * Math.cos(rad)
    cg = ctx.createLinearGradient(x0, y0, x1, y1)
  } else {
    const ocx = left + gradient.cx * pw
    const ocy = top  + gradient.cy * ph
    cg = ctx.createRadialGradient(ocx, ocy, 0, ocx, ocy, Math.max(pw, ph) / 2)
  }
  for (const stop of gradient.stops) {
    cg.addColorStop(Math.max(0, Math.min(1, stop.pos)), hexToRgba(stop.hex, stop.opacity))
  }
  return cg
}

export function applyTransform(ctx: CanvasRenderingContext2D, t: ShapeTransform, cx: number, cy: number) {
  ctx.translate(cx, cy)
  if (t.skewX || t.skewY) {
    ctx.transform(1, Math.tan((t.skewY ?? 0) * Math.PI / 180),
                     Math.tan((t.skewX ?? 0) * Math.PI / 180), 1, 0, 0)
  }
  if (t.rotate) ctx.rotate(t.rotate * Math.PI / 180)
  if (t.scaleX !== undefined || t.scaleY !== undefined) ctx.scale(t.scaleX ?? 1, t.scaleY ?? 1)
  ctx.translate(-cx, -cy)
}

/** Returns [left, top, pw, ph] bounding box of pts (normalized coords). */
function ptsBBox(pts: number[], artW: number, artH: number): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    const px = pts[i] * artW, py = pts[i + 1] * artH
    if (px < minX) minX = px; if (px > maxX) maxX = px
    if (py < minY) minY = py; if (py > maxY) maxY = py
  }
  return [minX, minY, maxX - minX, maxY - minY]
}

// ── Shape effects ─────────────────────────────────────────────────────────────

function applyBevel(
  ctx: CanvasRenderingContext2D,
  buildPath: () => void,
  bx: number, by: number, bw: number, bh: number,
  opacity: number,
): void {
  ctx.save()
  buildPath()
  ctx.clip()
  ctx.globalAlpha = 1

  // Highlight from top-left
  const hl = ctx.createLinearGradient(bx, by, bx + bw * 0.7, by + bh * 0.7)
  hl.addColorStop(0, `rgba(255,255,255,${opacity * 0.7})`)
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hl
  ctx.fillRect(bx, by, bw, bh)

  // Shadow from bottom-right
  const sh = ctx.createLinearGradient(bx + bw, by + bh, bx + bw * 0.3, by + bh * 0.3)
  sh.addColorStop(0, `rgba(0,0,0,${opacity * 0.5})`)
  sh.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sh
  ctx.fillRect(bx, by, bw, bh)

  ctx.restore()
}

let _noiseCanvas: HTMLCanvasElement | null = null
function getNoiseCanvas(): HTMLCanvasElement {
  if (_noiseCanvas) return _noiseCanvas
  _noiseCanvas = document.createElement('canvas')
  _noiseCanvas.width = _noiseCanvas.height = 128
  const nc = _noiseCanvas.getContext('2d')!
  const img = nc.createImageData(128, 128)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255 | 0
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  nc.putImageData(img, 0, 0)
  return _noiseCanvas
}

function applyNoise(
  ctx: CanvasRenderingContext2D,
  buildPath: () => void,
  amount: number,
): void {
  const pat = ctx.createPattern(getNoiseCanvas(), 'repeat')
  if (!pat) return
  ctx.save()
  buildPath()
  ctx.clip()
  ctx.globalAlpha = amount * 0.5
  ctx.globalCompositeOperation = 'overlay'
  ctx.fillStyle = pat
  ctx.fillRect(-99999, -99999, 199998, 199998)
  ctx.restore()
}

// applyWarp operates on physical pixels of dc (which has the same transform as the main ctx).
// bx/by/bw/bh are in artboard pixels; pixelScale converts to physical pixels.
// freq is in cycles per artboard pixel — zoom-independent visual frequency.
function applyWarp(
  ctx: CanvasRenderingContext2D,
  bx: number, by: number, bw: number, bh: number,
  amount: number, freq: number,
  pixelScale: number,
): void {
  const pAmount = amount * pixelScale
  const pad = Math.ceil(pAmount)
  const rx = Math.max(0, Math.floor(bx * pixelScale) - pad)
  const ry = Math.max(0, Math.floor(by * pixelScale) - pad)
  const rw = Math.min(Math.ceil(bw * pixelScale) + pad * 2, ctx.canvas.width  - rx)
  const rh = Math.min(Math.ceil(bh * pixelScale) + pad * 2, ctx.canvas.height - ry)
  if (rw <= 0 || rh <= 0) return
  const src = ctx.getImageData(rx, ry, rw, rh)
  const dst = new ImageData(rw, rh)
  const TAU = Math.PI * 2
  for (let y = 0; y < rh; y++) {
    // Divide by pixelScale → artboard-space coords for sin → zoom-independent frequency
    const dx = Math.round(pAmount * Math.sin((ry + y) / pixelScale * freq * TAU))
    for (let x = 0; x < rw; x++) {
      const dy = Math.round(pAmount * Math.sin((rx + x) / pixelScale * freq * TAU))
      const sx = Math.max(0, Math.min(rw - 1, x + dx))
      const sy = Math.max(0, Math.min(rh - 1, y + dy))
      const si = (sy * rw + sx) * 4
      const di = (y  * rw + x ) * 4
      dst.data[di]   = src.data[si]
      dst.data[di+1] = src.data[si+1]
      dst.data[di+2] = src.data[si+2]
      dst.data[di+3] = src.data[si+3]
    }
  }
  ctx.putImageData(dst, rx, ry)
}

// Offscreen canvas at physical resolution, matching main ctx transform for warp isolation.
let _warpCanvas: HTMLCanvasElement | null = null
let _warpCtx: CanvasRenderingContext2D | null = null

function getWarpCtx(physW: number, physH: number): CanvasRenderingContext2D {
  if (!_warpCanvas) {
    _warpCanvas = document.createElement('canvas')
    _warpCtx    = _warpCanvas.getContext('2d')!
  }
  if (_warpCanvas.width !== physW || _warpCanvas.height !== physH) {
    _warpCanvas.width  = physW
    _warpCanvas.height = physH
  }
  return _warpCtx!
}

// ── Group renderer ────────────────────────────────────────────────────────────
// Flattens group effects into each child shape and renders directly.
// This avoids offscreen canvas issues and works for all effect types.
// Warp is applied per-shape (not as a true composite warp).

function flattenGroupShapes(children: import('./types').Shape[], groupEffects: import('./types').ShapeEffect[]): import('./types').Shape[] {
  if (groupEffects.length === 0) return children
  return children.map(child => {
    if (child.type === 'group' && child.children?.length) {
      // Nested group: merge effects downward
      return {
        ...child,
        effects: [...(child.effects ?? []), ...groupEffects],
      }
    }
    return {
      ...child,
      effects: [...(child.effects ?? []), ...groupEffects],
    }
  })
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderLayers2D(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  artW: number,
  artH: number,
  clear = true,
): void {
  const pixelScale = ctx.getTransform().a || 1
  const physW = ctx.canvas.width
  const physH = ctx.canvas.height
  if (clear) ctx.clearRect(0, 0, artW, artH)

  for (const layer of layers) {
    if (!layer.visible) continue

    if (layer.bgColor) {
      ctx.globalAlpha = 1
      ctx.fillStyle   = layer.bgColor
      ctx.fillRect(0, 0, artW, artH)
    }

    for (const shape of layer.shapes) {
      // ── Group: flatten effects into children and render directly ──
      if (shape.type === 'group' && shape.children?.length) {
        const groupEffects = shape.effects ?? []
        const flattened = flattenGroupShapes(shape.children, groupEffects)
        const tmpLayer: Layer = {
          id: '_group_tmp', name: '', visible: true, mode: 'manual',
          shapes: flattened, query: '',
        }
        renderLayers2D(ctx, [tmpLayer], artW, artH, false)
        continue
      }

      const { type, color, geom, stroke, effects } = shape

      const px   = geom.x * artW
      const py   = geom.y * artH
      const pw   = geom.w * artW
      const ph   = geom.h * artW
      const left = px - pw / 2
      const top  = py - ph / 2

      const shadowFx = effects?.find((e: ShapeEffect) => e.type === 'shadow')
      const blurFx   = effects?.find((e: ShapeEffect) => e.type === 'blur')
      const bevelFx  = effects?.find((e: ShapeEffect) => e.type === 'bevel')
      const noiseFx  = effects?.find((e: ShapeEffect) => e.type === 'noise')
      const warpFx   = effects?.find((e: ShapeEffect) => e.type === 'warp')

      // For warp: draw to an isolated offscreen canvas (physical resolution, same
      // transform as ctx) so warp only distorts the shape's own pixels, then composite.
      let dc: CanvasRenderingContext2D
      if (warpFx) {
        dc = getWarpCtx(physW, physH)
        dc.setTransform(1, 0, 0, 1, 0, 0)      // identity so clearRect covers full physical canvas
        dc.clearRect(0, 0, physW, physH)
        dc.setTransform(ctx.getTransform())     // match main ctx scale for shape drawing
      } else {
        dc = ctx
      }

      // Build a (re-usable) path for filled shapes — uses dc
      function buildShapePath() {
        dc.beginPath()
        if (type === 'rect') {
          dc.rect(left, top, pw, ph)
        } else if (type === 'ellipse') {
          dc.ellipse(px, py, pw / 2, ph / 2, 0, 0, Math.PI * 2)
        } else if (type === 'arc') {
          const p = shape.pts!
          const startRad = p[0] * Math.PI / 180
          const endRad   = p[1] * Math.PI / 180
          dc.moveTo(px, py)
          dc.arc(px, py, pw / 2, startRad, endRad)
          dc.closePath()
        } else if (type === 'triangle') {
          const p = shape.pts!
          dc.moveTo(p[0] * artW, p[1] * artH)
          dc.lineTo(p[2] * artW, p[3] * artH)
          dc.lineTo(p[4] * artW, p[5] * artH)
          dc.closePath()
        }
      }

      // One save wraps transform + effects for the whole shape
      dc.save()
      if (blurFx)   dc.filter = `blur(${blurFx.blur ?? 4}px)`
      if (shadowFx) {
        dc.shadowColor   = hexToRgba(shadowFx.color ?? '#000000', shadowFx.opacity ?? 0.5)
        dc.shadowBlur    = shadowFx.blur    ?? 10
        dc.shadowOffsetX = shadowFx.offsetX ?? 0
        dc.shadowOffsetY = shadowFx.offsetY ?? 4
      }

      if (type === 'line' || type === 'curve' || type === 'spline') {
        const p = shape.pts!
        const [bl, bt, bw, bh] = ptsBBox(p, artW, artH)
        if (shape.transform) {
          const midX = type === 'curve' ? (p[0] + p[4]) / 2 * artW : (p[0] + p[2]) / 2 * artW
          const midY = type === 'curve' ? (p[1] + p[5]) / 2 * artH : (p[1] + p[3]) / 2 * artH
          applyTransform(dc, shape.transform, midX, midY)
        }
        if (color.gradient) {
          dc.globalAlpha = 1
          dc.strokeStyle = makeGradient(dc, color.gradient, bl, bt, bw, bh)
        } else {
          dc.globalAlpha = color.opacity
          dc.strokeStyle = color.hex
        }
        dc.lineWidth = (shape.strokeWidth ?? 0.004) * artW
        dc.lineCap   = 'round'
        dc.lineJoin  = 'round'
        dc.beginPath()
        dc.moveTo(p[0] * artW, p[1] * artH)
        if (type === 'curve') {
          dc.quadraticCurveTo(p[2] * artW, p[3] * artH, p[4] * artW, p[5] * artH)
        } else if (type === 'spline') {
          // Catmull-Rom → cubic Bezier
          const n = p.length / 2  // number of points
          for (let i = 0; i < n - 1; i++) {
            const i0 = Math.max(0, i - 1) * 2
            const i1 = i * 2
            const i2 = (i + 1) * 2
            const i3 = Math.min(n - 1, i + 2) * 2
            const x0 = p[i0] * artW, y0 = p[i0+1] * artH
            const x1 = p[i1] * artW, y1 = p[i1+1] * artH
            const x2 = p[i2] * artW, y2 = p[i2+1] * artH
            const x3 = p[i3] * artW, y3 = p[i3+1] * artH
            const cp1x = x1 + (x2 - x0) / 6
            const cp1y = y1 + (y2 - y0) / 6
            const cp2x = x2 - (x3 - x1) / 6
            const cp2y = y2 - (y3 - y1) / 6
            dc.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2)
          }
        } else {
          dc.lineTo(p[2] * artW, p[3] * artH)
        }
        dc.stroke()
        dc.restore()
        continue
      }

      // For triangles, compute actual bounding box for gradient coverage
      const [gleft, gtop, gpw, gph] = type === 'triangle' && shape.pts
        ? ptsBBox(shape.pts, artW, artH)
        : [left, top, pw, ph]

      if (shape.transform) {
        let pivotX = px, pivotY = py
        if (type === 'triangle') {
          const p = shape.pts!
          pivotX = (p[0] + p[2] + p[4]) / 3 * artW
          pivotY = (p[1] + p[3] + p[5]) / 3 * artH
        }
        applyTransform(dc, shape.transform, pivotX, pivotY)
      }

      // Fill
      if (color.gradient) {
        dc.globalAlpha = 1
        dc.fillStyle   = makeGradient(dc, color.gradient, gleft, gtop, gpw, gph)
      } else {
        dc.globalAlpha = color.opacity
        dc.fillStyle   = color.hex
      }
      buildShapePath()
      dc.fill()

      // Stroke
      if (stroke) {
        const lw    = stroke.width * artW
        const align = stroke.align ?? 'center'
        if (stroke.gradient) {
          dc.strokeStyle = makeGradient(dc, stroke.gradient, gleft, gtop, gpw, gph)
        } else {
          dc.strokeStyle = stroke.hex
        }
        dc.lineJoin = stroke.join ?? 'miter'

        if (align === 'center') {
          dc.globalAlpha = stroke.gradient ? 1 : stroke.opacity
          dc.lineWidth   = lw
          buildShapePath()
          dc.stroke()
        } else if (align === 'inner') {
          dc.save()
          buildShapePath()
          dc.clip()
          dc.globalAlpha = stroke.gradient ? 1 : stroke.opacity
          dc.lineWidth   = lw * 2
          buildShapePath()
          dc.stroke()
          dc.restore()
        } else { // outer
          dc.save()
          dc.beginPath()
          dc.rect(-1, -1, artW + 2, artH + 2)
          if (type === 'rect') {
            dc.rect(left, top, pw, ph)
          } else if (type === 'ellipse') {
            dc.ellipse(px, py, pw / 2, ph / 2, 0, 0, Math.PI * 2)
          } else if (type === 'arc') {
            const p = shape.pts!
            dc.moveTo(px, py)
            dc.arc(px, py, pw / 2, p[0] * Math.PI / 180, p[1] * Math.PI / 180)
            dc.closePath()
          } else if (type === 'triangle') {
            const p = shape.pts!
            dc.moveTo(p[0] * artW, p[1] * artH)
            dc.lineTo(p[2] * artW, p[3] * artH)
            dc.lineTo(p[4] * artW, p[5] * artH)
            dc.closePath()
          }
          dc.clip('evenodd')
          dc.globalAlpha = stroke.gradient ? 1 : stroke.opacity
          dc.lineWidth   = lw * 2
          buildShapePath()
          dc.stroke()
          dc.restore()
        }
      }

      // Clear shadow/blur before post-draw effects so they don't stack
      dc.shadowColor = 'transparent'
      dc.filter      = 'none'

      if (bevelFx) applyBevel(dc, buildShapePath, gleft, gtop, gpw, gph, bevelFx.opacity ?? 0.6)
      if (noiseFx) applyNoise(dc, buildShapePath, noiseFx.amount ?? 0.3)

      if (warpFx) {
        // Compute rotation-aware bounding box
        let [wl, wt, ww, wh] = [gleft, gtop, gpw, gph] as [number, number, number, number]
        const rot = shape.transform?.rotate
        if (rot) {
          const θ = rot * Math.PI / 180
          if (type === 'triangle' && shape.pts) {
            const pcx = (shape.pts[0] + shape.pts[2] + shape.pts[4]) / 3 * artW
            const pcy = (shape.pts[1] + shape.pts[3] + shape.pts[5]) / 3 * artH
            const rpts: number[] = []
            for (let i = 0; i < shape.pts.length; i += 2) {
              const dx = shape.pts[i] * artW - pcx, dy = shape.pts[i + 1] * artH - pcy
              rpts.push((pcx + dx * Math.cos(θ) - dy * Math.sin(θ)) / artW,
                        (pcy + dx * Math.sin(θ) + dy * Math.cos(θ)) / artH)
            }
            ;[wl, wt, ww, wh] = ptsBBox(rpts, artW, artH)
          } else {
            const rw = Math.abs(gpw * Math.cos(θ)) + Math.abs(gph * Math.sin(θ))
            const rh = Math.abs(gpw * Math.sin(θ)) + Math.abs(gph * Math.cos(θ))
            ;[wl, wt, ww, wh] = [px - rw / 2, py - rh / 2, rw, rh]
          }
        }
        dc.restore()
        applyWarp(dc, wl, wt, ww, wh, warpFx.amount ?? 8, warpFx.freq ?? 0.05, pixelScale)
        // Composite at 1:1 physical pixels (no zoom scaling applied to the drawImage)
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(_warpCanvas!, 0, 0)
        ctx.restore()
        continue
      }

      dc.restore()
    }
  }

  ctx.globalAlpha = 1
}

export function clientToNorm(
  clientX: number,
  clientY: number,
  artboardRect: DOMRect,
  artW: number,
  artH: number,
): { nx: number; ny: number } {
  const nx = (clientX - artboardRect.left) / artboardRect.width
  const ny = (clientY - artboardRect.top)  / artboardRect.height
  return { nx, ny }
}
