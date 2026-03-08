import type { Gradient, Layer, ShapeTransform } from './types'

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

function applyTransform(ctx: CanvasRenderingContext2D, t: ShapeTransform, cx: number, cy: number) {
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

export function renderLayers2D(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  artW: number,
  artH: number,
): void {
  ctx.clearRect(0, 0, artW, artH)

  for (const layer of layers) {
    if (!layer.visible) continue

    if (layer.bgColor) {
      ctx.globalAlpha = 1
      ctx.fillStyle   = layer.bgColor
      ctx.fillRect(0, 0, artW, artH)
    }

    for (const shape of layer.shapes) {
      const { type, color, geom, stroke } = shape

      const px   = geom.x * artW
      const py   = geom.y * artH
      const pw   = geom.w * artW
      const ph   = geom.h * artW
      const left = px - pw / 2
      const top  = py - ph / 2

      // Build a (re-usable) path for filled shapes
      function buildShapePath() {
        ctx.beginPath()
        if (type === 'rect') {
          ctx.rect(left, top, pw, ph)
        } else if (type === 'ellipse') {
          ctx.ellipse(px, py, pw / 2, ph / 2, 0, 0, Math.PI * 2)
        } else if (type === 'triangle') {
          const p = shape.pts!
          ctx.moveTo(p[0] * artW, p[1] * artH)
          ctx.lineTo(p[2] * artW, p[3] * artH)
          ctx.lineTo(p[4] * artW, p[5] * artH)
          ctx.closePath()
        }
      }

      if (type === 'line' || type === 'curve') {
        const p = shape.pts!
        const [bl, bt, bw, bh] = ptsBBox(p, artW, artH)
        if (shape.transform) {
          const midX = type === 'curve'
            ? (p[0] + p[4]) / 2 * artW
            : (p[0] + p[2]) / 2 * artW
          const midY = type === 'curve'
            ? (p[1] + p[5]) / 2 * artH
            : (p[1] + p[3]) / 2 * artH
          ctx.save()
          applyTransform(ctx, shape.transform, midX, midY)
        }
        if (color.gradient) {
          ctx.globalAlpha = 1
          ctx.strokeStyle = makeGradient(ctx, color.gradient, bl, bt, bw, bh)
        } else {
          ctx.globalAlpha = color.opacity
          ctx.strokeStyle = color.hex
        }
        ctx.lineWidth   = (shape.strokeWidth ?? 0.004) * artW
        ctx.lineCap     = 'round'
        ctx.beginPath()
        ctx.moveTo(p[0] * artW, p[1] * artH)
        if (type === 'curve') {
          ctx.quadraticCurveTo(p[2] * artW, p[3] * artH, p[4] * artW, p[5] * artH)
        } else {
          ctx.lineTo(p[2] * artW, p[3] * artH)
        }
        ctx.stroke()
        if (shape.transform) ctx.restore()
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
        ctx.save()
        applyTransform(ctx, shape.transform, pivotX, pivotY)
      }

      // Fill
      if (color.gradient) {
        ctx.globalAlpha = 1
        ctx.fillStyle   = makeGradient(ctx, color.gradient, gleft, gtop, gpw, gph)
      } else {
        ctx.globalAlpha = color.opacity
        ctx.fillStyle   = color.hex
      }
      buildShapePath()
      ctx.fill()

      // Stroke
      if (stroke) {
        const lw    = stroke.width * artW
        const align = stroke.align ?? 'center'
        if (stroke.gradient) {
          ctx.strokeStyle = makeGradient(ctx, stroke.gradient, gleft, gtop, gpw, gph)
        } else {
          ctx.strokeStyle = stroke.hex
        }
        ctx.lineJoin    = stroke.join ?? 'miter'

        if (align === 'center') {
          ctx.globalAlpha = stroke.gradient ? 1 : stroke.opacity
          ctx.lineWidth   = lw
          buildShapePath()
          ctx.stroke()
        } else if (align === 'inner') {
          ctx.save()
          buildShapePath()
          ctx.clip()
          ctx.globalAlpha = stroke.gradient ? 1 : stroke.opacity
          ctx.lineWidth   = lw * 2
          buildShapePath()
          ctx.stroke()
          ctx.restore()
        } else { // outer
          ctx.save()
          ctx.beginPath()
          ctx.rect(-1, -1, artW + 2, artH + 2)
          // add shape as sub-path; even-odd rule excludes the interior
          if (type === 'rect') {
            ctx.rect(left, top, pw, ph)
          } else if (type === 'ellipse') {
            ctx.ellipse(px, py, pw / 2, ph / 2, 0, 0, Math.PI * 2)
          } else if (type === 'triangle') {
            const p = shape.pts!
            ctx.moveTo(p[0] * artW, p[1] * artH)
            ctx.lineTo(p[2] * artW, p[3] * artH)
            ctx.lineTo(p[4] * artW, p[5] * artH)
            ctx.closePath()
          }
          ctx.clip('evenodd')
          ctx.globalAlpha = stroke.gradient ? 1 : stroke.opacity
          ctx.lineWidth   = lw * 2
          buildShapePath()
          ctx.stroke()
          ctx.restore()
        }
      }

      if (shape.transform) ctx.restore()
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
  const nx = Math.max(0, Math.min(1, (clientX - artboardRect.left) / artboardRect.width))
  const ny = Math.max(0, Math.min(1, (clientY - artboardRect.top)  / artboardRect.height))
  return { nx, ny }
}
