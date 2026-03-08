<script lang="ts">
  interface SizePreset { label: string; w: number; h: number }

  const {
    artW,
    artH,
    onSizeChange,
    onExport,
  }: {
    artW: number
    artH: number
    onSizeChange: (w: number, h: number) => void
    onExport: () => void
  } = $props()

  const PRESETS: SizePreset[] = [
    { label: 'A4 Portrait',  w: 794,  h: 1123 },
    { label: 'A4 Landscape', w: 1123, h: 794  },
    { label: '1080 × 1080',  w: 1080, h: 1080 },
    { label: '1920 × 1080',  w: 1920, h: 1080 },
    { label: '1080 × 1920',  w: 1080, h: 1920 },
    { label: '2048 × 2048',  w: 2048, h: 2048 },
    { label: 'Custom',       w: 0,    h: 0    },
  ]

  let showDropdown  = $state(false)
  let showCustom    = $state(false)
  let customW       = $state(0)
  let customH       = $state(0)

  function activeLabel() {
    const m = PRESETS.find(p => p.w === artW && p.h === artH)
    return m?.label ?? `${artW} × ${artH}`
  }

  function selectPreset(p: SizePreset) {
    showDropdown = false
    if (p.label === 'Custom') { customW = artW; customH = artH; showCustom = true; return }
    showCustom = false
    onSizeChange(p.w, p.h)
  }

  function applyCustom() {
    const w = Math.max(100, Math.min(8192, customW))
    const h = Math.max(100, Math.min(8192, customH))
    onSizeChange(w, h)
    showCustom = false
  }
</script>

<header class="topbar">
  <span class="logo">forma</span>

  <div class="size-picker">
    <button class="size-btn" onclick={() => showDropdown = !showDropdown}>
      {activeLabel()} <span class="arrow">▾</span>
    </button>

    {#if showDropdown}
      <div class="dropdown" role="menu">
        {#each PRESETS as p}
          <button
            class="dropdown-item"
            class:active={p.w === artW && p.h === artH}
            onclick={() => selectPreset(p)}
            role="menuitem"
          >
            {p.label}
            {#if p.w}
              <span class="dim">{p.w}×{p.h}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if showCustom}
      <div class="custom-form">
        <input type="number" bind:value={customW} min="100" max="8192" placeholder="W" />
        <span>×</span>
        <input type="number" bind:value={customH} min="100" max="8192" placeholder="H" />
        <button class="apply-btn" onclick={applyCustom}>Apply</button>
      </div>
    {/if}
  </div>

  <button class="export-btn" onclick={onExport}>Export PNG</button>
</header>

<!-- close dropdown on outside click -->
{#if showDropdown}
  <div class="overlay" role="presentation" onclick={() => showDropdown = false}></div>
{/if}

<style>
  .topbar {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 44px;
    background: #17171a;
    border-bottom: 1px solid #2b2b30;
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
    color: #8b5cf6;
    letter-spacing: .08em;
    flex-shrink: 0;
  }

  .size-picker {
    position: relative;
    flex-shrink: 0;
  }

  .size-btn {
    background: #222226;
    border: 1px solid #2b2b30;
    color: #c4c4cc;
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 5px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .size-btn:hover { border-color: #444; color: #e2e2e6; }

  .arrow { font-size: 10px; opacity: .6; }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: #1e1e22;
    border: 1px solid #2b2b30;
    border-radius: 6px;
    overflow: hidden;
    z-index: 200;
    min-width: 180px;
    box-shadow: 0 8px 24px rgba(0,0,0,.5);
  }

  .dropdown-item {
    width: 100%;
    background: none;
    border: none;
    color: #c4c4cc;
    font-size: 12px;
    padding: 8px 12px;
    cursor: pointer;
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .dropdown-item:hover { background: #2a2a30; color: #e2e2e6; }
  .dropdown-item.active { color: #8b5cf6; }

  .dim {
    font-family: monospace;
    font-size: 10px;
    opacity: .5;
  }

  .custom-form {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: #1e1e22;
    border: 1px solid #2b2b30;
    border-radius: 6px;
    padding: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    z-index: 200;
    box-shadow: 0 8px 24px rgba(0,0,0,.5);
  }
  .custom-form input {
    width: 68px;
    background: #111114;
    border: 1px solid #2b2b30;
    color: #e2e2e6;
    font-size: 12px;
    padding: 4px 6px;
    border-radius: 4px;
    text-align: center;
  }
  .custom-form input:focus { outline: none; border-color: #8b5cf6; }
  .custom-form span { color: #666672; font-size: 12px; }

  .apply-btn {
    background: #8b5cf6;
    border: none;
    color: #fff;
    font-size: 11px;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
  }
  .apply-btn:hover { background: #7c3aed; }

  .export-btn {
    margin-left: auto;
    background: none;
    border: 1px solid #2b2b30;
    color: #c4c4cc;
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 5px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .export-btn:hover { border-color: #8b5cf6; color: #8b5cf6; }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 150;
  }
</style>
