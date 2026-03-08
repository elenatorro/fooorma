import type { Layer } from './types'

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
        ctx.globalAlpha = color.opacity
        ctx.strokeStyle = color.hex
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
        continue
      }

      // Fill
      ctx.globalAlpha = color.opacity
      ctx.fillStyle   = color.hex
      buildShapePath()
      ctx.fill()

      // Stroke
      if (stroke) {
        const lw    = stroke.width * artW
        const align = stroke.align ?? 'center'
        ctx.strokeStyle = stroke.hex
        ctx.lineJoin    = stroke.join ?? 'miter'

        if (align === 'center') {
          ctx.globalAlpha = stroke.opacity
          ctx.lineWidth   = lw
          buildShapePath()
          ctx.stroke()
        } else if (align === 'inner') {
          ctx.save()
          buildShapePath()
          ctx.clip()
          ctx.globalAlpha = stroke.opacity
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
          ctx.globalAlpha = stroke.opacity
          ctx.lineWidth   = lw * 2
          buildShapePath()
          ctx.stroke()
          ctx.restore()
        }
      }
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
