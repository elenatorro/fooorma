import type { ColorStop, Gradient, LinearGradient, RadialGradient, Shape, ShapeEffect, ShapeStroke, ShapeTransform, ShapeType } from '../layers/types'

/** Serialize manual shapes to equivalent query code. */
export function shapesToCode(shapes: Shape[]): string {
  if (shapes.length === 0) return ''
  const f = (n: number) => parseFloat(n.toFixed(4))

  function stopStr(st: ColorStop): string {
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

  function effectStr(e: ShapeEffect): string {
    switch (e.type) {
      case 'shadow': {
        const col = e.color   ?? '#000000'
        const op  = e.opacity ?? 0.5
        const bl  = e.blur    ?? 10
        const ox  = e.offsetX ?? 0
        const oy  = e.offsetY ?? 4
        if (col === '#000000' && op === 0.5 && bl === 10 && ox === 0 && oy === 4) return 'shadow()'
        if (op  === 0.5 && bl === 10 && ox === 0 && oy === 4) return `shadow('${col}')`
        if (bl  === 10 && ox === 0 && oy === 4) return `shadow('${col}', ${f(op)})`
        if (ox  === 0 && oy === 4) return `shadow('${col}', ${f(op)}, ${f(bl)})`
        return `shadow('${col}', ${f(op)}, ${f(bl)}, ${f(ox)}, ${f(oy)})`
      }
      case 'blur':
        return (e.blur ?? 4) === 4 ? 'blur()' : `blur(${f(e.blur!)})`
      case 'bevel':
        return (e.opacity ?? 0.6) === 0.6 ? 'bevel()' : `bevel(${f(e.opacity!)})`
      case 'noise':
        return (e.amount ?? 0.3) === 0.3 ? 'noise()' : `noise(${f(e.amount!)})`
      case 'warp': {
        const amt  = e.amount ?? 8
        const freq = e.freq   ?? 0.05
        if (amt === 8 && freq === 0.05) return 'warp()'
        if (freq === 0.05) return `warp(${f(amt)})`
        return `warp(${f(amt)}, ${f(freq)})`
      }
    }
  }

  return shapes.map(({ type, geom: { x, y, w, h }, color, stroke, pts, strokeWidth, transform, effects }) => {
    const { hex, opacity, gradient } = color
    const colorArg = gradient ? gradStr(gradient) : `'${hex}'`
    const opArg    = gradient ? '1' : String(f(opacity))
    const tr  = transform ? `, ${transformStr(transform)}` : ''
    const efx = effects?.length ? ', ' + effects.map(effectStr).join(', ') : ''
    if (type === 'arc' && pts) {
      const r  = f(w / 2)
      const sk = stroke ? `, ${strokeStr(stroke)}` : ''
      return `arc(${f(x)}, ${f(y)}, ${r}, ${f(pts[0])}, ${f(pts[1])}, ${colorArg}, ${opArg}${sk}${tr}${efx})`
    }
    if (pts) {
      const coords = pts.map(f).join(', ')
      const sw = strokeWidth !== undefined ? `, ${f(strokeWidth)}` : ''
      const sk = stroke ? `, ${strokeStr(stroke)}` : ''
      if (type === 'triangle') return `triangle(${coords}, ${colorArg}, ${opArg}${sk}${tr}${efx})`
      return `${type}(${coords}, ${colorArg}, ${opArg}${sw}${tr}${efx})`
    }
    const sk = stroke ? `, ${strokeStr(stroke)}` : ''
    return `${type}(${f(x)}, ${f(y)}, ${f(w)}, ${f(h)}, ${colorArg}, ${opArg}${sk}${tr}${efx})`
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

  // ── Gradient helpers ──────────────────────────────────────────────────────
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

  // ── Type guards ───────────────────────────────────────────────────────────
  function isTransform(v: unknown): v is ShapeTransform {
    return typeof v === 'object' && v !== null && !Array.isArray(v) &&
      !('width' in v) && !('stops' in v) && !('hex' in v) && !('type' in v) &&
      ('rotate' in v || 'scaleX' in v || 'scaleY' in v || 'skewX' in v || 'skewY' in v)
  }

  function isEffect(v: unknown): v is ShapeEffect {
    return typeof v === 'object' && v !== null && 'type' in v &&
      ['shadow', 'blur', 'bevel', 'noise', 'warp'].includes((v as ShapeEffect).type)
  }

  /** Scan trailing args and sort into stroke, transform, and effects buckets. */
  function collectTrailing(trailing: unknown[]): { stroke?: ShapeStroke; transform?: ShapeTransform; effects: ShapeEffect[] } {
    let stroke: ShapeStroke | undefined
    let xform: ShapeTransform | undefined
    const effects: ShapeEffect[] = []
    for (let i = 0; i < trailing.length; i++) {
      const arg = trailing[i]
      if (arg === null || arg === undefined) continue
      if (typeof arg === 'object') {
        if (isEffect(arg))     effects.push(arg as ShapeEffect)
        else if (isTransform(arg)) xform = arg as ShapeTransform
        else if ('width' in (arg as object)) stroke = arg as ShapeStroke
      } else if (typeof arg === 'string') {
        // Legacy positional stroke: hex, [opacity, [width]]
        const opacity = typeof trailing[i + 1] === 'number' ? (trailing[i + 1] as number) : 1
        const width   = typeof trailing[i + 2] === 'number' ? (trailing[i + 2] as number) : 0.005
        stroke = { hex: arg, opacity, width, align: 'center', join: 'miter' }
        i += 2
      }
    }
    return { stroke, transform: xform, effects }
  }

  // ── Transform helpers ─────────────────────────────────────────────────────
  const rotate    = (deg: number): ShapeTransform => ({ rotate: deg })
  const transform = (opts: ShapeTransform): ShapeTransform => ({ ...opts })

  // ── Stroke helper ─────────────────────────────────────────────────────────
  type ColorArg = string | Gradient

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

  // ── Effect factories ──────────────────────────────────────────────────────
  const shadow = (color = '#000000', opacity = 0.5, blur = 10, offsetX = 0, offsetY = 4): ShapeEffect =>
    ({ type: 'shadow', color, opacity, blur, offsetX, offsetY })

  const blur = (amount = 4): ShapeEffect =>
    ({ type: 'blur', blur: amount })

  const bevel = (intensity = 0.6): ShapeEffect =>
    ({ type: 'bevel', opacity: intensity })

  const noise = (amount = 0.3): ShapeEffect =>
    ({ type: 'noise', amount })

  const warp = (amount = 8, freq = 0.05): ShapeEffect =>
    ({ type: 'warp', amount, freq })

  // ── Drawing primitives ────────────────────────────────────────────────────
  function makeShape(
    type: ShapeType,
    x: number, y: number, w: number, h: number,
    colorArg: ColorArg = '#8b5cf6',
    opacity  = 0.85,
    stroke?: ShapeStroke,
    effects: ShapeEffect[] = [],
    xform?: ShapeTransform,
  ): void {
    if (shapes.length >= MAX_SHAPES) return
    const shapeColor = typeof colorArg === 'string'
      ? { hex: colorArg, opacity: Math.max(0, Math.min(1, opacity)) }
      : { hex: colorArg.stops[0]?.hex ?? '#000000', opacity: 1, gradient: colorArg }
    const shape: Shape = { id: crypto.randomUUID(), type, color: shapeColor, geom: { x, y, w, h } }
    if (stroke)          shape.stroke    = stroke
    if (xform)           shape.transform = xform
    if (effects.length)  shape.effects   = effects
    shapes.push(shape)
  }

  const rect = (x: number, y: number, w: number, h: number, colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    const { stroke, transform: xform, effects } = collectTrailing(trailing)
    makeShape('rect', x, y, w, h, colorArg, opacity, stroke, effects, xform)
  }
  const ellipse = (x: number, y: number, w: number, h: number, colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    const { stroke, transform: xform, effects } = collectTrailing(trailing)
    makeShape('ellipse', x, y, w, h, colorArg, opacity, stroke, effects, xform)
  }

  function makePtsShape(
    type: ShapeType,
    pts: number[],
    colorArg: ColorArg = '#8b5cf6',
    opacity = 0.85,
    strokeWidth?: number,
    xform?: ShapeTransform,
    effects: ShapeEffect[] = [],
  ): void {
    if (shapes.length >= MAX_SHAPES) return
    const shapeColor = typeof colorArg === 'string'
      ? { hex: colorArg, opacity: Math.max(0, Math.min(1, opacity)) }
      : { hex: colorArg.stops[0]?.hex ?? '#000000', opacity: 1, gradient: colorArg }
    const shape: Shape = {
      id: crypto.randomUUID(), type, color: shapeColor,
      geom: { x: 0, y: 0, w: 0, h: 0 }, pts,
      ...(strokeWidth !== undefined ? { strokeWidth } : {}),
    }
    if (xform)          shape.transform = xform
    if (effects.length) shape.effects   = effects
    shapes.push(shape)
  }

  const arc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number, colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    if (shapes.length >= MAX_SHAPES) return
    const { stroke, transform: xform, effects } = collectTrailing(trailing)
    const shapeColor = typeof colorArg === 'string' || colorArg === undefined
      ? { hex: colorArg ?? '#8b5cf6', opacity: Math.max(0, Math.min(1, opacity ?? 0.85)) }
      : { hex: colorArg.stops[0]?.hex ?? '#000000', opacity: 1, gradient: colorArg }
    const shape: Shape = {
      id: crypto.randomUUID(), type: 'arc',
      color: shapeColor,
      geom: { x: cx, y: cy, w: r * 2, h: r * 2 },
      pts: [startAngle, endAngle],
    }
    if (stroke)         shape.stroke    = stroke
    if (xform)          shape.transform = xform
    if (effects.length) shape.effects   = effects
    shapes.push(shape)
  }

  const line = (x1: number, y1: number, x2: number, y2: number, colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    let sw: number | undefined
    let rest: unknown[] = trailing
    if (trailing.length > 0 && typeof trailing[0] === 'number') { sw = trailing[0] as number; rest = trailing.slice(1) }
    const { transform: xform, effects } = collectTrailing(rest)
    makePtsShape('line', [x1, y1, x2, y2], colorArg, opacity, sw, xform, effects)
  }
  const curve = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    let sw: number | undefined
    let rest: unknown[] = trailing
    if (trailing.length > 0 && typeof trailing[0] === 'number') { sw = trailing[0] as number; rest = trailing.slice(1) }
    const { transform: xform, effects } = collectTrailing(rest)
    makePtsShape('curve', [x1, y1, cx, cy, x2, y2], colorArg, opacity, sw, xform, effects)
  }

  const triangle = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    if (shapes.length >= MAX_SHAPES) return
    const shapeColor = typeof colorArg === 'string' || colorArg === undefined
      ? { hex: colorArg ?? '#8b5cf6', opacity: Math.max(0, Math.min(1, opacity ?? 0.85)) }
      : { hex: colorArg.stops[0]?.hex ?? '#000000', opacity: 1, gradient: colorArg }
    const { stroke, transform: xform, effects } = collectTrailing(trailing)
    const shape: Shape = {
      id: crypto.randomUUID(), type: 'triangle', color: shapeColor,
      geom: { x: 0, y: 0, w: 0, h: 0 }, pts: [x1, y1, x2, y2, x3, y3],
    }
    if (stroke)          shape.stroke    = stroke
    if (xform)           shape.transform = xform
    if (effects.length)  shape.effects   = effects
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

  // ── Palette lookup ────────────────────────────────────────────────────────
  const palette = (name: string, index: number): string => {
    const p = palettes.find(p => p.name === name)
    if (!p || p.colors.length === 0) return '#888888'
    return p.colors[((index % p.colors.length) + p.colors.length) % p.colors.length]
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  try {
    new Function(
      'rect', 'ellipse', 'arc', 'line', 'curve', 'triangle',
      'stroke', 'rotate', 'transform',
      'shadow', 'blur', 'bevel', 'noise', 'warp',
      'repeat', 'grid',
      'grad', 'radGrad',
      'palette',
      'W', 'H',
      'PI', 'TAU', 'E',
      'sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'pow', 'min', 'max', 'random',
      'lerp', 'clamp', 'map', 'fract', 'smoothstep',
      code,
    )(
      rect, ellipse, arc, line, curve, triangle,
      mkStroke, rotate, transform,
      shadow, blur, bevel, noise, warp,
      repeat, grid,
      grad, radGrad,
      palette,
      artW, artH,
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
