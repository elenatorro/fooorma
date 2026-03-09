<script lang="ts">
  import type { Layer } from '../lib/layers/types'
  import type { Palette } from '../lib/palettes/index'
  import { evaluateQuery } from '../lib/query/index'
  import { API_SNIPPETS } from '../lib/api-snippets'
  import { adjustEditorFontSize } from '../lib/editor-font'
  import CodeEditor from './CodeEditor.svelte'
  import ColorPicker from './ColorPicker.svelte'

  const {
    activeLayer,
    artW,
    artH,
    palettes,
    onSetQuery,
    height,
    onHeightChange,
    onMoveToRight,
  }: {
    activeLayer: Layer
    artW: number
    artH: number
    palettes: Palette[]
    onSetQuery: (id: string, q: string) => void
    height: number
    onHeightChange: (h: number) => void
    onMoveToRight: () => void
  } = $props()

  type EditorRef = {
    insertAtCursor: (t: string) => void
    getColorAtCursor: () => { hex: string; from: number; to: number } | null
    replaceRange: (from: number, to: number, text: string) => void
    focus: () => void
  }

  let editorRef = $state<EditorRef | null>(null)
  let apiOpen   = $state(false)
  let cursorColor = $state<{ hex: string; from: number; to: number } | null>(null)

  const codeResult = $derived(evaluateQuery(activeLayer.query, artW, artH, palettes))

  function detectColorAtCursor() {
    cursorColor = editorRef?.getColorAtCursor() ?? null
  }

  function onCursorColorChange(newHex: string) {
    if (!cursorColor) return
    editorRef?.replaceRange(cursorColor.from, cursorColor.to, newHex)
    cursorColor = { ...cursorColor, hex: newHex, to: cursorColor.from + 7 }
  }

  function copyCode() { navigator.clipboard.writeText(activeLayer.query) }
  function insertSnippet(code: string) { editorRef?.insertAtCursor(code) }

  // ── Resize handle ──────────────────────────────────────────────────────────
  let resizing = false
  let resizeStart = { y: 0, h: 0 }

  function onResizeDown(e: PointerEvent) {
    resizing = true
    resizeStart = { y: e.clientY, h: height }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onResizeMove(e: PointerEvent) {
    if (!resizing) return
    const delta = resizeStart.y - e.clientY
    onHeightChange(Math.max(150, Math.min(700, resizeStart.h + delta)))
  }
  function onResizeUp() { resizing = false }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="bcp" style:height="{height}px">

  <!-- Resize handle -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bcp-resize"
    onpointerdown={onResizeDown}
    onpointermove={onResizeMove}
    onpointerup={onResizeUp}
  ></div>

  <!-- Toolbar -->
  <div class="bcp-toolbar">
    <span class="bcp-label">Code</span>
    {#if cursorColor}
      <div class="bcp-color-pick">
        <ColorPicker hex={cursorColor.hex} showOpacity={false} onChange={onCursorColorChange} />
        <span class="bcp-color-hex">{cursorColor.hex}</span>
      </div>
    {/if}
    <div class="bcp-actions">
      <button class="bcp-btn" onclick={() => adjustEditorFontSize(-1)} title="Decrease font size">A−</button>
      <button class="bcp-btn" onclick={() => adjustEditorFontSize(1)} title="Increase font size">A+</button>
      <button class="bcp-btn" onclick={copyCode} title="Copy">copy</button>
      <button class="bcp-btn" onclick={() => onSetQuery(activeLayer.id, '')} title="Clear">clear</button>
      <button class="bcp-btn" onclick={onMoveToRight} title="Move editor to right panel">→ panel</button>
    </div>
  </div>

  <div class="bcp-body">
    <!-- Code editor -->
    <div class="bcp-editor">
      <CodeEditor
        bind:this={editorRef}
        value={activeLayer.query}
        minHeight="100%"
        extraCompletions={palettes.map(p => `palette('${p.name}', 0)`)}
        onChange={(v) => { onSetQuery(activeLayer.id, v); detectColorAtCursor() }}
        onCursorChange={detectColorAtCursor}
      />
    </div>

    <!-- Right gutter: status + API ref -->
    <div class="bcp-gutter">

      <!-- Status -->
      <div class="bcp-status">
        {#if codeResult?.errors.length}
          <span class="status-err">● {codeResult.errors.length} error{codeResult.errors.length !== 1 ? 's' : ''}</span>
        {:else if codeResult}
          <span class="status-ok">● {codeResult.shapes.length} shape{codeResult.shapes.length !== 1 ? 's' : ''}</span>
        {/if}
        <span class="status-lines">{activeLayer.query.split('\n').length} lines</span>
      </div>

      <!-- Errors -->
      {#if codeResult?.errors.length}
        <div class="bcp-errors">
          {#each codeResult.errors as err}
            <p class="error-line">{err}</p>
          {/each}
        </div>
      {/if}

      <!-- API Reference -->
      <div class="bcp-api">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="bcp-api-toggle" onclick={() => apiOpen = !apiOpen}>
          <span>API</span>
          <span>{apiOpen ? '▴' : '▾'}</span>
        </div>
        {#if apiOpen}
          <div class="bcp-api-body">
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

    </div>
  </div>
</div>

<style>
  .bcp {
    position: fixed;
    bottom: 36px;
    left: 0;
    right: var(--panel-w, 260px);
    background: var(--bg-bar);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    z-index: 88;
    min-height: 150px;
  }

  /* ── Resize handle ── */
  .bcp-resize {
    height: 5px;
    cursor: ns-resize;
    flex-shrink: 0;
    background: transparent;
    transition: background .15s;
  }
  .bcp-resize:hover { background: color-mix(in srgb, var(--accent) 25%, transparent); }

  /* ── Toolbar ── */
  .bcp-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--border-inner);
    flex-shrink: 0;
    height: 30px;
  }

  .bcp-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-4);
    letter-spacing: .06em;
    text-transform: uppercase;
  }

  .bcp-color-pick {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .bcp-color-hex {
    font-family: monospace;
    font-size: 10px;
    color: var(--text-3);
  }

  .bcp-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  .bcp-btn {
    padding: 2px 8px;
    font-size: 10px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-4);
    cursor: pointer;
    transition: border-color .1s, color .1s;
  }
  .bcp-btn:hover { border-color: var(--accent); color: var(--accent-text); }

  /* ── Body: editor + gutter ── */
  .bcp-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .bcp-editor {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .bcp-editor :global(.cm-wrap) {
    flex: 1;
    border-bottom: none;
    min-height: unset;
    height: 100%;
  }
  .bcp-editor :global(.cm-editor) {
    height: 100%;
  }
  .bcp-editor :global(.cm-scroller) {
    overflow: auto;
  }

  /* ── Gutter ── */
  .bcp-gutter {
    width: 220px;
    flex-shrink: 0;
    border-left: 1px solid var(--border-inner);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .bcp-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 10px;
    font-size: 10px;
    font-family: monospace;
    border-bottom: 1px solid var(--border-inner);
    flex-shrink: 0;
  }

  .status-ok  { color: var(--text-ok); }
  .status-err { color: var(--text-err); }
  .status-lines { color: var(--text-6); }

  .bcp-errors {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-inner);
  }

  .error-line {
    font-family: monospace;
    font-size: 10px;
    color: var(--text-err);
    white-space: pre-wrap;
    word-break: break-all;
  }

  /* ── API ref ── */
  .bcp-api { display: flex; flex-direction: column; }

  .bcp-api-toggle {
    display: flex;
    justify-content: space-between;
    padding: 6px 10px;
    font-size: 10px;
    color: var(--text-4);
    cursor: pointer;
    user-select: none;
    border-bottom: 1px solid var(--border-inner);
  }
  .bcp-api-toggle:hover { color: var(--text-2); }

  .bcp-api-body { display: flex; flex-direction: column; }

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
