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
      const { type, color, geom } = shape

      // Convert normalized coords to pixels.
      // x/y are relative to their respective axis; w/h are both relative to artW
      // so that equal w and h always produces a circle regardless of artboard aspect ratio.
      const px = geom.x * artW
      const py = geom.y * artH
      const pw = geom.w * artW
      const ph = geom.h * artW
      const left = px - pw / 2
      const top  = py - ph / 2

      ctx.globalAlpha = color.opacity

      if (type === 'rect') {
        ctx.fillStyle = color.hex
        ctx.fillRect(left, top, pw, ph)
      } else if (type === 'ellipse') {
        ctx.fillStyle = color.hex
        ctx.beginPath()
        ctx.ellipse(px, py, pw / 2, ph / 2, 0, 0, Math.PI * 2)
        ctx.fill()
      } else if (type === 'line' || type === 'curve') {
        const p = shape.pts!
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
      } else if (type === 'triangle') {
        const p = shape.pts!
        ctx.fillStyle = color.hex
        ctx.beginPath()
        ctx.moveTo(p[0] * artW, p[1] * artH)
        ctx.lineTo(p[2] * artW, p[3] * artH)
        ctx.lineTo(p[4] * artW, p[5] * artH)
        ctx.closePath()
        ctx.fill()
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
