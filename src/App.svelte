<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { createRenderer }    from './lib/renderer/index'
  import type { Renderer }     from './lib/renderer/types'
  import { SKETCHES }          from './lib/sketches/index'
  import type { SketchDef }    from './lib/sketches/types'
  import type { Layer, Shape, ShapeGeom } from './lib/layers/types'
  import { renderLayers2D }    from './lib/layers/renderer2d'
  import { evaluateQuery, shapesToCode } from './lib/query/index'

  import TopBar     from './components/TopBar.svelte'
  import RightPanel from './components/RightPanel.svelte'
  import StatusBar  from './components/StatusBar.svelte'
  import Viewport   from './components/Viewport.svelte'

  // ── Artboard ──────────────────────────────────────────────────────────────
  let artW = $state(794)
  let artH = $state(1123)

  // ── Zoom / pan ─────────────────────────────────────────────────────────────
  let zoom = $state(1)
  let panX = $state(0)
  let panY = $state(0)

  // Computed viewport size (minus bars)
  let vpW = $state(0)
  let vpH = $state(0)

  function fit() {
    const pad = 0.88
    zoom = Math.min(vpW / artW, vpH / artH) * pad
    panX = 0
    panY = 0
  }

  function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

  function stepZoom(dir: number) {
    const factor = dir > 0 ? 1.2 : 1 / 1.2
    zoom = clamp(zoom * factor, 0.05, 20)
  }

  // ── Sketch / params ────────────────────────────────────────────────────────
  let activeSketch = $state<SketchDef>(SKETCHES[0])

  // params: id → current value
  let params = $state<Record<string, number>>(defaultParams(SKETCHES[0]))

  function defaultParams(s: SketchDef): Record<string, number> {
    return Object.fromEntries(s.params.map(p => [p.id, p.default]))
  }

  function paramsToArray(s: SketchDef, p: Record<string, number>): Float32Array {
    const a = new Float32Array(8)
    s.params.forEach((def, i) => { a[i] = p[def.id] ?? def.default })
    return a
  }

  // ── Layers ─────────────────────────────────────────────────────────────────
  const _initId = crypto.randomUUID()
  let layers = $state<Layer[]>([{ id: _initId, name: 'Layer 1', visible: true, mode: 'manual', shapes: [], query: '' }])
  let activeLayerId = $state<string | null>(_initId)
  let activeShapeId = $state<string | null>(null)
  let activeTab = $state<'layers' | 'effects'>('layers')
  let effectsEnabled = $state(false)

  const activeLayerShapes = $derived(
    layers.find(l => l.id === activeLayerId)?.shapes ?? []
  )

  // For code-mode layers, replace layer.shapes with evaluated shapes at render time
  const resolvedLayers = $derived(
    layers.map(layer => {
      if (layer.mode !== 'code') return layer
      const { shapes } = evaluateQuery(layer.query)
      return { ...layer, shapes }
    })
  )

  // Null when the active layer is in code mode — disables canvas draw/select in Viewport
  const drawableLayerId = $derived(
    layers.find(l => l.id === activeLayerId)?.mode === 'code' ? null : activeLayerId
  )

  function handleAddLayer() {
    const id = crypto.randomUUID()
    const n  = layers.length + 1
    layers = [...layers, { id, name: `Layer ${n}`, visible: true, mode: 'manual', shapes: [], query: '' }]
    activeLayerId = id
    activeShapeId = null
  }

  function handleSelectLayer(id: string) {
    activeLayerId = id
    activeShapeId = null
  }

  function handleDeleteLayer(id: string) {
    const layer = layers.find(l => l.id === id)
    if (layer && activeShapeId !== null && layer.shapes.some(s => s.id === activeShapeId)) {
      activeShapeId = null
    }
    layers = layers.filter(l => l.id !== id)
    if (activeLayerId === id) activeLayerId = layers[layers.length - 1]?.id ?? null
  }

  function handleToggleVisible(id: string) {
    layers = layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
  }

  function handleRenameLayer(id: string, name: string) {
    layers = layers.map(l => l.id === id ? { ...l, name } : l)
  }

  function handleMoveLayerTo(srcId: string, targetId: string) {
    if (srcId === targetId) return
    const srcIdx    = layers.findIndex(l => l.id === srcId)
    const targetIdx = layers.findIndex(l => l.id === targetId)
    const next = [...layers]
    const [removed] = next.splice(srcIdx, 1)
    next.splice(targetIdx, 0, removed)
    layers = next
  }

  function handleUpdateLayerBg(id: string, bgColor: string | undefined) {
    layers = layers.map(l => l.id === id ? { ...l, bgColor } : l)
  }

  // Update query text while staying in code mode
  function handleSetQuery(id: string, query: string) {
    layers = layers.map(l => l.id === id ? { ...l, query } : l)
  }

  // Switch mode with bidirectional sync:
  //   manual → code: generate code from shapes if query is empty
  //   code → manual: bake evaluated shapes into layer.shapes
  function handleSetMode(id: string, mode: 'manual' | 'code') {
    layers = layers.map(l => {
      if (l.id !== id || l.mode === mode) return l
      if (mode === 'code') {
        const query = l.query.trim() ? l.query : shapesToCode(l.shapes)
        return { ...l, mode, query }
      } else {
        const shapes = l.query.trim() ? evaluateQuery(l.query).shapes : l.shapes
        return { ...l, mode, shapes }
      }
    })
    activeShapeId = null
  }

  function handleStartDraw(layerId: string, initialGeom: ShapeGeom): string {
    const shapeId = crypto.randomUUID()
    layers = layers.map(l => l.id === layerId ? {
      ...l,
      shapes: [...l.shapes, {
        id: shapeId,
        type: 'rect',
        color: { hex: '#8b5cf6', opacity: 0.85 },
        geom: initialGeom,
      }],
    } : l)
    activeShapeId = shapeId
    return shapeId
  }

  function handleAddShape(layerId: string) {
    const shapeId = crypto.randomUUID()
    layers = layers.map(l => l.id === layerId ? {
      ...l,
      shapes: [...l.shapes, {
        id: shapeId,
        type: 'rect',
        color: { hex: '#8b5cf6', opacity: 0.85 },
        geom: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 },
      }],
    } : l)
    activeShapeId = shapeId
  }

  function handleSelectShape(shapeId: string) {
    activeShapeId = shapeId
  }

  function handleDeleteShape(layerId: string, shapeId: string) {
    layers = layers.map(l => l.id === layerId ? {
      ...l,
      shapes: l.shapes.filter(s => s.id !== shapeId),
    } : l)
    if (activeShapeId === shapeId) activeShapeId = null
  }

  function handleUpdateShape(layerId: string, shapeId: string, update: Partial<Shape>) {
    layers = layers.map(l => l.id === layerId ? {
      ...l,
      shapes: l.shapes.map(s => s.id === shapeId ? { ...s, ...update } : s),
    } : l)
  }

  function handleUpdateGeom(layerId: string, shapeId: string, geom: ShapeGeom) {
    layers = layers.map(l => l.id === layerId ? {
      ...l,
      shapes: l.shapes.map(s => s.id === shapeId ? { ...s, geom } : s),
    } : l)
  }

  // ── Canvas 2D ──────────────────────────────────────────────────────────────
  let canvas2d: HTMLCanvasElement | null = null
  let ctx2d: CanvasRenderingContext2D | null = null

  function initCanvas2D(c: HTMLCanvasElement) {
    canvas2d = c
    ctx2d    = c.getContext('2d')
  }

  // ── Renderer ───────────────────────────────────────────────────────────────
  let renderer: Renderer | null = null
  let gpuCanvas: HTMLCanvasElement | null = null
  let rafId: number
  let rendererType = $state('')

  async function initRenderer(canvas: HTMLCanvasElement) {
    gpuCanvas = canvas
    canvas.style.display = effectsEnabled ? 'block' : 'none'
    renderer = await createRenderer(canvas, activeSketch, paramsToArray(activeSketch, params))
    rendererType = renderer.type
    renderer.resize(artW, artH)
    rafId = requestAnimationFrame(loop)

    // Measure viewport and fit
    updateVP()
    fit()
  }

  // Keep GPU canvas visibility in sync with effectsEnabled
  $effect(() => {
    if (gpuCanvas) gpuCanvas.style.display = effectsEnabled ? 'block' : 'none'
  })

  function updateVP() {
    vpW = window.innerWidth - 260
    vpH = window.innerHeight - 44 - 36
  }

  function loop(time: number) {
    if (effectsEnabled) renderer?.render(time)
    if (ctx2d && canvas2d) {
      // Scale canvas buffer to match physical pixels at current zoom,
      // so shapes stay crisp regardless of zoom level.
      const dpr   = window.devicePixelRatio || 1
      const scale = zoom * dpr
      const w = Math.round(artW * scale)
      const h = Math.round(artH * scale)
      if (canvas2d.width !== w || canvas2d.height !== h) {
        canvas2d.width  = w
        canvas2d.height = h
      }
      ctx2d.setTransform(scale, 0, 0, scale, 0, 0)
      renderLayers2D(ctx2d, resolvedLayers, artW, artH)
      drawSelectionOutline(ctx2d)
    }
    rafId = requestAnimationFrame(loop)
  }

  function drawSelectionOutline(ctx: CanvasRenderingContext2D) {
    if (!activeShapeId) return
    let shape: Shape | null = null
    for (const l of resolvedLayers) {
      shape = l.shapes.find(s => s.id === activeShapeId) ?? null
      if (shape) break
    }
    if (!shape) return

    ctx.save()
    ctx.globalAlpha = 0.6
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])

    if (shape.pts) {
      const xs = shape.pts.filter((_, i) => i % 2 === 0).map(v => v * artW)
      const ys = shape.pts.filter((_, i) => i % 2 === 1).map(v => v * artH)
      const pad = 4
      ctx.strokeRect(Math.min(...xs) - pad, Math.min(...ys) - pad,
        Math.max(...xs) - Math.min(...xs) + pad * 2,
        Math.max(...ys) - Math.min(...ys) + pad * 2)
    } else {
      const pad = 3
      const pw = shape.geom.w * artW
      const ph = shape.geom.h * artW
      const px = shape.geom.x * artW - pw / 2 - pad
      const py = shape.geom.y * artH - ph / 2 - pad
      ctx.strokeRect(px, py, pw + pad * 2, ph + pad * 2)
    }

    ctx.restore()
  }

  // ── Sketch change ──────────────────────────────────────────────────────────
  async function handleSketchChange(s: SketchDef) {
    activeSketch = s
    params = defaultParams(s)
    await renderer?.setSketch(s, paramsToArray(s, params))
  }

  // ── Param change ───────────────────────────────────────────────────────────
  function handleParamChange(id: string, value: number) {
    params[id] = value
    renderer?.setParams(paramsToArray(activeSketch, params))
  }

  // ── Canvas size change ─────────────────────────────────────────────────────
  async function handleSizeChange(w: number, h: number) {
    artW = w
    artH = h
    await new Promise(r => setTimeout(r, 0))
    renderer?.resize(w, h)
    updateVP()
    fit()
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  async function handleExport() {
    const offscreen = document.createElement('canvas')
    offscreen.width  = artW
    offscreen.height = artH
    const octx = offscreen.getContext('2d')!

    // Draw GPU layer only when effects are enabled
    if (effectsEnabled && renderer) {
      const gpuBlob = await renderer.exportPNG()
      const gpuImg  = await createImageBitmap(gpuBlob)
      octx.drawImage(gpuImg, 0, 0)
    }

    // Draw 2D overlay cleanly (no selection outline)
    renderLayers2D(octx, resolvedLayers, artW, artH)

    const blob = await new Promise<Blob>(res =>
      offscreen.toBlob(b => res(b!), 'image/png')
    )
    const url = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = `forma-${activeSketch.id}-${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  function handleKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    if (e.key === 'Escape') { activeShapeId = null }
    if (e.key === '0') { e.preventDefault(); fit() }
    if (e.key === '1') { e.preventDefault(); zoom = 1; panX = 0; panY = 0 }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); stepZoom(1) }
    if (e.key === '-') { e.preventDefault(); stepZoom(-1) }
  }

  onMount(() => {
    updateVP()
    const ro = new ResizeObserver(() => updateVP())
    ro.observe(document.body)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      ro.disconnect()
      window.removeEventListener('keydown', handleKeyDown)
    }
  })

  onDestroy(() => {
    cancelAnimationFrame(rafId)
    renderer?.destroy()
  })
</script>

<TopBar
  {artW}
  {artH}
  onSizeChange={handleSizeChange}
  onExport={handleExport}
/>

<Viewport
  {artW}
  {artH}
  {zoom}
  {panX}
  {panY}
  activeLayerId={drawableLayerId}
  {activeLayerShapes}
  onCanvas={initRenderer}
  onCanvas2d={initCanvas2D}
  onZoomChange={(z, px, py) => { zoom = z; panX = px; panY = py }}
  onPanChange={(px, py) => { panX = px; panY = py }}
  onStartDraw={handleStartDraw}
  onSelectShape={handleSelectShape}
  onDeselect={() => { activeShapeId = null }}
  onUpdateGeom={handleUpdateGeom}
  onUpdatePts={(layerId, shapeId, pts) => {
    layers = layers.map(l => l.id === layerId ? {
      ...l, shapes: l.shapes.map(s => s.id === shapeId ? { ...s, pts } : s)
    } : l)
  }}
/>

<RightPanel
  sketches={SKETCHES}
  activeSketch={activeSketch}
  {effectsEnabled}
  params={params}
  {layers}
  {activeLayerId}
  {activeShapeId}
  {activeTab}
  onSketchChange={handleSketchChange}
  onParamChange={handleParamChange}
  onTabChange={(t: 'layers' | 'effects') => { activeTab = t }}
  onAddLayer={handleAddLayer}
  onSelectLayer={handleSelectLayer}
  onDeleteLayer={handleDeleteLayer}
  onToggleVisible={handleToggleVisible}
  onRenameLayer={handleRenameLayer}
  onMoveLayerTo={handleMoveLayerTo}
  onUpdateLayerBg={handleUpdateLayerBg}
  onSetQuery={handleSetQuery}
  onSetMode={handleSetMode}
  onAddShape={handleAddShape}
  onSelectShape={handleSelectShape}
  onDeleteShape={handleDeleteShape}
  onUpdateShape={handleUpdateShape}
  onUpdateGeom={handleUpdateGeom}
  onToggleEffects={() => effectsEnabled = !effectsEnabled}
/>

<StatusBar
  {zoom}
  {rendererType}
  onZoom={stepZoom}
  onFit={fit}
  onReset={() => { zoom = 1; panX = 0; panY = 0 }}
/>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(html, body) {
    width: 100%; height: 100%; overflow: hidden;
    background: #0e0e10;
    color: #e2e2e6;
    font-family: system-ui, -apple-system, sans-serif;
  }
  :global(::-webkit-scrollbar) { width: 6px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) { background: #2b2b30; border-radius: 3px; }
</style>
