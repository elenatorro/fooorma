<script lang="ts">
  const {
    zoom,
    rendererType,
    onZoom,
    onFit,
    onReset,
  }: {
    zoom: number
    rendererType: string
    onZoom: (delta: number) => void
    onFit: () => void
    onReset: () => void
  } = $props()

  const pct = $derived(Math.round(zoom * 100))
</script>

<footer class="statusbar">
  <div class="zoom-controls">
    <button onclick={() => onZoom(-1)} title="Zoom out (–)">−</button>
    <span class="zoom-val">{pct}%</span>
    <button onclick={() => onZoom(1)} title="Zoom in (+)">+</button>
    <button class="text-btn" onclick={onFit} title="Fit to view (0)">Fit</button>
    <button class="text-btn" onclick={onReset} title="100% (1)">1:1</button>
  </div>
  {#if rendererType}
    <span class="badge">{rendererType}</span>
  {/if}
</footer>

<style>
  .statusbar {
    position: fixed;
    bottom: 0; left: 0; right: var(--panel-w, 260px);
    height: 36px;
    background: #17171a;
    border-top: 1px solid #2b2b30;
    display: flex;
    align-items: center;
    padding: 0 14px;
    gap: 6px;
    z-index: 100;
    user-select: none;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .zoom-controls button {
    background: none;
    border: 1px solid #2b2b30;
    color: #c4c4cc;
    font-size: 13px;
    width: 26px;
    height: 22px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
  }
  .zoom-controls button:hover { border-color: #444; color: #e2e2e6; }

  .text-btn {
    width: auto !important;
    padding: 0 8px !important;
    font-size: 11px !important;
  }

  .zoom-val {
    font-family: monospace;
    font-size: 11px;
    color: #888890;
    width: 38px;
    text-align: center;
  }

  .badge {
    margin-left: auto;
    font-family: monospace;
    font-size: 10px;
    color: #444450;
  }
</style>
