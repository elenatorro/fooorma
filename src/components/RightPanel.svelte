<script lang="ts">
  import type { SketchDef } from '../lib/sketches/types'
  import type { Layer, Shape, ShapeGeom } from '../lib/layers/types'
  import { evaluateQuery } from '../lib/query/index'

  const {
    sketches,
    activeSketch,
    effectsEnabled,
    params,
    layers,
    activeLayerId,
    activeShapeId,
    activeTab,
    onSketchChange,
    onParamChange,
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
    onToggleEffects,
  }: {
    sketches: SketchDef[]
    activeSketch: SketchDef
    effectsEnabled: boolean
    params: Record<string, number>
    layers: Layer[]
    activeLayerId: string | null
    activeShapeId: string | null
    activeTab: 'layers' | 'effects'
    onSketchChange: (s: SketchDef) => void
    onParamChange: (id: string, value: number) => void
    onTabChange: (t: 'layers' | 'effects') => void
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
    onToggleEffects: () => void
  } = $props()

  const activeLayer = $derived(layers.find(l => l.id === activeLayerId) ?? null)
  const activeShape = $derived(activeLayer?.shapes.find(s => s.id === activeShapeId) ?? null)
  const isCodeMode  = $derived(activeLayer?.mode === 'code')
  const codeResult  = $derived(isCodeMode && activeLayer ? evaluateQuery(activeLayer.query) : null)

  const geomKeys: { label: string; key: 'x' | 'y' | 'w' | 'h' }[] = [
    { label: 'X center', key: 'x' },
    { label: 'Y center', key: 'y' },
    { label: 'Width',    key: 'w' },
    { label: 'Height',   key: 'h' },
  ]

  // Inline rename state
  let editingId = $state<string | null>(null)
  let editingName = $state('')

  // Drag-to-reorder state
  let dragSrcId  = $state<string | null>(null)
  let dragOverId = $state<string | null>(null)

  // Template builder state
  let tpl        = $state<'single' | 'row' | 'grid' | 'spiral'>('row')
  let tplCount   = $state(8)
  let tplCols    = $state(4)
  let tplRows    = $state(4)
  let tplShape   = $state<'rect' | 'ellipse'>('rect')
  let tplColor   = $state('#8b5cf6')
  let tplOpacity = $state(0.85)

  function buildTemplate(): string {
    const color = `'${tplColor}'`
    const op    = tplOpacity.toFixed(2)
    const s     = tplShape
    if (tpl === 'single') {
      return `${s}(0.5, 0.5, 0.7, 0.7, ${color}, ${op})`
    }
    if (tpl === 'row') {
      const n = tplCount
      return `repeat(${n}, (i, t) => {\n  ${s}((i + 0.5) / ${n}, 0.5, 1/${n} * 0.85, 0.4, ${color}, ${op})\n})`
    }
    if (tpl === 'grid') {
      const nc = tplCols, nr = tplRows
      return `grid(${nc}, ${nr}, (c, r, ct, rt) => {\n  ${s}((c + 0.5) / ${nc}, (r + 0.5) / ${nr}, 1/${nc} * 0.85, 1/${nr} * 0.85, ${color}, ${op})\n})`
    }
    // spiral
    const n = tplCount
    return `repeat(${n}, (i, t) => {\n  const angle = t * TAU * 3\n  const r = 0.1 + t * 0.35\n  ellipse(0.5 + cos(angle) * r, 0.5 + sin(angle) * r, 0.03 + t * 0.05, 0.03 + t * 0.05, ${color}, ${op})\n})`
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
            <input
              id="layer-bg-color"
              type="color"
              value={activeLayer.bgColor ?? '#1a1a2e'}
              disabled={activeLayer.bgColor === undefined}
              oninput={(e) => onUpdateLayerBg(activeLayer.id, (e.target as HTMLInputElement).value)}
            />
            <span class="prop-label" style:flex="1">
              {activeLayer.bgColor ?? 'None'}
            </span>
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
          {#each [['single','1'], ['row','↔'], ['grid','⊞'], ['spiral','◌']] as [id, icon]}
            <button
              class="tpl-btn"
              class:active={tpl === id}
              title={id}
              onclick={() => tpl = id as typeof tpl}
            >{icon}</button>
          {/each}
        </div>

        <!-- Count (row / spiral) -->
        {#if tpl === 'row' || tpl === 'spiral'}
          <div class="param-row">
            <label class="param-label" for="tpl-count">Count</label>
            <div class="param-control">
              <input id="tpl-count" type="range" min="1" max="100" step="1" bind:value={tplCount} />
              <span class="param-val">{tplCount}</span>
            </div>
          </div>
        {/if}

        <!-- Cols × Rows (grid) -->
        {#if tpl === 'grid'}
          <div class="param-row">
            <label class="param-label" for="tpl-cols">Cols × Rows</label>
            <div class="tpl-grid-row">
              <input id="tpl-cols" class="num-input" type="number" min="1" max="50" bind:value={tplCols} />
              <span class="tpl-x">×</span>
              <input class="num-input" type="number" min="1" max="50" bind:value={tplRows} />
            </div>
          </div>
        {/if}

        <!-- Shape type (not spiral — always ellipse) -->
        {#if tpl !== 'spiral'}
          <div class="shape-toggle" style:margin-top="8px" style:margin-bottom="8px">
            <button
              class="shape-type-btn"
              class:active={tplShape === 'rect'}
              onclick={() => tplShape = 'rect'}
            >▭ Rect</button>
            <button
              class="shape-type-btn"
              class:active={tplShape === 'ellipse'}
              onclick={() => tplShape = 'ellipse'}
            >◯ Ellipse</button>
          </div>
        {/if}

        <!-- Color + opacity -->
        <div class="color-control" style:margin-bottom="10px">
          <input type="color" bind:value={tplColor} />
          <input type="range" min="0" max="1" step="0.01" bind:value={tplOpacity} />
          <span class="param-val">{tplOpacity.toFixed(2)}</span>
        </div>

        <button
          class="insert-btn"
          onclick={() => activeLayer && onSetQuery(activeLayer.id, buildTemplate())}
        >→ Insert code</button>
      </section>
    {/if}

    <!-- Code editor (code mode) -->
    {#if activeLayer && isCodeMode}
      <section class="section code-section">
        <!-- svelte-ignore a11y_autofocus -->
        <textarea
          class="code-editor"
          spellcheck="false"
          value={activeLayer.query}
          placeholder={"// rect(x, y, w, h, color?, opacity?)\n// ellipse(x, y, w, h, color?, opacity?)\n// repeat(n, (i, t) => { ... })\n// grid(cols, rows, (c, r, ct, rt) => { ... })"}
          oninput={(e) => onSetQuery(activeLayer.id, (e.target as HTMLTextAreaElement).value)}
          onkeydown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault()
              const ta = e.target as HTMLTextAreaElement
              const start = ta.selectionStart
              const end   = ta.selectionEnd
              ta.setRangeText('  ', start, end, 'end')
              ta.dispatchEvent(new Event('input', { bubbles: true }))
            }
          }}
        ></textarea>
        {#if codeResult && codeResult.errors.length > 0}
          <div class="error-list">
            {#each codeResult.errors as err}
              <p class="error-line">{err}</p>
            {/each}
          </div>
        {:else if codeResult}
          <p class="code-hint">{codeResult.shapes.length} shape{codeResult.shapes.length !== 1 ? 's' : ''}</p>
        {/if}
      </section>
    {/if}

    <!-- Shapes sub-list (manual mode only) -->
    {#if activeLayer && !isCodeMode}
      <section class="section">
        <h2 class="section-title">Shapes</h2>
        <div class="shape-list">
          {#each activeLayer.shapes as shape, i (shape.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="shape-row"
              class:selected={shape.id === activeShapeId}
              onclick={() => onSelectShape(shape.id)}
            >
              <span class="shape-type-badge">{ ({rect:'▭',ellipse:'◯',line:'╱',curve:'∿',triangle:'△'} as Record<string,string>)[shape.type] }</span>
              <span class="shape-auto-name">
                { ({rect:'Rect',ellipse:'Ellipse',line:'Line',curve:'Curve',triangle:'Triangle'} as Record<string,string>)[shape.type] } {i + 1}
              </span>
              <button
                class="icon-btn delete-btn"
                title="Delete shape"
                onclick={(e) => { e.stopPropagation(); onDeleteShape(activeLayer.id, shape.id) }}
              >×</button>
            </div>
          {/each}
        </div>
        <button class="add-layer-btn" onclick={() => onAddShape(activeLayer.id)}>+ Add shape</button>
      </section>
    {/if}

    <!-- Shape properties (manual mode, shape selected) -->
    {#if activeLayer && activeShape && !isCodeMode}
      <section class="section">
        <h2 class="section-title">Shape</h2>

        <!-- Shape type toggle -->
        <div class="shape-toggle">
          <button
            class="shape-type-btn"
            class:active={activeShape.type === 'rect'}
            onclick={() => onUpdateShape(activeLayer.id, activeShape.id, { type: 'rect' })}
          >▭ Rect</button>
          <button
            class="shape-type-btn"
            class:active={activeShape.type === 'ellipse'}
            onclick={() => onUpdateShape(activeLayer.id, activeShape.id, { type: 'ellipse' })}
          >◯ Ellipse</button>
        </div>

        <!-- Color + opacity -->
        <div class="prop-row">
          <label class="prop-label" for="color-hex">Color</label>
          <div class="color-control">
            <input
              id="color-hex"
              type="color"
              value={activeShape.color.hex}
              oninput={(e) => onUpdateShape(activeLayer.id, activeShape.id, {
                color: { ...activeShape.color, hex: (e.target as HTMLInputElement).value }
              })}
            />
            <input
              type="range"
              min="0" max="1" step="0.01"
              value={activeShape.color.opacity}
              oninput={(e) => onUpdateShape(activeLayer.id, activeShape.id, {
                color: { ...activeShape.color, opacity: parseFloat((e.target as HTMLInputElement).value) }
              })}
            />
            <span class="param-val">{activeShape.color.opacity.toFixed(2)}</span>
          </div>
        </div>

        <!-- Geometry sliders -->
        <h2 class="section-title" style:margin-top="12px">Position & Size</h2>
        {#each geomKeys as { label, key }}
          <div class="param-row">
            <label class="param-label" for={`geom-${key}`}>{label}</label>
            <div class="param-control">
              <input
                id={`geom-${key}`}
                type="range"
                min="0" max="1" step="0.001"
                value={activeShape.geom[key]}
                oninput={(e) => onUpdateGeom(activeLayer.id, activeShape.id, {
                  ...activeShape.geom,
                  [key]: parseFloat((e.target as HTMLInputElement).value)
                })}
              />
              <span class="param-val">{activeShape.geom[key].toFixed(3)}</span>
            </div>
          </div>
        {/each}
      </section>
    {/if}
  {/if}

  <!-- ── Effects tab ── -->
  {#if activeTab === 'effects'}
    <section class="section">
      <div class="effects-header">
        <h2 class="section-title" style:margin-bottom="0">Effects</h2>
        <button
          class="effects-toggle"
          class:on={effectsEnabled}
          onclick={onToggleEffects}
        >{effectsEnabled ? 'On' : 'Off'}</button>
      </div>
    </section>

    {#if effectsEnabled}
    <section class="section">
      <h2 class="section-title">Presets</h2>
      <div class="grid">
        {#each sketches as s}
          <button
            class="preset-btn"
            class:active={s.id === activeSketch.id}
            onclick={() => onSketchChange(s)}
            title={s.name}
          >
            <span class="preset-icon">{s.name[0]}</span>
            <span class="preset-name">{s.name}</span>
          </button>
        {/each}
      </div>
    </section>

    {#if activeSketch.params.length > 0}
      <section class="section">
        <h2 class="section-title">Parameters</h2>
        <div class="params">
          {#each activeSketch.params as p}
            {@const val = params[p.id] ?? p.default}
            <div class="param-row">
              <label for={`param-${p.id}`} class="param-label">{p.label}</label>
              <div class="param-control">
                <input
                  id={`param-${p.id}`}
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step ?? 0.01}
                  value={val}
                  oninput={(e) => onParamChange(p.id, parseFloat((e.target as HTMLInputElement).value))}
                />
                <span class="param-val">{val.toFixed(p.step && p.step >= 1 ? 0 : 2)}</span>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
    {/if}
  {/if}
</aside>

<style>
  .panel {
    position: fixed;
    top: 44px;
    right: 0;
    bottom: 0;
    width: 260px;
    background: #17171a;
    border-left: 1px solid #2b2b30;
    overflow-y: auto;
    z-index: 90;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* ── Tab bar ── */
  .tab-bar {
    display: flex;
    border-bottom: 1px solid #2b2b30;
    flex-shrink: 0;
  }

  .tab-btn {
    flex: 1;
    padding: 10px 0;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: #666672;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: color .15s, border-color .15s;
    margin-bottom: -1px;
  }
  .tab-btn:hover { color: #aaa; }
  .tab-btn.active { color: #c4b0f8; border-bottom-color: #8b5cf6; }

  /* ── Sections ── */
  .section {
    padding: 14px;
    border-bottom: 1px solid #2b2b30;
  }

  .section-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: #555560;
    margin-bottom: 10px;
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
  .layer-row:hover { background: #1f1f24; }
  .layer-row.selected { border-color: #8b5cf6; background: #1a1428; }
  .layer-row.drag-over { border-color: #a78bfa; background: #1f1830; }
  .layer-row.drag-src  { opacity: 0.4; }

  .drag-handle {
    font-size: 13px;
    color: #444450;
    cursor: grab;
    flex-shrink: 0;
    padding: 0 1px;
    transition: color .1s;
    user-select: none;
  }
  .layer-row:hover .drag-handle { color: #666672; }
  .drag-handle:active { cursor: grabbing; }

  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #666672;
    font-size: 13px;
    line-height: 1;
    padding: 2px;
    flex-shrink: 0;
    transition: color .1s;
  }
  .icon-btn:hover { color: #bbb; }
  .delete-btn:hover { color: #f87171; }

  .shape-badge {
    font-size: 12px;
    color: #888890;
    flex-shrink: 0;
  }

  .layer-name {
    flex: 1;
    font-size: 12px;
    color: #c8c8d0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .rename-input {
    flex: 1;
    background: #111114;
    border: 1px solid #8b5cf6;
    border-radius: 3px;
    color: #e2e2e6;
    font-size: 12px;
    padding: 1px 4px;
    min-width: 0;
    outline: none;
  }

  .add-layer-btn {
    width: 100%;
    padding: 7px;
    background: none;
    border: 1px dashed #333340;
    border-radius: 5px;
    color: #666672;
    font-size: 12px;
    cursor: pointer;
    transition: border-color .15s, color .15s;
  }
  .add-layer-btn:hover { border-color: #8b5cf6; color: #c4b0f8; }

  /* ── Shape list ── */
  .shape-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 10px;
  }

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
  .shape-row:hover { background: #1f1f24; }
  .shape-row.selected { border-color: #8b5cf6; background: #1a1428; }

  .shape-type-badge {
    font-size: 12px;
    color: #888890;
    flex-shrink: 0;
  }

  .shape-auto-name {
    flex: 1;
    font-size: 12px;
    color: #c8c8d0;
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
    background: #111114;
    border: 1px solid #2b2b30;
    border-radius: 5px;
    color: #888890;
    font-size: 12px;
    cursor: pointer;
    transition: border-color .15s, background .15s, color .15s;
  }
  .mode-btn:hover { border-color: #444; color: #bbb; }
  .mode-btn.active { border-color: #8b5cf6; background: #1a1428; color: #c4b0f8; }

  /* ── Template builder ── */
  .tpl-tabs {
    display: flex;
    gap: 5px;
    margin-bottom: 10px;
  }

  .tpl-btn {
    flex: 1;
    padding: 5px 2px;
    background: #111114;
    border: 1px solid #2b2b30;
    border-radius: 5px;
    color: #666672;
    font-size: 14px;
    cursor: pointer;
    transition: border-color .15s, background .15s, color .15s;
  }
  .tpl-btn:hover { border-color: #444; color: #bbb; }
  .tpl-btn.active { border-color: #8b5cf6; background: #1a1428; color: #c4b0f8; }

  .tpl-grid-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .num-input {
    width: 52px;
    background: #111114;
    border: 1px solid #2b2b30;
    border-radius: 4px;
    color: #c8c8d0;
    font-size: 12px;
    padding: 3px 6px;
    outline: none;
    text-align: center;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .num-input:focus { border-color: #8b5cf6; }
  .num-input::-webkit-outer-spin-button,
  .num-input::-webkit-inner-spin-button { -webkit-appearance: none; appearance: none; }

  .tpl-x {
    font-size: 12px;
    color: #555560;
  }

  .insert-btn {
    width: 100%;
    padding: 7px;
    background: #1a1428;
    border: 1px solid #8b5cf6;
    border-radius: 5px;
    color: #c4b0f8;
    font-size: 12px;
    cursor: pointer;
    transition: background .15s;
  }
  .insert-btn:hover { background: #22183a; }

  /* ── Code editor ── */
  .code-section { gap: 8px; }

  .code-editor {
    width: 100%;
    min-height: 200px;
    resize: vertical;
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    line-height: 1.6;
    color: #c8c8d0;
    background: #0e0e10;
    border: 1px solid #2b2b30;
    border-radius: 5px;
    padding: 10px;
    outline: none;
    tab-size: 2;
    white-space: pre;
    overflow-wrap: normal;
    overflow-x: auto;
  }
  .code-editor:focus { border-color: #8b5cf6; }

  .error-list { display: flex; flex-direction: column; gap: 4px; }

  .error-line {
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    color: #f87171;
    background: #1c0a0a;
    border: 1px solid #5c1a1a;
    border-radius: 4px;
    padding: 5px 8px;
    word-break: break-all;
  }

  .code-hint {
    font-size: 11px;
    color: #555560;
    text-align: right;
  }

  /* ── Effects header ── */
  .effects-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .effects-toggle {
    padding: 3px 10px;
    border-radius: 10px;
    border: 1px solid #333340;
    background: #111114;
    color: #666672;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color .15s, color .15s, background .15s;
  }
  .effects-toggle:hover { border-color: #555; color: #aaa; }
  .effects-toggle.on { border-color: #8b5cf6; background: #1a1428; color: #c4b0f8; }

  /* ── Shape properties ── */
  .shape-toggle {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }

  .shape-type-btn {
    flex: 1;
    padding: 6px;
    background: #111114;
    border: 1px solid #2b2b30;
    border-radius: 5px;
    color: #888890;
    font-size: 12px;
    cursor: pointer;
    transition: border-color .15s, background .15s, color .15s;
  }
  .shape-type-btn:hover { border-color: #444; color: #bbb; }
  .shape-type-btn.active { border-color: #8b5cf6; background: #1a1428; color: #c4b0f8; }

  .prop-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  .prop-label {
    font-size: 11px;
    color: #888890;
  }

  .color-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  input[type="color"] {
    width: 28px;
    height: 20px;
    padding: 0;
    border: 1px solid #2b2b30;
    border-radius: 3px;
    background: none;
    cursor: pointer;
    flex-shrink: 0;
  }

  /* ── Preset grid ── */
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .preset-btn {
    background: #111114;
    border: 1px solid #2b2b30;
    border-radius: 6px;
    cursor: pointer;
    padding: 12px 8px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    transition: border-color .15s, background .15s;
  }
  .preset-btn:hover { border-color: #444; background: #1a1a20; }
  .preset-btn.active { border-color: #8b5cf6; background: #1a1428; }

  .preset-icon {
    width: 48px;
    height: 48px;
    border-radius: 4px;
    background: linear-gradient(135deg, #1a0830, #2a1040);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
    color: #8b5cf6;
    font-family: monospace;
  }
  .preset-btn.active .preset-icon { background: linear-gradient(135deg, #2a0860, #4a1870); }

  .preset-name {
    font-size: 11px;
    color: #888890;
  }
  .preset-btn.active .preset-name { color: #c4b0f8; }

  /* ── Params ── */
  .params {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .param-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .param-label {
    font-size: 11px;
    color: #888890;
  }

  .param-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  input[type="range"] {
    flex: 1;
    height: 3px;
    accent-color: #8b5cf6;
    cursor: pointer;
    background: transparent;
  }

  .param-val {
    font-family: monospace;
    font-size: 11px;
    color: #666672;
    width: 34px;
    text-align: right;
    flex-shrink: 0;
  }
</style>
