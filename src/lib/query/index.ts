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

  function transformStr(t: ShapeTransform, is3D = false): string {
    // For non-3D, filter out 3D-only keys with default values
    const parts: string[] = []
    if (t.rotate   !== undefined) parts.push(`rotate: ${f(t.rotate)}`)
    if (t.scaleX   !== undefined) parts.push(`scaleX: ${f(t.scaleX)}`)
    if (t.scaleY   !== undefined) parts.push(`scaleY: ${f(t.scaleY)}`)
    if (t.skewX    !== undefined) parts.push(`skewX: ${f(t.skewX)}`)
    if (t.skewY    !== undefined) parts.push(`skewY: ${f(t.skewY)}`)
    // 3D properties
    if (t.rotateX  !== undefined && t.rotateX  !== 35)        parts.push(`rotateX: ${f(t.rotateX)}`)
    if (t.rotateY  !== undefined && t.rotateY  !== 45)        parts.push(`rotateY: ${f(t.rotateY)}`)
    if (t.rotateZ  !== undefined && t.rotateZ  !== 0)         parts.push(`rotateZ: ${f(t.rotateZ)}`)
    if (t.depth    !== undefined && t.depth    !== 0)         parts.push(`depth: ${f(t.depth)}`)
    if (t.smooth   !== undefined && t.smooth   !== 32)        parts.push(`smooth: ${f(t.smooth)}`)
    // Simple rotate shorthand only for 2D shapes
    if (!is3D && parts.length === 1 && t.rotate !== undefined) return `rotate(${f(t.rotate)})`
    if (parts.length === 0) return ''
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
      case 'material': {
        const mk = e.material ?? 'default'
        const mr = e.roughness ?? 0.5
        const mi = e.intensity ?? 0.5
        if (mr === 0.5 && mi === 0.5) return `material('${mk}')`
        if (mi === 0.5) return `material('${mk}', ${f(mr)})`
        return `material('${mk}', ${f(mr)}, ${f(mi)})`
      }
    }
  }

  return shapes.map(({ type, geom: { x, y, w, h }, color, stroke, pts, strokeWidth, transform, effects, children }) => {
    // Serialize group shapes
    if (type === 'group' && children?.length) {
      const efx = effects?.length ? effects.map(effectStr).join(', ') : ''
      const inner = shapesToCode(children).split('\n').map(l => '  ' + l).join('\n')
      return `beginGroup(${efx})\n${inner}\nendGroup()`
    }

    const is3D = type === 'cube' || type === 'sphere' || type === 'cylinder' || type === 'torus'
    const { hex, opacity, gradient } = color
    const colorArg = gradient ? gradStr(gradient) : `'${hex}'`
    const opArg    = gradient ? '1' : String(f(opacity))
    const trCode = transform ? transformStr(transform, is3D) : ''
    const tr  = trCode ? `, ${trCode}` : ''
    const efx = effects?.length ? ', ' + effects.map(effectStr).join(', ') : ''
    // 3D shapes: cube(x, y, size), sphere(x, y, size), cylinder(x, y, w, h), torus(x, y, size)
    if (type === 'cube' || type === 'sphere' || type === 'torus') {
      const sk = stroke ? `, ${strokeStr(stroke)}` : ''
      return `${type}(${f(x)}, ${f(y)}, ${f(w)}, ${colorArg}, ${opArg}${sk}${tr}${efx})`
    }
    if (type === 'cylinder') {
      const sk = stroke ? `, ${strokeStr(stroke)}` : ''
      return `cylinder(${f(x)}, ${f(y)}, ${f(w)}, ${f(h)}, ${colorArg}, ${opArg}${sk}${tr}${efx})`
    }
    if (type === 'spline' && pts) {
      const ptsArg = `[${pts.map(f).join(', ')}]`
      const sw = strokeWidth !== undefined ? `, ${f(strokeWidth)}` : ''
      return `spline(${ptsArg}, ${colorArg}, ${opArg}${sw}${tr}${efx})`
    }
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

  function parseStops(args: (StopInput | string[])[]): ColorStop[] {
    // Allow a single string[] (palette shorthand) to be passed as one argument
    const flat: StopInput[] = (args.length === 1 && Array.isArray(args[0]) && args[0].every(a => typeof a === 'string'))
      ? (args[0] as string[])
      : (args as StopInput[])
    const n = flat.length
    return flat.map((a, i) => {
      if (typeof a === 'string') return { hex: a, opacity: 1, pos: n <= 1 ? 0 : i / (n - 1) }
      const [hex, opacity = 1, pos] = a
      return { hex, opacity, pos: pos ?? (n <= 1 ? 0 : i / (n - 1)) }
    })
  }

  const grad = (angle: number, ...args: (StopInput | string[])[]): LinearGradient =>
    ({ type: 'linear', angle, stops: parseStops(args) })

  const radGrad = (...args: (StopInput | string[])[]): RadialGradient =>
    ({ type: 'radial', cx: 0.5, cy: 0.5, stops: parseStops(args) })

  // ── Type guards ───────────────────────────────────────────────────────────
  const TRANSFORM_KEYS = new Set(['rotate', 'scaleX', 'scaleY', 'skewX', 'skewY', 'rotateX', 'rotateY', 'rotateZ', 'depth', 'smooth'])

  function isTransform(v: unknown): v is ShapeTransform {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
    if ('width' in v || 'stops' in v || 'hex' in v || 'type' in v) return false
    const keys = Object.keys(v)
    return keys.length > 0 && keys.some(k => TRANSFORM_KEYS.has(k))
  }

  function isEffect(v: unknown): v is ShapeEffect {
    return typeof v === 'object' && v !== null && 'type' in v &&
      ['shadow', 'blur', 'bevel', 'noise', 'warp', 'material'].includes((v as ShapeEffect).type)
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
        if (isEffect(arg))          effects.push(arg as ShapeEffect)
        else if (isTransform(arg))  xform = xform ? { ...xform, ...(arg as ShapeTransform) } : arg as ShapeTransform
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

  const material = (kind: import('../layers/types').Material3D = 'default', roughness = 0.5, intensity = 0.5): ShapeEffect =>
    ({ type: 'material', material: kind, roughness, intensity })

  // ── Group stack ─────────────────────────────────────────────────────────
  // beginGroup(...effects) captures all shapes created until endGroup()
  // and wraps them in a single 'group' shape with those effects applied
  // to the composite.
  interface GroupFrame { startIdx: number; effects: ShapeEffect[] }
  const _groupStack: GroupFrame[] = []

  const beginGroup = (...args: unknown[]): void => {
    const effects: ShapeEffect[] = []
    for (const a of args) { if (isEffect(a)) effects.push(a as ShapeEffect) }
    _groupStack.push({ startIdx: shapes.length, effects })
  }

  const endGroup = (): void => {
    const frame = _groupStack.pop()
    if (!frame) return
    const children = shapes.splice(frame.startIdx)
    if (children.length === 0) return
    const group: Shape = {
      id: crypto.randomUUID(),
      type: 'group',
      color: { hex: '#000000', opacity: 0 },
      geom: { x: 0, y: 0, w: 0, h: 0 },
      effects: frame.effects,
      children,
    }
    shapes.push(group)
  }

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

  // ── 3D shape primitives ─────────────────────────────────────────────────
  const cube = (x: number, y: number, size: number, colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    const { stroke, transform: xform, effects } = collectTrailing(trailing)
    makeShape('cube', x, y, size, size, colorArg, opacity, stroke, effects, xform)
  }

  const sphere = (x: number, y: number, size: number, colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    const { stroke, transform: xform, effects } = collectTrailing(trailing)
    makeShape('sphere', x, y, size, size, colorArg, opacity, stroke, effects, xform)
  }

  const cylinder = (x: number, y: number, w: number, h: number, colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    const { stroke, transform: xform, effects } = collectTrailing(trailing)
    makeShape('cylinder', x, y, w, h, colorArg, opacity, stroke, effects, xform)
  }

  const torus = (x: number, y: number, size: number, colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    const { stroke, transform: xform, effects } = collectTrailing(trailing)
    makeShape('torus', x, y, size, size, colorArg, opacity, stroke, effects, xform)
  }

  // ── Spline (Catmull-Rom through N points) ─────────────────────────────────
  const spline = (pts: number[], colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    if (!Array.isArray(pts) || pts.length < 4) return
    let sw: number | undefined
    let rest: unknown[] = trailing
    if (trailing.length > 0 && typeof trailing[0] === 'number') { sw = trailing[0] as number; rest = trailing.slice(1) }
    const { transform: xform, effects } = collectTrailing(rest)
    makePtsShape('spline', pts, colorArg, opacity, sw, xform, effects)
  }

  // Vertex accumulator for beginSpline / vertex / endSpline
  let _vtx: number[] = []
  const beginSpline = () => { _vtx = [] }
  const vertex = (x: number, y: number) => { _vtx.push(x, y) }
  const endSpline = (colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    if (_vtx.length < 4) return
    let sw: number | undefined
    let rest: unknown[] = trailing
    if (trailing.length > 0 && typeof trailing[0] === 'number') { sw = trailing[0] as number; rest = trailing.slice(1) }
    const { transform: xform, effects } = collectTrailing(rest)
    makePtsShape('spline', [..._vtx], colorArg, opacity, sw, xform, effects)
  }

  // ── Value noise ───────────────────────────────────────────────────────────
  const nz = (x: number, y = 0): number => {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = x - ix, fy = y - iy
    const fade = (t: number) => t * t * (3 - 2 * t)
    const h = (a: number, b: number): number => {
      const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123
      return n - Math.floor(n)
    }
    const ux = fade(fx), uy = fade(fy)
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
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

  // wave(n, amplitude, frequency, cb(i, t, x, y))
  // Iterates n times along a horizontal sine wave across the artboard.
  // x goes 0→1, y = 0.5 + amplitude * sin(frequency * t * TAU)
  const wave = (
    n: number,
    amplitude = 0.15,
    frequency = 1,
    cb: (i: number, t: number, x: number, y: number) => void,
  ): void => {
    const count = Math.min(Math.floor(n), MAX_SHAPES)
    for (let i = 0; i < count; i++) {
      if (shapes.length >= MAX_SHAPES) break
      const t = count > 1 ? i / (count - 1) : 0
      const x = t
      const y = 0.5 + amplitude * Math.sin(frequency * t * Math.PI * 2)
      cb(i, t, x, y)
    }
  }

  // circular(n, cx, cy, r, cb(i, t, x, y, angle))
  // Distributes n items evenly around a circle. angle is in radians.
  // y is aspect-ratio corrected so the path is visually circular.
  const circular = (
    n: number,
    cx = 0.5,
    cy = 0.5,
    r = 0.35,
    cb: (i: number, t: number, x: number, y: number, angle: number) => void,
  ): void => {
    const count = Math.min(Math.floor(n), MAX_SHAPES)
    const aspect = artW / artH
    for (let i = 0; i < count; i++) {
      if (shapes.length >= MAX_SHAPES) break
      const t     = count > 1 ? i / count : 0
      const angle = t * Math.PI * 2
      const x     = cx + r * Math.cos(angle)
      const y     = cy + r * Math.sin(angle) * aspect
      cb(i, t, x, y, angle)
    }
  }

  // ── Math helpers ──────────────────────────────────────────────────────────
  const lerp       = (a: number, b: number, t: number) => a + (b - a) * t
  const clamp      = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const map        = (v: number, a: number, b: number, c: number, d: number) => c + ((v - a) / (b - a)) * (d - c)
  const fract      = (v: number) => v - Math.floor(v)
  const smoothstep = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t) }

  // ── Palette lookup ────────────────────────────────────────────────────────
  function palette(name: string): string[]
  function palette(name: string, index: number): string
  function palette(name: string, index?: number): string | string[] {
    const p = palettes.find(p => p.name === name)
    if (index === undefined) return p?.colors ? [...p.colors] : []
    if (!p || p.colors.length === 0) return '#888888'
    return p.colors[((index % p.colors.length) + p.colors.length) % p.colors.length]
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  try {
    new Function(
      'rect', 'ellipse', 'arc', 'line', 'curve', 'triangle', 'spline', 'beginSpline', 'vertex', 'endSpline',
      'cube', 'sphere', 'cylinder', 'torus',
      'beginGroup', 'endGroup',
      'stroke', 'rotate', 'transform',
      'shadow', 'blur', 'bevel', 'noise', 'warp', 'material',
      'repeat', 'grid', 'wave', 'circular',
      'grad', 'radGrad',
      'palette',
      'W', 'H',
      'PI', 'TAU', 'E',
      'sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'pow', 'min', 'max', 'random',
      'lerp', 'clamp', 'map', 'fract', 'smoothstep', 'nz',
      code,
    )(
      rect, ellipse, arc, line, curve, triangle, spline, beginSpline, vertex, endSpline,
      cube, sphere, cylinder, torus,
      beginGroup, endGroup,
      mkStroke, rotate, transform,
      shadow, blur, bevel, noise, warp, material,
      repeat, grid, wave, circular,
      grad, radGrad,
      palette,
      artW, artH,
      Math.PI, Math.PI * 2, Math.E,
      Math.sin, Math.cos, Math.tan, Math.abs, Math.floor, Math.ceil,
      Math.round, Math.sqrt, Math.pow, Math.min, Math.max, Math.random,
      lerp, clamp, map, fract, smoothstep, nz,
    )
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  return { shapes, errors }
}
