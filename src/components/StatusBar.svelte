<script lang="ts">
  const {
    zoom,
    cmykProof,
    onZoom,
    onFit,
    onReset,
    onToggleCmykProof,
  }: {
    zoom: number
    cmykProof: boolean
    onZoom: (delta: number) => void
    onFit: () => void
    onReset: () => void
    onToggleCmykProof: () => void
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
  <button
    class="text-btn proof-btn"
    class:active={cmykProof}
    onclick={onToggleCmykProof}
    title="CMYK soft-proof preview"
  >CMYK</button>
</footer>

<style>
  .statusbar {
    position: fixed;
    bottom: 0; left: 0; right: var(--panel-w, 260px);
    height: 36px;
    background: var(--bg-bar);
    border-top: 1px solid var(--border);
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
    border: 1px solid var(--border);
    color: var(--text-2);
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
  .zoom-controls button:hover { border-color: var(--text-6); color: var(--text-1); }

  .text-btn {
    width: auto !important;
    padding: 0 8px !important;
    font-size: 11px !important;
  }

  .zoom-val {
    font-family: monospace;
    font-size: 11px;
    color: var(--text-3);
    width: 38px;
    text-align: center;
  }

  .proof-btn {
    margin-left: auto;
    background: none;
    border: 1px solid var(--border);
    color: var(--text-5);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: .04em;
    padding: 0 8px;
    height: 22px;
    border-radius: 4px;
    cursor: pointer;
    transition: border-color .12s, color .12s;
  }
  .proof-btn:hover { border-color: var(--text-6); color: var(--text-2); }
  .proof-btn.active { border-color: var(--accent); color: var(--accent); }

</style>
