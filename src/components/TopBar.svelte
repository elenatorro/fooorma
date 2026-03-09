<script lang="ts">
  interface SizePreset { label: string; w: number; h: number }

  const {
    artW,
    artH,
    theme,
    onSizeChange,
    onExport,
    onSave,
    onLoad,
    onNew,
    onToggleTheme,
  }: {
    artW: number
    artH: number
    theme: 'dark' | 'light'
    onSizeChange: (w: number, h: number) => void
    onExport: () => void
    onSave: () => void
    onLoad: (file: File) => void
    onNew: () => void
    onToggleTheme: () => void
  } = $props()

  // ── File open ──────────────────────────────────────────────────────────────
  let fileInput: HTMLInputElement

  function openFilePicker() {
    fileInput.value = ''
    fileInput.click()
  }

  function onFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) onLoad(file)
  }

  // ── Canvas size ────────────────────────────────────────────────────────────
  const PRESETS: SizePreset[] = [
    { label: 'A4 Portrait',  w: 794,  h: 1123 },
    { label: 'A4 Landscape', w: 1123, h: 794  },
    { label: 'Square 1080',  w: 1080, h: 1080 },
    { label: '1920 × 1080',  w: 1920, h: 1080 },
    { label: '1080 × 1920',  w: 1080, h: 1920 },
    { label: '2048 × 2048',  w: 2048, h: 2048 },
    { label: '4096 × 4096',  w: 4096, h: 4096 },
  ]

  let editW = $state(artW)
  let editH = $state(artH)
  let showPresets = $state(false)

  // Sync when artW/artH change from outside (e.g. file load)
  $effect(() => { editW = artW })
  $effect(() => { editH = artH })

  function applySize() {
    const w = Math.max(100, Math.min(8192, Math.round(editW) || 100))
    const h = Math.max(100, Math.min(8192, Math.round(editH) || 100))
    editW = w
    editH = h
    if (w !== artW || h !== artH) onSizeChange(w, h)
  }

  function onDimKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      applySize()
      ;(e.target as HTMLInputElement).blur()
    }
  }

  function swapDims() {
    const tmp = editW
    editW = editH
    editH = tmp
    applySize()
  }

  function selectPreset(p: SizePreset) {
    editW = p.w
    editH = p.h
    showPresets = false
    onSizeChange(p.w, p.h)
  }

  const isPreset = $derived(PRESETS.some(p => p.w === artW && p.h === artH))
</script>

<header class="topbar">
  <span class="logo">forma</span>

  <!-- Canvas size editor -->
  <div class="size-editor">
    <div class="dim-pair">
      <label class="dim-label">W</label>
      <input
        class="dim-input"
        type="number"
        min="100" max="8192" step="1"
        value={editW}
        oninput={(e) => editW = parseInt((e.target as HTMLInputElement).value) || editW}
        onblur={applySize}
        onkeydown={onDimKeydown}
      />
    </div>
    <span class="dim-sep">×</span>
    <div class="dim-pair">
      <label class="dim-label">H</label>
      <input
        class="dim-input"
        type="number"
        min="100" max="8192" step="1"
        value={editH}
        oninput={(e) => editH = parseInt((e.target as HTMLInputElement).value) || editH}
        onblur={applySize}
        onkeydown={onDimKeydown}
      />
    </div>
    <button class="swap-btn" onclick={swapDims} title="Swap width ↔ height">⇄</button>
    <div class="preset-wrap">
      <button
        class="preset-toggle"
        class:active={isPreset}
        onclick={() => showPresets = !showPresets}
        title="Presets"
      >▾</button>
      {#if showPresets}
        <div class="preset-dropdown">
          {#each PRESETS as p}
            <button
              class="preset-item"
              class:active={p.w === artW && p.h === artH}
              onclick={() => selectPreset(p)}
            >
              <span>{p.label}</span>
              <span class="preset-dim">{p.w}×{p.h}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- File controls -->
  <div class="file-controls">
    <button class="file-btn" onclick={onNew} title="New blank canvas">New</button>
    <button class="file-btn" onclick={openFilePicker} title="Open .forma file">Open</button>
    <button class="file-btn" onclick={onSave} title="Save project as .forma">Save</button>
    <button class="file-btn theme-btn" onclick={onToggleTheme} title="Toggle light/dark theme">{theme === 'dark' ? '◑' : '◐'}</button>
  </div>

  <button class="export-btn" onclick={onExport}>Export PNG</button>
</header>

<!-- hidden file input -->
<input
  bind:this={fileInput}
  type="file"
  accept=".forma,.txt"
  style:display="none"
  onchange={onFileChange}
/>

<!-- close presets on outside click -->
{#if showPresets}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => showPresets = false}></div>
{/if}

<style>
  .topbar {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 44px;
    background: var(--bg-bar);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 14px;
    gap: 12px;
    z-index: 100;
    user-select: none;
  }

  .logo {
    font-family: monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: .08em;
    flex-shrink: 0;
  }

  /* ── Size editor ── */
  .size-editor {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .dim-pair {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 0 6px;
    height: 28px;
    transition: border-color .12s;
  }
  .dim-pair:focus-within { border-color: var(--accent); }

  .dim-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-6);
    text-transform: uppercase;
    letter-spacing: .05em;
    flex-shrink: 0;
  }

  .dim-input {
    width: 44px;
    background: none;
    border: none;
    color: var(--text-2);
    font-size: 12px;
    font-family: monospace;
    text-align: right;
    outline: none;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .dim-input::-webkit-inner-spin-button,
  .dim-input::-webkit-outer-spin-button { -webkit-appearance: none; }

  .dim-sep {
    font-size: 12px;
    color: var(--text-7);
  }

  .swap-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-6);
    font-size: 14px;
    width: 26px;
    height: 28px;
    border-radius: 5px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color .12s, color .12s;
  }
  .swap-btn:hover { border-color: var(--text-5); color: var(--text-3); }

  /* ── Presets ── */
  .preset-wrap {
    position: relative;
  }

  .preset-toggle {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-6);
    font-size: 10px;
    width: 22px;
    height: 28px;
    border-radius: 5px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color .12s, color .12s;
  }
  .preset-toggle:hover { border-color: var(--text-5); color: var(--text-3); }
  .preset-toggle.active { border-color: var(--accent); color: var(--accent-text); }

  .preset-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    z-index: 200;
    min-width: 180px;
    box-shadow: 0 8px 24px rgba(0,0,0,.3);
  }

  .preset-item {
    width: 100%;
    background: none;
    border: none;
    color: var(--text-2);
    font-size: 12px;
    padding: 8px 12px;
    cursor: pointer;
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    transition: background .1s;
  }
  .preset-item:hover { background: var(--bg-hover); color: var(--text-1); }
  .preset-item.active { color: var(--accent); }

  .preset-dim {
    font-family: monospace;
    font-size: 10px;
    opacity: .45;
  }

  /* ── File / Export ── */
  .file-controls {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }

  .file-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-3);
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 5px;
    cursor: pointer;
    transition: border-color .15s, color .15s;
  }
  .file-btn:hover { border-color: var(--text-5); color: var(--text-2); }

  .theme-btn { font-size: 14px; padding: 5px 8px; }

  .export-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-2);
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 5px;
    cursor: pointer;
    flex-shrink: 0;
    transition: border-color .15s, color .15s;
  }
  .export-btn:hover { border-color: var(--accent); color: var(--accent); }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
  }
</style>
