<script lang="ts">
  import type { Layer, Material3D, Pattern, PatternType, Shape, ShapeEffect, ShapeGeom } from '../lib/layers/types'
  import type { Palette } from '../lib/palettes/index'
  import { evaluateQuery, shapesToCode } from '../lib/query/index'
  import ColorPicker from './ColorPicker.svelte'
  import GradColorEditor from './GradColorEditor.svelte'
  import SliderRow from './SliderRow.svelte'

  const {
    artW,
    artH,
    layers,
    activeLayerId,
    activeShapeId,
    selectedShapeIds,
    activeTab,
    onTabChange,
    onAddLayer,
    onSelectLayer,
    onDeleteLayer,
    onToggleVisible,
    onRenameLayer,
    onMoveLayerTo,
    onUpdateLayerBg,
    onSetQuery,
    onSetMode,
    onAddShape,
    onSelectShape,
    onDeleteShape,
    onUpdateShape,
    onBatchUpdateShapes,
    onUpdateGeom,
    palettes,
    onAddPalette,
    onUpdatePalette,
    onDeletePalette,
    patterns,
    onAddPattern,
    onUpdatePattern,
    onDeletePattern,
  }: {
    artW: number
    artH: number
    layers: Layer[]
    activeLayerId: string | null
    activeShapeId: string | null
    selectedShapeIds: string[]
    activeTab: 'layers' | 'palettes' | 'patterns' | 'samples'
    onTabChange: (t: 'layers' | 'palettes' | 'patterns' | 'samples') => void
    onAddLayer: () => void
    onSelectLayer: (id: string) => void
    onDeleteLayer: (id: string) => void
    onToggleVisible: (id: string) => void
    onRenameLayer: (id: string, name: string) => void
    onMoveLayerTo: (srcId: string, targetId: string) => void
    onUpdateLayerBg: (layerId: string, bgColor: string | undefined) => void
    onSetQuery: (layerId: string, query: string) => void
    onSetMode: (layerId: string, mode: 'manual' | 'code') => void
    onAddShape: (layerId: string) => void
    onSelectShape: (shapeId: string) => void
    onDeleteShape: (layerId: string, shapeId: string) => void
    onUpdateShape: (layerId: string, shapeId: string, update: Partial<Shape>) => void
    onBatchUpdateShapes: (layerId: string, updates: Array<{ shapeId: string; patch: Partial<Shape> }>) => void
    onUpdateGeom: (layerId: string, shapeId: string, geom: ShapeGeom) => void
    palettes: Palette[]
    onAddPalette: () => void
    onUpdatePalette: (id: string, update: Partial<Palette>) => void
    onDeletePalette: (id: string) => void
    patterns: Pattern[]
    onAddPattern: (pattern: Pattern) => void
    onUpdatePattern: (id: string, update: Partial<Pattern>) => void
    onDeletePattern: (id: string) => void
  } = $props()

  /** Simple syntax highlight for stamp code previews — reuses CodeMirror CSS vars */
  function highlightCode(code: string): string {
    return code.replace(
      /\/\/.*|'[^']*'|"[^"]*"|`[^`]*`|\b(\d+\.?\d*)\b|\b(true|false|null|undefined|const|let|var|if|else|for|while|return|function)\b|([a-zA-Z_$]\w*)\s*(?=\()/g,
      (m, num, kw, fn) => {
        if (m.startsWith('//'))  return `<span style="color:var(--cm-comment);font-style:italic">${m}</span>`
        if (m.startsWith("'") || m.startsWith('"') || m.startsWith('`'))
          return `<span style="color:var(--cm-string)">${m}</span>`
        if (num !== undefined)   return `<span style="color:var(--cm-number)">${m}</span>`
        if (kw !== undefined)    return `<span style="color:var(--cm-keyword)">${m}</span>`
        if (fn !== undefined)    return `<span style="color:var(--cm-function)">${fn}</span>${m.slice(fn.length)}`
        return m
      }
    )
  }

  const activeLayer  = $derived(layers.find(l => l.id === activeLayerId) ?? null)
  const activeShape  = $derived(activeLayer?.shapes.find(s => s.id === activeShapeId) ?? null)
  const isCodeMode   = $derived(activeLayer?.mode === 'code')
  const stampPatterns = $derived(patterns.filter(p => p.code))
  const codeResult   = $derived(isCodeMode && activeLayer ? evaluateQuery(activeLayer.query, artW, artH, palettes, stampPatterns) : null)
  const selectedShapes = $derived(
    !isCodeMode && activeLayer ? activeLayer.shapes.filter(s => selectedShapeIds.includes(s.id)) : []
  )

  /** Apply a patch to all selected shapes (or just the active shape when only one is selected). */
  function forAll(mkPatch: (s: Shape) => Partial<Shape>) {
    if (!activeLayer || !activeShape) return
    if (selectedShapes.length > 1) {
      onBatchUpdateShapes(activeLayer.id, selectedShapes.map(s => ({ shapeId: s.id, patch: mkPatch(s) })))
    } else {
      onUpdateShape(activeLayer.id, activeShape.id, mkPatch(activeShape))
    }
  }

  /** Like forAll but only targets geom-based shapes and calls onUpdateGeom for single. */
  function forAllGeom(mkGeom: (s: Shape) => ShapeGeom) {
    if (!activeLayer || !activeShape) return
    if (selectedShapes.length > 1) {
      const geomShapes = selectedShapes.filter(s => s.type === 'rect' || s.type === 'ellipse' || s.type === 'arc'
        || s.type === 'cube' || s.type === 'sphere' || s.type === 'cylinder' || s.type === 'torus')
      if (geomShapes.length > 0)
        onBatchUpdateShapes(activeLayer.id, geomShapes.map(s => ({ shapeId: s.id, patch: { geom: mkGeom(s) } })))
    } else {
      onUpdateGeom(activeLayer.id, activeShape.id, mkGeom(activeShape))
    }
  }

  const geomKeys: { label: string; key: 'x' | 'y' | 'w' | 'h' }[] = [
    { label: 'X center', key: 'x' },
    { label: 'Y center', key: 'y' },
    { label: 'Width',    key: 'w' },
    { label: 'Height',   key: 'h' },
  ]

  // Inline rename state
  let editingId = $state<string | null>(null)
  let editingName = $state('')

  // Palette rename state
  let editingPaletteId   = $state<string | null>(null)
  let editingPaletteName = $state('')

  // Drag-to-reorder state
  let dragSrcId  = $state<string | null>(null)
  let dragOverId = $state<string | null>(null)

  // Shape list lazy loading
  const listShapes = $derived(isCodeMode ? (codeResult?.shapes ?? []) : (activeLayer?.shapes ?? []))
  let shapeListEl  = $state<HTMLDivElement | null>(null)
  let sentinelEl   = $state<HTMLDivElement | null>(null)
  let visibleEnd   = $state(50)

  $effect(() => {
    // Reset window when layer or total count changes
    activeLayerId; listShapes.length
    visibleEnd = 50
  })

  $effect(() => {
    if (!activeShapeId) return
    const idx = listShapes.findIndex(s => s.id === activeShapeId)
    if (idx === -1) return
    if (idx >= visibleEnd) visibleEnd = idx + 1
    // Wait for DOM to render the row
    setTimeout(() => {
      document.getElementById(`shape-row-${activeShapeId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 0)
  })

  $effect(() => {
    if (!sentinelEl || !shapeListEl) return
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) visibleEnd = Math.min(visibleEnd + 50, listShapes.length) },
      { root: shapeListEl },
    )
    io.observe(sentinelEl)
    return () => io.disconnect()
  })

  // ── Samples ───────────────────────────────────────────────────────────────
  const SAMPLES: { name: string; desc: string; code: string }[] = [
    {
      name: 'Noise Waves',
      desc: 'Horizontal splines warped by value noise',
      code: `// repeat(count, (i, t) => ...) — i: index, t: normalized 0→1
repeat(14, (i, a) => {
  beginSpline()
  repeat(80, (j, t) => {
    vertex(t, lerp(0.08, 0.92, a) + nz(t * 5 + i * 1.7) * 0.04)
  })
  endSpline(grad(90, palette('Aurora')), lerp(0.2, 0.9, a), 0.003)
})`,
    },
    {
      name: 'Dot Grid',
      desc: 'Noise-sized grid of circles from a palette',
      code: `// tile(cols, cb) — square tiles, rows auto-computed from aspect ratio
tile(14, (c, r, ct, rt) => {
  const n = nz(ct * 4, rt * 4)
  const sz = lerp(0.1, 0.4, n)
  ellipse((1 - sz) / 2, (1 - sz) / 2, sz, sz, palette('Neon', c + r), lerp(0.35, 1, n))
})`,
    },
    {
      name: 'Spiral',
      desc: 'Outward spiral of circles',
      code: `repeat(120, (i, t) => {
angle = t * TAU * 5
r = 0.04 + t * 0.42
s = 0.01 + t * 0.02
s2 = 0.01 + t * 0.05
px = 0.5 + cos(angle) * r
py = 0.5 + sin(angle) * r * W / H
ellipse(px - s2 / 2, py - sy(s2) / 2, s2, s2,
  palette('Aurora', i % 6), 1)
  ellipse(px- s / 2, py - sy(s) / 2, s, s,
  '#FFFFFF', 1)
})`,
    },
    {
      name: 'Burst',
      desc: 'Radial lines arranged in a ring',
      code: `// circular(n, cx, cy, r, (i, t, x, y, angle) => ...)
circular(48, 0.5, 0.5, 0.34, (i, t, x, y, angle) => {
  const ir = 0.08
  const x0 = 0.5 + cos(angle) * ir
  const y0 = 0.5 + sin(angle) * ir * W / H
  line(x0, y0, x, y, palette('Neon', i % 7), lerp(0.3, 0.85, t), 0.002)
})`,
    },
    {
      name: 'Woven',
      desc: 'Sine waves offset per row',
      code: `repeat(10, (i, a) => {
  beginSpline()
  repeat(60, (j, t) => {
    vertex(t, lerp(0.08, 0.92, a) + sin(t * TAU * 3 + i * 1.1) * 0.055)
  })
  endSpline(palette('Neon', i), lerp(0.4, 0.85, a), 0.04)
})`,
    },
    {
      name: 'Noise Tiles',
      desc: 'Rotated rectangles sized by noise',
      code: `tile(8, (c, r, ct, rt) => {
  const n = nz(ct * 3, rt * 3)
  const sz = lerp(0.4, 0.9, n)
  rect((1 - sz) / 2, (1 - sz) / 2, sz, sz,
    palette('Ember', floor(n * 6)), lerp(0.5, 1, n),
    rotate(n * 90))
}, { gapX: 0.003, gapY: 0.003 })`,
    },
    {
      name: 'Wave Dots',
      desc: 'Circles distributed along a sine wave',
      code: `// wave(n, amp, freq, (i, t, x, y) => ...) — x/y: center point on wave
wave(200, 0.28, 1.5, (i, t, x, y) => {
  s = 0.012 + nz(t * 6) * 0.016
  ellipse(x - s / 2, y - sy(s) / 2, s, s, palette('Ocean', i % 6), 1)
})`,
    },
    {
      name: 'Neon Cubes',
      desc: 'Cubes in a grid with sharp highlights',
      code: `tile(5, (c, r, ct, rt) => {
  cube(0, 0, 1, '#f6a95c', 1,
       rotate(random() * 100),
       stroke('#3be623', 1, 0.01), 
       shadow('#d24141', 4, 10, 0, 0))
})`,
    },
    {
      name: 'Material Mix',
      desc: 'Mixed materials and shapes scattered with noise',
      code: `const mats = ['metal', 'plastic', 'marble', 'glass']
repeat(30, (i, t) => {
  const nx = nz(i * 1.7, 0.3)
  const ny = nz(i * 2.3, 0.7)
  const s = lerp(0.03, 0.07, nz(i * 0.5))
  const shapes = [cube, sphere, torus]
  const shape = shapes[i % 3]
  shape(lerp(0.08, 0.92, nx) - s / 2, lerp(0.08, 0.92, ny) - sy(s) / 2, s,
    palette('Ember', i % 6), lerp(0.5, 0.95, t),
    transform({ rotateX: 30 + i * 7, rotateY: 45 + i * 11 }), material(mats[i % 4]))
})`,
    },
    {
      name: 'Tile Mosaic',
      desc: 'Repeating tile with mirrored alternation',
      code: `// tile(cols, cb) — square tiles, auto-adapted to viewport
tile(5, (c, r, ct, rt) => {
  rect(0.05, 0.05, 0.9, 0.9, palette('Aurora', c + r * 2), 0.7)
  ellipse(0.1, 0.1, 0.3, 0.3, '#fff', 0.4)
  ellipse(0.65, 0.65, 0.2, 0.2, '#000', 0.3)
  if ((c + r) % 2) mirror('x')
})`,
    },
    {
      name: 'Tile Weave',
      desc: 'Interlocking tile pattern with per-cell variation',
      code: `tile(6, (c, r, ct, rt) => {
  const n = nz(ct * 3, rt * 3)
  rect(0.075, 0.075, 0.85, 0.85, palette('Ocean', c + r), lerp(0.4, 0.9, n))
  line(0, 0.5, 1, 0.5, '#fff', 0.2 + n * 0.3, 0.01)
  line(0.5, 0, 0.5, 1, '#fff', 0.2 + n * 0.3, 0.01)
  if (r % 2) mirror('y')
}, { gapX: 0.005, gapY: 0.005 })`,
    },
    {
      name: 'Masked Gradient',
      desc: 'Diagonal gradient clipped to a circle',
      code: `// beginMask() → draw clip shape → endMask() → draw content → endClip()
beginMask()
  ellipse(0.15, 0.15, 0.7, 0.7, '#fff', 1)
endMask()
  rect(0, 0, 1, h(1), grad(135, '#8b5cf6', '#f97316', '#4ecdc4'), 1)
endClip()`,
    },
    {
      name: 'Mask Tiles',
      desc: 'Tiled circular windows over a striped background',
      code: `tile(5, (c, r, ct, rt) => {
  beginMask()
    ellipse(0.1, 0.1, 0.8, 0.8, '#fff', 1, shadow())
  endMask()
    rect(0, 0, 1, 1, palette('Sunset', c + r), 1)
    repeat(6, (i, t) => {
      rect(0, t * 0.95, 1, 0.08, '#fff', 0.3 + nz(ct * 3 + i) * 0.3)
    })
  endClip()
})`,
    },
  ]

  function loadSample(code: string) {
    if (!activeLayer) return
    onSetMode(activeLayer.id, 'code')
    onSetQuery(activeLayer.id, code)
  }

  // Template builder state
  let tpl        = $state<'single' | 'row' | 'grid' | 'spiral' | 'wave' | 'circular'>('row')
  let tplCount   = $state(8)
  let tplCols    = $state(4)
  let tplRows    = $state(4)
  let tplShape   = $state<'rect' | 'ellipse' | 'arc' | 'line' | 'curve' | 'triangle' | 'cube' | 'sphere' | 'cylinder' | 'torus'>('rect')
  let tplColor   = $state('#8b5cf6')
  let tplOpacity = $state(0.85)

  function buildTemplate(): string {
    const color = `'${tplColor}'`
    const op = tplOpacity.toFixed(2)
    const s  = tplShape
    const n  = tplCount
    const nc = tplCols
    const nr = tplRows

    // 3D shapes use size-based API (cube/sphere/torus) or w,h (cylinder)
    const is3D = s === 'cube' || s === 'sphere' || s === 'cylinder' || s === 'torus'

    if (tpl === 'single') {
      if (s === 'arc')      return `arc(0.3, 0.3, 0.2, 0, 270, ${color}, ${op})`
      if (s === 'line')     return `line(0.1, 0.5, 0.9, 0.5, ${color}, ${op})`
      if (s === 'curve')    return `curve(0.1, 0.5, 0.5, 0.1, 0.9, 0.5, ${color}, ${op})`
      if (s === 'triangle') return `triangle(0.5, 0.1, 0.2, 0.9, 0.8, 0.9, ${color}, ${op})`
      if (s === 'cylinder') return `cylinder(0.35, 0.3, 0.25, 0.35, ${color}, ${op})`
      if (is3D)             return `${s}(0.3, 0.3, 0.35, ${color}, ${op})`
      return `${s}(0.15, 0.15, 0.7, 0.7, ${color}, ${op})`
    }

    if (tpl === 'row') {
      if (s === 'rect' || s === 'ellipse')
        return `repeat(${n}, (i, t) => {\n  const sw = 0.85 / ${n}\n  ${s}((i + 0.5) / ${n} - sw / 2, 0.3, sw, 0.4, ${color}, ${op})\n})`
      if (s === 'arc')
        return `repeat(${n}, (i, t) => {\n  const r = 0.4 / ${n}\n  arc((i + 0.5) / ${n} - r, 0.35, r, 0, 270, ${color}, ${op})\n})`
      if (s === 'line')
        return `repeat(${n}, (i, t) => {\n  line(0.1, (i + 0.5) / ${n}, 0.9, (i + 0.5) / ${n}, ${color}, ${op})\n})`
      if (s === 'curve')
        return `repeat(${n}, (i, t) => {\n  const y = (i + 0.5) / ${n}\n  curve(0.1, y - 0.06, 0.5, y + 0.06, 0.9, y - 0.06, ${color}, ${op})\n})`
      if (s === 'cylinder')
        return `repeat(${n}, (i, t) => {\n  const sw = 0.7 / ${n}\n  cylinder((i + 0.5) / ${n} - sw / 2, 0.35, sw, 0.3, ${color}, ${op})\n})`
      if (is3D)
        return `repeat(${n}, (i, t) => {\n  const sz = 0.8 / ${n}\n  ${s}((i + 0.5) / ${n} - sz / 2, 0.35, sz, ${color}, ${op})\n})`
      return `repeat(${n}, (i, t) => {\n  const cx = (i + 0.5) / ${n}\n  const d = 1/${n} * 0.4\n  triangle(cx, 0.5 - d, cx - d, 0.5 + d, cx + d, 0.5 + d, ${color}, ${op})\n})`
    }

    if (tpl === 'grid') {
      if (s === 'rect' || s === 'ellipse')
        return `grid(${nc}, ${nr}, (c, r) => {\n  const sw = 0.85 / ${nc}\n  const sh = 0.85 / ${nr}\n  ${s}((c + 0.5) / ${nc} - sw / 2, (r + 0.5) / ${nr} - sy(sh) / 2, sw, sh, ${color}, ${op})\n})`
      if (s === 'arc')
        return `grid(${nc}, ${nr}, (c, r) => {\n  const rad = 0.4 / ${nc}\n  arc((c + 0.5) / ${nc} - rad, (r + 0.5) / ${nr} - sy(rad) / 2, rad, 0, 270, ${color}, ${op})\n})`
      if (s === 'line')
        return `grid(${nc}, ${nr}, (c, r) => {\n  const x = (c + 0.5) / ${nc}\n  const y = (r + 0.5) / ${nr}\n  const d = 1/${nc} * 0.4\n  line(x - d, y, x + d, y, ${color}, ${op})\n})`
      if (s === 'curve')
        return `grid(${nc}, ${nr}, (c, r) => {\n  const x = (c + 0.5) / ${nc}\n  const y = (r + 0.5) / ${nr}\n  const d = 1/${nc} * 0.4\n  curve(x - d, y, x, y - d, x + d, y, ${color}, ${op})\n})`
      if (s === 'cylinder')
        return `grid(${nc}, ${nr}, (c, r) => {\n  const sw = 0.7 / ${nc}\n  const sh = 0.7 / ${nr}\n  cylinder((c + 0.5) / ${nc} - sw / 2, (r + 0.5) / ${nr} - sy(sh) / 2, sw, sh, ${color}, ${op})\n})`
      if (is3D)
        return `grid(${nc}, ${nr}, (c, r) => {\n  const sz = 0.8 / ${Math.max(nc, nr)}\n  ${s}((c + 0.5) / ${nc} - sz / 2, (r + 0.5) / ${nr} - sy(sz) / 2, sz, ${color}, ${op})\n})`
      return `grid(${nc}, ${nr}, (c, r) => {\n  const x = (c + 0.5) / ${nc}\n  const y = (r + 0.5) / ${nr}\n  const d = 1/${nc} * 0.4\n  triangle(x, y - d, x - d, y + d, x + d, y + d, ${color}, ${op})\n})`
    }

    // spiral
    if (tpl === 'spiral') {
      if (s === 'rect' || s === 'ellipse')
        return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  const sz = 0.03 + t * 0.05\n  const px = 0.5 + cos(angle) * r\n  const py = 0.5 + sin(angle) * r * W / H\n  ${s}(px - sz / 2, py - sy(sz) / 2, sz, sz, ${color}, ${op})\n})`
      if (s === 'arc')
        return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  const sz = 0.03 + t * 0.05\n  const px = 0.5 + cos(angle) * r\n  const py = 0.5 + sin(angle) * r * W / H\n  arc(px - sz, py - sy(sz * 2) / 2, sz, 0, 270, ${color}, ${op})\n})`
      if (s === 'line')
        return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  const px = 0.5 + cos(angle) * r\n  const py = 0.5 + sin(angle) * r * W / H\n  const len = 0.015 + t * 0.025\n  const nx = cos(angle + PI / 2) * len\n  const ny = sin(angle + PI / 2) * len\n  line(px - nx, py - ny, px + nx, py + ny, ${color}, ${op})\n})`
      if (s === 'curve')
        return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  const px = 0.5 + cos(angle) * r\n  const py = 0.5 + sin(angle) * r * W / H\n  const d = 0.03 + t * 0.04\n  curve(px - d, py, px, py - d, px + d, py, ${color}, ${op})\n})`
      if (s === 'cylinder')
        return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  const sz = 0.04 + t * 0.06\n  const px = 0.5 + cos(angle) * r\n  const py = 0.5 + sin(angle) * r * W / H\n  cylinder(px - sz * 0.35, py - sy(sz) / 2, sz * 0.7, sz, ${color}, ${op})\n})`
      if (is3D)
        return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  const sz = 0.04 + t * 0.06\n  const px = 0.5 + cos(angle) * r\n  const py = 0.5 + sin(angle) * r * W / H\n  ${s}(px - sz / 2, py - sy(sz) / 2, sz, ${color}, ${op})\n})`
      return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  const px = 0.5 + cos(angle) * r\n  const py = 0.5 + sin(angle) * r * W / H\n  const d = 0.02 + t * 0.03\n  triangle(px, py - d, px - d, py + d, px + d, py + d, ${color}, ${op})\n})`
    }

    // wave
    if (tpl === 'wave') {
      if (s === 'rect' || s === 'ellipse')
        return `wave(${n}, 0.2, 1.5, (i, t, x, y) => {\n  const sz = 0.7 / ${n}\n  ${s}(x - sz / 2, y - sy(sz) / 2, sz, sz, ${color}, ${op})\n})`
      if (s === 'arc')
        return `wave(${n}, 0.2, 1.5, (i, t, x, y) => {\n  const r = 0.35 / ${n}\n  arc(x - r, y - sy(r * 2) / 2, r, 0, 270, ${color}, ${op})\n})`
      if (s === 'line')
        return `wave(${n}, 0.2, 1.5, (i, t, x, y) => {\n  line(x - 0.02, y, x + 0.02, y, ${color}, ${op})\n})`
      if (s === 'curve')
        return `wave(${n}, 0.2, 1.5, (i, t, x, y) => {\n  const d = 1/${n} * 0.3\n  curve(x - d, y, x, y - d, x + d, y, ${color}, ${op})\n})`
      if (s === 'cylinder')
        return `wave(${n}, 0.2, 1.5, (i, t, x, y) => {\n  const sw = 0.5 / ${n}\n  const sh = 0.7 / ${n}\n  cylinder(x - sw / 2, y - sy(sh) / 2, sw, sh, ${color}, ${op})\n})`
      if (is3D)
        return `wave(${n}, 0.2, 1.5, (i, t, x, y) => {\n  const sz = 0.7 / ${n}\n  ${s}(x - sz / 2, y - sy(sz) / 2, sz, ${color}, ${op})\n})`
      return `wave(${n}, 0.2, 1.5, (i, t, x, y) => {\n  const d = 1/${n} * 0.35\n  triangle(x, y - d, x - d, y + d, x + d, y + d, ${color}, ${op})\n})`
    }

    // circular
    if (s === 'rect' || s === 'ellipse')
      return `circular(${n}, 0.5, 0.5, 0.32, (i, t, x, y, angle) => {\n  ${s}(x - 0.04, y - sy(0.08) / 2, 0.08, 0.08, ${color}, ${op})\n})`
    if (s === 'arc')
      return `circular(${n}, 0.5, 0.5, 0.32, (i, t, x, y, angle) => {\n  arc(x - 0.04, y - sy(0.08) / 2, 0.04, 0, 270, ${color}, ${op})\n})`
    if (s === 'line')
      return `circular(${n}, 0.5, 0.5, 0.32, (i, t, x, y, angle) => {\n  const nx = cos(angle) * 0.03\n  const ny = sin(angle) * 0.03\n  line(x - nx, y - ny, x + nx, y + ny, ${color}, ${op})\n})`
    if (s === 'curve')
      return `circular(${n}, 0.5, 0.5, 0.32, (i, t, x, y, angle) => {\n  const d = 0.04\n  curve(x - d, y, x, y - d, x + d, y, ${color}, ${op})\n})`
    if (s === 'cylinder')
      return `circular(${n}, 0.5, 0.5, 0.32, (i, t, x, y, angle) => {\n  cylinder(x - 0.03, y - sy(0.08) / 2, 0.06, 0.08, ${color}, ${op})\n})`
    if (is3D)
      return `circular(${n}, 0.5, 0.5, 0.32, (i, t, x, y, angle) => {\n  ${s}(x - 0.04, y - sy(0.08) / 2, 0.08, ${color}, ${op})\n})`
    return `circular(${n}, 0.5, 0.5, 0.32, (i, t, x, y, angle) => {\n  const d = 0.03\n  triangle(x, y - d, x - d, y + d, x + d, y + d, ${color}, ${op})\n})`
  }

  // ── Pattern helpers ────────────────────────────────────────────────────────
  function buildPatternCode(p: Pattern): string {
    // Temporarily set template state from pattern, call buildTemplate, restore
    const prevTpl = tpl, prevCount = tplCount, prevCols = tplCols, prevRows = tplRows
    const prevShape = tplShape, prevColor = tplColor, prevOpacity = tplOpacity
    tpl = p.type; tplCount = p.count; tplCols = p.cols; tplRows = p.rows
    tplShape = p.shape as typeof tplShape; tplColor = p.color; tplOpacity = p.opacity
    const code = buildTemplate()
    tpl = prevTpl; tplCount = prevCount; tplCols = prevCols; tplRows = prevRows
    tplShape = prevShape; tplColor = prevColor; tplOpacity = prevOpacity
    return code
  }

  function loadPattern(p: Pattern) {
    if (!activeLayer) return
    const code = p.code ? `stamp('${p.name}')` : buildPatternCode(p)
    onSetMode(activeLayer.id, 'code')
    const existing = activeLayer.query.trimEnd()
    onSetQuery(activeLayer.id, existing ? existing + '\n' + code : code)
  }

  function saveCurrentAsPattern() {
    onAddPattern({
      id: '',
      name: `Pattern ${patterns.filter(p => !p.builtin).length + 1}`,
      type: tpl,
      shape: tplShape,
      color: tplColor,
      opacity: tplOpacity,
      count: tplCount,
      cols: tplCols,
      rows: tplRows,
    })
  }

  /** Shift shapes so their bounding-box center sits at (0.5, 0.5). */
  function normalizeToCenter(shapes: Shape[]): Shape[] {
    if (shapes.length === 0) return shapes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const s of shapes) {
      if (s.pts && s.type !== 'arc') {
        for (let i = 0; i < s.pts.length; i += 2) {
          minX = Math.min(minX, s.pts[i]); maxX = Math.max(maxX, s.pts[i])
          minY = Math.min(minY, s.pts[i + 1]); maxY = Math.max(maxY, s.pts[i + 1])
        }
      } else {
        const hw = s.geom.w / 2, hh = s.geom.h / 2
        minX = Math.min(minX, s.geom.x - hw); maxX = Math.max(maxX, s.geom.x + hw)
        minY = Math.min(minY, s.geom.y - hh); maxY = Math.max(maxY, s.geom.y + hh)
      }
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    const dx = 0.5 - cx, dy = 0.5 - cy
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return shapes
    return shapes.map(s => {
      const out = { ...s, geom: { ...s.geom, x: s.geom.x + dx, y: s.geom.y + dy } }
      if (s.pts && s.type !== 'arc') {
        out.pts = s.pts.map((v, i) => i % 2 === 0 ? v + dx : v + dy)
      }
      return out
    })
  }

  function saveSelectedAsStamp() {
    if (!activeLayer || selectedShapes.length === 0) return
    const code = shapesToCode(normalizeToCenter(selectedShapes), artW, artH)
    onAddPattern({
      id: '',
      name: `Stamp ${patterns.filter(p => !p.builtin).length + 1}`,
      type: 'single',
      shape: 'rect',
      color: '#8b5cf6',
      opacity: 1,
      count: 1,
      cols: 1,
      rows: 1,
      code,
    })
  }

  function saveCodeAsStamp() {
    if (!activeLayer || !isCodeMode || !activeLayer.query.trim()) return
    onAddPattern({
      id: '',
      name: `Stamp ${patterns.filter(p => !p.builtin).length + 1}`,
      type: 'single',
      shape: 'rect',
      color: '#8b5cf6',
      opacity: 1,
      count: 1,
      cols: 1,
      rows: 1,
      code: activeLayer.query.trim(),
    })
  }

  let editingPatternId = $state<string | null>(null)
  let editingPatternName = $state('')
  let editingStampCode = $state<string | null>(null)
  let editingStampCodeValue = $state('')

  const PATTERN_TYPE_LABELS: Record<PatternType, string> = {
    single: 'Single', row: 'Row', grid: 'Grid',
    spiral: 'Spiral', wave: 'Wave', circular: 'Circular',
  }

  const SHAPE_ICONS: Record<string, string> = {
    rect: '▭', ellipse: '◯', arc: '◜', line: '╱', curve: '∿',
    triangle: '△', cube: '⬡', sphere: '●', cylinder: '⬮', torus: '◎',
  }

  // ── Shape effect helpers ───────────────────────────────────────────────────
  function toggleFx(type: ShapeEffect['type'], defaults: Partial<ShapeEffect>) {
    if (!activeLayer || !activeShape) return
    const has = activeShape.effects?.some(e => e.type === type)
    onUpdateShape(activeLayer.id, activeShape.id, {
      effects: has
        ? (activeShape.effects ?? []).filter(e => e.type !== type)
        : [...(activeShape.effects ?? []), { type, ...defaults } as ShapeEffect],
    })
  }

  function setFx(type: ShapeEffect['type'], update: Partial<ShapeEffect>) {
    if (!activeLayer || !activeShape?.effects) return
    onUpdateShape(activeLayer.id, activeShape.id, {
      effects: activeShape.effects.map(e => e.type === type ? { ...e, ...update } : e),
    })
  }

  function startRename(layer: Layer) {
    editingId   = layer.id
    editingName = layer.name
  }

  function commitRename() {
    if (editingId && editingName.trim()) onRenameLayer(editingId, editingName.trim())
    editingId = null
  }

  function onRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter')  commitRename()
    if (e.key === 'Escape') editingId = null
  }
</script>

<aside class="panel">
  <!-- Tab bar -->
  <div class="tab-bar">
    <button
      class="tab-btn"
      class:active={activeTab === 'layers'}
      onclick={() => onTabChange('layers')}
    >Layers</button>
    <button
      class="tab-btn"
      class:active={activeTab === 'palettes'}
      onclick={() => onTabChange('palettes')}
    >Palettes</button>
    <button
      class="tab-btn"
      class:active={activeTab === 'patterns'}
      onclick={() => onTabChange('patterns')}
    >Patterns</button>
    <button
      class="tab-btn"
      class:active={activeTab === 'samples'}
      onclick={() => onTabChange('samples')}
    >Samples</button>
  </div>

  <!-- ── Layers tab ── -->
  {#if activeTab === 'layers'}
    <section class="section">
      <!-- Layer stack (reversed: top of list = front) -->
      <div class="layer-list">
        {#each [...layers].reverse() as layer (layer.id)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="layer-row"
            class:selected={layer.id === activeLayerId}
            class:drag-over={layer.id === dragOverId && layer.id !== dragSrcId}
            class:drag-src={layer.id === dragSrcId}
            draggable="true"
            onclick={() => onSelectLayer(layer.id)}
            ondragstart={() => { dragSrcId = layer.id }}
            ondragover={(e) => { e.preventDefault(); dragOverId = layer.id }}
            ondrop={(e) => { e.preventDefault(); if (dragSrcId) onMoveLayerTo(dragSrcId, layer.id); dragSrcId = null; dragOverId = null }}
            ondragend={() => { dragSrcId = null; dragOverId = null }}
          >
            <!-- Drag handle -->
            <span class="drag-handle" title="Drag to reorder">⠿</span>

            <!-- Eye toggle -->
            <button
              class="icon-btn"
              title={layer.visible ? 'Hide' : 'Show'}
              onclick={(e) => { e.stopPropagation(); onToggleVisible(layer.id) }}
            >{layer.visible ? '👁' : '○'}</button>

            <!-- Shape count badge -->
            <span class="shape-badge">{layer.mode === 'code' && layer.query.trim()
              ? evaluateQuery(layer.query, artW, artH, palettes, stampPatterns).shapes.length
              : layer.shapes.length}</span>

            <!-- Name (or rename input) -->
            {#if editingId === layer.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                class="rename-input"
                bind:value={editingName}
                onblur={commitRename}
                onkeydown={onRenameKeydown}
                autofocus
                onclick={(e) => e.stopPropagation()}
              />
            {:else}
              <span
                class="layer-name"
                ondblclick={(e) => { e.stopPropagation(); startRename(layer) }}
              >{layer.name}</span>
            {/if}

            <!-- Delete -->
            <button
              class="icon-btn delete-btn"
              title="Delete layer"
              onclick={(e) => { e.stopPropagation(); onDeleteLayer(layer.id) }}
            >×</button>
          </div>
        {/each}
      </div>

      <button class="add-layer-btn" onclick={() => onAddLayer()}>+ Add layer</button>
    </section>

    <!-- Layer background color (shown when a layer is selected) -->
    {#if activeLayer}
      <section class="section">
        <h2 class="section-title">Background</h2>
        <div class="prop-row">
          <div class="color-control">
            <input
              type="checkbox"
              checked={activeLayer.bgColor !== undefined}
              onchange={(e) => onUpdateLayerBg(
                activeLayer.id,
                (e.target as HTMLInputElement).checked ? '#1a1a2e' : undefined
              )}
            />
            {#if activeLayer.bgColor !== undefined}
              <ColorPicker
                hex={activeLayer.bgColor}
                showOpacity={false}
                onChange={(h) => onUpdateLayerBg(activeLayer.id, h)}
              />
              <span class="prop-label" style:flex="1" style:font-family="monospace">{activeLayer.bgColor}</span>
            {:else}
              <span class="prop-label" style:flex="1">None</span>
            {/if}
          </div>
        </div>
      </section>
    {/if}

    <!-- Mode toggle -->
    {#if activeLayer}
      <section class="section">
        <div class="mode-toggle">
          <button
            class="mode-btn"
            class:active={!isCodeMode}
            onclick={() => onSetMode(activeLayer.id, 'manual')}
          >Manual</button>
          <button
            class="mode-btn"
            class:active={isCodeMode}
            onclick={() => onSetMode(activeLayer.id, 'code')}
          >Code</button>
        </div>
      </section>
    {/if}

    <!-- Template builder (code mode) -->
    {#if activeLayer && isCodeMode}
      <section class="section">
        <h2 class="section-title">Template</h2>

        <!-- Pattern type -->
        <div class="tpl-tabs">
          {#each [['single','1'], ['row','↔'], ['grid','⊞'], ['spiral','◌'], ['wave','∿'], ['circular','◎']] as [id, icon]}
            <button
              class="tpl-btn"
              class:active={tpl === id}
              title={id}
              onclick={() => tpl = id as typeof tpl}
            >{icon}</button>
          {/each}
        </div>

        <!-- Count (row / spiral) -->
        {#if tpl === 'row' || tpl === 'spiral' || tpl === 'wave' || tpl === 'circular'}
          <SliderRow id="tpl-count" label="Count" min={1} max={100} step={1} value={tplCount} onchange={(v) => tplCount = v} />
        {/if}

        <!-- Cols × Rows (grid) -->
        {#if tpl === 'grid'}
          <div class="tpl-grid-dims">
            <label class="tpl-dim-label">Cols × Rows</label>
            <div class="tpl-grid-row">
              <input id="tpl-cols" class="num-input" type="number" min="1" max="50" bind:value={tplCols} />
              <span class="tpl-x">×</span>
              <input class="num-input" type="number" min="1" max="50" bind:value={tplRows} />
            </div>
          </div>
        {/if}

        <!-- Shape type -->
        {#if true}
          <div class="shape-list" style:margin-top="8px" style:margin-bottom="8px">
            {#each ([['rect','▭','Rect'],['ellipse','◯','Ellipse'],['arc','◜','Arc'],['line','╱','Line'],['curve','∿','Curve'],['triangle','△','Triangle'],['cube','⬡','Cube'],['sphere','●','Sphere'],['cylinder','⬮','Cylinder'],['torus','◎','Torus']] as const) as [val, icon, label]}
              <button class="shape-list-item" class:active={tplShape === val} onclick={() => tplShape = val as typeof tplShape}>
                <span class="shape-list-icon">{icon}</span>{label}
              </button>
            {/each}
          </div>
        {/if}

        <!-- Color + opacity -->
        <div class="prop-row">
          <label class="prop-label">Color</label>
          <div class="color-control">
            <ColorPicker
              hex={tplColor}
              opacity={tplOpacity}
              onChange={(h, op) => { tplColor = h; tplOpacity = op }}
            />
            <span class="tpl-hex">{tplColor}</span>
          </div>
        </div>
        <SliderRow id="tpl-opacity" label="Opacity" min={0} max={1} step={0.01} value={tplOpacity} onchange={(v) => tplOpacity = v} style="margin-bottom:10px" />

        <button
          class="insert-btn"
          onclick={() => {
            if (!activeLayer) return
            const existing = activeLayer.query.trimEnd()
            onSetQuery(activeLayer.id, existing ? existing + '\n' + buildTemplate() : buildTemplate())
          }}
        >Insert code</button>
      </section>
    {/if}


    <!-- Shapes sub-list (manual + code mode) -->
    {#if activeLayer}
      <section class="section">
        <h2 class="section-title">Shapes {#if listShapes.length > 0}<span class="shape-count">{listShapes.length}</span>{/if}</h2>
        <div class="layer-shapes" bind:this={shapeListEl}>
          {#each listShapes.slice(0, visibleEnd) as shape, i (shape.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              id="shape-row-{shape.id}"
              class="shape-row"
              class:selected={!isCodeMode && selectedShapeIds.includes(shape.id)}
              onclick={() => { if (!isCodeMode) onSelectShape(shape.id) }}
            >
              <span class="shape-type-badge">{ ({rect:'▭',ellipse:'◯',arc:'◜',line:'╱',curve:'∿',triangle:'△',spline:'〜',cube:'⬡',sphere:'●',cylinder:'⏣',torus:'◎',group:'▦',mask:'◩'} as Record<string,string>)[shape.type] }</span>
              <span class="shape-auto-name">
                { ({rect:'Rect',ellipse:'Ellipse',arc:'Arc',line:'Line',curve:'Curve',triangle:'Triangle',spline:'Spline',cube:'Cube',sphere:'Sphere',cylinder:'Cylinder',torus:'Torus',group:'Group',mask:'Mask'} as Record<string,string>)[shape.type] } {i + 1}
              </span>
              {#if !isCodeMode}
                <button
                  class="icon-btn delete-btn"
                  title="Delete shape"
                  onclick={(e) => { e.stopPropagation(); onDeleteShape(activeLayer.id, shape.id) }}
                >×</button>
              {/if}
            </div>
          {/each}
          {#if visibleEnd < listShapes.length}
            <div bind:this={sentinelEl} class="shape-list-sentinel"></div>
          {/if}
        </div>
        {#if !isCodeMode}
          <button class="add-layer-btn" onclick={() => onAddShape(activeLayer.id)}>+ Add shape</button>
        {/if}
      </section>
    {/if}

    <!-- Shape properties (manual mode, shape selected) -->
    {#if activeLayer && activeShape && !isCodeMode}
      <section class="section">
        <h2 class="section-title">Shape</h2>

        <!-- Shape type list -->
        <div class="shape-list">
          {#each ([
            ['rect',     '▭', 'Rect',     undefined],
            ['ellipse',  '◯', 'Ellipse',  undefined],
            ['arc',      '◜', 'Arc',      [0, 270]],
            ['line',     '╱', 'Line',     [0.2,0.5,0.8,0.5]],
            ['curve',    '∿', 'Curve',    [0.2,0.5,0.5,0.1,0.8,0.5]],
            ['triangle', '△', 'Triangle', [0.5,0.1,0.2,0.9,0.8,0.9]],
            ['cube',     '⬡', 'Cube',     undefined],
            ['sphere',   '●', 'Sphere',   undefined],
            ['cylinder', '⬮', 'Cylinder', undefined],
            ['torus',    '◎', 'Torus',    undefined],
          ] as const) as [type, icon, label, defaultPts]}
            <button class="shape-list-item" class:active={activeShape.type === type}
              onclick={() => onUpdateShape(activeLayer.id, activeShape.id, {
                type, pts: defaultPts ? (activeShape.pts ?? [...defaultPts]) : undefined
              })}>
              <span class="shape-list-icon">{icon}</span>{label}
            </button>
          {/each}
        </div>

        <!-- Color + opacity -->
        <div class="prop-row">
          <label class="prop-label">Color</label>
          <GradColorEditor
            color={activeShape.color}
            onChange={(c) => forAll(() => ({ color: c }))}
          />
        </div>

        <!-- Stroke (rect / ellipse / arc / triangle / 3D shapes) -->
        {#if activeShape.type !== 'line' && activeShape.type !== 'curve'}
          <div class="prop-row" style:margin-top="10px">
            <label class="prop-label">Stroke</label>
            <div class="color-control">
              <input
                type="checkbox"
                checked={!!activeShape.stroke}
                onchange={(e) => forAll(s => ({
                  stroke: (e.target as HTMLInputElement).checked
                    ? (s.stroke ?? { hex: '#000000', opacity: 1, width: 0.005 })
                    : undefined
                }))}
              />
            </div>
          </div>
          {#if activeShape.stroke}
            <GradColorEditor
              color={{ hex: activeShape.stroke.hex, opacity: activeShape.stroke.opacity, gradient: activeShape.stroke.gradient }}
              onChange={(c) => forAll(s => s.stroke ? { stroke: { ...s.stroke, hex: c.hex, opacity: c.opacity, gradient: c.gradient } } : {})}
            />
            {@const sk = activeShape.stroke}
            {@const is3DStroke = activeShape.type === 'cube' || activeShape.type === 'sphere' || activeShape.type === 'cylinder' || activeShape.type === 'torus'}
            <SliderRow id="stroke-width" label="Width"
              min={is3DStroke ? 0.0005 : 0.0002}
              max={is3DStroke ? 0.015 : 0.05}
              step={is3DStroke ? 0.0005 : 0.0002}
              value={sk.width}
              onchange={(v) => forAll(s => s.stroke ? { stroke: { ...s.stroke, width: v } } : {})}
            />
            <div class="prop-row">
              <label class="prop-label">Align</label>
              <div class="mini-toggle">
                {#each (['center','inner','outer'] as const) as a}
                  <button class="mini-btn" class:active={( sk.align ?? 'center') === a}
                    onclick={() => forAll(s => s.stroke ? { stroke: { ...s.stroke, align: a } } : {})}
                  >{a}</button>
                {/each}
              </div>
            </div>
            <div class="prop-row">
              <label class="prop-label">Join</label>
              <div class="mini-toggle">
                {#each (['miter','round','bevel'] as const) as j}
                  <button class="mini-btn" class:active={(sk.join ?? 'miter') === j}
                    onclick={() => forAll(s => s.stroke ? { stroke: { ...s.stroke, join: j } } : {})}
                  >{j}</button>
                {/each}
              </div>
            </div>
            {#if is3DStroke}
              <div class="prop-row">
                <label class="prop-label">Wireframe</label>
                <div class="color-control">
                  <input
                    type="checkbox"
                    checked={!!sk.wireframe}
                    onchange={(e) => forAll(s => s.stroke ? { stroke: { ...s.stroke, wireframe: (e.target as HTMLInputElement).checked } } : {})}
                  />
                </div>
              </div>
            {/if}
          {/if}
        {/if}

        <!-- Rotation slider (all shape types) -->
        <SliderRow id="shape-rotate" label="Rotate" min={-180} max={180} step={1}
          value={activeShape.transform?.rotate ?? 0}
          onchange={(v) => forAll(s => ({ transform: { ...s.transform, rotate: v } }))}
          style="margin-top: 10px"
        />

        <!-- Geometry sliders (rect / ellipse / arc / 3D shapes center) -->
        {#if activeShape.type === 'rect' || activeShape.type === 'ellipse' || activeShape.type === 'arc'
          || activeShape.type === 'cube' || activeShape.type === 'sphere' || activeShape.type === 'cylinder' || activeShape.type === 'torus'}
          <h2 class="section-title" style:margin-top="12px">Position & Size</h2>
          {@const is3DSingleSize = activeShape.type === 'cube' || activeShape.type === 'sphere' || activeShape.type === 'torus'}
          {#each geomKeys.filter(k => {
            if (activeShape.type === 'arc') return k.key === 'x' || k.key === 'y'
            if (is3DSingleSize) return k.key === 'x' || k.key === 'y' || k.key === 'w'
            return true
          }).map(k => is3DSingleSize && k.key === 'w' ? { ...k, label: 'Size' } : k) as { label, key }}
            <SliderRow id={`geom-${key}`} {label} min={0} max={1} step={0.001}
              value={activeShape.geom[key]}
              onchange={(v) => {
                if (key === 'x' || key === 'y') {
                  const delta = v - activeShape.geom[key]
                  forAllGeom(s => ({ ...s.geom, [key]: s.geom[key] + delta }))
                } else if (is3DSingleSize && key === 'w') {
                  forAllGeom(s => ({ ...s.geom, w: v, h: v }))
                } else {
                  forAllGeom(s => ({ ...s.geom, [key]: v }))
                }
              }}
            />
          {/each}
        {/if}

        <!-- 3D View sliders (cube / sphere / cylinder / torus) -->
        {#if activeShape.type === 'cube' || activeShape.type === 'sphere' || activeShape.type === 'cylinder' || activeShape.type === 'torus'}
          <h2 class="section-title" style:margin-top="12px">3D Transform</h2>
          {@const t3d = activeShape.transform ?? {}}
          {#each [
            { id: 'v3d-rx', label: 'Tilt',   key: 'rotateX' as const, min: -180, max: 180, step: 1, val: t3d.rotateX ?? 35 },
            { id: 'v3d-ry', label: 'Spin',    key: 'rotateY' as const, min: -180, max: 180, step: 1, val: t3d.rotateY ?? 45 },
            { id: 'v3d-rz', label: 'Roll',    key: 'rotateZ' as const, min: -180, max: 180, step: 1, val: t3d.rotateZ ?? 0 },
            { id: 'v3d-dp', label: 'Depth',   key: 'depth'   as const, min: 0,    max: 1,   step: 0.01, val: t3d.depth ?? 0 },
            { id: 'v3d-sm', label: 'Smooth',  key: 'smooth'  as const, min: 3,    max: 128, step: 1, val: t3d.smooth ?? 32 },
          ] as p}
            <SliderRow id={p.id} label={p.label} min={p.min} max={p.max} step={p.step} value={p.val}
              onchange={(v) => forAll(s => ({
                transform: { ...(s.transform ?? {}), [p.key]: v }
              }))}
            />
          {/each}
        {/if}

        <!-- Arc sliders -->
        {#if activeShape.type === 'arc'}
          <h2 class="section-title" style:margin-top="12px">Arc</h2>
          <SliderRow id="arc-r" label="Radius" min={0.01} max={1} step={0.001}
            value={activeShape.geom.w / 2}
            onchange={(v) => forAllGeom(s => ({ ...s.geom, w: v * 2, h: v * 2 }))}
          />
          {#each ['Start', 'End'] as lbl, i}
            <SliderRow id={`arc-${i}`} label={lbl} min={-360} max={360} step={1}
              value={activeShape.pts?.[i] ?? (i === 0 ? 0 : 270)}
              onchange={(v) => {
                const pts = [...(activeShape.pts ?? [0, 270])]
                pts[i] = v
                onUpdateShape(activeLayer.id, activeShape.id, { pts })
              }}
            />
          {/each}
        {/if}

        <!-- Pts sliders (line / curve / triangle) -->
        {#if activeShape.pts && activeShape.type !== 'arc'}
          {@const ptsLabels = activeShape.type === 'curve'
            ? ['X1','Y1','CX','CY','X2','Y2']
            : activeShape.type === 'triangle'
              ? ['X1','Y1','X2','Y2','X3','Y3']
              : ['X1','Y1','X2','Y2']}
          <h2 class="section-title" style:margin-top="12px">Points</h2>
          {#each ptsLabels as lbl, i}
            <SliderRow id={`pts-${i}`} label={lbl} min={0} max={1} step={0.001}
              value={activeShape.pts[i] ?? 0}
              onchange={(v) => {
                const pts = [...(activeShape.pts!)]
                pts[i] = v
                onUpdateShape(activeLayer.id, activeShape.id, { pts })
              }}
            />
          {/each}
          {#if activeShape.type === 'line' || activeShape.type === 'curve'}
            <SliderRow id="stroke-w" label="Stroke" min={0.001} max={0.05} step={0.001}
              value={activeShape.strokeWidth ?? 0.004}
              onchange={(v) => forAll(() => ({ strokeWidth: v }))}
            />
          {/if}
        {/if}
      </section>

      <!-- Per-shape shaders -->
      <section class="section">
        <h2 class="section-title">Shaders</h2>
        {#if activeShape}
        {@const shadowFx = activeShape.effects?.find(e => e.type === 'shadow')}
        {@const blurFx   = activeShape.effects?.find(e => e.type === 'blur')}
        {@const bevelFx  = activeShape.effects?.find(e => e.type === 'bevel')}
        {@const noiseFx  = activeShape.effects?.find(e => e.type === 'noise')}
        {@const warpFx   = activeShape.effects?.find(e => e.type === 'warp')}

        <!-- Shadow -->
        <div class="fx-row">
          <input type="checkbox" id="fx-shadow" checked={!!shadowFx}
            onchange={() => toggleFx('shadow', { color: '#000000', opacity: 0.5, blur: 10, offsetX: 0, offsetY: 4 })} />
          <label for="fx-shadow" class="fx-label">Drop Shadow</label>
        </div>
        {#if shadowFx}
          <div class="fx-params">
            <div class="prop-row">
              <label class="prop-label">Color</label>
              <ColorPicker hex={shadowFx.color ?? '#000000'} showOpacity={false}
                onChange={(h) => setFx('shadow', { color: h })} />
            </div>
            {#each [
              { id: 'sh-op', label: 'Opacity', key: 'opacity', min: 0,   max: 1,  step: 0.01, val: shadowFx.opacity ?? 0.5 },
              { id: 'sh-bl', label: 'Blur',    key: 'blur',    min: 0,   max: 40, step: 1,    val: shadowFx.blur    ?? 10  },
              { id: 'sh-ox', label: 'X',       key: 'offsetX', min: -40, max: 40, step: 1,    val: shadowFx.offsetX ?? 0   },
              { id: 'sh-oy', label: 'Y',       key: 'offsetY', min: -40, max: 40, step: 1,    val: shadowFx.offsetY ?? 4   },
            ] as p}
              <SliderRow id={p.id} label={p.label} min={p.min} max={p.max} step={p.step} value={p.val}
                onchange={(v) => setFx('shadow', { [p.key]: v })}
              />
            {/each}
          </div>
        {/if}

        <!-- Blur (not available for 3D shapes — too expensive) -->
        {#if activeShape.type !== 'cube' && activeShape.type !== 'sphere' && activeShape.type !== 'cylinder' && activeShape.type !== 'torus'}
        <div class="fx-row">
          <input type="checkbox" id="fx-blur" checked={!!blurFx}
            onchange={() => toggleFx('blur', { blur: 4 })} />
          <label for="fx-blur" class="fx-label">Blur</label>
        </div>
        {#if blurFx}
          <div class="fx-params">
            <SliderRow id="bl-am" label="Amount" min={0} max={20} step={0.5}
              value={blurFx.blur ?? 4} onchange={(v) => setFx('blur', { blur: v })} />
          </div>
        {/if}
        {/if}

        <!-- Bevel -->
        <div class="fx-row">
          <input type="checkbox" id="fx-bevel" checked={!!bevelFx}
            onchange={() => toggleFx('bevel', { opacity: 0.6 })} />
          <label for="fx-bevel" class="fx-label">Bevel</label>
        </div>
        {#if bevelFx}
          <div class="fx-params">
            <SliderRow id="bv-op" label="Intensity" min={0} max={1} step={0.01}
              value={bevelFx.opacity ?? 0.6} onchange={(v) => setFx('bevel', { opacity: v })} />
          </div>
        {/if}

        <!-- Noise -->
        <div class="fx-row">
          <input type="checkbox" id="fx-noise" checked={!!noiseFx}
            onchange={() => toggleFx('noise', { amount: 0.3 })} />
          <label for="fx-noise" class="fx-label">Noise</label>
        </div>
        {#if noiseFx}
          <div class="fx-params">
            <SliderRow id="ns-am" label="Amount" min={0} max={1} step={0.01}
              value={noiseFx.amount ?? 0.3} onchange={(v) => setFx('noise', { amount: v })} />
          </div>
        {/if}

        <!-- Warp -->
        <div class="fx-row">
          <input type="checkbox" id="fx-warp" checked={!!warpFx}
            onchange={() => toggleFx('warp', { amount: 8, freq: 0.05 })} />
          <label for="fx-warp" class="fx-label">Warp</label>
        </div>
        {#if warpFx}
          <div class="fx-params">
            {#each [
              { id: 'wp-am', label: 'Strength',  key: 'amount', min: 0,     max: 40,  step: 0.5,   val: warpFx.amount ?? 8    },
              { id: 'wp-fr', label: 'Frequency', key: 'freq',   min: 0.005, max: 0.2, step: 0.005, val: warpFx.freq   ?? 0.05 },
            ] as p}
              <SliderRow id={p.id} label={p.label} min={p.min} max={p.max} step={p.step} value={p.val}
                onchange={(v) => setFx('warp', { [p.key]: v })}
              />
            {/each}
          </div>
        {/if}

        <!-- Materials (3D shapes only) -->
        {#if activeShape.type === 'cube' || activeShape.type === 'sphere' || activeShape.type === 'cylinder' || activeShape.type === 'torus'}
          {@const materialFx = activeShape.effects?.find(e => e.type === 'material')}
          {@const activeMat = materialFx?.material ?? null}
          {#each [
            { id: 'fx-metal',   mat: 'metal' as Material3D,   label: 'Metal',   r: 'Roughness', i: 'Reflectivity' },
            { id: 'fx-plastic', mat: 'plastic' as Material3D, label: 'Plastic', r: 'Roughness', i: 'Glossiness' },
            { id: 'fx-marble',  mat: 'marble' as Material3D,  label: 'Marble',  r: 'Veins',     i: 'Polish' },
            { id: 'fx-glass',   mat: 'glass' as Material3D,   label: 'Glass',   r: 'Roughness', i: 'Transparency' },
          ] as m}
            <div class="fx-row">
              <input type="checkbox" id={m.id} checked={activeMat === m.mat}
                onchange={() => {
                  if (activeMat === m.mat) {
                    if (!activeLayer || !activeShape) return
                    onUpdateShape(activeLayer.id, activeShape.id, {
                      effects: (activeShape.effects ?? []).filter(e => e.type !== 'material'),
                    })
                  } else {
                    if (!activeLayer || !activeShape) return
                    const others = (activeShape.effects ?? []).filter(e => e.type !== 'material')
                    onUpdateShape(activeLayer.id, activeShape.id, {
                      effects: [...others, { type: 'material', material: m.mat, roughness: 0.5, intensity: 0.5 } as ShapeEffect],
                    })
                  }
                }} />
              <label for={m.id} class="fx-label">{m.label}</label>
            </div>
            {#if activeMat === m.mat && materialFx}
              <div class="fx-params">
                <SliderRow id={`${m.id}-r`} label={m.r} min={0} max={1} step={0.01}
                  value={materialFx.roughness ?? 0.5}
                  onchange={(v) => setFx('material', { roughness: v })} />
                <SliderRow id={`${m.id}-i`} label={m.i} min={0} max={1} step={0.01}
                  value={materialFx.intensity ?? 0.5}
                  onchange={(v) => setFx('material', { intensity: v })} />
              </div>
            {/if}
          {/each}
        {/if}
        {/if}
      </section>
    {/if}
  {/if}

  <!-- ── Palettes tab ── -->
  {#if activeTab === 'palettes'}
    <!-- Built-in palettes -->
    <section class="section">
      <h2 class="section-title">Built-in</h2>
      <div class="palette-list">
        {#each palettes.filter(p => p.builtin) as palette}
          <div class="palette-row">
            <div class="palette-row-header">
              <span class="palette-row-name">{palette.name}</span>
              <span class="palette-row-var">palette('{palette.name}', i)</span>
              <button
                class="code-tool-btn"
                title="Copy variable name"
                onclick={() => navigator.clipboard.writeText(`palette('${palette.name}', 0)`)}
              >copy</button>
            </div>
            <div class="palette-swatches">
              {#each palette.colors as color}
                <div class="palette-swatch" style:background={color} title={color}></div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Custom palettes -->
    <section class="section">
      <h2 class="section-title">Custom</h2>
      <div class="palette-list">
        {#each palettes.filter(p => !p.builtin) as palette}
          <div class="palette-card">
            <div class="palette-card-header">
              {#if editingPaletteId === palette.id}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  class="rename-input"
                  bind:value={editingPaletteName}
                  autofocus
                  onblur={() => {
                    if (editingPaletteName.trim()) onUpdatePalette(palette.id, { name: editingPaletteName.trim() })
                    editingPaletteId = null
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLElement).blur()
                    if (e.key === 'Escape') editingPaletteId = null
                  }}
                />
              {:else}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span
                  class="palette-card-name"
                  title="Double-click to rename"
                  ondblclick={() => { editingPaletteId = palette.id; editingPaletteName = palette.name }}
                >{palette.name}</span>
              {/if}
              <span class="palette-row-var">palette('{palette.name}', i)</span>
              <button
                class="code-tool-btn"
                title="Copy variable name"
                onclick={() => navigator.clipboard.writeText(`palette('${palette.name}', 0)`)}
              >copy</button>
              <button
                class="icon-btn delete-btn"
                title="Delete palette"
                onclick={() => onDeletePalette(palette.id)}
              >×</button>
            </div>
            <div class="palette-swatches palette-swatches-edit">
              {#each palette.colors as color, ci}
                <div class="palette-swatch-wrap">
                  <ColorPicker
                    hex={color}
                    showOpacity={false}
                    onChange={(h) => {
                      const colors = [...palette.colors]
                      colors[ci] = h
                      onUpdatePalette(palette.id, { colors })
                    }}
                  />
                  {#if palette.colors.length > 1}
                    <button
                      class="swatch-del-btn"
                      title="Remove color"
                      onclick={() => onUpdatePalette(palette.id, { colors: palette.colors.filter((_, i) => i !== ci) })}
                    >×</button>
                  {/if}
                </div>
              {/each}
              <button
                class="add-color-btn"
                title="Add color"
                onclick={() => onUpdatePalette(palette.id, { colors: [...palette.colors, '#8b5cf6'] })}
              >+</button>
            </div>
          </div>
        {/each}
      </div>
      <button class="add-layer-btn" onclick={() => onAddPalette()}>+ New palette</button>
    </section>

    <!-- Usage hint -->
    <section class="section">
      <p class="palette-hint">Use palette() in code mode:<br>
        <code>repeat(8, (i, t) =&gt; &#123;<br>
          &nbsp;&nbsp;rect(…, palette('Neon', i))<br>
        &#125;)</code>
      </p>
    </section>
  {/if}

  <!-- ── Patterns tab ── -->
  {#if activeTab === 'patterns'}

    <!-- Save as stamp -->
    <section class="section">
      <h2 class="section-title">Save Stamp</h2>
      {#if !isCodeMode && selectedShapes.length > 0}
        <button class="add-layer-btn" onclick={saveSelectedAsStamp}>+ Save {selectedShapes.length} selected shape{selectedShapes.length > 1 ? 's' : ''} as stamp</button>
      {:else if isCodeMode && activeLayer?.query.trim()}
        <button class="add-layer-btn" onclick={saveCodeAsStamp}>+ Save current code as stamp</button>
      {:else}
        <p class="fx-hint">Select shapes or write code to save as a reusable stamp.</p>
      {/if}
    </section>

    <!-- Save current template as pattern -->
    <section class="section">
      <h2 class="section-title">Save Template Pattern</h2>
      <p class="pattern-hint">{PATTERN_TYPE_LABELS[tpl]} &middot; {tplShape} &middot; {tpl === 'grid' ? `${tplCols}×${tplRows}` : `${tplCount}×`}</p>
      <button class="add-layer-btn" onclick={saveCurrentAsPattern}>+ Save as pattern</button>
    </section>

    <!-- Stamps (code-based) -->
    {@const stampList = patterns.filter(p => !p.builtin && p.code)}
    {#if stampList.length > 0}
      <section class="section">
        <h2 class="section-title">Stamps</h2>
        <div class="pattern-list">
          {#each stampList as pattern}
            <div class="pattern-card">
              <div class="pattern-card-header">
                {#if editingPatternId === pattern.id}
                  <!-- svelte-ignore a11y_autofocus -->
                  <input
                    class="rename-input"
                    bind:value={editingPatternName}
                    autofocus
                    onblur={() => {
                      if (editingPatternName.trim()) onUpdatePattern(pattern.id, { name: editingPatternName.trim() })
                      editingPatternId = null
                    }}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLElement).blur()
                      if (e.key === 'Escape') editingPatternId = null
                    }}
                  />
                {:else}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <span
                    class="pattern-card-name"
                    title="Double-click to rename"
                    ondblclick={() => { editingPatternId = pattern.id; editingPatternName = pattern.name }}
                  >{pattern.name}</span>
                {/if}
                <span class="pattern-card-meta stamp-badge">stamp</span>
                <button
                  class="icon-btn delete-btn"
                  title="Delete stamp"
                  onclick={() => onDeletePattern(pattern.id)}
                >×</button>
              </div>
              <!-- Code preview / edit -->
              {#if editingStampCode === pattern.id}
                <textarea
                  class="stamp-code-editor"
                  bind:value={editingStampCodeValue}
                  rows="4"
                  spellcheck="false"
                  onblur={() => {
                    if (editingStampCodeValue.trim()) onUpdatePattern(pattern.id, { code: editingStampCodeValue.trim() })
                    editingStampCode = null
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Escape') editingStampCode = null
                    if (e.key === 'Tab') { e.preventDefault(); editingStampCodeValue += '  ' }
                  }}
                ></textarea>
              {:else}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <pre
                  class="stamp-code-preview"
                  title="Click to edit"
                  onclick={() => { editingStampCode = pattern.id; editingStampCodeValue = pattern.code ?? '' }}
                >{@html highlightCode(pattern.code ?? '')}</pre>
              {/if}
              <div class="pattern-card-actions">
                <button class="sample-load-btn" onclick={() => loadPattern(pattern)}>Insert</button>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Built-in patterns -->
    <section class="section">
      <h2 class="section-title">Built-in Patterns</h2>
      <div class="pattern-list">
        {#each patterns.filter(p => p.builtin) as pattern}
          <div class="pattern-card">
            <div class="pattern-card-header">
              <span class="pattern-card-name">{pattern.name}</span>
              <span class="pattern-card-meta">
                <span class="pattern-swatch" style:background={pattern.color}></span>
                {SHAPE_ICONS[pattern.shape] ?? '?'} {PATTERN_TYPE_LABELS[pattern.type]}
                {pattern.type === 'grid' ? `${pattern.cols}×${pattern.rows}` : `×${pattern.count}`}
              </span>
            </div>
            <div class="pattern-card-actions">
              <button class="sample-load-btn" onclick={() => loadPattern(pattern)}>Insert</button>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Custom template patterns (non-stamp) -->
    {@const customTemplates = patterns.filter(p => !p.builtin && !p.code)}
    {#if customTemplates.length > 0}
      <section class="section">
        <h2 class="section-title">Custom Patterns</h2>
        <div class="pattern-list">
          {#each customTemplates as pattern}
            <div class="pattern-card">
              <div class="pattern-card-header">
                {#if editingPatternId === pattern.id}
                  <!-- svelte-ignore a11y_autofocus -->
                  <input
                    class="rename-input"
                    bind:value={editingPatternName}
                    autofocus
                    onblur={() => {
                      if (editingPatternName.trim()) onUpdatePattern(pattern.id, { name: editingPatternName.trim() })
                      editingPatternId = null
                    }}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLElement).blur()
                      if (e.key === 'Escape') editingPatternId = null
                    }}
                  />
                {:else}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <span
                    class="pattern-card-name"
                    title="Double-click to rename"
                    ondblclick={() => { editingPatternId = pattern.id; editingPatternName = pattern.name }}
                  >{pattern.name}</span>
                {/if}
                <span class="pattern-card-meta">
                  <span class="pattern-swatch" style:background={pattern.color}></span>
                  {SHAPE_ICONS[pattern.shape] ?? '?'} {PATTERN_TYPE_LABELS[pattern.type]}
                  {pattern.type === 'grid' ? `${pattern.cols}×${pattern.rows}` : `×${pattern.count}`}
                </span>
                <button
                  class="icon-btn delete-btn"
                  title="Delete pattern"
                  onclick={() => onDeletePattern(pattern.id)}
                >×</button>
              </div>
              <div class="pattern-card-actions">
                <button class="sample-load-btn" onclick={() => loadPattern(pattern)}>Insert</button>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Usage hint -->
    <section class="section">
      <p class="palette-hint">Use stamps in code mode:<br>
        <code>stamp('MyStamp')<br>
          // inside tile:<br>
          tile(4, (c, r) =&gt; &#123;<br>
          &nbsp;&nbsp;stamp('MyStamp', &#123; scale: 0.8 &#125;)<br>
          &#125;)</code>
      </p>
    </section>

  {/if}

  <!-- ── Samples tab ── -->
  {#if activeTab === 'samples'}
    <section class="section">
      <h2 class="section-title">Samples</h2>
      {#if !activeLayer}
        <p class="fx-hint">Select or add a layer first.</p>
      {:else}
        <div class="samples-list">
          {#each SAMPLES as s}
            <div class="sample-card">
              <div class="sample-info">
                <span class="sample-name">{s.name}</span>
                <span class="sample-desc">{s.desc}</span>
              </div>
              <button class="sample-load-btn" onclick={() => loadSample(s.code)}>Load</button>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</aside>

<style>
  .panel {
    position: fixed;
    top: 44px;
    right: 0;
    bottom: 0;
    width: var(--panel-w, 260px);
    min-width: 220px;
    background: var(--bg-bar);
    border-left: 1px solid var(--border);
    overflow-y: auto;
    z-index: 90;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* ── Tab bar ── */
  .tab-bar {
    display: flex;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .tab-btn {
    flex: 1;
    padding: 10px 0;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-4);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: color .15s, border-color .15s;
    margin-bottom: -1px;
  }
  .tab-btn:hover { color: var(--text-3); }
  .tab-btn.active { color: var(--accent-text); border-bottom-color: var(--accent); }

  /* ── Sections ── */
  .section {
    padding: 14px;
    border-bottom: 1px solid var(--border);
  }

  .section-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--text-5);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .shape-count {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    color: var(--text-5);
    background: var(--bg-hover);
    border-radius: 8px;
    padding: 1px 5px;
  }

  /* ── Layer list ── */
  .layer-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 240px;
    overflow-y: auto;
    margin-bottom: 10px;
  }

  .layer-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    border-radius: 5px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background .1s;
  }
  .layer-row:hover { background: var(--bg-hover); }
  .layer-row.selected { border-color: var(--accent); background: var(--bg-selected); }
  .layer-row.drag-over { border-color: var(--accent-text); background: var(--bg-selected); }
  .layer-row.drag-src  { opacity: 0.4; }

  .drag-handle {
    font-size: 13px;
    color: var(--text-6);
    cursor: grab;
    flex-shrink: 0;
    padding: 0 1px;
    transition: color .1s;
    user-select: none;
  }
  .layer-row:hover .drag-handle { color: var(--text-4); }
  .drag-handle:active { cursor: grabbing; }

  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-4);
    font-size: 13px;
    line-height: 1;
    padding: 2px;
    flex-shrink: 0;
    transition: color .1s;
  }
  .icon-btn:hover { color: var(--text-2); }
  .delete-btn:hover { color: var(--text-err); }

  .shape-badge {
    font-size: 12px;
    color: var(--text-3);
    flex-shrink: 0;
  }

  .layer-name {
    flex: 1;
    font-size: 12px;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .rename-input {
    flex: 1;
    background: var(--bg-panel);
    border: 1px solid var(--accent);
    border-radius: 3px;
    color: var(--text-1);
    font-size: 12px;
    padding: 1px 4px;
    min-width: 0;
    outline: none;
  }

  .add-layer-btn {
    width: 100%;
    padding: 7px;
    background: none;
    border: 1px dashed var(--border-add);
    border-radius: 5px;
    color: var(--text-4);
    font-size: 12px;
    cursor: pointer;
    transition: border-color .15s, color .15s;
  }
  .add-layer-btn:hover { border-color: var(--accent); color: var(--accent-text); }

  /* ── Shape list ── */
  .layer-shapes {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 10px;
    max-height: 240px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .layer-shapes::-webkit-scrollbar       { width: 4px; }
  .layer-shapes::-webkit-scrollbar-track { background: transparent; }
  .layer-shapes::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .shape-list-sentinel { height: 1px; flex-shrink: 0; }

  .shape-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 5px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background .1s;
  }
  .shape-row:hover { background: var(--bg-hover); }
  .shape-row.selected { border-color: var(--accent); background: var(--bg-selected); }

  .shape-type-badge {
    font-size: 12px;
    color: var(--text-3);
    flex-shrink: 0;
  }

  .shape-auto-name {
    flex: 1;
    font-size: 12px;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  /* ── Mode toggle ── */
  .mode-toggle {
    display: flex;
    gap: 6px;
  }

  .mode-btn {
    flex: 1;
    padding: 6px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-3);
    font-size: 12px;
    cursor: pointer;
    transition: border-color .15s, background .15s, color .15s;
  }
  .mode-btn:hover { border-color: var(--text-5); color: var(--text-2); }
  .mode-btn.active { border-color: var(--accent); background: var(--bg-selected); color: var(--accent-text); }

  /* ── Template builder ── */
  .tpl-tabs {
    display: flex;
    gap: 5px;
    margin-bottom: 10px;
  }

  .tpl-btn {
    flex: 1;
    padding: 5px 2px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-4);
    font-size: 14px;
    cursor: pointer;
    transition: border-color .15s, background .15s, color .15s;
  }
  .tpl-btn:hover { border-color: var(--text-5); color: var(--text-2); }
  .tpl-btn.active { border-color: var(--accent); background: var(--bg-selected); color: var(--accent-text); }

  .tpl-grid-dims {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tpl-dim-label {
    font-size: 11px;
    color: var(--text-3);
  }

  .tpl-grid-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .num-input {
    width: 48px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-2);
    font-family: monospace;
    font-size: 11px;
    padding: 1px 4px;
    outline: none;
    text-align: right;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .num-input:focus { border-color: var(--accent); }
  .num-input::-webkit-outer-spin-button,
  .num-input::-webkit-inner-spin-button { -webkit-appearance: none; appearance: none; }

  .tpl-x {
    font-size: 11px;
    color: var(--text-5);
  }

  .tpl-hex {
    font-family: monospace;
    font-size: 11px;
    color: var(--text-3);
    flex: 1;
  }

  .insert-btn {
    width: 100%;
    padding: 7px;
    background: var(--bg-selected);
    border: 1px solid var(--accent);
    border-radius: 5px;
    color: var(--accent-text);
    font-size: 12px;
    cursor: pointer;
    transition: background .15s;
  }
  .insert-btn:hover { background: color-mix(in srgb, var(--accent) 25%, var(--bg-selected)); }

  /* ── Shader effects ── */
  .fx-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0 3px;
    border-bottom: 1px solid var(--border-inner);
  }
  .fx-row:last-of-type { border-bottom: none; }
  .fx-label {
    font-size: 11px;
    color: var(--text-2);
    cursor: pointer;
    flex: 1;
  }
  .fx-params {
    padding: 6px 0 4px 16px;
    border-bottom: 1px solid var(--border-inner);
  }
  .fx-hint {
    font-size: 11px;
    color: var(--text-6);
    text-align: center;
    padding: 16px 0 8px;
    margin: 0;
  }

  /* ── Samples ── */
  .samples-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sample-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: border-color .12s;
  }
  .sample-card:hover { border-color: var(--accent); }

  .sample-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .sample-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
  }

  .sample-desc {
    font-size: 10px;
    color: var(--text-5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sample-load-btn {
    flex-shrink: 0;
    padding: 3px 10px;
    font-size: 10px;
    background: var(--bg-selected);
    border: 1px solid var(--accent);
    border-radius: 4px;
    color: var(--accent-text);
    cursor: pointer;
    transition: background .1s;
  }
  .sample-load-btn:hover { background: var(--accent); color: #fff; }

  /* ── Shape list (type selector) ── */
  .shape-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .shape-list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    background: var(--bg-panel);
    border: none;
    border-bottom: 1px solid var(--border-inner);
    color: var(--text-3);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: background .12s, color .12s;
  }
  .shape-list-item:last-child { border-bottom: none; }
  .shape-list-item:hover { background: var(--bg-hover); color: var(--text-2); }
  .shape-list-item.active { background: var(--bg-selected); color: var(--accent-text); }
  .shape-list-item.active .shape-list-icon { color: var(--accent); }

  .shape-list-icon {
    width: 16px;
    text-align: center;
    color: var(--text-5);
    font-size: 13px;
  }

  .prop-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  .mini-toggle {
    display: flex;
    gap: 4px;
  }
  .mini-btn {
    flex: 1;
    padding: 4px 6px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-4);
    font-size: 11px;
    cursor: pointer;
    transition: border-color .12s, color .12s, background .12s;
  }
  .mini-btn:hover  { border-color: var(--text-5); color: var(--text-2); }
  .mini-btn.active { border-color: var(--accent); background: var(--bg-selected); color: var(--accent-text); }

  .prop-label {
    font-size: 11px;
    color: var(--text-3);
  }


  .color-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  input[type="checkbox"] {
    accent-color: var(--accent);
    cursor: pointer;
    flex-shrink: 0;
  }

  /* ── Palette tab ── */
  .palette-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 10px;
  }

  .palette-row {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .palette-row-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border-inner);
  }

  .palette-row-name {
    font-size: 12px;
    color: var(--text-2);
    font-weight: 500;
    flex: 1;
  }

  .palette-row-var {
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 10px;
    color: var(--text-4);
  }

  .palette-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 8px;
  }

  .palette-swatch {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid var(--border);
    flex-shrink: 0;
    cursor: default;
  }

  /* Custom palette cards */
  .palette-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .palette-card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border-inner);
  }

  .palette-card-name {
    font-size: 12px;
    color: var(--text-2);
    font-weight: 500;
    flex: 1;
    cursor: text;
  }
  .palette-card-name:hover { color: var(--text-1); }

  .palette-swatches-edit {
    align-items: center;
  }

  .palette-swatch-wrap {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .swatch-del-btn {
    background: none;
    border: none;
    color: var(--text-6);
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    padding: 1px 2px;
    border-radius: 2px;
    transition: color .1s;
    flex-shrink: 0;
  }
  .swatch-del-btn:hover { color: var(--text-err); }

  .add-color-btn {
    width: 22px;
    height: 22px;
    background: none;
    border: 1px dashed var(--border-add);
    border-radius: 3px;
    color: var(--text-6);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: border-color .12s, color .12s;
  }
  .add-color-btn:hover { border-color: var(--accent); color: var(--accent-text); }

  /* Palette variable chips in API ref */
  .palette-var-btn {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .palette-var-dots {
    display: flex;
    gap: 2px;
    align-items: center;
  }

  .palette-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Usage hint */
  .palette-hint {
    font-size: 11px;
    color: var(--text-5);
    line-height: 1.7;
  }
  .palette-hint code {
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 10px;
    color: var(--text-4);
    display: block;
    margin-top: 6px;
    padding: 8px 10px;
    background: var(--bg-sunken);
    border-radius: 4px;
    border: 1px solid var(--border-inner);
  }

  /* ── Pattern cards ── */
  .pattern-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pattern-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    transition: border-color .12s;
  }
  .pattern-card:hover { border-color: var(--accent); }

  .pattern-card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .pattern-card-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    flex: 1;
    min-width: 0;
    cursor: text;
  }
  .pattern-card-name:hover { color: var(--text-1); }

  .pattern-card-meta {
    font-size: 10px;
    color: var(--text-5);
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .pattern-swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .pattern-card-actions {
    margin-top: 6px;
    display: flex;
    gap: 4px;
  }

  .pattern-hint {
    font-size: 11px;
    color: var(--text-5);
    margin: 2px 0 6px;
  }

  .stamp-badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent-text);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .stamp-code-preview {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 10px;
    color: var(--text-4);
    background: var(--bg-sunken);
    border: 1px solid var(--border-inner);
    border-radius: 4px;
    padding: 6px 8px;
    margin-top: 4px;
    max-height: 80px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
    cursor: pointer;
    transition: border-color .12s;
  }
  .stamp-code-preview:hover { border-color: var(--accent); }

  .stamp-code-editor {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 10px;
    color: var(--text-2);
    background: var(--bg-sunken);
    border: 1px solid var(--accent);
    border-radius: 4px;
    padding: 6px 8px;
    margin-top: 4px;
    width: 100%;
    resize: vertical;
    outline: none;
    tab-size: 2;
  }
</style>
