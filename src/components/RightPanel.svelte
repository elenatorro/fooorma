<script lang="ts">
  import type { Layer, Shape, ShapeEffect, ShapeGeom } from '../lib/layers/types'
  import type { Palette } from '../lib/palettes/index'
  import { evaluateQuery } from '../lib/query/index'
  import ColorPicker from './ColorPicker.svelte'
  import GradColorEditor from './GradColorEditor.svelte'
  import CodeEditor from './CodeEditor.svelte'
  import SliderRow from './SliderRow.svelte'

  const {
    artW,
    artH,
    layers,
    activeLayerId,
    activeShapeId,
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
    onUpdateGeom,
    palettes,
    onAddPalette,
    onUpdatePalette,
    onDeletePalette,
  }: {
    artW: number
    artH: number
    layers: Layer[]
    activeLayerId: string | null
    activeShapeId: string | null
    activeTab: 'layers' | 'effects' | 'palettes'
    onTabChange: (t: 'layers' | 'effects' | 'palettes') => void
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
    onUpdateGeom: (layerId: string, shapeId: string, geom: ShapeGeom) => void
    palettes: Palette[]
    onAddPalette: () => void
    onUpdatePalette: (id: string, update: Partial<Palette>) => void
    onDeletePalette: (id: string) => void
  } = $props()

  const activeLayer = $derived(layers.find(l => l.id === activeLayerId) ?? null)
  const activeShape = $derived(activeLayer?.shapes.find(s => s.id === activeShapeId) ?? null)
  const isCodeMode  = $derived(activeLayer?.mode === 'code')
  const codeResult  = $derived(isCodeMode && activeLayer ? evaluateQuery(activeLayer.query, artW, artH, palettes) : null)

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
    if (!sentinelEl || !shapeListEl) return
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) visibleEnd = Math.min(visibleEnd + 50, listShapes.length) },
      { root: shapeListEl },
    )
    io.observe(sentinelEl)
    return () => io.disconnect()
  })

  // Code editor state
  let codeExpanded = $state(false)
  let apiOpen      = $state(false)
  let editorRef    = $state<{ insertAtCursor: (t: string) => void; getColorAtCursor: () => { hex: string; from: number; to: number } | null; replaceRange: (from: number, to: number, text: string) => void; focus: () => void } | null>(null)

  const apiSnippets: { name: string; sig: string; code: string }[] = [
    { name: 'rect',     sig: 'x, y, w, h, color?, opacity?, stroke?',        code: "rect(0.5, 0.5, 0.3, 0.3, '#8b5cf6', 0.85)" },
    { name: 'ellipse',  sig: 'x, y, w, h, color?, opacity?, stroke?',        code: "ellipse(0.5, 0.5, 0.3, 0.3, '#8b5cf6', 0.85)" },
    { name: 'triangle', sig: 'x1,y1, x2,y2, x3,y3, color?, opacity?, stroke?', code: "triangle(0.5, 0.1, 0.2, 0.9, 0.8, 0.9, '#8b5cf6', 0.85)" },
    { name: 'arc',      sig: 'cx, cy, r, startDeg, endDeg, color?, opacity?, stroke?', code: "arc(0.5, 0.5, 0.2, 0, 270, '#8b5cf6', 0.85)" },
    { name: 'line',     sig: 'x1, y1, x2, y2, color?, opacity?, width?',     code: "line(0.1, 0.5, 0.9, 0.5, '#8b5cf6', 0.85)" },
    { name: 'curve',    sig: 'x1, y1, cx, cy, x2, y2, color?, opacity?, width?', code: "curve(0.1, 0.5, 0.5, 0.15, 0.9, 0.5, '#8b5cf6', 0.85)" },
    { name: 'spline',      sig: '[x1,y1,...], color?, opacity?, width?',        code: "spline([0.1, 0.3, 0.3, 0.7, 0.5, 0.4, 0.7, 0.7, 0.9, 0.3], '#8b5cf6', 0.85)" },
    { name: 'beginSpline', sig: '—',                                           code: "beginSpline()\nrepeat(20, (i, t) => {\n  vertex(t, 0.3 + nz(t * 4) * 0.4)\n})\nendSpline('#8b5cf6', 0.85)" },
    { name: 'vertex',      sig: 'x, y',                                        code: "vertex(0.5, 0.3)" },
    { name: 'endSpline',   sig: 'color?, opacity?, width?',                    code: "endSpline('#8b5cf6', 0.85, 0.006)" },
    { name: 'nz',          sig: 'x, y? → 0..1',                               code: "// nz(x, y) — deterministic value noise\nbeginSpline()\nrepeat(20, (i, t) => {\n  vertex(t, 0.3 + nz(t * 4) * 0.4)\n})\nendSpline('#8b5cf6', 0.85)" },
    { name: 'stroke',    sig: "hex, opacity?, width?, align?, join?",           code: "stroke('#000000', 1, 0.005)" },
    { name: 'rotate',    sig: 'deg',                                           code: "rotate(45)" },
    { name: 'transform', sig: '{ rotate?, scaleX?, scaleY?, skewX?, skewY? }', code: "transform({ rotate: 45, scaleX: 1.2 })" },
    { name: 'shadow',   sig: "color?, opacity?, blur?, offsetX?, offsetY?",   code: "shadow('#000000', 0.5, 10, 0, 4)" },
    { name: 'blur',     sig: 'amount?',                                        code: "blur(4)" },
    { name: 'bevel',    sig: 'intensity?',                                     code: "bevel(0.6)" },
    { name: 'noise',    sig: 'amount?',                                        code: "noise(0.3)" },
    { name: 'warp',     sig: 'strength?, freq?',                              code: "warp(8, 0.05)" },
    { name: 'grad',      sig: 'angle, …stops',                                code: "grad(90, '#8b5cf6', '#4ecdc4')" },
    { name: 'radGrad',  sig: '…stops',                                       code: "radGrad('#8b5cf6', '#4ecdc4')" },
    { name: 'repeat',   sig: 'n, (i, t) => { }',                                    code: "repeat(8, (i, t) => {\n  rect((i + 0.5) / 8, 0.5, 0.1, 0.1)\n})" },
    { name: 'grid',     sig: 'cols, rows, (c, r, ct, rt) => { }',                  code: "grid(4, 4, (c, r) => {\n  rect((c + 0.5) / 4, (r + 0.5) / 4, 0.2, 0.2)\n})" },
    { name: 'wave',     sig: 'n, amplitude, frequency, (i, t, x, y) => { }',      code: "wave(16, 0.2, 1.5, (i, t, x, y) => {\n  ellipse(x, y, 0.04, 0.04, '#8b5cf6', 0.85)\n})" },
    { name: 'circular', sig: 'n, cx, cy, r, (i, t, x, y, angle) => { }',         code: "circular(12, 0.5, 0.5, 0.35, (i, t, x, y, angle) => {\n  ellipse(x, y, 0.06, 0.06, '#8b5cf6', 0.85)\n})" },
  ]

  // ── Cursor color detection ─────────────────────────────────────────────────
  let cursorColor = $state<{ hex: string; from: number; to: number } | null>(null)

  function detectColorAtCursor() {
    cursorColor = editorRef?.getColorAtCursor() ?? null
  }

  function onCursorColorChange(newHex: string) {
    if (!cursorColor) return
    editorRef?.replaceRange(cursorColor.from, cursorColor.to, newHex)
    cursorColor = { ...cursorColor, hex: newHex, to: cursorColor.from + 7 }
  }

  function copyCode() {
    if (activeLayer) navigator.clipboard.writeText(activeLayer.query)
  }

  function insertSnippet(code: string) {
    if (!activeLayer) return
    editorRef?.insertAtCursor(code)
  }

  // Template builder state
  let tpl        = $state<'single' | 'row' | 'grid' | 'spiral' | 'wave' | 'circular'>('row')
  let tplCount   = $state(8)
  let tplCols    = $state(4)
  let tplRows    = $state(4)
  let tplShape   = $state<'rect' | 'ellipse' | 'arc' | 'line' | 'curve' | 'triangle'>('rect')
  let tplColor   = $state('#8b5cf6')
  let tplOpacity = $state(0.85)

  function buildTemplate(): string {
    const color = `'${tplColor}'`
    const op = tplOpacity.toFixed(2)
    const s  = tplShape
    const n  = tplCount
    const nc = tplCols
    const nr = tplRows

    if (tpl === 'single') {
      if (s === 'arc')      return `arc(0.5, 0.5, 0.2, 0, 270, ${color}, ${op})`
      if (s === 'line')     return `line(0.1, 0.5, 0.9, 0.5, ${color}, ${op})`
      if (s === 'curve')    return `curve(0.1, 0.5, 0.5, 0.1, 0.9, 0.5, ${color}, ${op})`
      if (s === 'triangle') return `triangle(0.5, 0.1, 0.2, 0.9, 0.8, 0.9, ${color}, ${op})`
      return `${s}(0.5, 0.5, 0.7, 0.7, ${color}, ${op})`
    }

    if (tpl === 'row') {
      if (s === 'rect' || s === 'ellipse')
        return `repeat(${n}, (i, t) => {\n  ${s}((i + 0.5) / ${n}, 0.5, 1/${n} * 0.85, 0.4, ${color}, ${op})\n})`
      if (s === 'arc')
        return `repeat(${n}, (i, t) => {\n  arc((i + 0.5) / ${n}, 0.5, 1/${n} * 0.4, 0, 270, ${color}, ${op})\n})`
      if (s === 'line')
        return `repeat(${n}, (i, t) => {\n  line(0.1, (i + 0.5) / ${n}, 0.9, (i + 0.5) / ${n}, ${color}, ${op})\n})`
      if (s === 'curve')
        return `repeat(${n}, (i, t) => {\n  const y = (i + 0.5) / ${n}\n  curve(0.1, y - 0.06, 0.5, y + 0.06, 0.9, y - 0.06, ${color}, ${op})\n})`
      return `repeat(${n}, (i, t) => {\n  const cx = (i + 0.5) / ${n}\n  const d = 1/${n} * 0.4\n  triangle(cx, 0.5 - d, cx - d, 0.5 + d, cx + d, 0.5 + d, ${color}, ${op})\n})`
    }

    if (tpl === 'grid') {
      if (s === 'rect' || s === 'ellipse')
        return `grid(${nc}, ${nr}, (c, r) => {\n  ${s}((c + 0.5) / ${nc}, (r + 0.5) / ${nr}, 1/${nc} * 0.85, 1/${nr} * 0.85, ${color}, ${op})\n})`
      if (s === 'arc')
        return `grid(${nc}, ${nr}, (c, r) => {\n  arc((c + 0.5) / ${nc}, (r + 0.5) / ${nr}, 1/${nc} * 0.4, 0, 270, ${color}, ${op})\n})`
      if (s === 'line')
        return `grid(${nc}, ${nr}, (c, r) => {\n  const x = (c + 0.5) / ${nc}\n  const y = (r + 0.5) / ${nr}\n  const d = 1/${nc} * 0.4\n  line(x - d, y, x + d, y, ${color}, ${op})\n})`
      if (s === 'curve')
        return `grid(${nc}, ${nr}, (c, r) => {\n  const x = (c + 0.5) / ${nc}\n  const y = (r + 0.5) / ${nr}\n  const d = 1/${nc} * 0.4\n  curve(x - d, y, x, y - d, x + d, y, ${color}, ${op})\n})`
      return `grid(${nc}, ${nr}, (c, r) => {\n  const x = (c + 0.5) / ${nc}\n  const y = (r + 0.5) / ${nr}\n  const d = 1/${nc} * 0.4\n  triangle(x, y - d, x - d, y + d, x + d, y + d, ${color}, ${op})\n})`
    }

    // spiral
    if (tpl === 'spiral') {
      if (s === 'rect' || s === 'ellipse')
        return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  ${s}(0.5 + cos(angle) * r, 0.5 + sin(angle) * r, 0.03 + t * 0.05, 0.03 + t * 0.05, ${color}, ${op})\n})`
      if (s === 'arc')
        return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  arc(0.5 + cos(angle) * r, 0.5 + sin(angle) * r, 0.03 + t * 0.05, 0, 270, ${color}, ${op})\n})`
      if (s === 'line')
        return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  const cx = 0.5 + cos(angle) * r\n  const cy = 0.5 + sin(angle) * r\n  const len = 0.015 + t * 0.025\n  const nx = cos(angle + PI / 2) * len\n  const ny = sin(angle + PI / 2) * len\n  line(cx - nx, cy - ny, cx + nx, cy + ny, ${color}, ${op})\n})`
      if (s === 'curve')
        return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  const cx = 0.5 + cos(angle) * r\n  const cy = 0.5 + sin(angle) * r\n  const d = 0.03 + t * 0.04\n  curve(cx - d, cy, cx, cy - d, cx + d, cy, ${color}, ${op})\n})`
      return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  const cx = 0.5 + cos(angle) * r\n  const cy = 0.5 + sin(angle) * r\n  const d = 0.02 + t * 0.03\n  triangle(cx, cy - d, cx - d, cy + d, cx + d, cy + d, ${color}, ${op})\n})`
    }

    // wave
    if (tpl === 'wave') {
      if (s === 'rect' || s === 'ellipse')
        return `wave(${n}, 0.2, 1.5, (i, t, x, y) => {\n  ${s}(x, y, 1/${n} * 0.7, 1/${n} * 0.7, ${color}, ${op})\n})`
      if (s === 'arc')
        return `wave(${n}, 0.2, 1.5, (i, t, x, y) => {\n  arc(x, y, 1/${n} * 0.35, 0, 270, ${color}, ${op})\n})`
      if (s === 'line')
        return `wave(${n}, 0.2, 1.5, (i, t, x, y) => {\n  line(x - 0.02, y, x + 0.02, y, ${color}, ${op})\n})`
      if (s === 'curve')
        return `wave(${n}, 0.2, 1.5, (i, t, x, y) => {\n  const d = 1/${n} * 0.3\n  curve(x - d, y, x, y - d, x + d, y, ${color}, ${op})\n})`
      return `wave(${n}, 0.2, 1.5, (i, t, x, y) => {\n  const d = 1/${n} * 0.35\n  triangle(x, y - d, x - d, y + d, x + d, y + d, ${color}, ${op})\n})`
    }

    // circular
    if (s === 'rect' || s === 'ellipse')
      return `circular(${n}, 0.5, 0.5, 0.32, (i, t, x, y, angle) => {\n  ${s}(x, y, 0.08, 0.08, ${color}, ${op})\n})`
    if (s === 'arc')
      return `circular(${n}, 0.5, 0.5, 0.32, (i, t, x, y, angle) => {\n  arc(x, y, 0.04, 0, 270, ${color}, ${op})\n})`
    if (s === 'line')
      return `circular(${n}, 0.5, 0.5, 0.32, (i, t, x, y, angle) => {\n  const nx = cos(angle) * 0.03\n  const ny = sin(angle) * 0.03\n  line(x - nx, y - ny, x + nx, y + ny, ${color}, ${op})\n})`
    if (s === 'curve')
      return `circular(${n}, 0.5, 0.5, 0.32, (i, t, x, y, angle) => {\n  const d = 0.04\n  curve(x - d, y, x, y - d, x + d, y, ${color}, ${op})\n})`
    return `circular(${n}, 0.5, 0.5, 0.32, (i, t, x, y, angle) => {\n  const d = 0.03\n  triangle(x, y - d, x - d, y + d, x + d, y + d, ${color}, ${op})\n})`
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
      class:active={activeTab === 'effects'}
      onclick={() => onTabChange('effects')}
    >Effects</button>
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
            <span class="shape-badge">{layer.shapes.length}</span>

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

      <button class="add-layer-btn" onclick={onAddLayer}>+ Add layer</button>
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
            {#each ([['rect','▭','Rect'],['ellipse','◯','Ellipse'],['arc','◜','Arc'],['line','╱','Line'],['curve','∿','Curve'],['triangle','△','Triangle']] as const) as [val, icon, label]}
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
        >→ Insert code</button>
      </section>
    {/if}

    <!-- Code editor (code mode) -->
    {#if activeLayer && isCodeMode}
      <section class="section code-section" class:expanded={codeExpanded}>

        <!-- Toolbar -->
        <div class="code-toolbar">
          <span class="code-label">Code</span>
          {#if cursorColor}
            <div class="code-color-pick" title="Edit color at cursor">
              <ColorPicker
                hex={cursorColor.hex}
                showOpacity={false}
                onChange={onCursorColorChange}
              />
              <span class="code-color-hex">{cursorColor.hex}</span>
            </div>
          {/if}
          <div class="code-actions">
            <button class="code-tool-btn" title="Copy code" onclick={copyCode}>copy</button>
            <button class="code-tool-btn" title="Clear" onclick={() => activeLayer && onSetQuery(activeLayer.id, '')}>clear</button>
            <button class="code-tool-btn expand-btn" class:active={codeExpanded} title={codeExpanded ? 'Collapse' : 'Expand'} onclick={() => codeExpanded = !codeExpanded}>↕</button>
          </div>
        </div>

        <!-- Editor area -->
        <CodeEditor
          bind:this={editorRef}
          value={activeLayer.query}
          minHeight={codeExpanded ? '400px' : '220px'}
          extraCompletions={palettes.map(p => `palette('${p.name}', 0)`)}
          onChange={(v) => { onSetQuery(activeLayer.id, v); detectColorAtCursor() }}
          onCursorChange={detectColorAtCursor}
        />

        <!-- Status bar -->
        <div class="code-statusbar">
          {#if codeResult?.errors.length}
            <span class="status-err">● {codeResult.errors.length} error{codeResult.errors.length !== 1 ? 's' : ''}</span>
          {:else if codeResult}
            <span class="status-ok">● {codeResult.shapes.length} shape{codeResult.shapes.length !== 1 ? 's' : ''}</span>
          {:else}
            <span class="status-idle">—</span>
          {/if}
          <span class="status-lines">{activeLayer.query.split('\n').length} lines</span>
        </div>

        <!-- Error details -->
        {#if codeResult?.errors.length}
          <div class="error-list">
            {#each codeResult.errors as err}
              <p class="error-line">{err}</p>
            {/each}
          </div>
        {/if}

        <!-- API Reference -->
        <div class="api-ref">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="api-ref-toggle" onclick={() => apiOpen = !apiOpen}>
            <span>API Reference</span>
            <span class="api-chevron">{apiOpen ? '▴' : '▾'}</span>
          </div>
          {#if apiOpen}
            <div class="api-ref-body">
              {#each apiSnippets as snip}
                <button class="api-snip" onclick={() => insertSnippet(snip.code)} title="Insert at cursor">
                  <span class="api-snip-name">{snip.name}</span>
                  <span class="api-snip-sig">{snip.sig}</span>
                </button>
              {/each}
              <div class="api-consts">
                {#each ['W', 'H', 'PI', 'TAU', 'sin', 'cos', 'abs', 'min', 'max', 'floor', 'ceil', 'round', 'random'] as c}
                  <button class="api-const-btn" onclick={() => insertSnippet(c)} title={c}>{c}</button>
                {/each}
                {#each palettes as p}
                  <button class="api-const-btn palette-var-btn" onclick={() => insertSnippet(`palette('${p.name}', 0)`)} title="{p.name} — {p.colors.length} colors">
                    <span class="palette-var-dots">
                      {#each p.colors.slice(0, 5) as c}
                        <span class="palette-dot" style:background={c}></span>
                      {/each}
                    </span>
                    {p.name}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>

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
              class="shape-row"
              class:selected={!isCodeMode && shape.id === activeShapeId}
              onclick={() => { if (!isCodeMode) onSelectShape(shape.id) }}
            >
              <span class="shape-type-badge">{ ({rect:'▭',ellipse:'◯',arc:'◜',line:'╱',curve:'∿',triangle:'△',spline:'〜'} as Record<string,string>)[shape.type] }</span>
              <span class="shape-auto-name">
                { ({rect:'Rect',ellipse:'Ellipse',arc:'Arc',line:'Line',curve:'Curve',triangle:'Triangle',spline:'Spline'} as Record<string,string>)[shape.type] } {i + 1}
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
            onChange={(c) => onUpdateShape(activeLayer.id, activeShape.id, { color: c })}
          />
        </div>

        <!-- Stroke (rect / ellipse / arc / triangle) -->
        {#if activeShape.type !== 'line' && activeShape.type !== 'curve'}
          <div class="prop-row" style:margin-top="10px">
            <label class="prop-label">Stroke</label>
            <div class="color-control">
              <input
                type="checkbox"
                checked={!!activeShape.stroke}
                onchange={(e) => onUpdateShape(activeLayer.id, activeShape.id, {
                  stroke: (e.target as HTMLInputElement).checked
                    ? { hex: '#000000', opacity: 1, width: 0.005 }
                    : undefined
                })}
              />
            </div>
          </div>
          {#if activeShape.stroke}
            <GradColorEditor
              color={{ hex: activeShape.stroke.hex, opacity: activeShape.stroke.opacity, gradient: activeShape.stroke.gradient }}
              onChange={(c) => onUpdateShape(activeLayer.id, activeShape.id, {
                stroke: { ...activeShape.stroke!, hex: c.hex, opacity: c.opacity, gradient: c.gradient }
              })}
            />
            {@const sk = activeShape.stroke}
            <SliderRow id="stroke-width" label="Width" min={0.001} max={0.05} step={0.001}
              value={sk.width}
              onchange={(v) => onUpdateShape(activeLayer.id, activeShape.id, { stroke: { ...sk, width: v } })}
            />
            <div class="prop-row">
              <label class="prop-label">Align</label>
              <div class="mini-toggle">
                {#each (['center','inner','outer'] as const) as a}
                  <button class="mini-btn" class:active={( sk.align ?? 'center') === a}
                    onclick={() => onUpdateShape(activeLayer.id, activeShape.id, { stroke: { ...sk, align: a } })}
                  >{a}</button>
                {/each}
              </div>
            </div>
            <div class="prop-row">
              <label class="prop-label">Join</label>
              <div class="mini-toggle">
                {#each (['miter','round','bevel'] as const) as j}
                  <button class="mini-btn" class:active={(sk.join ?? 'miter') === j}
                    onclick={() => onUpdateShape(activeLayer.id, activeShape.id, { stroke: { ...sk, join: j } })}
                  >{j}</button>
                {/each}
              </div>
            </div>
          {/if}
        {/if}

        <!-- Rotation slider (all shape types) -->
        <SliderRow id="shape-rotate" label="Rotate" min={-180} max={180} step={1}
          value={activeShape.transform?.rotate ?? 0}
          onchange={(v) => onUpdateShape(activeLayer.id, activeShape.id, { transform: { ...activeShape.transform, rotate: v } })}
          style="margin-top: 10px"
        />

        <!-- Geometry sliders (rect / ellipse / arc center) -->
        {#if activeShape.type === 'rect' || activeShape.type === 'ellipse' || activeShape.type === 'arc'}
          <h2 class="section-title" style:margin-top="12px">Position & Size</h2>
          {#each geomKeys.filter(k => activeShape.type !== 'arc' || k.key === 'x' || k.key === 'y') as { label, key }}
            <SliderRow id={`geom-${key}`} {label} min={0} max={1} step={0.001}
              value={activeShape.geom[key]}
              onchange={(v) => onUpdateGeom(activeLayer.id, activeShape.id, { ...activeShape.geom, [key]: v })}
            />
          {/each}
        {/if}

        <!-- Arc sliders -->
        {#if activeShape.type === 'arc'}
          <h2 class="section-title" style:margin-top="12px">Arc</h2>
          <SliderRow id="arc-r" label="Radius" min={0.01} max={1} step={0.001}
            value={activeShape.geom.w / 2}
            onchange={(v) => onUpdateGeom(activeLayer.id, activeShape.id, { ...activeShape.geom, w: v * 2, h: v * 2 })}
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
              onchange={(v) => onUpdateShape(activeLayer.id, activeShape.id, { strokeWidth: v })}
            />
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
      <button class="add-layer-btn" onclick={onAddPalette}>+ New palette</button>
    </section>

    <!-- Usage hint -->
    <section class="section">
      <p class="palette-hint">Use palette variables in code mode:<br>
        <code>repeat(8, (i, t) =&gt; &#123;<br>
          &nbsp;&nbsp;rect(…, Neon[i % Neon.length])<br>
        &#125;)</code>
      </p>
    </section>
  {/if}

  <!-- ── Effects tab ── -->
  {#if activeTab === 'effects'}

    <!-- Per-shape shaders -->
    <section class="section">
      <h2 class="section-title">Shaders</h2>
      {#if activeShape && activeLayer}
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

        <!-- Blur -->
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

      {:else}
        <p class="fx-hint">Select a shape in the Layers tab to apply shaders.</p>
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

  /* ── Code editor ── */
  .code-section {
    padding: 0;
  }

  .code-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 12px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-inner);
  }

  .code-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: var(--accent);
  }

  .code-color-pick {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-right: 4px;
  }

  .code-color-hex {
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 10px;
    color: var(--text-4);
    letter-spacing: .04em;
  }

  .code-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .code-tool-btn {
    background: none;
    border: none;
    color: var(--text-6);
    font-size: 10px;
    font-weight: 500;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
    letter-spacing: .03em;
    transition: color .1s, background .1s;
  }
  .code-tool-btn:hover { color: var(--text-2); background: var(--bg-hover); }
  .code-tool-btn.active { color: var(--accent-text); }

  .expand-btn { font-size: 13px; }

  .code-statusbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-inner);
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 10px;
  }
  .status-ok   { color: var(--text-ok); }
  .status-err  { color: var(--text-err); }
  .status-idle { color: var(--text-7); }
  .status-lines { margin-left: auto; color: var(--text-7); }

  .error-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 6px 12px;
    background: var(--bg-error);
    border-bottom: 1px solid var(--border-inner);
  }

  .error-line {
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 10px;
    color: var(--text-err);
    padding: 3px 0;
    word-break: break-all;
    border-bottom: 1px solid var(--border-error);
  }
  .error-line:last-child { border-bottom: none; }

  /* ── API Reference ── */
  .api-ref {
    background: var(--bg-sunken);
  }

  .api-ref-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 12px;
    border-top: 1px solid var(--border-inner);
    color: var(--text-6);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .08em;
    cursor: pointer;
    transition: color .1s, background .1s;
    user-select: none;
  }
  .api-ref-toggle:hover { color: var(--text-3); background: var(--bg-panel); }

  .api-chevron { font-size: 9px; }

  .api-ref-body {
    padding: 6px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .api-snip {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 5px 8px;
    background: var(--bg-panel);
    border: 1px solid var(--border-inner);
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    transition: border-color .1s, background .1s;
  }
  .api-snip:hover { border-color: var(--accent); background: var(--bg-selected); }

  .api-snip-name {
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    color: var(--accent-text);
    font-weight: 600;
    flex-shrink: 0;
  }

  .api-snip-sig {
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 9px;
    color: var(--text-7);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .api-consts {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 4px;
  }

  .api-const-btn {
    padding: 2px 7px;
    background: var(--bg-panel);
    border: 1px solid var(--border-inner);
    border-radius: 3px;
    color: var(--text-5);
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 10px;
    cursor: pointer;
    transition: border-color .1s, color .1s, background .1s;
  }
  .api-const-btn:hover { border-color: var(--accent); color: var(--accent-text); background: var(--bg-selected); }

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
</style>
