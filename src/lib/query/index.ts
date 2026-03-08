import type { Shape, ShapeType } from '../layers/types'

/** Serialize manual shapes to equivalent query code. */
export function shapesToCode(shapes: Shape[]): string {
  if (shapes.length === 0) return ''
  const f = (n: number) => parseFloat(n.toFixed(4))
  return shapes.map(({ type, geom: { x, y, w, h }, color: { hex, opacity }, pts, strokeWidth }) => {
    if (pts) {
      const coords = pts.map(f).join(', ')
      const sw = strokeWidth !== undefined ? `, ${f(strokeWidth)}` : ''
      if (type === 'triangle') return `triangle(${coords}, '${hex}', ${f(opacity)})`
      return `${type}(${coords}, '${hex}', ${f(opacity)}${sw})`
    }
    return `${type}(${f(x)}, ${f(y)}, ${f(w)}, ${f(h)}, '${hex}', ${f(opacity)})`
  }).join('\n')
}

export interface QueryResult {
  shapes: Shape[]
  errors: string[]
}

const MAX_SHAPES = 5_000

export function evaluateQuery(code: string): QueryResult {
  const shapes: Shape[] = []
  const errors: string[] = []

  // ── Drawing primitives ────────────────────────────────────────────────────
  function makeShape(
    type: ShapeType,
    x: number, y: number, w: number, h: number,
    color = '#8b5cf6',
    opacity = 0.85,
  ): void {
    if (shapes.length >= MAX_SHAPES) return
    shapes.push({
      id: crypto.randomUUID(),
      type,
      color: { hex: color, opacity: Math.max(0, Math.min(1, opacity)) },
      geom:  { x, y, w, h },
    })
  }

  const rect    = (x: number, y: number, w: number, h: number, color?: string, opacity?: number) => makeShape('rect',    x, y, w, h, color, opacity)
  const ellipse = (x: number, y: number, w: number, h: number, color?: string, opacity?: number) => makeShape('ellipse', x, y, w, h, color, opacity)

  function makePtsShape(
    type: ShapeType,
    pts: number[],
    color = '#8b5cf6',
    opacity = 0.85,
    strokeWidth?: number,
  ): void {
    if (shapes.length >= MAX_SHAPES) return
    shapes.push({
      id: crypto.randomUUID(),
      type,
      color: { hex: color, opacity: Math.max(0, Math.min(1, opacity)) },
      geom: { x: 0, y: 0, w: 0, h: 0 },
      pts,
      ...(strokeWidth !== undefined ? { strokeWidth } : {}),
    })
  }

  const line     = (x1: number, y1: number, x2: number, y2: number, color?: string, opacity?: number, strokeWidth?: number) =>
    makePtsShape('line', [x1, y1, x2, y2], color, opacity, strokeWidth)
  const curve    = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, color?: string, opacity?: number, strokeWidth?: number) =>
    makePtsShape('curve', [x1, y1, cx, cy, x2, y2], color, opacity, strokeWidth)
  const triangle = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color?: string, opacity?: number) =>
    makePtsShape('triangle', [x1, y1, x2, y2, x3, y3], color, opacity)

  // ── Loop helpers ──────────────────────────────────────────────────────────
  const repeat = (n: number, cb: (i: number, t: number) => void): void => {
    const count = Math.min(Math.floor(n), MAX_SHAPES)
    for (let i = 0; i < count; i++) {
      if (shapes.length >= MAX_SHAPES) break
      cb(i, count > 1 ? i / (count - 1) : 0)
    }
  }

  const grid = (cols: number, rows: number, cb: (c: number, r: number, ct: number, rt: number) => void): void => {
    const nc = Math.min(Math.floor(cols), 200)
    const nr = Math.min(Math.floor(rows), 200)
    for (let r = 0; r < nr; r++) {
      for (let c = 0; c < nc; c++) {
        if (shapes.length >= MAX_SHAPES) break
        cb(c, r, nc > 1 ? c / (nc - 1) : 0, nr > 1 ? r / (nr - 1) : 0)
      }
    }
  }

  // ── Math helpers ──────────────────────────────────────────────────────────
  const lerp       = (a: number, b: number, t: number) => a + (b - a) * t
  const clamp      = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const map        = (v: number, a: number, b: number, c: number, d: number) => c + ((v - a) / (b - a)) * (d - c)
  const fract      = (v: number) => v - Math.floor(v)
  const smoothstep = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t) }

  // ── Execute ───────────────────────────────────────────────────────────────
  try {
    new Function(
      'rect', 'ellipse', 'line', 'curve', 'triangle', 'repeat', 'grid',
      'PI', 'TAU', 'E',
      'sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'pow', 'min', 'max', 'random',
      'lerp', 'clamp', 'map', 'fract', 'smoothstep',
      `"use strict";\n${code}`,
    )(
      rect, ellipse, line, curve, triangle, repeat, grid,
      Math.PI, Math.PI * 2, Math.E,
      Math.sin, Math.cos, Math.tan, Math.abs, Math.floor, Math.ceil,
      Math.round, Math.sqrt, Math.pow, Math.min, Math.max, Math.random,
      lerp, clamp, map, fract, smoothstep,
    )
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  return { shapes, errors }
}
