import type { ColorStop, Gradient, LinearGradient, Pattern, RadialGradient, Shape, ShapeEffect, ShapeStroke, ShapeTransform, ShapeType } from '../layers/types'

/** Serialize manual shapes to equivalent query code. */
export function shapesToCode(shapes: Shape[], artW = 794, artH = 1123): string {
  if (shapes.length === 0) return ''
  const f = (n: number) => parseFloat(n.toFixed(4))
  // Convert center-based geom to top-left (x,y) for the code API
  const _hToY = artW / (2 * artH)  // converts half of h (artW-fraction) to artH-fraction offset
  const toTL = (cx: number, cy: number, w: number, h: number) => ({
    x: cx - w / 2,
    y: cy - h * _hToY,
    w, h,
  })

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
    if (sk.wireframe) {
      const colorArg = sk.gradient ? gradStr(sk.gradient) : `'${sk.hex}'`
      const opArg = sk.gradient ? '1' : String(f(sk.opacity))
      const join = sk.join ?? 'round'
      let s = `wireframe(${colorArg}, ${opArg}, ${f(sk.width)}`
      if (join !== 'round') s += `, '${join}'`
      return s + ')'
    }
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

  return shapes.map(({ type, geom, color, stroke, pts, strokeWidth, transform, effects, children, mask }) => {
    // Serialize group shapes
    if (type === 'group' && children?.length) {
      const efx = effects?.length ? effects.map(effectStr).join(', ') : ''
      const inner = shapesToCode(children, artW, artH).split('\n').map(l => '  ' + l).join('\n')
      return `beginGroup(${efx})\n${inner}\nendGroup()`
    }

    // Serialize mask shapes
    if (type === 'mask' && mask?.length) {
      const maskInner = shapesToCode(mask, artW, artH).split('\n').map(l => '  ' + l).join('\n')
      const contentInner = children?.length
        ? shapesToCode(children, artW, artH).split('\n').map(l => '  ' + l).join('\n')
        : ''
      return `beginMask()\n${maskInner}\nendMask()\n${contentInner}\nendClip()`
    }

    // Convert center-based geom to top-left for the code API
    const { x, y, w, h } = toTL(geom.x, geom.y, geom.w, geom.h)

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
  stamps: Pattern[] = [],
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

  function mkWireframe(
    colorArg: ColorArg = '#000000',
    opacity = 1,
    width   = 0.003,
    join:  'miter'  | 'round' | 'bevel' = 'round',
  ): ShapeStroke {
    if (typeof colorArg === 'string') {
      return { hex: colorArg, opacity: Math.max(0, Math.min(1, opacity)), width, align: 'center', join, wireframe: true }
    }
    return { hex: colorArg.stops[0]?.hex ?? '#000000', opacity: 1, width, align: 'center', join, wireframe: true, gradient: colorArg }
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

  // ── Mask stack ──────────────────────────────────────────────────────────
  // beginMask() → draw mask shape(s) → endMask() → draw content → endClip()
  // Content is clipped to the alpha of the mask shapes.
  interface MaskFrame { startIdx: number; maskShapes?: Shape[] }
  const _maskStack: MaskFrame[] = []

  const beginMask = (): void => {
    _maskStack.push({ startIdx: shapes.length })
  }

  const endMask = (): void => {
    const frame = _maskStack[_maskStack.length - 1]
    if (!frame) return
    frame.maskShapes = shapes.splice(frame.startIdx)
    frame.startIdx = shapes.length
  }

  const endClip = (): void => {
    const frame = _maskStack.pop()
    if (!frame || !frame.maskShapes) return
    const contentShapes = shapes.splice(frame.startIdx)
    if (frame.maskShapes.length === 0 && contentShapes.length === 0) return
    const maskShape: Shape = {
      id: crypto.randomUUID(),
      type: 'mask',
      color: { hex: '#000000', opacity: 0 },
      geom: { x: 0, y: 0, w: 0, h: 0 },
      mask: frame.maskShapes,
      children: contentShapes,
    }
    shapes.push(maskShape)
  }

  // ── Drawing primitives ────────────────────────────────────────────────────
  // Convert top-left (x,y) to center-based geom used by the renderer.
  // h is in artW-fractions (uniform sizing), y is in artH-fractions.
  // In tile-local space both axes are 0–1, so _hToY becomes 0.5.
  const _globalHToY = artW / (2 * artH)
  let _hToY = _globalHToY

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
    // x,y = top-left corner → convert to center for internal geom
    const cx = x + w / 2
    const cy = y + h * _hToY
    const shape: Shape = { id: crypto.randomUUID(), type, color: shapeColor, geom: { x: cx, y: cy, w, h } }
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

  const arc = (x: number, y: number, r: number, startAngle: number, endAngle: number, colorArg?: ColorArg, opacity?: number, ...trailing: unknown[]) => {
    if (shapes.length >= MAX_SHAPES) return
    const { stroke, transform: xform, effects } = collectTrailing(trailing)
    const shapeColor = typeof colorArg === 'string' || colorArg === undefined
      ? { hex: colorArg ?? '#8b5cf6', opacity: Math.max(0, Math.min(1, opacity ?? 0.85)) }
      : { hex: colorArg.stops[0]?.hex ?? '#000000', opacity: 1, gradient: colorArg }
    // x,y = top-left corner → convert to center
    const d = r * 2
    const cx = x + d / 2
    const cy = y + d * _hToY
    const shape: Shape = {
      id: crypto.randomUUID(), type: 'arc',
      color: shapeColor,
      geom: { x: cx, y: cy, w: d, h: d },
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

  // ── Tile helper ─────────────────────────────────────────────────────────
  // tile(cols, cb)             — square tiles, rows auto-computed from aspect ratio
  // tile(cols, rows, cb)       — explicit grid (cells may be non-square)
  // tile(cols, cb, opts?)      — square tiles with options
  // tile(cols, rows, cb, opts?)— explicit grid with options
  //
  // Shapes inside the callback are drawn in tile-local 0–1 space.
  // They are automatically repositioned into each grid cell.
  // w and h always scale uniformly (by cell width), so w=h is always a circle.
  // Inside the callback, use mirror('x'), mirror('y'), or mirror('xy') to
  // flip subsequently drawn shapes within the tile.
  interface TileOpts { offsetX?: number; offsetY?: number; gapX?: number; gapY?: number }

  let _tileCtx: { ox: number; oy: number; tw: number; th: number; mx: boolean; my: boolean } | null = null

  const mirror = (axis: 'x' | 'y' | 'xy' = 'x'): void => {
    if (!_tileCtx) return
    if (axis === 'x' || axis === 'xy') _tileCtx.mx = !_tileCtx.mx
    if (axis === 'y' || axis === 'xy') _tileCtx.my = !_tileCtx.my
  }

  /** Remap a shape's coordinates from tile-local 0–1 space to the grid cell.
   *  Both w and h scale by tw (cell width) so that equal local w/h always
   *  produces a perfect circle/square regardless of cell aspect ratio. */

  function remapShape(s: Shape, ox: number, oy: number, tw: number, th: number, mx: boolean, my: boolean): Shape {
    const out = { ...s }
    // Remap geom-based coords
    let lx = s.geom.x, ly = s.geom.y, lw = s.geom.w, lh = s.geom.h
    if (mx) lx = 1 - lx
    if (my) ly = 1 - ly
    out.geom = { x: ox + lx * tw, y: oy + ly * th, w: lw * tw, h: lh * tw }

    // Remap pts (line, curve, triangle, spline, arc)
    if (s.pts) {
      const pts = [...s.pts]
      if (s.type === 'arc') {
        // arc pts are [startAngle, endAngle] — mirror reverses them
        if (mx) { pts[0] = 360 - pts[1]; pts[1] = 360 - s.pts[0] }
        if (my) { pts[0] = -pts[1]; pts[1] = -s.pts[0] }
      } else {
        // pts are flat [x0, y0, x1, y1, ...]
        for (let i = 0; i < pts.length; i += 2) {
          let px = pts[i], py = pts[i + 1]
          if (mx) px = 1 - px
          if (my) py = 1 - py
          pts[i]     = ox + px * tw
          pts[i + 1] = oy + py * th
        }
      }
      out.pts = pts
    }

    // Mirror rotation in transform
    if (s.transform && (mx || my)) {
      const t = { ...s.transform }
      if (t.rotate !== undefined && (mx !== my)) t.rotate = -t.rotate
      if (t.skewX !== undefined && mx) t.skewX = -t.skewX
      if (t.skewY !== undefined && my) t.skewY = -t.skewY
      out.transform = t
    }

    // Recurse into group children and mask shapes
    if (s.children) {
      out.children = s.children.map(c => remapShape(c, ox, oy, tw, th, mx, my))
    }
    if (s.mask) {
      out.mask = s.mask.map(c => remapShape(c, ox, oy, tw, th, mx, my))
    }

    return out
  }

  const tile = (
    cols: number,
    rows: number | ((col: number, row: number, ct: number, rt: number) => void),
    cb?: ((col: number, row: number, ct: number, rt: number) => void) | TileOpts,
    opts?: TileOpts,
  ): void => {
    // tile(cols, cb) — square tiles, auto-compute rows from aspect ratio
    let _cols = cols
    let _rows: number
    let _cb: (col: number, row: number, ct: number, rt: number) => void
    let _opts: TileOpts | undefined
    if (typeof rows === 'function') {
      _cb = rows
      _opts = typeof cb === 'object' ? cb as TileOpts : undefined
      const aspect = artH / artW
      _rows = Math.round(_cols * aspect)
    } else {
      _rows = rows
      _cb = cb as (col: number, row: number, ct: number, rt: number) => void
      _opts = opts
    }
    const nc = Math.min(Math.floor(_cols), 200)
    const nr = Math.min(Math.floor(_rows), 200)
    const gx = _opts?.gapX ?? 0
    const gy = _opts?.gapY ?? 0
    const baseOx = _opts?.offsetX ?? 0
    const baseOy = _opts?.offsetY ?? 0
    const tw = nc > 0 ? (1 - baseOx * 2 - gx * (nc - 1)) / nc : 1
    const th = nr > 0 ? (1 - baseOy * 2 - gy * (nr - 1)) / nr : 1

    for (let r = 0; r < nr; r++) {
      for (let c = 0; c < nc; c++) {
        if (shapes.length >= MAX_SHAPES) break
        const cellOx = baseOx + c * (tw + gx)
        const cellOy = baseOy + r * (th + gy)
        const ct = nc > 1 ? c / (nc - 1) : 0
        const rt = nr > 1 ? r / (nr - 1) : 0

        // Capture shapes drawn inside the callback
        // In tile-local space both axes are 0–1, so use 0.5 for h→y conversion
        _tileCtx = { ox: cellOx, oy: cellOy, tw, th, mx: false, my: false }
        const prevHToY = _hToY
        _hToY = 0.5
        const startIdx = shapes.length
        _cb(c, r, ct, rt)
        _hToY = prevHToY
        const localShapes = shapes.splice(startIdx)
        const { ox, oy, mx, my } = _tileCtx
        _tileCtx = null

        // Remap and push
        for (const s of localShapes) {
          if (shapes.length >= MAX_SHAPES) break
          shapes.push(remapShape(s, ox, oy, tw, th, mx, my))
        }
      }
    }
  }

  // ── Dimension helpers ────────────────────────────────────────────────────
  // Sizes in the data model are always in artW-fractions (uniform space).
  // w()/width()  — identity (already in width-relative space)
  // h()/height() — convert from height-relative to uniform space
  const w      = (v: number): number => v
  const width  = w
  const h      = (v: number): number => v * artH / artW
  const height = h

  // Convert a size (artW-fraction) to a y-position offset (artH-fraction).
  // Useful for computing top-left y from a center point:
  //   ellipse(cx - s/2, cy - sy(s)/2, s, s)
  const sy     = (v: number): number => v * artW / artH

  // ── Stamp (reusable shape group) ────────────────────────────────────────
  // stamp('name')              — place shapes centered at (0.5, 0.5)
  // stamp('name', { scale, rotate, mirror })  — with transforms
  interface StampOpts { scale?: number; rotate?: number; mirror?: 'x' | 'y' | 'xy' }

  /** Compute bounding-box center of shapes (x in artW-space, y in artH-space). */
  function stampCenter(list: Shape[]): [number, number] {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const s of list) {
      if (s.pts && s.type !== 'arc') {
        for (let i = 0; i < s.pts.length; i += 2) {
          const px = s.pts[i], py = s.pts[i + 1]
          if (px < minX) minX = px; if (px > maxX) maxX = px
          if (py < minY) minY = py; if (py > maxY) maxY = py
        }
      } else {
        const { x, y, w, h } = s.geom
        // w,h are artW-fractions; convert h to artH-fraction for y-axis bbox
        const hh = (h * artW) / artH / 2
        const hw = w / 2
        if (x - hw < minX) minX = x - hw; if (x + hw > maxX) maxX = x + hw
        if (y - hh < minY) minY = y - hh; if (y + hh > maxY) maxY = y + hh
      }
    }
    return [(minX + maxX) / 2, (minY + maxY) / 2]
  }

  const stamp = (name: string, opts?: StampOpts): void => {
    const pat = stamps.find(p => p.code && p.name === name)
    if (!pat || !pat.code) { errors.push(`stamp '${name}' not found`); return }
    // Evaluate the stamp code into a temporary shape list
    const inner = evaluateQuery(pat.code, artW, artH, palettes, stamps)
    if (inner.errors.length) { errors.push(...inner.errors.map(e => `stamp '${name}': ${e}`)); return }
    if (inner.shapes.length === 0) return

    // Auto-center: shift all shapes so their bbox center sits at (0.5, 0.5)
    const [cx, cy] = stampCenter(inner.shapes)
    const dx = 0.5 - cx, dy = 0.5 - cy

    const sc = opts?.scale ?? 1
    const rot = opts?.rotate ?? 0
    const mx = opts?.mirror === 'x' || opts?.mirror === 'xy'
    const my = opts?.mirror === 'y' || opts?.mirror === 'xy'
    const cosR = Math.cos(rot * Math.PI / 180)
    const sinR = Math.sin(rot * Math.PI / 180)

    for (const s of inner.shapes) {
      if (shapes.length >= MAX_SHAPES) break
      let out = { ...s, id: crypto.randomUUID() }
      // Shift to center, then apply scale/mirror/rotate around (0.5, 0.5)
      let lx = s.geom.x + dx, ly = s.geom.y + dy, lw = s.geom.w, lh = s.geom.h
      if (sc !== 1) {
        lx = 0.5 + (lx - 0.5) * sc
        ly = 0.5 + (ly - 0.5) * sc
        lw *= sc; lh *= sc
      }
      if (mx) lx = 1 - lx
      if (my) ly = 1 - ly
      if (rot !== 0) {
        const ddx = lx - 0.5, ddy = ly - 0.5
        lx = 0.5 + ddx * cosR - ddy * sinR
        ly = 0.5 + ddx * sinR + ddy * cosR
      }
      out.geom = { x: lx, y: ly, w: lw, h: lh }
      // Transform pts
      if (s.pts && s.type !== 'arc') {
        const pts = [...s.pts]
        for (let i = 0; i < pts.length; i += 2) {
          let px = pts[i] + dx, py = pts[i + 1] + dy
          if (sc !== 1) { px = 0.5 + (px - 0.5) * sc; py = 0.5 + (py - 0.5) * sc }
          if (mx) px = 1 - px
          if (my) py = 1 - py
          if (rot !== 0) {
            const ddx = px - 0.5, ddy = py - 0.5
            px = 0.5 + ddx * cosR - ddy * sinR
            py = 0.5 + ddx * sinR + ddy * cosR
          }
          pts[i] = px; pts[i + 1] = py
        }
        out.pts = pts
      }
      // Merge rotation into existing transform
      if (rot !== 0 || (mx !== my)) {
        const t = { ...(s.transform ?? {}) }
        const existingRot = t.rotate ?? 0
        let addedRot = rot
        if (mx !== my) addedRot = -addedRot
        t.rotate = existingRot + addedRot
        out.transform = t
      }
      if (s.children) {
        out.children = s.children.map(c => ({ ...c, id: crypto.randomUUID() }))
      }
      if (s.mask) {
        out.mask = s.mask.map(c => ({ ...c, id: crypto.randomUUID() }))
      }
      shapes.push(out)
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
      'beginMask', 'endMask', 'endClip',
      'stroke', 'wireframe', 'rotate', 'transform',
      'shadow', 'blur', 'bevel', 'noise', 'warp', 'material',
      'repeat', 'grid', 'wave', 'circular', 'tile', 'mirror',
      'stamp',
      'grad', 'radGrad',
      'palette',
      'w', 'width', 'h', 'height', 'sy',
      'W', 'H',
      'PI', 'TAU', 'E',
      'sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'pow', 'min', 'max', 'random',
      'lerp', 'clamp', 'map', 'fract', 'smoothstep', 'nz',
      code,
    )(
      rect, ellipse, arc, line, curve, triangle, spline, beginSpline, vertex, endSpline,
      cube, sphere, cylinder, torus,
      beginGroup, endGroup,
      beginMask, endMask, endClip,
      mkStroke, mkWireframe, rotate, transform,
      shadow, blur, bevel, noise, warp, material,
      repeat, grid, wave, circular, tile, mirror,
      stamp,
      grad, radGrad,
      palette,
      w, width, h, height, sy,
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
