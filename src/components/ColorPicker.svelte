<script lang="ts">
  // ── Color math ─────────────────────────────────────────────────────────────
  function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const f = (n: number) => {
      const k = (n + h / 60) % 6
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
    }
    return [f(5) * 255, f(3) * 255, f(1) * 255]
  }

  function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b)
    let h = 0
    if (d > 0) {
      if      (max === r) h = ((g - b) / d % 6) * 60
      else if (max === g) h = ((b - r) / d + 2) * 60
      else                h = ((r - g) / d + 4) * 60
      if (h < 0) h += 360
    }
    return [h, max === 0 ? 0 : d / max, max]
  }

  function hexToRgb(hex: string): [number, number, number] {
    const c = hex.replace('#', '')
    return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)]
  }

  function toHex(r: number, g: number, b: number): string {
    return '#' + [r,g,b].map(n => Math.round(Math.max(0,Math.min(255,n))).toString(16).padStart(2,'0')).join('')
  }

  function hsvHex(h: number, s: number, v: number): string {
    return toHex(...hsvToRgb(h, s, v))
  }

  // ── Props ──────────────────────────────────────────────────────────────────
  const {
    hex,
    opacity = 1,
    showOpacity = true,
    onChange,
  }: {
    hex: string
    opacity?: number
    showOpacity?: boolean
    onChange: (hex: string, opacity: number) => void
  } = $props()

  // ── State ──────────────────────────────────────────────────────────────────
  let isOpen  = $state(false)
  let swEl    = $state<HTMLButtonElement | null>(null)
  let svEl    = $state<HTMLDivElement | null>(null)

  let H = $state(0), S = $state(0.7), V = $state(0.9), A = $state(1)
  let hexText = $state('')

  let pickerX = $state(0)
  let pickerY = $state(0)

  function initFrom(h: string, a: number) {
    ;[H, S, V] = rgbToHsv(...hexToRgb(h))
    A = a
    syncText()
  }

  function syncText() {
    hexText = hsvHex(H, S, V).slice(1).toUpperCase()
  }

  function emit() {
    onChange(hsvHex(H, S, V), A)
  }

  function toggle() {
    isOpen = !isOpen
    if (isOpen && swEl) {
      initFrom(hex, opacity)
      const r  = swEl.getBoundingClientRect()
      const pw = 212
      const ph = showOpacity ? 264 : 232
      let x = r.left
      let y = r.bottom + 6
      if (y + ph > window.innerHeight - 8) y = r.top - ph - 6
      if (x + pw > window.innerWidth  - 8) x = window.innerWidth - pw - 8
      pickerX = Math.max(8, x)
      pickerY = Math.max(8, y)
    }
  }

  // ── SV square drag ─────────────────────────────────────────────────────────
  function onSV(e: PointerEvent) {
    if (e.type === 'pointerdown') (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (e.type === 'pointermove' && !e.buttons) return
    if (!svEl) return
    const r = svEl.getBoundingClientRect()
    S = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    V = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))
    syncText(); emit()
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const hueHex = $derived(hsvHex(H, 1, 1))
  const curHex = $derived(hsvHex(H, S, V))
</script>

<!-- Swatch trigger -->
<button
  bind:this={swEl}
  class="cp-swatch"
  onclick={toggle}
  title="Pick color"
>
  <span class="cp-swatch-inner" style:background={hex} style:opacity={showOpacity ? opacity : 1}></span>
</button>

{#if isOpen}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="cp-backdrop" onclick={() => isOpen = false}></div>

  <!-- Picker panel -->
  <div class="cp-panel" style:left="{pickerX}px" style:top="{pickerY}px">

    <!-- Saturation / Value square -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={svEl}
      class="cp-sv"
      style:--hc={hueHex}
      onpointerdown={onSV}
      onpointermove={onSV}
    >
      <div class="cp-cursor"
        style:left="{S * 100}%"
        style:top="{(1 - V) * 100}%"
        style:background={curHex}
      ></div>
    </div>

    <!-- Hue + opacity sliders -->
    <div class="cp-sliders">
      <input
        class="cp-hue"
        type="range" min="0" max="360" step="0.5"
        value={H}
        oninput={(e) => { H = parseFloat((e.target as HTMLInputElement).value); syncText(); emit() }}
      />
      {#if showOpacity}
        <div class="cp-op-wrap" style:--c={curHex}>
          <input
            class="cp-op"
            type="range" min="0" max="1" step="0.01"
            value={A}
            oninput={(e) => { A = parseFloat((e.target as HTMLInputElement).value); emit() }}
          />
        </div>
      {/if}
    </div>

    <!-- Hex input + preview -->
    <div class="cp-bottom">
      <div class="cp-hex-wrap">
        <span class="cp-hash">#</span>
        <input
          class="cp-hex-input"
          type="text"
          maxlength="6"
          spellcheck="false"
          value={hexText}
          oninput={(e) => {
            const val = (e.target as HTMLInputElement).value.replace(/[^0-9a-fA-F]/g,'').slice(0,6)
            hexText = val
            if (val.length === 6) {
              ;[H, S, V] = rgbToHsv(...hexToRgb('#' + val))
              emit()
            }
          }}
          onblur={syncText}
        />
      </div>
      {#if showOpacity}
        <span class="cp-alpha-val">{Math.round(A * 100)}%</span>
      {/if}
      <div class="cp-preview" style:background={curHex} style:opacity={A}></div>
    </div>

  </div>
{/if}

<style>
  /* ── Swatch ── */
  .cp-swatch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 22px;
    padding: 2px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    transition: border-color .12s;
  }
  .cp-swatch:hover { border-color: var(--text-5); }

  .cp-swatch-inner {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 2px;
  }

  /* ── Backdrop ── */
  .cp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 998;
  }

  /* ── Panel ── */
  .cp-panel {
    position: fixed;
    z-index: 999;
    width: 212px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0,0,0,.4);
    overflow: hidden;
    user-select: none;
  }

  /* ── SV square ── */
  .cp-sv {
    position: relative;
    width: 100%;
    height: 140px;
    background: var(--hc);
    cursor: crosshair;
  }
  .cp-sv::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to right, #fff, transparent);
  }
  .cp-sv::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent, #000);
  }

  .cp-cursor {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,.5), inset 0 0 0 1px rgba(0,0,0,.2);
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 1;
  }

  /* ── Sliders ── */
  .cp-sliders {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px 6px;
  }

  /* Shared thumb style via custom properties */
  .cp-hue,
  .cp-op {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 10px;
    border-radius: 5px;
    outline: none;
    cursor: pointer;
    display: block;
  }

  /* Hue track */
  .cp-hue {
    background: linear-gradient(to right,
      hsl(0,100%,50%), hsl(30,100%,50%), hsl(60,100%,50%), hsl(90,100%,50%),
      hsl(120,100%,50%), hsl(150,100%,50%), hsl(180,100%,50%), hsl(210,100%,50%),
      hsl(240,100%,50%), hsl(270,100%,50%), hsl(300,100%,50%), hsl(330,100%,50%),
      hsl(360,100%,50%)
    );
  }

  /* Opacity track wrapper (checkerboard + gradient) */
  .cp-op-wrap {
    position: relative;
    height: 10px;
    border-radius: 5px;
    background:
      linear-gradient(45deg, var(--checker-a) 25%, transparent 25%, transparent 75%, var(--checker-a) 75%) 0 0 / 8px 8px,
      linear-gradient(45deg, var(--checker-a) 25%, transparent 25%, transparent 75%, var(--checker-a) 75%) 4px 4px / 8px 8px,
      var(--checker-b);
  }
  .cp-op-wrap::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 5px;
    background: linear-gradient(to right, transparent, var(--c));
    pointer-events: none;
  }
  .cp-op {
    position: absolute;
    inset: 0;
    background: transparent;
  }

  /* Thumbs */
  .cp-hue::-webkit-slider-thumb,
  .cp-op::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    border: 1.5px solid rgba(0,0,0,.35);
    box-shadow: 0 1px 3px rgba(0,0,0,.4);
    cursor: pointer;
  }
  .cp-hue::-moz-range-thumb,
  .cp-op::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    border: 1.5px solid rgba(0,0,0,.35);
    box-shadow: 0 1px 3px rgba(0,0,0,.4);
    cursor: pointer;
  }
  .cp-hue::-moz-range-track { background: transparent; height: 10px; border-radius: 5px; }
  .cp-op::-moz-range-track  { background: transparent; height: 10px; border-radius: 5px; }

  /* ── Bottom row: hex + alpha + preview ── */
  .cp-bottom {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px 10px;
    border-top: 1px solid var(--border-inner);
  }

  .cp-hex-wrap {
    display: flex;
    align-items: center;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 6px;
    flex: 1;
    gap: 2px;
    transition: border-color .12s;
  }
  .cp-hex-wrap:focus-within { border-color: var(--accent); }

  .cp-hash {
    font-family: monospace;
    font-size: 11px;
    color: var(--text-6);
  }

  .cp-hex-input {
    background: none;
    border: none;
    color: var(--text-2);
    font-family: monospace;
    font-size: 11px;
    width: 58px;
    outline: none;
    letter-spacing: .05em;
  }

  .cp-alpha-val {
    font-family: monospace;
    font-size: 10px;
    color: var(--text-5);
    width: 30px;
    text-align: right;
    flex-shrink: 0;
  }

  .cp-preview {
    width: 20px;
    height: 20px;
    border-radius: 3px;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }
</style>
