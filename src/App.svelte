<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { Layer, Shape, ShapeGeom } from './lib/layers/types'
  import { renderLayers2D, applyTransform } from './lib/layers/renderer2d'
  import { evaluateQuery, shapesToCode } from './lib/query/index'

  /** Recursively flatten group shapes into their children (for manual mode). */
  function flattenShapes(shapes: Shape[]): Shape[] {
    const out: Shape[] = []
    for (const s of shapes) {
      if (s.type === 'group' && s.children?.length) {
        // Merge group effects into each child, then flatten recursively
        const gfx = s.effects ?? []
        for (const child of s.children) {
          const merged = gfx.length
            ? { ...child, effects: [...(child.effects ?? []), ...gfx] }
            : child
          if (merged.type === 'group' && merged.children?.length) {
            out.push(...flattenShapes([merged]))
          } else {
            out.push(merged)
          }
        }
      } else {
        out.push(s)
      }
    }
    return out
  }

  import { initEditorFont } from './lib/editor-font'
  initEditorFont()

  import TopBar          from './components/TopBar.svelte'
  import RightPanel      from './components/RightPanel.svelte'
  import BottomCodePanel from './components/BottomCodePanel.svelte'
  import StatusBar       from './components/StatusBar.svelte'
  import Viewport        from './components/Viewport.svelte'
  import { serializeProject, parseProject } from './lib/persist/index'
  import { BUILTIN_PALETTES } from './lib/palettes/index'
  import type { Palette } from './lib/palettes/index'
  import { MIN_ZOOM, MAX_ZOOM, MAX_RENDER_SCALE } from './lib/viewport'

  // ── Theme ──────────────────────────────────────────────────────────────────
  const THEME_KEY = 'forma_theme'
  let theme = $state<'dark' | 'light'>((localStorage.getItem(THEME_KEY) as 'dark' | 'light') ?? 'dark')

  $effect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = theme
    localStorage.setItem(THEME_KEY, theme)
  })

  function toggleTheme() { theme = theme === 'dark' ? 'light' : 'dark' }

  // ── Autosave / restore ─────────────────────────────────────────────────────
  const STORAGE_KEY = 'forma_autosave'

  function loadAutosave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw) as { layers: Layer[]; artW: number; artH: number; customPalettes: Palette[]; activeIdx: number }
      if (!Array.isArray(data.layers)) return null
      return data
    } catch {
      return null
    }
  }

  const _saved = loadAutosave()

  // ── Artboard ──────────────────────────────────────────────────────────────
  let artW = $state(_saved?.artW ?? 794)
  let artH = $state(_saved?.artH ?? 1123)

  // ── Zoom / pan ─────────────────────────────────────────────────────────────
  let zoom = $state(1)
  let panX = $state(0)
  let panY = $state(0)

  // ── Panel width (resizable + presets) ──────────────────────────────────────
  let panelWidth = $state(parseInt(localStorage.getItem('forma_panel_w') ?? '260') || 260)
  let resizeOrigin: { x: number; w: number } | null = null

  // ── Code panel position ─────────────────────────────────────────────────────
  let codePanelPos = $state<'right' | 'bottom'>((localStorage.getItem('forma_code_pos') as 'right' | 'bottom') ?? 'right')
  let codePanelH   = $state(parseInt(localStorage.getItem('forma_code_h') ?? '280') || 280)

  function startResize(e: PointerEvent) {
    resizeOrigin = { x: e.clientX, w: panelWidth }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function doResize(e: PointerEvent) {
    if (!resizeOrigin) return
    const delta = resizeOrigin.x - e.clientX
    panelWidth = Math.max(220, Math.min(Math.round(window.innerWidth * 0.75), resizeOrigin.w + delta))
    updateVP()
  }

  function endResize() {
    resizeOrigin = null
  }

  $effect(() => {
    document.documentElement.style.setProperty('--panel-w', `${panelWidth}px`)
    localStorage.setItem('forma_panel_w', String(panelWidth))
  })

  $effect(() => {
    const mode = layers.find(l => l.id === activeLayerId)?.mode ?? 'manual'
    const h = codePanelPos === 'bottom' && mode === 'code' ? codePanelH : 0
    document.documentElement.style.setProperty('--code-panel-h', `${h}px`)
    localStorage.setItem('forma_code_pos', codePanelPos)
    localStorage.setItem('forma_code_h', String(codePanelH))
  })

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
    zoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM)
  }

  // ── History (undo / redo) ──────────────────────────────────────────────────
  const MAX_HISTORY = 50
  let past   = $state<Layer[][]>([])
  let future = $state<Layer[][]>([])

  function snapshot(): Layer[] {
    return JSON.parse(JSON.stringify(layers)) as Layer[]
  }

  function commit() {
    past   = [...past.slice(-(MAX_HISTORY - 1)), snapshot()]
    future = []
  }

  function undo() {
    if (!past.length) return
    future = [snapshot(), ...future.slice(0, MAX_HISTORY - 1)]
    layers = past[past.length - 1]
    past   = past.slice(0, -1)
    activeShapeId = null
    selectedShapeIds = []
  }

  function redo() {
    if (!future.length) return
    past   = [...past.slice(-(MAX_HISTORY - 1)), snapshot()]
    layers = future[0]
    future = future.slice(1)
    activeShapeId = null
    selectedShapeIds = []
  }

  // ── Layers ─────────────────────────────────────────────────────────────────
  const _initId = crypto.randomUUID()
  let layers = $state<Layer[]>(_saved?.layers ?? [{ id: _initId, name: 'Layer 1', visible: true, mode: 'manual', shapes: [], query: '' }])
  const _initActiveId = _saved
    ? (_saved.layers[_saved.activeIdx]?.id ?? _saved.layers[_saved.layers.length - 1]?.id ?? null)
    : _initId
  let activeLayerId = $state<string | null>(_initActiveId)
  let activeShapeId = $state<string | null>(null)
  let selectedShapeIds = $state<string[]>([])
  let activeTab = $state<'layers' | 'effects' | 'palettes' | 'samples'>('layers')

  // ── Palettes ───────────────────────────────────────────────────────────────
  let customPalettes = $state<Palette[]>(_saved?.customPalettes ?? [])

  // ── Autosave effect ────────────────────────────────────────────────────────
  let _saveTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const idx  = layers.findIndex(l => l.id === activeLayerId)
    const data = JSON.stringify({ layers, artW, artH, customPalettes, activeIdx: idx < 0 ? layers.length - 1 : idx })
    clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, data) } catch { /* storage full or unavailable */ }
    }, 500)
  })
  const allPalettes  = $derived([...BUILTIN_PALETTES, ...customPalettes])

  const activeLayerShapes = $derived(
    layers.find(l => l.id === activeLayerId)?.shapes ?? []
  )

  // For code-mode layers, replace layer.shapes with evaluated shapes at render time
  const resolvedLayers = $derived(
    layers.map(layer => {
      if (layer.mode !== 'code') return layer
      const { shapes } = evaluateQuery(layer.query, artW, artH, allPalettes)
      return { ...layer, shapes }
    })
  )

  // Null when the active layer is in code mode — disables canvas draw/select in Viewport
  const drawableLayerId = $derived(
    layers.find(l => l.id === activeLayerId)?.mode === 'code' ? null : activeLayerId
  )

  function handleAddLayer() {
    commit()
    const id = crypto.randomUUID()
    const n  = layers.length + 1
    layers = [...layers, { id, name: `Layer ${n}`, visible: true, mode: 'manual', shapes: [], query: '' }]
    activeLayerId = id
    activeShapeId = null
  }

  function handleSelectLayer(id: string) {
    activeLayerId = id
    activeShapeId = null
    selectedShapeIds = []
  }

  function handleDeleteLayer(id: string) {
    commit()
    layers = layers.filter(l => l.id !== id)
    if (activeLayerId === id) {
      activeLayerId = layers[layers.length - 1]?.id ?? null
      activeShapeId = null
      selectedShapeIds = []
    }
  }

  function handleToggleVisible(id: string) {
    commit()
    layers = layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
  }

  function handleRenameLayer(id: string, name: string) {
    commit()
    layers = layers.map(l => l.id === id ? { ...l, name } : l)
  }

  function handleMoveLayerTo(srcId: string, targetId: string) {
    if (srcId === targetId) return
    commit()
    const srcIdx    = layers.findIndex(l => l.id === srcId)
    const targetIdx = layers.findIndex(l => l.id === targetId)
    const next = [...layers]
    const [removed] = next.splice(srcIdx, 1)
    next.splice(targetIdx, 0, removed)
    layers = next
  }

  function handleUpdateLayerBg(id: string, bgColor: string | undefined) {
    commit()
    layers = layers.map(l => l.id === id ? { ...l, bgColor } : l)
  }

  // Update query text while staying in code mode (CM handles its own undo internally)
  function handleSetQuery(id: string, query: string) {
    layers = layers.map(l => l.id === id ? { ...l, query } : l)
  }

  // Switch mode with bidirectional sync:
  //   manual → code: generate code from shapes if query is empty
  //   code → manual: bake evaluated shapes into layer.shapes
  function handleSetMode(id: string, mode: 'manual' | 'code') {
    commit()
    layers = layers.map(l => {
      if (l.id !== id || l.mode === mode) return l
      if (mode === 'code') {
        const query = l.query.trim() ? l.query : shapesToCode(l.shapes)
        return { ...l, mode, query }
      } else {
        const raw = l.query.trim() ? evaluateQuery(l.query, artW, artH, allPalettes).shapes : l.shapes
        return { ...l, mode, shapes: flattenShapes(raw) }
      }
    })
    activeShapeId = null
    selectedShapeIds = []
  }

  // Commit once per drag (tracked by shape id to avoid committing on every mousemove)
  let _lastGeomCommitKey = ''
  $effect(() => { _lastGeomCommitKey = activeShapeId ?? '' })

  function handleStartDraw(layerId: string, initialGeom: ShapeGeom): string {
    commit()
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
    _lastGeomCommitKey = shapeId
    return shapeId
  }

  function handleAddShape(layerId: string) {
    commit()
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
    selectedShapeIds = [shapeId]
  }

  function handleToggleShape(shapeId: string) {
    if (selectedShapeIds.includes(shapeId)) {
      selectedShapeIds = selectedShapeIds.filter(id => id !== shapeId)
      if (activeShapeId === shapeId) {
        activeShapeId = selectedShapeIds[selectedShapeIds.length - 1] ?? null
      }
    } else {
      selectedShapeIds = [...selectedShapeIds, shapeId]
      activeShapeId = shapeId
    }
  }

  function handleMoveBatch(
    layerId: string,
    moves: Array<{ shapeId: string; geom?: ShapeGeom; pts?: number[] }>,
  ) {
    const key = `batch:${layerId}:${selectedShapeIds.join(',')}`
    if (key !== _lastGeomCommitKey) { commit(); _lastGeomCommitKey = key }
    layers = layers.map(l => l.id === layerId ? {
      ...l,
      shapes: l.shapes.map(s => {
        const upd = moves.find(u => u.shapeId === s.id)
        if (!upd) return s
        if (upd.pts !== undefined) return { ...s, pts: upd.pts }
        if (upd.geom !== undefined) return { ...s, geom: upd.geom }
        return s
      }),
    } : l)
  }

  function handleDeleteShape(layerId: string, shapeId: string) {
    commit()
    layers = layers.map(l => l.id === layerId ? {
      ...l,
      shapes: l.shapes.filter(s => s.id !== shapeId),
    } : l)
    if (activeShapeId === shapeId) activeShapeId = null
    selectedShapeIds = selectedShapeIds.filter(id => id !== shapeId)
  }

  function handleDeleteSelected() {
    const layer = layers.find(l => l.id === activeLayerId)
    if (!layer || selectedShapeIds.length === 0) return
    commit()
    const toDelete = new Set(selectedShapeIds)
    layers = layers.map(l => l.id === layer.id ? {
      ...l,
      shapes: l.shapes.filter(s => !toDelete.has(s.id)),
    } : l)
    activeShapeId = null
    selectedShapeIds = []
  }

  function handleUpdateShape(layerId: string, shapeId: string, update: Partial<Shape>) {
    commit()
    layers = layers.map(l => l.id === layerId ? {
      ...l,
      shapes: l.shapes.map(s => s.id === shapeId ? { ...s, ...update } : s),
    } : l)
  }

  function handleBatchUpdateShapes(layerId: string, updates: Array<{ shapeId: string; patch: Partial<Shape> }>) {
    if (updates.length === 0) return
    commit()
    const patchMap = new Map(updates.map(u => [u.shapeId, u.patch]))
    layers = layers.map(l => l.id === layerId ? {
      ...l,
      shapes: l.shapes.map(s => {
        const patch = patchMap.get(s.id)
        return patch ? { ...s, ...patch } : s
      }),
    } : l)
  }

  function handleUpdateGeom(layerId: string, shapeId: string, geom: ShapeGeom) {
    const key = `${layerId}:${shapeId}`
    if (key !== _lastGeomCommitKey) { commit(); _lastGeomCommitKey = key }
    layers = layers.map(l => l.id === layerId ? {
      ...l,
      shapes: l.shapes.map(s => s.id === shapeId ? { ...s, geom } : s),
    } : l)
  }

  // ── Palette handlers ───────────────────────────────────────────────────────
  function handleAddPalette() {
    customPalettes = [...customPalettes, {
      id: crypto.randomUUID(),
      name: `Palette ${customPalettes.length + 1}`,
      colors: ['#8b5cf6', '#4ecdc4', '#f7c68a'],
    }]
  }

  function handleUpdatePalette(id: string, update: Partial<Palette>) {
    customPalettes = customPalettes.map(p => p.id === id ? { ...p, ...update } : p)
  }

  function handleDeletePalette(id: string) {
    customPalettes = customPalettes.filter(p => p.id !== id)
  }

  // ── Canvas 2D ──────────────────────────────────────────────────────────────
  let canvas2d: HTMLCanvasElement | null = null
  let ctx2d: CanvasRenderingContext2D | null = null
  let rafId: number

  function initCanvas2D(c: HTMLCanvasElement) {
    canvas2d = c
    ctx2d    = c.getContext('2d')
    rafId    = requestAnimationFrame(loop)
    updateVP()
    fit()
  }

  function updateVP() {
    vpW = window.innerWidth - panelWidth
    vpH = window.innerHeight - 44 - 36
  }

  function loop(time: number) {
    if (ctx2d && canvas2d) {
      // Scale canvas buffer to match physical pixels at current zoom,
      // so shapes stay crisp regardless of zoom level.
      // renderScale is capped to MAX_RENDER_SCALE to prevent the canvas bitmap
      // from growing unboundedly at high zoom levels (which would crash the tab).
      // Visual zoom (CSS transform on the artboard) is unaffected by this cap.
      const dpr         = window.devicePixelRatio || 1
      const renderScale = Math.min(zoom * dpr, MAX_RENDER_SCALE)
      const w = Math.round(artW * renderScale)
      const h = Math.round(artH * renderScale)
      if (canvas2d.width !== w || canvas2d.height !== h) {
        canvas2d.width  = w
        canvas2d.height = h
      }
      ctx2d.setTransform(renderScale, 0, 0, renderScale, 0, 0)
      try {
        renderLayers2D(ctx2d, resolvedLayers, artW, artH)
      } catch { /* don't let a bad frame kill the render loop */ }
      drawSelectionOutline(ctx2d)
    }
    rafId = requestAnimationFrame(loop)
  }

  function drawSelectionOutline(ctx: CanvasRenderingContext2D) {
    if (selectedShapeIds.length === 0) return
    const allShapes = resolvedLayers.flatMap(l => l.shapes)

    ctx.globalCompositeOperation = 'difference'
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.75
    ctx.setLineDash([])

    for (const id of selectedShapeIds) {
      const shape = allShapes.find(s => s.id === id)
      if (!shape) continue

      ctx.save()

      if (shape.pts && shape.type !== 'arc') {
        const p = shape.pts
        const xs = p.filter((_, i) => i % 2 === 0).map(v => v * artW)
        const ys = p.filter((_, i) => i % 2 === 1).map(v => v * artH)
        const minX = Math.min(...xs), maxX = Math.max(...xs)
        const minY = Math.min(...ys), maxY = Math.max(...ys)
        const pad = 4

        if (shape.transform) {
          let pivotX: number, pivotY: number
          if (shape.type === 'triangle') {
            pivotX = (p[0] + p[2] + p[4]) / 3 * artW
            pivotY = (p[1] + p[3] + p[5]) / 3 * artH
          } else {
            // line / curve / spline: midpoint of first and last point
            pivotX = (p[0] + p[p.length - 2]) / 2 * artW
            pivotY = (p[1] + p[p.length - 1]) / 2 * artH
          }
          applyTransform(ctx, shape.transform, pivotX, pivotY)
        }

        ctx.strokeRect(minX - pad, minY - pad,
          maxX - minX + pad * 2,
          maxY - minY + pad * 2)
      } else {
        const pad = 3
        const pw = shape.geom.w * artW
        const ph = shape.geom.h * artW
        const px = shape.geom.x * artW
        const py = shape.geom.y * artH

        if (shape.transform) applyTransform(ctx, shape.transform, px, py)

        ctx.strokeRect(px - pw / 2 - pad, py - ph / 2 - pad, pw + pad * 2, ph + pad * 2)
      }

      ctx.restore()
    }

    ctx.globalCompositeOperation = 'source-over'
  }

  // ── Canvas size change ─────────────────────────────────────────────────────
  async function handleSizeChange(w: number, h: number) {
    artW = w
    artH = h
    await new Promise(r => setTimeout(r, 0))
    updateVP()
    fit()
  }

  // ── New ────────────────────────────────────────────────────────────────────
  function handleNew() {
    const id = crypto.randomUUID()
    layers        = [{ id, name: 'Layer 1', visible: true, mode: 'manual', shapes: [], query: '' }]
    activeLayerId = id
    activeShapeId = null
    selectedShapeIds = []
    past = []; future = []
  }

  // ── Save / Load ────────────────────────────────────────────────────────────
  function handleSave() {
    const content = serializeProject({ layers, artW, artH, customPalettes })
    const blob = new Blob([content], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'project.forma'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleLoad(file: File) {
    const content = await file.text()
    try {
      const { layers: newLayers, artW: newW, artH: newH, customPalettes: newPalettes } = parseProject(content)
      layers          = newLayers
      customPalettes  = newPalettes ?? []
      activeLayerId    = newLayers[newLayers.length - 1]?.id ?? null
      activeShapeId    = null
      selectedShapeIds = []
      past = []; future = []
      if (newW !== artW || newH !== artH) await handleSizeChange(newW, newH)
      else { updateVP(); fit() }
    } catch (e) {
      console.error('Failed to load file:', e)
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function handleExport() {
    const canvas = document.createElement('canvas')
    canvas.width  = artW
    canvas.height = artH
    const ctx = canvas.getContext('2d')!
    renderLayers2D(ctx, resolvedLayers, artW, artH)
    // Fill white behind all rendered content (destination-over draws src under dst)
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, artW, artH)
    ctx.globalCompositeOperation = 'source-over'
    const a = document.createElement('a')
    a.href     = canvas.toDataURL('image/png')
    a.download = `forma-${Date.now()}.png`
    a.click()
  }

  // ── Clipboard / duplicate ──────────────────────────────────────────────────
  let _clipboard = $state<Shape[]>([])

  function selectedShapes(): Shape[] {
    const layer = layers.find(l => l.id === activeLayerId)
    if (!layer) return []
    return layer.shapes.filter(s => selectedShapeIds.includes(s.id))
  }

  const PASTE_OFFSET = 0.02  // normalized units

  function handleDuplicateSelected() {
    if (selectedShapeIds.length === 0) return
    const layer = layers.find(l => l.id === activeLayerId)
    if (!layer) return
    commit()
    const originals = layer.shapes.filter(s => selectedShapeIds.includes(s.id))
    const copies = originals.map(s => ({
      ...JSON.parse(JSON.stringify(s)) as Shape,
      id: crypto.randomUUID(),
      geom: { ...s.geom, x: s.geom.x + PASTE_OFFSET, y: s.geom.y + PASTE_OFFSET },
      pts: s.pts?.map((v, i) => v + PASTE_OFFSET),
    }))
    layers = layers.map(l => l.id === activeLayerId ? { ...l, shapes: [...l.shapes, ...copies] } : l)
    selectedShapeIds = copies.map(c => c.id)
    activeShapeId = copies[copies.length - 1].id
  }

  function handleCopySelected() {
    if (selectedShapeIds.length === 0) return
    _clipboard = JSON.parse(JSON.stringify(selectedShapes())) as Shape[]
  }

  function handleCutSelected() {
    if (selectedShapeIds.length === 0) return
    handleCopySelected()
    handleDeleteSelected()
  }

  function handlePaste() {
    if (_clipboard.length === 0) return
    const layer = layers.find(l => l.id === activeLayerId)
    if (!layer) return
    commit()
    const copies = _clipboard.map(s => ({
      ...JSON.parse(JSON.stringify(s)) as Shape,
      id: crypto.randomUUID(),
      geom: { ...s.geom, x: s.geom.x + PASTE_OFFSET, y: s.geom.y + PASTE_OFFSET },
      pts: s.pts?.map((v, i) => v + PASTE_OFFSET),
    }))
    layers = layers.map(l => l.id === activeLayerId ? { ...l, shapes: [...l.shapes, ...copies] } : l)
    selectedShapeIds = copies.map(c => c.id)
    activeShapeId = copies[copies.length - 1].id
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  function handleKeyDown(e: KeyboardEvent) {
    const el = e.target as HTMLElement
    const inEditor = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || !!el.closest?.('.cm-editor')
    if (inEditor) return

    const mod = e.ctrlKey || e.metaKey

    // Undo / redo
    if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
    if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) { e.preventDefault(); redo(); return }

    // Duplicate
    if (mod && e.key === 'd' && selectedShapeIds.length > 0) {
      e.preventDefault(); handleDuplicateSelected(); return
    }

    // Copy / cut / paste
    if (mod && e.key === 'c' && selectedShapeIds.length > 0) {
      e.preventDefault(); handleCopySelected(); return
    }
    if (mod && e.key === 'x' && selectedShapeIds.length > 0) {
      e.preventDefault(); handleCutSelected(); return
    }
    if (mod && e.key === 'v') {
      e.preventDefault(); handlePaste(); return
    }

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
  })
</script>

<TopBar
  {artW}
  {artH}
  {theme}
  onSizeChange={handleSizeChange}
  onExport={handleExport}
  onNew={handleNew}
  onSave={handleSave}
  onLoad={handleLoad}
  onToggleTheme={toggleTheme}
/>

<Viewport
  {artW}
  {artH}
  {zoom}
  {panX}
  {panY}
  activeLayerId={drawableLayerId}
  {activeLayerShapes}
  {selectedShapeIds}
  onCanvas2d={initCanvas2D}
  onZoomChange={(z, px, py) => { zoom = z; panX = px; panY = py }}
  onPanChange={(px, py) => { panX = px; panY = py }}
  onStartDraw={handleStartDraw}
  onSelectShape={handleSelectShape}
  onToggleShape={handleToggleShape}
  onDeselect={() => { activeShapeId = null; selectedShapeIds = [] }}
  onUpdateGeom={handleUpdateGeom}
  onMoveBatch={handleMoveBatch}
  onUpdatePts={(layerId, shapeId, pts) => {
    const key = `pts:${layerId}:${shapeId}`
    if (key !== _lastGeomCommitKey) { commit(); _lastGeomCommitKey = key }
    layers = layers.map(l => l.id === layerId ? {
      ...l, shapes: l.shapes.map(s => s.id === shapeId ? { ...s, pts } : s)
    } : l)
  }}
/>

<RightPanel
  {artW}
  {artH}
  {layers}
  {activeLayerId}
  {activeShapeId}
  {selectedShapeIds}
  {activeTab}
  onTabChange={(t: 'layers' | 'effects' | 'palettes' | 'samples') => activeTab = t}
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
  onBatchUpdateShapes={handleBatchUpdateShapes}
  onUpdateGeom={handleUpdateGeom}
  palettes={allPalettes}
  onAddPalette={handleAddPalette}
  onUpdatePalette={handleUpdatePalette}
  onDeletePalette={handleDeletePalette}
  {panelWidth}
  onSetPanelW={(w) => { panelWidth = w; updateVP() }}
  {codePanelPos}
  onSetCodePanelPos={(p) => { codePanelPos = p }}
/>

{#if codePanelPos === 'bottom'}
  {@const activeCodeLayer = layers.find(l => l.id === activeLayerId && l.mode === 'code') ?? null}
  {#if activeCodeLayer}
    <BottomCodePanel
      activeLayer={activeCodeLayer}
      {artW}
      {artH}
      palettes={allPalettes}
      onSetQuery={handleSetQuery}
      height={codePanelH}
      onHeightChange={(h) => { codePanelH = h }}
      onMoveToRight={() => { codePanelPos = 'right' }}
    />
  {/if}
{/if}

<StatusBar
  {zoom}
  onZoom={stepZoom}
  onFit={fit}
  onReset={() => { zoom = 1; panX = 0; panY = 0 }}
/>

<!-- Panel resize handle -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="panel-resize-handle"
  style:right="{panelWidth - 3}px"
  onpointerdown={startResize}
  onpointermove={doResize}
  onpointerup={endResize}
  ondblclick={() => { panelWidth = Math.round(window.innerWidth * 0.5); updateVP() }}
  title="Drag to resize · Double-click for 50%"
></div>

<style>
  /* ── CSS custom properties ─────────────────────────────────────────────── */
  :global(:root) {
    --bg-bar:        #17171a;
    --bg-panel:      #111114;
    --bg-elevated:   #1a1a1e;
    --bg-sunken:     #0e0e10;
    --bg-hover:      #1f1f24;
    --bg-selected:   #1a1428;
    --bg-error:      #110808;
    --border:        #2b2b30;
    --border-inner:  #1e1e22;
    --border-add:    #333340;
    --border-error:  #1a0c0c;
    --text-1:        #e2e2e6;
    --text-2:        #c8c8d0;
    --text-3:        #888890;
    --text-4:        #666672;
    --text-5:        #555560;
    --text-6:        #444450;
    --text-7:        #333340;
    --text-ok:       #4ade80;
    --text-err:      #f87171;
    --accent:        #8b5cf6;
    --accent-text:   #c4b0f8;
    --viewport-bg:   #0e0e10;
    --viewport-grid: rgba(255,255,255,.03);
    --artboard-shadow: rgba(0,0,0,.7);
    --checker-a:     #3a3a3a;
    --checker-b:     #1a1a1e;
    --cm-bg:         #0d0d0f;
    --cm-text:       #c8c8d0;
    --cm-comment:    #444454;
    --cm-string:     #86c99a;
    --cm-number:     #d19a66;
    --cm-keyword:    #c4b0f8;
    --cm-operator:   #88889a;
    --cm-function:   #93c5fd;
    --cm-property:   #e5c07b;
    --cm-cursor:     #c4b0f8;
    --cm-selection:  #2d2540;
    --cm-active-line: rgba(139,92,246,0.05);
    --cm-placeholder: #2a2a36;
    --cm-tooltip-bg:  #18181c;
    --cm-tooltip-border: #2d2d38;
    --cm-item-selected:  #2a1f3d;
    --cm-item-text:      #c4b0f8;
    --cm-matched:        #8b5cf6;
    --cm-focus-shadow:   #8b5cf6;
  }

  :global([data-theme="light"]) {
    --bg-bar:        #f2f2f5;
    --bg-panel:      #f5f5f8;
    --bg-elevated:   #ffffff;
    --bg-sunken:     #ebebef;
    --bg-hover:      #eeeef2;
    --bg-selected:   #ede9fe;
    --bg-error:      #fff5f5;
    --border:        #d8d8e2;
    --border-inner:  #e4e4ec;
    --border-add:    #c0c0cc;
    --border-error:  #fecaca;
    --text-1:        #111118;
    --text-2:        #2a2a34;
    --text-3:        #6b6b7a;
    --text-4:        #7a7a8a;
    --text-5:        #8888a0;
    --text-6:        #9898b0;
    --text-7:        #aaaabb;
    --text-ok:       #16a34a;
    --text-err:      #ef4444;
    --accent:        #7c3aed;
    --accent-text:   #7c3aed;
    --viewport-bg:   #e0e0e8;
    --viewport-grid: rgba(0,0,0,.05);
    --artboard-shadow: rgba(0,0,0,.15);
    --checker-a:     #cccccc;
    --checker-b:     #eeeeee;
    --cm-bg:         #f8f8fc;
    --cm-text:       #1a1a28;
    --cm-comment:    #9898aa;
    --cm-string:     #15803d;
    --cm-number:     #b45309;
    --cm-keyword:    #7c3aed;
    --cm-operator:   #6b7080;
    --cm-function:   #1d4ed8;
    --cm-property:   #92400e;
    --cm-cursor:     #7c3aed;
    --cm-selection:  #ddd6fe;
    --cm-active-line: rgba(124,58,237,0.04);
    --cm-placeholder: #c0c0cc;
    --cm-tooltip-bg:  #ffffff;
    --cm-tooltip-border: #d8d8e2;
    --cm-item-selected:  #ede9fe;
    --cm-item-text:      #7c3aed;
    --cm-matched:        #7c3aed;
    --cm-focus-shadow:   #7c3aed;
  }

  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(html, body) {
    width: 100%; height: 100%; overflow: hidden;
    background: var(--viewport-bg);
    color: var(--text-2);
    font-family: system-ui, -apple-system, sans-serif;
  }
  :global(::-webkit-scrollbar) { width: 6px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) { background: var(--border); border-radius: 3px; }

  .panel-resize-handle {
    position: fixed;
    top: 44px;
    bottom: 36px;
    width: 6px;
    cursor: col-resize;
    z-index: 95;
    background: transparent;
    transition: background .15s;
  }
  .panel-resize-handle:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
  .panel-resize-handle:active { background: color-mix(in srgb, var(--accent) 35%, transparent); }
</style>
