import type { ColorStop, Gradient, LinearGradient, RadialGradient, Shape, ShapeStroke, ShapeTransform, ShapeType } from '../layers/types'
import { paletteVarName } from '../palettes/index'

/** Serialize manual shapes to equivalent query code. */
export function shapesToCode(shapes: Shape[]): string {
  if (shapes.length === 0) return ''
  const f = (n: number) => parseFloat(n.toFixed(4))

  function stopStr(st: ColorStop): string {
    // Simple stop: opacity=1, position will be distributed evenly → just hex string
    return `['${st.hex}', ${f(st.opacity)}, ${f(st.pos)}]`
  }

  function gradStr(g: Gradient): string {
    const stopsAllSimple = g.stops.every(s => s.opacity === 1)
    const n = g.stops.length
    const evenlySpaced = g.stops.every((s, i) => Math.abs(s.pos - (n <= 1 ? 0 : i / (n - 1))) < 0.001)
    const stopArgs = (stopsAllSimple && evenlySpaced)
      ? g.stops.map(s => `'${s.hex}'`).join(', ')
      : g.stops.map(stopStr).join(', ')
    if (g.type === 'linear') return `grad(${f(g.angle)}, ${stopArgs})`
    return `radGrad(${stopArgs})`
  }

  function strokeStr(sk: ShapeStroke): string {
    const align = sk.align ?? 'center'
    const join  = sk.join  ?? 'miter'
    const colorArg = sk.gradient ? gradStr(sk.gradient) : `'${sk.hex}'`
    const opArg = sk.gradient ? '1' : String(f(sk.opacity))
    let s = `stroke(${colorArg}, ${opArg}, ${f(sk.width)}`
    if (join !== 'miter') {
      s += `, '${align}', '${join}'`
    } else if (align !== 'center') {
      s += `, '${align}'`
    }
    return s + ')'
  }

  function transformStr(t: ShapeTransform): string {
    const keys = (Object.keys(t) as (keyof ShapeTransform)[]).filter(k => t[k] !== undefined)
    if (keys.length === 1 && t.rotate !== undefined) return `rotate(${f(t.rotate)})`
    const parts: string[] = []
    if (t.rotate  !== undefined) parts.push(`rotate: ${f(t.rotate)}`)
    if (t.scaleX  !== undefined) parts.push(`scaleX: ${f(t.scaleX)}`)
    if (t.scaleY  !== undefined) parts.push(`scaleY: ${f(t.scaleY)}`)
    if (t.skewX   !== undefined) parts.push(`skewX: ${f(t.skewX)}`)
    if (t.skewY   !== undefined) parts.push(`skewY: ${f(t.skewY)}`)
    return `transform({ ${parts.join(', ')} })`
  }

  return shapes.map(({ type, geom: { x, y, w, h }, color, stroke, pts, strokeWidth, transform }) => {
    const { hex, opacity, gradient } = color
    const colorArg = gradient ? gradStr(gradient) : `'${hex}'`
    const opArg    = gradient ? '1' : String(f(opacity))
    const tr = transform ? `, ${transformStr(transform)}` : ''
    if (pts) {
      const coords = pts.map(f).join(', ')
      const sw = strokeWidth !== undefined ? `, ${f(strokeWidth)}` : ''
      const sk = stroke ? `, ${strokeStr(stroke)}` : ''
      if (type === 'triangle') return `triangle(${coords}, ${colorArg}, ${opArg}${sk}${tr})`
      return `${type}(${coords}, ${colorArg}, ${opArg}${sw}${tr})`
    }
    // rect / ellipse: no stroke → transform goes in stroke slot; stroke + transform → both appended
    const sk = stroke ? `, ${strokeStr(stroke)}` : ''
    return `${type}(${f(x)}, ${f(y)}, ${f(w)}, ${f(h)}, ${colorArg}, ${opArg}${sk}${tr})`
  }).join('\n')
}

export interface QueryResult {
  shapes: Shape[]
  errors: string[]
}

const MAX_SHAPES = 5_000

export function evaluateQuery(
  code: string,
  artW = 794,
  artH = 1123,
  palettes: { name: string; colors: string[] }[] = [],
): QueryResult {
  const shapes: Shape[] = []
  const errors: string[] = []

  // ── Gradient helpers (exposed in sandbox) ────────────────────────────────
  type StopInput = string | [string, number?, number?]

  function parseStops(args: StopInput[]): ColorStop[] {
    const n = args.length
    return args.map((a, i) => {
      if (typeof a === 'string') return { hex: a, opacity: 1, pos: n <= 1 ? 0 : i / (n - 1) }
      const [hex, opacity = 1, pos] = a
      return { hex, opacity, pos: pos ?? (n <= 1 ? 0 : i / (n - 1)) }
    })
  }

  const grad = (angle: number, ...args: StopInput[]): LinearGradient =>
    ({ type: 'linear', angle, stops: parseStops(args) })

  const radGrad = (...args: StopInput[]): RadialGradient =>
    ({ type: 'radial', cx: 0.5, cy: 0.5, stops: parseStops(args) })

  // ── Transform helpers ─────────────────────────────────────────────────────
  function isTransform(v: unknown): v is ShapeTransform {
    return typeof v === 'object' && v !== null && !Array.isArray(v) &&
      !('width' in v) && !('stops' in v) && !('hex' in v) &&
      ('rotate' in v || 'scaleX' in v || 'scaleY' in v || 'skewX' in v || 'skewY' in v)
  }

  const rotate    = (deg: number): ShapeTransform => ({ rotate: deg })
  const transform = (opts: ShapeTransform): ShapeTransform => ({ ...opts })

  // ── Stroke helper (exposed as `stroke()` in sandbox) ─────────────────────
  type ColorArg = string | Gradient
  type StrokeArg = ShapeStroke | ColorArg | undefined

  function mkStroke(
    colorArg: ColorArg = '#000000',
    opacity = 1,
    width   = 0.005,
    align: 'center' | 'inner' | 'outer' = 'center',
    join:  'miter'  | 'round' | 'bevel' = 'miter',
  ): ShapeStroke {
    if (typeof colorArg === 'string') {
      return { hex: colorArg, opacity: Math.max(0, Math.min(1, opacity)), width, align, join }
    }
    return { hex: colorArg.stops[0]?.hex ?? '#000000', opacity: 1, width, align, join, gradient: colorArg }
  }

  function resolveStroke(strokeArg: StrokeArg, legacyOpacity: number, legacyWidth?: number): ShapeStroke | undefined {
    if (strokeArg === undefined) return undefined
    if (typeof strokeArg === 'object' && 'width' in strokeArg) return strokeArg as ShapeStroke
    // backward-compat positional form or gradient
    if (legacyWidth !== undefined) return mkStroke(strokeArg as ColorArg, legacyOpacity, legacyWidth)
    return undefined
  }

  // ── Drawing primitives ────────────────────────────────────────────────────
  function makeShape(
    type: ShapeType,
    x: number, y: number, w: number, h: number,
    colorArg: ColorArg = '#8b5cf6',
    opacity  = 0.85,
    strokeArg?: StrokeArg | ShapeTransform,
    strokeOpacity = 1,
    strokeWidth?: number,
    transformArg?: ShapeTransform,
  ): void {
    if (shapes.length >= MAX_SHAPES) return
    const shapeColor = typeof colorArg === 'string'
      ? { hex: colorArg, opacity: Math.max(0, Math.min(1, opacity)) }
      : { hex: colorArg.stops[0]?.hex ?? '#000000', opacity: 1, gradient: colorArg }
    const shape: Shape = {
      id:    crypto.randomUUID(),
      type,
      color: shapeColor,
      geom:  { x, y, w, h },
    }
    const actualTransform = isTransform(strokeArg) ? strokeArg : transformArg
    const resolvedStroke  = isTransform(strokeArg) ? undefined : resolveStroke(strokeArg as StrokeArg, strokeOpacity, strokeWidth)
    if (resolvedStroke) shape.stroke = resolvedStroke
    if (actualTransform) shape.transform = actualTransform
    shapes.push(shape)
  }

  const rect    = (x: number, y: number, w: number, h: number, colorArg?: ColorArg, opacity?: number, strokeArg?: StrokeArg | ShapeTransform, strokeOpacity?: number, strokeWidth?: number, transformArg?: ShapeTransform) =>
    makeShape('rect',    x, y, w, h, colorArg, opacity, strokeArg, strokeOpacity, strokeWidth, transformArg)
  const ellipse = (x: number, y: number, w: number, h: number, colorArg?: ColorArg, opacity?: number, strokeArg?: StrokeArg | ShapeTransform, strokeOpacity?: number, strokeWidth?: number, transformArg?: ShapeTransform) =>
    makeShape('ellipse', x, y, w, h, colorArg, opacity, strokeArg, strokeOpacity, strokeWidth, transformArg)

  function makePtsShape(
    type: ShapeType,
    pts: number[],
    colorArg: ColorArg = '#8b5cf6',
    opacity = 0.85,
    strokeWidth?: number,
    transformArg?: ShapeTransform,
  ): void {
    if (shapes.length >= MAX_SHAPES) return
    const shapeColor = typeof colorArg === 'string'
      ? { hex: colorArg, opacity: Math.max(0, Math.min(1, opacity)) }
      : { hex: colorArg.stops[0]?.hex ?? '#000000', opacity: 1, gradient: colorArg }
    const shape: Shape = {
      id: crypto.randomUUID(),
      type,
      color: shapeColor,
      geom: { x: 0, y: 0, w: 0, h: 0 },
      pts,
      ...(strokeWidth !== undefined ? { strokeWidth } : {}),
    }
    if (transformArg) shape.transform = transformArg
    shapes.push(shape)
  }

  const line  = (x1: number, y1: number, x2: number, y2: number, colorArg?: ColorArg, opacity?: number, swOrTransform?: number | ShapeTransform, transformArg?: ShapeTransform) => {
    const sw = typeof swOrTransform === 'number' ? swOrTransform : undefined
    const t  = isTransform(swOrTransform) ? swOrTransform : transformArg
    makePtsShape('line', [x1, y1, x2, y2], colorArg, opacity, sw, t)
  }
  const curve = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, colorArg?: ColorArg, opacity?: number, swOrTransform?: number | ShapeTransform, transformArg?: ShapeTransform) => {
    const sw = typeof swOrTransform === 'number' ? swOrTransform : undefined
    const t  = isTransform(swOrTransform) ? swOrTransform : transformArg
    makePtsShape('curve', [x1, y1, cx, cy, x2, y2], colorArg, opacity, sw, t)
  }

  const triangle = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, colorArg?: ColorArg, opacity?: number, strokeArg?: StrokeArg | ShapeTransform, strokeOpacity?: number, strokeWidth?: number, transformArg?: ShapeTransform) => {
    if (shapes.length >= MAX_SHAPES) return
    const shapeColor = typeof colorArg === 'string' || colorArg === undefined
      ? { hex: colorArg ?? '#8b5cf6', opacity: Math.max(0, Math.min(1, opacity ?? 0.85)) }
      : { hex: colorArg.stops[0]?.hex ?? '#000000', opacity: 1, gradient: colorArg }
    const shape: Shape = {
      id:   crypto.randomUUID(),
      type: 'triangle',
      color: shapeColor,
      geom: { x: 0, y: 0, w: 0, h: 0 },
      pts:  [x1, y1, x2, y2, x3, y3],
    }
    const actualTransform = isTransform(strokeArg) ? strokeArg : transformArg
    const sk = isTransform(strokeArg) ? undefined : resolveStroke(strokeArg as StrokeArg, strokeOpacity ?? 1, strokeWidth)
    if (sk) shape.stroke = sk
    if (actualTransform) shape.transform = actualTransform
    shapes.push(shape)
  }

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
    const paletteNames  = palettes.map(p => paletteVarName(p.name))
    const paletteArrays = palettes.map(p => [...p.colors])
    new Function(
      'rect', 'ellipse', 'line', 'curve', 'triangle', 'stroke', 'rotate', 'transform', 'repeat', 'grid',
      'grad', 'radGrad',
      'W', 'H',
      'PI', 'TAU', 'E',
      'sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'pow', 'min', 'max', 'random',
      'lerp', 'clamp', 'map', 'fract', 'smoothstep',
      ...paletteNames,
      `"use strict";\n${code}`,
    )(
      rect, ellipse, line, curve, triangle, mkStroke, rotate, transform, repeat, grid,
      grad, radGrad,
      artW, artH,
      Math.PI, Math.PI * 2, Math.E,
      Math.sin, Math.cos, Math.tan, Math.abs, Math.floor, Math.ceil,
      Math.round, Math.sqrt, Math.pow, Math.min, Math.max, Math.random,
      lerp, clamp, map, fract, smoothstep,
      ...paletteArrays,
    )
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  return { shapes, errors }
}
