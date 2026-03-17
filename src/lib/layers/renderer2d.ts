import type { Gradient, Layer, Material3D, ShapeEffect, ShapeStroke, ShapeTransform } from './types'

// ── Gradient helpers ──────────────────────────────────────────────────────────

function hexToRgba(hex: unknown, opacity: number): string {
  if (typeof hex !== 'string') return `rgba(0,0,0,${opacity})`
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16) || 0
  const g = parseInt(c.slice(2, 4), 16) || 0
  const b = parseInt(c.slice(4, 6), 16) || 0
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

// Eagerly create noise canvas at module load so the bitmap is ready before first render.
// Firefox can return null from createPattern() if the source canvas was just created.
const _noiseCanvas: HTMLCanvasElement = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const nc = c.getContext('2d')!
  const img = nc.createImageData(128, 128)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255 | 0
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  nc.putImageData(img, 0, 0)
  return c
})()

function applyNoise(
  ctx: CanvasRenderingContext2D,
  buildPath: () => void,
  amount: number,
): void {
  const pat = ctx.createPattern(_noiseCanvas, 'repeat')
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
// Keyed by target canvas to avoid cross-contamination between viewport and export.
const _warpPool = new WeakMap<HTMLCanvasElement, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>()
const _maskPool = new WeakMap<HTMLCanvasElement, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>()

function getWarpCtx(targetCanvas: HTMLCanvasElement, physW: number, physH: number): CanvasRenderingContext2D {
  let entry = _warpPool.get(targetCanvas)
  if (!entry) {
    const canvas = document.createElement('canvas')
    canvas.width = physW
    canvas.height = physH
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    entry = { canvas, ctx }
    _warpPool.set(targetCanvas, entry)
  }
  if (entry.canvas.width !== physW || entry.canvas.height !== physH) {
    entry.canvas.width  = physW
    entry.canvas.height = physH
    // Re-acquire context — Firefox invalidates it after dimension change
    entry.ctx = entry.canvas.getContext('2d', { willReadFrequently: true })!
  }
  return entry.ctx
}

function getMaskCtx(targetCanvas: HTMLCanvasElement, physW: number, physH: number): CanvasRenderingContext2D {
  let entry = _maskPool.get(targetCanvas)
  if (!entry) {
    const canvas = document.createElement('canvas')
    canvas.width = physW
    canvas.height = physH
    // willReadFrequently forces CPU path — fixes Firefox intermittent blank
    // output with destination-in compositing on GPU-accelerated canvases
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    entry = { canvas, ctx }
    _maskPool.set(targetCanvas, entry)
  }
  if (entry.canvas.width !== physW || entry.canvas.height !== physH) {
    entry.canvas.width  = physW
    entry.canvas.height = physH
    entry.ctx = entry.canvas.getContext('2d', { willReadFrequently: true })!
  }
  return entry.ctx
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

// ── 3D projection engine ─────────────────────────────────────────────────────

type V3 = [number, number, number]

// Default 3D transform values
const DEF_RX = 35, DEF_RY = 45, DEF_RZ = 0, DEF_DEPTH = 0, DEF_SMOOTH = 32

/** Build a rotation matrix from Euler angles (degrees). Order: Y → X → Z */
function rotMatrix(rxDeg: number, ryDeg: number, rzDeg: number): (v: V3) => V3 {
  const toRad = Math.PI / 180
  const cx = Math.cos(rxDeg * toRad), sx = Math.sin(rxDeg * toRad)
  const cy = Math.cos(ryDeg * toRad), sy = Math.sin(ryDeg * toRad)
  const cz = Math.cos(rzDeg * toRad), sz = Math.sin(rzDeg * toRad)
  // Combined Rz * Rx * Ry
  const m00 = cz * cy + sz * sx * sy, m01 = -sz * cy + cz * sx * sy, m02 = cx * sy
  const m10 = sz * cx,                m11 = cz * cx,                  m12 = -sx
  const m20 = -cz * sy + sz * sx * cy, m21 = sz * sy + cz * sx * cy, m22 = cx * cy
  return ([x, y, z]) => [
    m00 * x + m01 * y + m02 * z,
    m10 * x + m11 * y + m12 * z,
    m20 * x + m21 * y + m22 * z,
  ]
}

/** Project rotated 3D point to 2D with optional perspective depth. */
function project(v: V3, cx: number, cy: number, depth: number): [number, number] {
  // depth 0 = orthographic, depth 1 = noticeable perspective
  // Perspective divides by (1 + z * factor), where factor scales with depth
  const perspFactor = depth * 0.003
  const scale = perspFactor > 0 ? 1 / (1 + v[2] * perspFactor) : 1
  return [cx + v[0] * scale, cy - v[1] * scale]
}


/** Darken/lighten a hex color by a factor (0–2, 1 = unchanged). */
function shadeHex(hex: string, factor: number): string {
  const c = hex.replace('#', '')
  const r = Math.min(255, Math.max(0, Math.round((parseInt(c.slice(0, 2), 16) || 0) * factor)))
  const g = Math.min(255, Math.max(0, Math.round((parseInt(c.slice(2, 4), 16) || 0) * factor)))
  const b = Math.min(255, Math.max(0, Math.round((parseInt(c.slice(4, 6), 16) || 0) * factor)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/** Light direction (normalized): upper-left, toward camera */
const LIGHT_DIR: V3 = (() => {
  const lx = -0.4, ly = 0.6, lz = -0.7
  const len = Math.sqrt(lx * lx + ly * ly + lz * lz)
  return [lx / len, ly / len, lz / len] as V3
})()

/** Reflect vector r = 2(n·l)n - l */
function reflect(n: V3, l: V3): V3 {
  const dot = n[0] * l[0] + n[1] * l[1] + n[2] * l[2]
  return [2 * dot * n[0] - l[0], 2 * dot * n[1] - l[1], 2 * dot * n[2] - l[2]]
}

interface MaterialShade {
  shade: number     // base color multiplier
  specular: number  // additive white highlight 0–1
  alpha: number     // opacity multiplier 0–1
}

/** Camera-relative shading from a rotated normal. Returns material-aware shade info.
 *  roughness 0–1: low = mirror-sharp specular, high = diffuse/soft (default 0.5)
 *  intensity 0–1: overall effect strength (default 0.5) */
function shadeFromNormal(n: V3, material: Material3D = 'default', roughness = 0.5, intensity = 0.5): MaterialShade {
  const len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1
  const nx = n[0] / len, ny = n[1] / len, nz = n[2] / len
  const norm: V3 = [nx, ny, nz]

  // Diffuse: dot(normal, light)
  const diffuse = Math.max(0, -(nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1] + nz * LIGHT_DIR[2]))
  // Facing camera factor
  const facing = Math.max(0, -nz)

  // View direction (camera looks toward +z in our setup, so view = [0,0,-1])
  const r = reflect(norm, LIGHT_DIR)
  const specRaw = Math.max(0, -(r[2]))  // dot(reflect, viewDir=[0,0,-1])

  switch (material) {
    case 'metal': {
      // roughness: low = mirror, high = brushed. intensity: reflectivity
      const specPow = 10 + (1 - roughness) * 60   // 10–70
      const specMul = 0.4 + intensity * 0.6        // 0.4–1.0
      const base = (0.1 + (1 - intensity) * 0.1) + diffuse * (0.5 + intensity * 0.2)
      const spec = Math.pow(specRaw, specPow) * specMul
      return { shade: base, specular: spec, alpha: 1 }
    }
    case 'plastic': {
      // roughness: specular size. intensity: highlight strength
      const specPow = 5 + (1 - roughness) * 25    // 5–30
      const specMul = 0.2 + intensity * 0.5        // 0.2–0.7
      const base = 0.3 + diffuse * 0.55
      const spec = Math.pow(specRaw, specPow) * specMul
      return { shade: base, specular: spec, alpha: 1 }
    }
    case 'marble': {
      // roughness: vein noise amount (handled in drawFaces). intensity: polish/specular
      const specPow = 15 + (1 - roughness) * 15   // 15–30
      const specMul = 0.1 + intensity * 0.3        // 0.1–0.4
      const base = 0.4 + diffuse * 0.4 + facing * 0.15
      const spec = Math.pow(specRaw, specPow) * specMul
      return { shade: base, specular: spec, alpha: 1 }
    }
    case 'glass': {
      // roughness: surface roughness. intensity: transparency
      const rim = 1 - facing
      const specPow = 10 + (1 - roughness) * 40   // 10–50
      const specMul = 0.3 + (1 - roughness) * 0.5 // 0.3–0.8
      const base = 0.5 + diffuse * 0.35
      const spec = Math.pow(specRaw, specPow) * specMul
      const alpha = (1 - intensity) * 0.3 + rim * (0.3 + intensity * 0.4)
      return { shade: base, specular: spec, alpha }
    }
    default: {
      // Original shading
      const topLeft = Math.max(0, ny * 0.3 + (-nx) * 0.15)
      return { shade: 0.3 + facing * 0.55 + topLeft * 0.25, specular: 0, alpha: 1 }
    }
  }
}

interface Face3D {
  verts: [number, number][]
  shade: MaterialShade
  depth: number
}

/** Simple 2D convex hull (Graham scan) for clip paths */
function convexHull(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}

/** Add a white specular highlight to a hex color */
function addSpecular(hex: string, specular: number): string {
  if (specular <= 0) return hex
  const c = hex.replace('#', '')
  const r = Math.min(255, Math.round((parseInt(c.slice(0, 2), 16) || 0) + specular * 255))
  const g = Math.min(255, Math.round((parseInt(c.slice(2, 4), 16) || 0) + specular * 255))
  const b = Math.min(255, Math.round((parseInt(c.slice(4, 6), 16) || 0) + specular * 255))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function drawFaces(
  dc: CanvasRenderingContext2D,
  faces: Face3D[],
  hex: string,
  opacity: number,
  material: Material3D,
  matRoughness: number,
  gradient?: Gradient,
  bx = 0, by = 0, bw = 0, bh = 0,
  shapeStroke?: ShapeStroke,
  artW = 0,
) {
  faces.sort((a, b) => b.depth - a.depth)

  // Pre-compute stroke settings once
  let strokeLw = 0, strokeJoin: CanvasLineJoin = 'miter'
  let strokeStyle: string | CanvasGradient = ''
  let strokeAlpha = 1
  if (shapeStroke) {
    const shapeSize = Math.max(bw, bh) || (artW || 1)
    strokeLw = shapeStroke.width * shapeSize
    strokeJoin = shapeStroke.join ?? 'miter'
    strokeStyle = shapeStroke.gradient
      ? makeGradient(dc, shapeStroke.gradient, bx, by, bw, bh)
      : shapeStroke.hex
    strokeAlpha = shapeStroke.gradient ? 1 : shapeStroke.opacity
  }

  // Draw back-to-front: each face's fill naturally occludes back-face edges
  for (const face of faces) {
    dc.beginPath()
    dc.moveTo(face.verts[0][0], face.verts[0][1])
    for (let i = 1; i < face.verts.length; i++) dc.lineTo(face.verts[i][0], face.verts[i][1])
    dc.closePath()

    const { shade, specular, alpha } = face.shade
    let fillStyle: string | CanvasGradient
    if (gradient) {
      const shadedGrad: Gradient = {
        ...gradient,
        stops: gradient.stops.map(s => ({ ...s, hex: addSpecular(shadeHex(s.hex, shade), specular) })),
      }
      fillStyle = makeGradient(dc, shadedGrad, bx, by, bw, bh)
    } else {
      fillStyle = addSpecular(shadeHex(hex, shade), specular)
    }

    // Fill face (skip in wireframe mode)
    if (!shapeStroke?.wireframe) {
      dc.globalAlpha = opacity * alpha
      dc.fillStyle = fillStyle
      dc.fill()
      if (!shapeStroke) {
        // Stroke each face with its own fill color to eliminate seam lines
        dc.strokeStyle = fillStyle
        dc.lineWidth = material === 'glass' ? 0.25 : 0.5
        dc.lineJoin = 'round'
        if (material === 'glass') dc.globalAlpha = opacity * alpha * 0.5
        dc.stroke()
      }
    }

    // Edge stroke per face — drawn right after the fill so the next face's
    // fill will cover any edges that should be hidden behind it
    if (shapeStroke) {
      dc.lineWidth = strokeLw
      dc.lineJoin = strokeJoin
      dc.lineCap = 'round'
      dc.strokeStyle = strokeStyle
      dc.globalAlpha = strokeAlpha
      dc.stroke()
    }
  }

  // Marble: overlay subtle vein noise onto the entire shape
  if (material === 'marble') {
    // Collect all projected vertices for a convex hull clip
    const allPts: [number, number][] = []
    for (const f of faces) for (const v of f.verts) allPts.push(v)
    const hull = convexHull(allPts)
    if (hull.length >= 3) {
      dc.save()
      dc.beginPath()
      dc.moveTo(hull[0][0], hull[0][1])
      for (let i = 1; i < hull.length; i++) dc.lineTo(hull[i][0], hull[i][1])
      dc.closePath()
      dc.clip()
      dc.globalAlpha = 0.05 + matRoughness * 0.2
      dc.globalCompositeOperation = 'overlay'
      const pat = dc.createPattern(_noiseCanvas, 'repeat')
      if (pat) { dc.fillStyle = pat; dc.fillRect(bx, by, bw, bh) }
      dc.restore()
    }
  }
}

// ── Shape generators (return raw V3 faces, before rotation/projection) ───────

interface RawFace { verts: V3[]; normal: V3 }

function cubeFaces(s: number): RawFace[] {
  // Scale down so the cube's projected size matches sphere/cylinder visually
  // (a cube's diagonal is sqrt(3)× its edge, so divide by ~1.7 to compensate)
  const h = s / 3.4
  // 6 faces with outward normals
  return [
    { verts: [[-h,-h,-h],[h,-h,-h],[h,h,-h],[-h,h,-h]], normal: [0,0,-1] },   // back
    { verts: [[-h,-h,h],[h,-h,h],[h,h,h],[-h,h,h]],     normal: [0,0,1] },    // front
    { verts: [[-h,-h,-h],[-h,-h,h],[-h,h,h],[-h,h,-h]], normal: [-1,0,0] },   // left
    { verts: [[h,-h,-h],[h,-h,h],[h,h,h],[h,h,-h]],     normal: [1,0,0] },    // right
    { verts: [[-h,h,-h],[h,h,-h],[h,h,h],[-h,h,h]],     normal: [0,1,0] },    // top
    { verts: [[-h,-h,-h],[h,-h,-h],[h,-h,h],[-h,-h,h]], normal: [0,-1,0] },   // bottom
  ]
}

function sphereFaces(radius: number, seg: number): RawFace[] {
  const faces: RawFace[] = []
  for (let i = 0; i < seg; i++) {
    const phi0 = (Math.PI * i) / seg
    const phi1 = (Math.PI * (i + 1)) / seg
    for (let j = 0; j < seg; j++) {
      const th0 = (2 * Math.PI * j) / seg
      const th1 = (2 * Math.PI * (j + 1)) / seg
      const v = (phi: number, th: number): V3 => [
        radius * Math.sin(phi) * Math.cos(th),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(th),
      ]
      const a = v(phi0, th0), b = v(phi1, th0), c = v(phi1, th1), d = v(phi0, th1)
      const nx = (a[0] + b[0] + c[0] + d[0]) / 4
      const ny = (a[1] + b[1] + c[1] + d[1]) / 4
      const nz = (a[2] + b[2] + c[2] + d[2]) / 4
      faces.push({ verts: [a, b, c, d], normal: [nx, ny, nz] })
    }
  }
  return faces
}

function cylinderFaces(radius: number, height: number, seg: number): RawFace[] {
  const faces: RawFace[] = []
  const h = height / 2
  // Side faces
  for (let i = 0; i < seg; i++) {
    const a0 = (2 * Math.PI * i) / seg
    const a1 = (2 * Math.PI * (i + 1)) / seg
    const c0 = Math.cos(a0), s0 = Math.sin(a0)
    const c1 = Math.cos(a1), s1 = Math.sin(a1)
    const nmx = (c0 + c1) / 2, nmz = (s0 + s1) / 2
    faces.push({
      verts: [
        [radius * c0, -h, radius * s0],
        [radius * c1, -h, radius * s1],
        [radius * c1, h, radius * s1],
        [radius * c0, h, radius * s0],
      ],
      normal: [nmx, 0, nmz],
    })
  }
  // Top cap
  const topVerts: V3[] = []
  for (let i = 0; i < seg; i++) {
    const a = (2 * Math.PI * i) / seg
    topVerts.push([radius * Math.cos(a), h, radius * Math.sin(a)])
  }
  faces.push({ verts: topVerts, normal: [0, 1, 0] })
  // Bottom cap
  const botVerts: V3[] = []
  for (let i = seg - 1; i >= 0; i--) {
    const a = (2 * Math.PI * i) / seg
    botVerts.push([radius * Math.cos(a), -h, radius * Math.sin(a)])
  }
  faces.push({ verts: botVerts, normal: [0, -1, 0] })
  return faces
}

function torusFaces(majorR: number, minorR: number, majSeg: number, minSeg: number): RawFace[] {
  const faces: RawFace[] = []
  for (let i = 0; i < majSeg; i++) {
    const t0 = (2 * Math.PI * i) / majSeg
    const t1 = (2 * Math.PI * (i + 1)) / majSeg
    for (let j = 0; j < minSeg; j++) {
      const p0 = (2 * Math.PI * j) / minSeg
      const p1 = (2 * Math.PI * (j + 1)) / minSeg
      const v = (t: number, p: number): V3 => [
        (majorR + minorR * Math.cos(p)) * Math.cos(t),
        minorR * Math.sin(p),
        (majorR + minorR * Math.cos(p)) * Math.sin(t),
      ]
      const a = v(t0, p0), b = v(t1, p0), c = v(t1, p1), d = v(t0, p1)
      // Normal = vertex - ring center
      const rcx = ((Math.cos(t0) + Math.cos(t1)) / 2) * majorR
      const rcz = ((Math.sin(t0) + Math.sin(t1)) / 2) * majorR
      const mid: V3 = [(a[0]+c[0])/2, (a[1]+c[1])/2, (a[2]+c[2])/2]
      faces.push({ verts: [a, b, c, d], normal: [mid[0]-rcx, mid[1], mid[2]-rcz] })
    }
  }
  return faces
}

export const SHAPE_3D_TYPES = new Set(['cube', 'sphere', 'cylinder', 'torus'])

/** Generate raw 3D faces for a shape type at given pixel dimensions. */
function generateRawFaces(type: string, pw: number, ph: number, seg: number): RawFace[] {
  const size = Math.min(pw, ph)
  if (type === 'cube')         return cubeFaces(size)
  if (type === 'sphere')       return sphereFaces(size / 2, seg)
  if (type === 'cylinder')     return cylinderFaces(size / 3, size * 0.7, seg)
  if (type === 'torus')        return torusFaces(size / 3, size / 8, Math.round(seg * 1.3), seg)
  return []
}

/** Compute the projected 2D bounding box of a 3D shape in artboard pixels.
 *  Returns [left, top, width, height] or null if not a 3D shape. */
export function get3DBounds(
  type: string,
  cx: number, cy: number, pw: number, ph: number,
  t: ShapeTransform | undefined,
): [number, number, number, number] | null {
  if (!SHAPE_3D_TYPES.has(type)) return null
  const rx = t?.rotateX ?? DEF_RX
  const ry = t?.rotateY ?? DEF_RY
  const rz = t?.rotateZ ?? DEF_RZ
  const depth = t?.depth ?? DEF_DEPTH
  const seg = Math.max(3, Math.min(128, Math.round(t?.smooth ?? DEF_SMOOTH)))
  const raw = generateRawFaces(type, pw, ph, seg)
  const rot = rotMatrix(rx, ry, rz)

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const f of raw) {
    for (const v of f.verts) {
      const rv = rot(v)
      const [sx, sy] = project(rv, cx, cy, depth)
      if (sx < minX) minX = sx; if (sx > maxX) maxX = sx
      if (sy < minY) minY = sy; if (sy > maxY) maxY = sy
    }
  }
  if (!isFinite(minX)) return null
  return [minX, minY, maxX - minX, maxY - minY]
}

/** Render a 3D shape. Returns the convex hull of projected vertices for clip paths. */
function render3DShape(
  dc: CanvasRenderingContext2D,
  type: string,
  cx: number, cy: number, pw: number, ph: number,
  hex: string, opacity: number,
  t: ShapeTransform | undefined,
  mat: Material3D,
  matRoughness: number,
  matIntensity: number,
  gradient?: Gradient,
  shapeStroke?: ShapeStroke,
  artW = 0,
): [number, number][] {
  const rx = t?.rotateX ?? DEF_RX
  const ry = t?.rotateY ?? DEF_RY
  const rz = t?.rotateZ ?? DEF_RZ
  const depth = t?.depth ?? DEF_DEPTH
  const baseSeg = Math.max(3, Math.min(128, Math.round(t?.smooth ?? DEF_SMOOTH)))
  // Glass needs higher tessellation so semi-transparent face seams are invisible
  const seg = mat === 'glass' ? Math.min(128, Math.round(baseSeg * 1.5)) : baseSeg
  const raw = generateRawFaces(type, pw, ph, seg)
  if (raw.length === 0) return []

  const rot = rotMatrix(rx, ry, rz)
  const faces: Face3D[] = []
  const allPts: [number, number][] = []
  for (const f of raw) {
    const rv = f.verts.map(rot)
    const rn = rot(f.normal)
    const pv = rv.map(v => project(v, cx, cy, depth))
    const shade = shadeFromNormal(rn, mat, matRoughness, matIntensity)
    let zSum = 0
    for (const v of rv) zSum += v[2]
    faces.push({ verts: pv, shade, depth: zSum / rv.length })
    for (const v of pv) allPts.push(v)
  }

  // Bounding box from projected vertices
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [vx, vy] of allPts) {
    if (vx < minX) minX = vx; if (vx > maxX) maxX = vx
    if (vy < minY) minY = vy; if (vy > maxY) maxY = vy
  }
  drawFaces(dc, faces, hex, opacity, mat, matRoughness, gradient, minX, minY, maxX - minX, maxY - minY, shapeStroke, artW)
  return convexHull(allPts)
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

      // ── Mask: render content clipped to mask shapes via destination-in ──
      if (shape.type === 'mask' && shape.mask?.length && shape.children?.length) {
        const maskCtx = getMaskCtx(ctx.canvas, physW, physH)
        maskCtx.setTransform(1, 0, 0, 1, 0, 0)
        maskCtx.clearRect(0, 0, physW, physH)
        maskCtx.setTransform(ctx.getTransform())

        // 1. Render content shapes onto offscreen canvas
        const contentLayer: Layer = {
          id: '_mask_content', name: '', visible: true, mode: 'manual',
          shapes: shape.children, query: '',
        }
        renderLayers2D(maskCtx, [contentLayer], artW, artH, false)

        // 2. Composite mask shapes with destination-in (alpha of mask determines what remains)
        maskCtx.save()
        maskCtx.globalCompositeOperation = 'destination-in'
        const maskLayer: Layer = {
          id: '_mask_shape', name: '', visible: true, mode: 'manual',
          shapes: shape.mask, query: '',
        }
        renderLayers2D(maskCtx, [maskLayer], artW, artH, false)
        maskCtx.restore()

        // 3. Composite result onto main canvas
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(_maskPool.get(ctx.canvas)!.canvas, 0, 0)
        ctx.restore()
        continue
      }

      const { type, color, geom, stroke, effects } = shape

      const px   = geom.x * artW
      const py   = geom.y * artH
      const pw   = geom.w * artW
      const ph   = geom.h * artW
      const left = px - pw / 2
      const top  = py - ph / 2

      // Sub-pixel bloat: expand filled rects by a tiny amount to eliminate
      // hairline seams between adjacent tiles caused by floating-point rounding.
      const BLOAT = 0.5  // half an artboard pixel — invisible but closes gaps

      // ── 3D shapes: isometric projection ──
      if (SHAPE_3D_TYPES.has(type)) {
        const shadowFx   = effects?.find((e: ShapeEffect) => e.type === 'shadow')
        const blurFx     = effects?.find((e: ShapeEffect) => e.type === 'blur')
        const noiseFx    = effects?.find((e: ShapeEffect) => e.type === 'noise')
        const bevelFx    = effects?.find((e: ShapeEffect) => e.type === 'bevel')
        const materialFx = effects?.find((e: ShapeEffect) => e.type === 'material')
        const mat: import('./types').Material3D = materialFx?.material ?? 'default'
        const matRoughness = materialFx?.roughness ?? 0.5
        const matIntensity = materialFx?.intensity ?? 0.5
        ctx.save()
        // Skip blur on 3D shapes — CSS filter blur is too expensive with many faces
        if (shadowFx) {
          ctx.shadowColor   = hexToRgba(shadowFx.color ?? '#000000', shadowFx.opacity ?? 0.5)
          ctx.shadowBlur    = shadowFx.blur    ?? 10
          ctx.shadowOffsetX = shadowFx.offsetX ?? 0
          ctx.shadowOffsetY = shadowFx.offsetY ?? 4
        }
        if (shape.transform) applyTransform(ctx, shape.transform, px, py)
        const hex = color.hex
        const opacity = color.gradient ? 1 : color.opacity
        const hull = render3DShape(ctx, type, px, py, pw, ph, hex, opacity, shape.transform, mat, matRoughness, matIntensity, color.gradient, stroke, artW)
        // Clear shadow/blur before post-draw effects
        ctx.shadowColor = 'transparent'
        ctx.filter = 'none'
        // Use convex hull of projected shape for clipping effects
        if (hull.length >= 3 && (noiseFx || bevelFx)) {
          const buildHullPath = () => {
            ctx.beginPath()
            ctx.moveTo(hull[0][0], hull[0][1])
            for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i][0], hull[i][1])
            ctx.closePath()
          }
          // Bounding box of hull
          let hx0 = Infinity, hy0 = Infinity, hx1 = -Infinity, hy1 = -Infinity
          for (const [vx, vy] of hull) {
            if (vx < hx0) hx0 = vx; if (vx > hx1) hx1 = vx
            if (vy < hy0) hy0 = vy; if (vy > hy1) hy1 = vy
          }
          if (bevelFx) applyBevel(ctx, buildHullPath, hx0, hy0, hx1 - hx0, hy1 - hy0, bevelFx.opacity ?? 0.6)
          if (noiseFx) applyNoise(ctx, buildHullPath, noiseFx.amount ?? 0.3)
        }
        ctx.restore()
        continue
      }

      const shadowFx = effects?.find((e: ShapeEffect) => e.type === 'shadow')
      const blurFx   = effects?.find((e: ShapeEffect) => e.type === 'blur')
      const bevelFx  = effects?.find((e: ShapeEffect) => e.type === 'bevel')
      const noiseFx  = effects?.find((e: ShapeEffect) => e.type === 'noise')
      const warpFx   = effects?.find((e: ShapeEffect) => e.type === 'warp')

      // For warp: draw to an isolated offscreen canvas (physical resolution, same
      // transform as ctx) so warp only distorts the shape's own pixels, then composite.
      let dc: CanvasRenderingContext2D
      if (warpFx) {
        dc = getWarpCtx(ctx.canvas, physW, physH)
        dc.setTransform(1, 0, 0, 1, 0, 0)      // identity so clearRect covers full physical canvas
        dc.clearRect(0, 0, physW, physH)
        dc.setTransform(ctx.getTransform())     // match main ctx scale for shape drawing
      } else {
        dc = ctx
      }

      // Build a (re-usable) path for filled shapes — uses dc
      // bloat: expand rect slightly to eliminate sub-pixel seams between adjacent tiles
      function buildShapePath(bloat = 0) {
        dc.beginPath()
        if (type === 'rect') {
          dc.rect(left - bloat, top - bloat, pw + bloat * 2, ph + bloat * 2)
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
      buildShapePath(BLOAT)
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
        // Composite warp canvas onto main canvas at 1:1 physical pixels
        const warpCanvas = _warpPool.get(ctx.canvas)!.canvas
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(warpCanvas, 0, 0)
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
