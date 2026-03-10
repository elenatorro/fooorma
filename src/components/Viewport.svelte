<script lang="ts">
  import { onMount } from 'svelte'
  import { clientToNorm } from '../lib/layers/renderer2d'
  import type { Shape, ShapeGeom } from '../lib/layers/types'
  import { MIN_ZOOM, MAX_ZOOM } from '../lib/viewport'

  const RULER_SIZE = 22  // px width/height of ruler bars

  const {
    artW,
    artH,
    zoom,
    panX,
    panY,
    activeLayerId,
    activeLayerShapes,
    selectedShapeIds,
    onCanvas2d,
    onZoomChange,
    onPanChange,
    onStartDraw,
    onSelectShape,
    onToggleShape,
    onDeselect,
    onUpdateGeom,
    onMoveBatch,
    onUpdatePts,
  }: {
    artW: number
    artH: number
    zoom: number
    panX: number
    panY: number
    activeLayerId: string | null
    activeLayerShapes: Shape[]
    selectedShapeIds: string[]
    onCanvas2d: (canvas: HTMLCanvasElement) => void
    onZoomChange: (zoom: number, px: number, py: number) => void
    onPanChange: (px: number, py: number) => void
    onStartDraw: (layerId: string, geom: ShapeGeom) => string
    onSelectShape: (shapeId: string) => void
    onToggleShape: (shapeId: string) => void
    onDeselect: () => void
    onUpdateGeom: (layerId: string, shapeId: string, geom: ShapeGeom) => void
    onMoveBatch: (layerId: string, moves: Array<{ shapeId: string; geom?: ShapeGeom; pts?: number[] }>) => void
    onUpdatePts: (layerId: string, shapeId: string, pts: number[]) => void
  } = $props()


  let viewportEl: HTMLDivElement
  let artboardHost: HTMLDivElement
  let canvas2dEl: HTMLCanvasElement
  let rulerH: HTMLCanvasElement   // horizontal (top)
  let rulerV: HTMLCanvasElement   // vertical (left)

  // Space+drag (pan) state
  let spaceHeld  = false
  let dragging   = false
  let dragOrigin = { x: 0, y: 0, panX: 0, panY: 0 }

  // Draw drag state
  let drawDrag: { startNx: number; startNy: number } | null = null
  let drawingShapeId: string | null = null

  // Move drag for geom shapes (rect/ellipse) — $state so cursor derived tracks it
  let moveDrag = $state<{
    shapeId: string
    offsetNx: number
    offsetNy: number
    origW: number
    origH: number
  } | null>(null)

  // Move drag for pts shapes (line/curve/triangle)
  let ptsDrag = $state<{
    shapeId: string
    origPts: number[]
    startNx: number
    startNy: number
  } | null>(null)

  // Multi-shape move drag
  let multiMoveDrag = $state<{
    startNx: number
    startNy: number
    origShapes: Array<{ id: string; geom: ShapeGeom; pts?: number[]; type: string }>
  } | null>(null)

  // Hover hit ($state so cursor derived tracks it)
  let hoverHit = $state(false)

  function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

  function hitTest(nx: number, ny: number): Shape | null {
    const px = nx * artW
    const py = ny * artH
    const PAD = 6  // min click area in pixels
    for (let i = activeLayerShapes.length - 1; i >= 0; i--) {
      const s = activeLayerShapes[i]
      if (s.pts && s.type !== 'arc') {
        // Bounding-box hit for line / curve / triangle
        const xs = s.pts.filter((_, j) => j % 2 === 0).map(v => v * artW)
        const ys = s.pts.filter((_, j) => j % 2 === 1).map(v => v * artH)
        if (px >= Math.min(...xs) - PAD && px <= Math.max(...xs) + PAD &&
            py >= Math.min(...ys) - PAD && py <= Math.max(...ys) + PAD) return s
        continue
      }
      const cx = s.geom.x * artW
      const cy = s.geom.y * artH
      const rw = s.geom.w * artW / 2 + PAD
      const rh = s.geom.h * artW / 2 + PAD
      const dx = px - cx
      const dy = py - cy
      if (s.type === 'rect') {
        if (Math.abs(dx) <= rw && Math.abs(dy) <= rh) return s
      } else {
        if ((dx / rw) ** 2 + (dy / rh) ** 2 <= 1) return s
      }
    }
    return null
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const factor  = e.deltaY < 0 ? 1.12 : 1 / 1.12
    const newZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM)

    const rect = viewportEl.getBoundingClientRect()
    const mx   = e.clientX - rect.left  - rect.width  / 2
    const my   = e.clientY - rect.top   - rect.height / 2

    const newPanX = mx + (panX - mx) * (newZoom / zoom)
    const newPanY = my + (panY - my) * (newZoom / zoom)
    onZoomChange(newZoom, newPanX, newPanY)
  }

  function onPointerDown(e: PointerEvent) {
    if (spaceHeld || e.button === 1) {
      // Pan mode (Space+drag or middle-mouse drag)
      e.preventDefault()
      dragging   = true
      dragOrigin = { x: e.clientX, y: e.clientY, panX, panY }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    if (activeLayerId) {
      const rect = artboardHost.getBoundingClientRect()
      const { nx, ny } = clientToNorm(e.clientX, e.clientY, rect, artW, artH)
      const hit = hitTest(nx, ny)
      if (hit) {
        if (e.shiftKey) {
          // Shift+click: toggle shape in/out of selection
          onToggleShape(hit.id)
        } else if (selectedShapeIds.includes(hit.id) && selectedShapeIds.length > 1) {
          // Clicking inside a multi-selection: move all together
          multiMoveDrag = {
            startNx: nx, startNy: ny,
            origShapes: activeLayerShapes
              .filter(s => selectedShapeIds.includes(s.id))
              .map(s => ({ id: s.id, geom: { ...s.geom }, pts: s.pts ? [...s.pts] : undefined, type: s.type })),
          }
        } else {
          // Single select + move
          onSelectShape(hit.id)
          if (hit.pts && hit.type !== 'arc') {
            ptsDrag  = { shapeId: hit.id, origPts: [...hit.pts], startNx: nx, startNy: ny }
          } else {
            moveDrag = { shapeId: hit.id,
              offsetNx: nx - hit.geom.x, offsetNy: ny - hit.geom.y,
              origW: hit.geom.w, origH: hit.geom.h }
          }
        }
      } else if (!e.shiftKey) {
        // Click on empty canvas (no shift): deselect and enter draw mode
        onDeselect()
        drawDrag = { startNx: nx, startNy: ny }
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (dragging) {
      onPanChange(
        dragOrigin.panX + (e.clientX - dragOrigin.x),
        dragOrigin.panY + (e.clientY - dragOrigin.y),
      )
      return
    }

    const rect = artboardHost.getBoundingClientRect()
    const { nx, ny } = clientToNorm(e.clientX, e.clientY, rect, artW, artH)

    if (multiMoveDrag && activeLayerId) {
      const dx = nx - multiMoveDrag.startNx
      const dy = ny - multiMoveDrag.startNy
      const moves = multiMoveDrag.origShapes.map(orig => {
        if (orig.pts && orig.type !== 'arc') {
          return { shapeId: orig.id, pts: orig.pts.map((v, i) => i % 2 === 0 ? v + dx : v + dy) }
        }
        return { shapeId: orig.id, geom: { ...orig.geom, x: orig.geom.x + dx, y: orig.geom.y + dy } }
      })
      onMoveBatch(activeLayerId, moves)
      return
    }

    if (ptsDrag && activeLayerId) {
      const dx = nx - ptsDrag.startNx
      const dy = ny - ptsDrag.startNy
      const newPts = ptsDrag.origPts.map((v, i) => i % 2 === 0 ? v + dx : v + dy)
      onUpdatePts(activeLayerId, ptsDrag.shapeId, newPts)
      return
    }

    if (moveDrag && activeLayerId) {
      onUpdateGeom(activeLayerId, moveDrag.shapeId, {
        x: nx - moveDrag.offsetNx,
        y: ny - moveDrag.offsetNy,
        w: moveDrag.origW,
        h: moveDrag.origH,
      })
      return
    }

    if (drawDrag && activeLayerId) {
      const x1 = Math.min(drawDrag.startNx, nx)
      const y1 = Math.min(drawDrag.startNy, ny)
      const x2 = Math.max(drawDrag.startNx, nx)
      const y2 = Math.max(drawDrag.startNy, ny)

      const w = Math.max(0.005, x2 - x1)
      // y drag distance is in artH-fractions; convert h to artW-fractions so equal w/h = circle
      const h = Math.max(0.005, (y2 - y1) * artH / artW)
      const geom = { x: (x1 + x2) / 2, y: (y1 + y2) / 2, w, h }

      if (drawingShapeId === null) {
        drawingShapeId = onStartDraw(activeLayerId, geom)
      } else {
        onUpdateGeom(activeLayerId, drawingShapeId, geom)
      }
      return
    }

    // Hover detection (no drag active)
    hoverHit = activeLayerId !== null && hitTest(nx, ny) !== null
  }

  function onPointerUp() {
    dragging       = false
    drawDrag       = null
    drawingShapeId = null
    moveDrag       = null
    ptsDrag        = null
    multiMoveDrag  = null
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space' && !e.repeat) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.closest('.cm-editor')) return
      e.preventDefault()
      spaceHeld = true
    }
  }
  function handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') spaceHeld = false
  }

  /** Pick a nice tick interval for rulers based on zoom level */
  function rulerStep(zoom: number): number {
    const pxPerUnit = zoom  // 1 artboard-px = `zoom` screen-px
    // We want ticks roughly every 60-120 screen-px apart
    const raw = 80 / pxPerUnit
    const mag = Math.pow(10, Math.floor(Math.log10(raw)))
    const norm = raw / mag
    if (norm < 2) return mag * 1
    if (norm < 5) return mag * 2
    return mag * 5
  }

  function drawRulers() {
    if (!rulerH || !rulerV || !viewportEl) return
    const dpr = window.devicePixelRatio || 1
    const vpRect = viewportEl.getBoundingClientRect()
    const vpW = vpRect.width
    const vpH = vpRect.height

    // --- Horizontal ruler ---
    const hRulerW = vpW - RULER_SIZE
    rulerH.width  = hRulerW * dpr
    rulerH.height = RULER_SIZE * dpr
    rulerH.style.width  = hRulerW + 'px'
    rulerH.style.height = RULER_SIZE + 'px'
    const hCtx = rulerH.getContext('2d')!
    hCtx.scale(dpr, dpr)

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
    const textColor = isDark ? '#a0a0b0' : '#555568'
    const lineColor = isDark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.15)'
    const bgColor   = isDark ? '#131316' : '#ebebef'

    hCtx.fillStyle = bgColor
    hCtx.fillRect(0, 0, hRulerW, RULER_SIZE)

    // Artboard left edge in viewport screen coords, offset by ruler bar
    const artScreenLeft = vpW / 2 + panX - (artW / 2) * zoom - RULER_SIZE
    const step = rulerStep(zoom)
    const startPx = Math.floor(-artScreenLeft / (zoom * step)) * step
    const endPx   = Math.ceil((hRulerW - artScreenLeft) / (zoom * step)) * step

    hCtx.fillStyle = textColor
    hCtx.font = '11px system-ui, sans-serif'
    hCtx.textAlign = 'center'
    hCtx.textBaseline = 'top'

    for (let px = startPx; px <= endPx; px += step) {
      const sx = artScreenLeft + px * zoom
      if (sx < 0 || sx > hRulerW) continue

      // Major tick
      hCtx.strokeStyle = lineColor
      hCtx.beginPath()
      hCtx.moveTo(sx, RULER_SIZE - 8)
      hCtx.lineTo(sx, RULER_SIZE)
      hCtx.lineWidth = 1
      hCtx.stroke()

      hCtx.fillText(String(Math.round(px)), sx, 3)

      // Minor ticks (5 subdivisions)
      const minor = step / 5
      if (minor * zoom >= 4) { // only show if at least 4px apart
        for (let m = 1; m < 5; m++) {
          const mx = artScreenLeft + (px + m * minor) * zoom
          if (mx < 0 || mx > hRulerW) continue
          hCtx.beginPath()
          hCtx.moveTo(mx, RULER_SIZE - 4)
          hCtx.lineTo(mx, RULER_SIZE)
          hCtx.stroke()
        }
      }
    }

    // --- Vertical ruler ---
    const vRulerH = vpH - RULER_SIZE
    rulerV.width  = RULER_SIZE * dpr
    rulerV.height = vRulerH * dpr
    rulerV.style.width  = RULER_SIZE + 'px'
    rulerV.style.height = vRulerH + 'px'
    const vCtx = rulerV.getContext('2d')!
    vCtx.scale(dpr, dpr)

    vCtx.fillStyle = bgColor
    vCtx.fillRect(0, 0, RULER_SIZE, vRulerH)

    const artScreenTop = vpH / 2 + panY - (artH / 2) * zoom - RULER_SIZE
    const vStep = rulerStep(zoom)
    const vStart = Math.floor(-artScreenTop / (zoom * vStep)) * vStep
    const vEnd   = Math.ceil((vRulerH - artScreenTop) / (zoom * vStep)) * vStep

    vCtx.fillStyle = textColor
    vCtx.font = '11px system-ui, sans-serif'
    vCtx.textAlign = 'center'
    vCtx.textBaseline = 'bottom'

    for (let py = vStart; py <= vEnd; py += vStep) {
      const sy = artScreenTop + py * zoom
      if (sy < 0 || sy > vRulerH) continue

      vCtx.strokeStyle = lineColor
      vCtx.beginPath()
      vCtx.moveTo(RULER_SIZE - 8, sy)
      vCtx.lineTo(RULER_SIZE, sy)
      vCtx.lineWidth = 1
      vCtx.stroke()

      vCtx.save()
      vCtx.translate(RULER_SIZE / 2, sy - 3)
      vCtx.rotate(-Math.PI / 2)
      vCtx.textAlign = 'left'
      vCtx.textBaseline = 'middle'
      vCtx.fillText(String(Math.round(py)), 0, 0)
      vCtx.restore()

      const vMinor = vStep / 5
      if (vMinor * zoom >= 4) {
        for (let m = 1; m < 5; m++) {
          const my = artScreenTop + (py + m * vMinor) * zoom
          if (my < 0 || my > vRulerH) continue
          vCtx.beginPath()
          vCtx.moveTo(RULER_SIZE - 4, my)
          vCtx.lineTo(RULER_SIZE, my)
          vCtx.stroke()
        }
      }
    }
  }

  // Track theme so rulers repaint on theme change
  let currentTheme = $state(document.documentElement.getAttribute('data-theme') ?? 'dark')

  $effect(() => {
    const obs = new MutationObserver(() => {
      currentTheme = document.documentElement.getAttribute('data-theme') ?? 'dark'
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  })

  $effect(() => {
    // Re-draw rulers when zoom, pan, artboard size, or theme changes
    void zoom; void panX; void panY; void artW; void artH; void currentTheme
    drawRulers()
  })

  onMount(() => {
    onCanvas2d(canvas2dEl)
    drawRulers()
    const onResize = () => drawRulers()
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup',   handleKeyUp)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup',   handleKeyUp)
    }
  })

  // CSS transform string
  const transform = $derived(
    `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${zoom})`
  )

  // Cursor style
  const cursor = $derived(
    dragging
      ? 'grabbing'
      : spaceHeld
        ? 'grab'
        : (moveDrag !== null || ptsDrag !== null || multiMoveDrag !== null)
          ? 'move'
          : activeLayerId
            ? (hoverHit ? 'move' : 'crosshair')
            : 'default'
  )
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="viewport"
  bind:this={viewportEl}
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  style:cursor
>
  <div
    class="artboard-host"
    bind:this={artboardHost}
    style:transform
    style:width="{artW}px"
    style:height="{artH}px"
  >
    <canvas
      bind:this={canvas2dEl}
      width={artW}
      height={artH}
      style:position="absolute"
      style:width="{artW}px"
      style:height="{artH}px"
    ></canvas>
  </div>

  <!-- Rulers -->
  <canvas class="ruler ruler-h" bind:this={rulerH}></canvas>
  <canvas class="ruler ruler-v" bind:this={rulerV}></canvas>
  <div class="ruler-corner"></div>
</div>

<style>
  .viewport {
    position: fixed;
    top: 44px;
    left: 0;
    right: var(--panel-w, 260px);
    bottom: calc(36px + var(--code-panel-h, 0px));
    background: var(--viewport-bg);
    overflow: hidden;
    /* subtle grid to show the void */
    background-image:
      linear-gradient(var(--viewport-grid) 1px, transparent 1px),
      linear-gradient(90deg, var(--viewport-grid) 1px, transparent 1px);
    background-size: 40px 40px;
  }

  .artboard-host {
    position: absolute;
    top: 50%;
    left: 50%;
    transform-origin: center center;
    background: #ffffff;
    box-shadow: 0 8px 40px var(--artboard-shadow), 0 0 0 1px rgba(128,128,128,.1);
    outline: 1px solid var(--viewport-bg);
    will-change: transform;
    isolation: isolate;
  }

  canvas {
    display: block;
  }

  .ruler {
    position: absolute;
    z-index: 10;
    pointer-events: none;
  }
  .ruler-h {
    top: 0;
    left: 22px;
    right: 0;
    height: 22px;
    border-bottom: 1px solid rgba(128,128,128,.15);
  }
  .ruler-v {
    top: 22px;
    left: 0;
    bottom: 0;
    width: 22px;
    border-right: 1px solid rgba(128,128,128,.15);
  }
  .ruler-corner {
    position: absolute;
    top: 0;
    left: 0;
    width: 22px;
    height: 22px;
    z-index: 11;
    background: var(--bg-bar, #131316);
    border-right: 1px solid rgba(128,128,128,.15);
    border-bottom: 1px solid rgba(128,128,128,.15);
  }
</style>
