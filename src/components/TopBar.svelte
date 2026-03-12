<script lang="ts">
  interface SizePreset { label: string; w: number; h: number }

  const {
    artW,
    artH,
    theme,
    onSizeChange,
    onExport,
    exportScale,
    exportFormat,
    onSetExportScale,
    onSetExportFormat,
    onSave,
    onLoad,
    onNew,
    onToggleTheme,
    onAbout,
  }: {
    artW: number
    artH: number
    theme: 'dark' | 'light'
    onSizeChange: (w: number, h: number) => void
    onExport: () => void
    exportScale: number
    exportFormat: 'png' | 'cmyk-tiff'
    onSetExportScale: (s: number) => void
    onSetExportFormat: (f: 'png' | 'cmyk-tiff') => void
    onSave: () => void
    onLoad: (file: File) => void
    onNew: () => void
    onToggleTheme: () => void
    onAbout: () => void
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

  // ── Export settings ──────────────────────────────────────────────────────
  const EXPORT_SCALES = [0.5, 1, 1.5, 2, 3, 4, 6, 8]
  const EXPORT_FORMATS: { value: 'png' | 'cmyk-tiff'; label: string }[] = [
    { value: 'png', label: 'PNG (RGB)' },
    { value: 'cmyk-tiff', label: 'TIFF (CMYK)' },
  ]
  const formatLabel = $derived(exportFormat === 'cmyk-tiff' ? 'TIFF' : 'PNG')
  let showExportMenu = $state(false)
</script>

<header class="topbar">
  <span class="logo">fooorma</span><span class="beta-badge">beta</span>
  <button class="info-btn" onclick={onAbout} title="About fooorma">ⓘ</button>

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
    <button class="file-btn" onclick={openFilePicker} title="Open .ooo file">Open</button>
    <button class="file-btn" onclick={onSave} title="Save project as .ooo">Save</button>
    <button class="file-btn theme-btn" onclick={onToggleTheme} title="Toggle light/dark theme">{theme === 'dark' ? '◑' : '◐'}</button>
  </div>

  <div class="export-wrap">
    <button class="export-btn" onclick={() => { showExportMenu = false; onExport() }}>Export {formatLabel} {exportScale}x</button>
    <button class="export-arrow" onclick={() => showExportMenu = !showExportMenu}>▾</button>
    {#if showExportMenu}
      <div class="export-dropdown">
        <div class="export-section-label">Format</div>
        {#each EXPORT_FORMATS as f}
          <button
            class="export-option"
            class:active={exportFormat === f.value}
            onclick={() => onSetExportFormat(f.value)}
          >
            <span>{f.label}</span>
          </button>
        {/each}
        <div class="export-divider"></div>
        <div class="export-section-label">Resolution</div>
        {#each EXPORT_SCALES as s}
          <button
            class="export-option"
            class:active={exportScale === s}
            onclick={() => onSetExportScale(s)}
          >
            <span>{s}x</span>
            <span class="export-dim">{artW * s} × {artH * s}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</header>

<!-- hidden file input -->
<input
  bind:this={fileInput}
  type="file"
  accept=".ooo,.forma,.txt"
  style:display="none"
  onchange={onFileChange}
/>

<!-- close dropdowns on outside click -->
{#if showExportMenu}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => showExportMenu = false}></div>
{/if}
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

  .export-wrap {
    position: relative;
    display: flex;
    flex-shrink: 0;
  }

  .export-btn {
    background: none;
    border: 1px solid var(--border);
    border-right: none;
    color: var(--text-2);
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 5px 0 0 5px;
    cursor: pointer;
    transition: border-color .15s, color .15s;
  }
  .export-btn:hover { border-color: var(--accent); color: var(--accent); }

  .export-arrow {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-6);
    font-size: 10px;
    width: 22px;
    border-radius: 0 5px 5px 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color .12s, color .12s;
  }
  .export-arrow:hover { border-color: var(--accent); color: var(--accent); }

  .export-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    z-index: 200;
    min-width: 180px;
    box-shadow: 0 8px 24px rgba(0,0,0,.3);
  }

  .export-option {
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
  .export-option:hover { background: var(--bg-hover); color: var(--text-1); }
  .export-option.active { color: var(--accent); }

  .export-dim {
    font-family: monospace;
    font-size: 10px;
    opacity: .45;
  }

  .export-section-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-6);
    text-transform: uppercase;
    letter-spacing: .06em;
    padding: 6px 12px 2px;
  }

  .export-divider {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
  }

  /* ── Beta badge + info button ── */
  .beta-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    padding: 1px 5px;
    border-radius: 4px;
    line-height: 1.4;
  }

  .info-btn {
    background: none;
    border: none;
    color: var(--text-6);
    font-size: 16px;
    cursor: pointer;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background .12s, color .12s;
    flex-shrink: 0;
  }
  .info-btn:hover { background: var(--bg-hover); color: var(--text-3); }
</style>
