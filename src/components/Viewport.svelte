<script lang="ts">
  import { onMount } from 'svelte'
  import { clientToNorm } from '../lib/layers/renderer2d'
  import type { Shape, ShapeGeom } from '../lib/layers/types'
  import { MIN_ZOOM, MAX_ZOOM } from '../lib/viewport'

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

  onMount(() => {
    onCanvas2d(canvas2dEl)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup',   handleKeyUp)
    return () => {
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
</style>
