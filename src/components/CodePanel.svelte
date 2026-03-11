<script lang="ts">
  import type { Layer, Pattern } from '../lib/layers/types'
  import type { Palette } from '../lib/palettes/index'
  import { evaluateQuery, shapesToCode } from '../lib/query/index'
  import { serializeProject, parseProject } from '../lib/persist/index'
  import { API_SNIPPETS } from '../lib/api-snippets'
  import { adjustEditorFontSize } from '../lib/editor-font'
  import CodeEditor from './CodeEditor.svelte'
  import ColorPicker from './ColorPicker.svelte'

  const {
    layers,
    activeLayerId,
    artW,
    artH,
    palettes,
    stamps = [],
    customPalettes = [],
    customPatterns = [],
    onSetQuery,
    onSetMode,
    onApplyFile,
    dock,
    onDockChange,
    onHide,
    scope,
    onScopeChange,
    width,
    onWidthChange,
    height,
    onHeightChange,
  }: {
    layers: Layer[]
    activeLayerId: string | null
    artW: number
    artH: number
    palettes: Palette[]
    stamps?: Pattern[]
    customPalettes?: Palette[]
    customPatterns?: Pattern[]
    onSetQuery: (id: string, q: string) => void
    onSetMode: (id: string, mode: 'manual' | 'code') => void
    onApplyFile: (text: string) => void
    dock: 'left' | 'bottom'
    onDockChange: (d: 'left' | 'bottom') => void
    onHide: () => void
    scope: 'layer' | 'file'
    onScopeChange: (s: 'layer' | 'file') => void
    width: number
    onWidthChange: (w: number) => void
    height: number
    onHeightChange: (h: number) => void
  } = $props()

  type EditorRef = {
    insertAtCursor: (t: string) => void
    getColorAtCursor: () => { hex: string; from: number; to: number } | null
    replaceRange: (from: number, to: number, text: string) => void
    focus: () => void
  }

  let editorRef = $state<EditorRef | null>(null)
  let apiOpen = $state(false)
  let cursorColor = $state<{ hex: string; from: number; to: number } | null>(null)

  // ── Active layer ──────────────────────────────────────────────────────────
  const activeLayer = $derived(layers.find(l => l.id === activeLayerId) ?? null)
  const isCodeMode = $derived(activeLayer?.mode === 'code')

  // ── Layer scope: editor value ─────────────────────────────────────────────
  // In manual mode, show the preserved query if it exists (keeps loops visible),
  // otherwise fall back to shapesToCode for the current shapes
  const layerValue = $derived(
    activeLayer
      ? isCodeMode
        ? activeLayer.query
        : (activeLayer.query.trim() || shapesToCode(activeLayer.shapes))
      : ''
  )
  const layerResult = $derived(
    activeLayer && isCodeMode
      ? evaluateQuery(activeLayer.query, artW, artH, palettes, stamps)
      : null
  )

  // ── File scope: local buffer ──────────────────────────────────────────────
  let fileBuffer = $state('')
  let fileApplyTimer: ReturnType<typeof setTimeout> | undefined

  // Sync file buffer when switching to file scope or when layers change externally
  $effect(() => {
    if (scope === 'file') {
      const doc = serializeProject({ layers, artW, artH, customPalettes, customPatterns })
      // Only resync if editor is not focused (avoid clobbering active edits)
      if (!editorRef || document.activeElement?.closest('.cm-editor') === null) {
        fileBuffer = doc
      }
    }
  })

  function onFileChange(text: string) {
    fileBuffer = text
    clearTimeout(fileApplyTimer)
    fileApplyTimer = setTimeout(() => onApplyFile(text), 800)
  }

  // ── Unified editor value + change handler ────────────────────────────────
  const editorValue = $derived(scope === 'file' ? fileBuffer : layerValue)

  function handleChange(v: string) {
    if (scope === 'file') {
      onFileChange(v)
      return
    }
    if (!activeLayer) return
    if (!isCodeMode) {
      // Auto-switch to code mode on first edit
      onSetMode(activeLayer.id, 'code')
    }
    onSetQuery(activeLayer.id, v)
  }

  // ── Status ────────────────────────────────────────────────────────────────
  const statusText = $derived.by(() => {
    if (scope === 'file') {
      const total = layers.flatMap(l => l.shapes).length
      return { ok: `${layers.length} layer${layers.length !== 1 ? 's' : ''}, ${total} shape${total !== 1 ? 's' : ''}`, err: '' }
    }
    if (!layerResult) return { ok: '', err: '' }
    if (layerResult.errors.length) return { ok: '', err: `${layerResult.errors.length} error${layerResult.errors.length !== 1 ? 's' : ''}` }
    return { ok: `${layerResult.shapes.length} shape${layerResult.shapes.length !== 1 ? 's' : ''}`, err: '' }
  })

  const lineCount = $derived(editorValue.split('\n').length)

  const errors = $derived(
    scope === 'layer' && layerResult?.errors.length ? layerResult.errors : []
  )

  // ── Editor helpers ────────────────────────────────────────────────────────
  function detectColorAtCursor() {
    cursorColor = editorRef?.getColorAtCursor() ?? null
  }

  function onCursorColorChange(newHex: string) {
    if (!cursorColor) return
    editorRef?.replaceRange(cursorColor.from, cursorColor.to, newHex)
    cursorColor = { ...cursorColor, hex: newHex, to: cursorColor.from + 7 }
  }

  function copyCode() { navigator.clipboard.writeText(editorValue) }
  function insertSnippet(code: string) { editorRef?.insertAtCursor(code) }

  // ── Resize ────────────────────────────────────────────────────────────────
  let resizing = false
  let resizeStart = { x: 0, y: 0, w: 0, h: 0 }

  function onResizeDown(e: PointerEvent) {
    resizing = true
    resizeStart = { x: e.clientX, y: e.clientY, w: width, h: height }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onResizeMove(e: PointerEvent) {
    if (!resizing) return
    if (dock === 'left') {
      const delta = e.clientX - resizeStart.x
      onWidthChange(Math.max(250, Math.min(Math.round(window.innerWidth * 0.6), resizeStart.w + delta)))
    } else {
      const delta = resizeStart.y - e.clientY
      onHeightChange(Math.max(150, Math.min(700, resizeStart.h + delta)))
    }
  }

  function onResizeUp() { resizing = false }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="code-panel"
  class:left={dock === 'left'}
  class:bottom={dock === 'bottom'}
  style={dock === 'left' ? `width:${width}px` : `height:${height}px`}
>
  <!-- Resize handle -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="cp-resize"
    class:cp-resize-h={dock === 'left'}
    class:cp-resize-v={dock === 'bottom'}
    onpointerdown={onResizeDown}
    onpointermove={onResizeMove}
    onpointerup={onResizeUp}
  ></div>

  <!-- Toolbar -->
  <div class="cp-toolbar">
    <div class="cp-left">
      <span class="cp-label">Code</span>
      <div class="cp-toggle">
        <button class="cp-toggle-btn" class:active={scope === 'layer'} onclick={() => onScopeChange('layer')}>Layer</button>
        <button class="cp-toggle-btn" class:active={scope === 'file'} onclick={() => onScopeChange('file')}>File</button>
      </div>
      {#if scope === 'layer' && activeLayer && !isCodeMode}
        <span class="cp-readonly">read-only</span>
      {/if}
    </div>

    <div class="cp-right">
      {#if cursorColor}
        <div class="cp-color-pick">
          <ColorPicker hex={cursorColor.hex} showOpacity={false} onChange={onCursorColorChange} />
          <span class="cp-color-hex">{cursorColor.hex}</span>
        </div>
      {/if}
      <button class="cp-btn" onclick={() => adjustEditorFontSize(-1)} title="Decrease font size">A−</button>
      <button class="cp-btn" onclick={() => adjustEditorFontSize(1)} title="Increase font size">A+</button>
      <button class="cp-btn" onclick={copyCode} title="Copy">copy</button>
      {#if scope === 'layer' && activeLayer && isCodeMode}
        <button class="cp-btn" onclick={() => onSetQuery(activeLayer.id, '')} title="Clear">clear</button>
      {/if}
      <button class="cp-btn" onclick={() => onDockChange(dock === 'left' ? 'bottom' : 'left')} title={dock === 'left' ? 'Dock bottom' : 'Dock left'}>
        {dock === 'left' ? '↓' : '←'}
      </button>
      <button class="cp-btn" onclick={onHide} title="Hide code panel">✕</button>
    </div>
  </div>

  <!-- Main content area -->
  <div class="cp-main" class:cp-main-h={dock === 'bottom'}>
    <!-- Editor -->
    <div class="cp-editor">
      <CodeEditor
        bind:this={editorRef}
        value={editorValue}
        minHeight="0"
        extraCompletions={palettes.map(p => `palette('${p.name}', 0)`)}
        onChange={handleChange}
        onCursorChange={detectColorAtCursor}
      />
    </div>

    <!-- API sidebar (right side in bottom dock, below editor in left dock) -->
    {#if apiOpen}
      <div class="cp-api-body">
        {#each API_SNIPPETS as snip}
          <button class="api-snip" onclick={() => insertSnippet(snip.code)} title="Insert at cursor">
            <span class="api-snip-name">{snip.name}</span>
            <span class="api-snip-sig">{snip.sig}</span>
          </button>
        {/each}
        <div class="api-consts">
          {#each ['W', 'H', 'PI', 'TAU', 'sin', 'cos', 'abs', 'min', 'max', 'floor', 'ceil', 'round', 'random', 'nz'] as c}
            <button class="api-const-btn" onclick={() => insertSnippet(c)}>{c}</button>
          {/each}
          {#each palettes as p}
            <button class="api-const-btn palette-var-btn" onclick={() => insertSnippet(`palette('${p.name}', 0)`)} title="{p.name}">
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

  <!-- Bottom bar: status + errors + API toggle -->
  <div class="cp-bottom-bar">
    <div class="cp-status">
      {#if statusText.err}
        <span class="status-err">● {statusText.err}</span>
      {:else if statusText.ok}
        <span class="status-ok">● {statusText.ok}</span>
      {:else}
        <span class="status-idle">—</span>
      {/if}
      <span class="status-lines">{lineCount} lines</span>
    </div>
    {#if errors.length}
      <div class="cp-errors">
        {#each errors as err}
          <p class="error-line">{err}</p>
        {/each}
      </div>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="cp-api-toggle" onclick={() => apiOpen = !apiOpen}>
      <span>API Reference</span>
      <span>{apiOpen ? '▾' : '▴'}</span>
    </div>
  </div>
</div>

<style>
  /* ── Panel container ── */
  .code-panel {
    position: fixed;
    background: var(--bg-bar);
    z-index: 88;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .code-panel.left {
    top: 44px;
    left: 0;
    bottom: 0;
    border-right: 1px solid var(--border);
    min-width: 250px;
  }

  .code-panel.bottom {
    bottom: 36px;
    left: 0;
    right: var(--panel-w, 260px);
    border-top: 1px solid var(--border);
    min-height: 150px;
  }

  /* ── Resize handles ── */
  .cp-resize {
    position: absolute;
    z-index: 2;
    background: transparent;
    transition: background .15s;
  }
  .cp-resize:hover { background: color-mix(in srgb, var(--accent) 25%, transparent); }

  .cp-resize-h {
    top: 0;
    right: 0;
    bottom: 0;
    width: 5px;
    cursor: ew-resize;
  }

  .cp-resize-v {
    top: 0;
    left: 0;
    right: 0;
    height: 5px;
    cursor: ns-resize;
  }

  /* ── Toolbar ── */
  .cp-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--border-inner);
    flex-shrink: 0;
    height: 30px;
  }

  .cp-left, .cp-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .cp-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-4);
    letter-spacing: .06em;
    text-transform: uppercase;
  }

  .cp-toggle {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }

  .cp-toggle-btn {
    padding: 2px 8px;
    font-size: 10px;
    background: none;
    border: none;
    color: var(--text-5);
    cursor: pointer;
    transition: background .1s, color .1s;
  }
  .cp-toggle-btn:not(:last-child) { border-right: 1px solid var(--border); }
  .cp-toggle-btn.active { background: var(--bg-selected); color: var(--accent); font-weight: 600; }

  .cp-readonly {
    font-size: 9px;
    color: var(--text-6);
    font-style: italic;
  }

  .cp-btn {
    padding: 2px 8px;
    font-size: 10px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-4);
    cursor: pointer;
    transition: border-color .1s, color .1s;
  }
  .cp-btn:hover { border-color: var(--accent); color: var(--accent-text); }

  .cp-color-pick {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .cp-color-hex {
    font-family: monospace;
    font-size: 10px;
    color: var(--text-3);
  }

  /* ── Main content (column for left dock, row for bottom dock) ── */
  .cp-main {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .cp-main-h {
    flex-direction: row;
  }

  /* ── Editor ── */
  .cp-editor {
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .cp-editor :global(.cm-wrap) {
    flex: 1 1 0;
    border-bottom: none;
    min-height: 0 !important;
    height: 0;
  }
  .cp-editor :global(.cm-editor) { height: 100%; }
  .cp-editor :global(.cm-scroller) { overflow: auto; }

  /* ── API body ── */
  /* Left dock: opens below editor */
  .cp-main:not(.cp-main-h) .cp-api-body {
    flex: 0 1 auto;
    max-height: 40vh;
    overflow-y: auto;
    scrollbar-width: thin;
    border-top: 1px solid var(--border);
  }

  /* Bottom dock: opens as right sidebar */
  .cp-main-h .cp-api-body {
    flex: 0 0 220px;
    overflow-y: auto;
    scrollbar-width: thin;
    border-left: 1px solid var(--border);
  }

  /* ── Bottom bar ── */
  .cp-bottom-bar {
    flex: 0 0 auto;
    border-top: 1px solid var(--border);
  }

  .cp-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
    font-size: 10px;
    font-family: monospace;
  }

  .status-ok   { color: var(--text-ok); }
  .status-err  { color: var(--text-err); }
  .status-idle { color: var(--text-6); }
  .status-lines { color: var(--text-6); }

  .cp-errors {
    padding: 4px 10px;
    border-top: 1px solid var(--border-inner);
  }

  .error-line {
    font-family: monospace;
    font-size: 10px;
    color: var(--text-err);
    white-space: pre-wrap;
    word-break: break-all;
  }

  .cp-api-toggle {
    display: flex;
    justify-content: space-between;
    padding: 5px 10px;
    font-size: 10px;
    color: var(--text-4);
    cursor: pointer;
    user-select: none;
    border-top: 1px solid var(--border-inner);
  }
  .cp-api-toggle:hover { color: var(--text-2); }

  .api-snip {
    display: flex;
    flex-direction: column;
    padding: 4px 10px;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border-inner);
    text-align: left;
    cursor: pointer;
    transition: background .1s;
  }
  .api-snip:hover { background: var(--bg-hover); }

  .api-snip-name {
    font-size: 11px;
    color: var(--text-2);
    font-weight: 500;
  }

  .api-snip-sig {
    font-size: 9px;
    color: var(--text-5);
    font-family: monospace;
  }

  .api-consts {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 8px 10px;
  }

  .api-const-btn {
    padding: 2px 6px;
    font-size: 10px;
    font-family: monospace;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-3);
    cursor: pointer;
    transition: border-color .1s, color .1s;
  }
  .api-const-btn:hover { border-color: var(--accent); color: var(--accent-text); }

  .palette-var-btn {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .palette-var-dots {
    display: flex;
    gap: 2px;
  }

  .palette-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
  }
</style>
