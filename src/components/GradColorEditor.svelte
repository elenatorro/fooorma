<script lang="ts">
  import type { ColorStop, Gradient, ShapeColor } from '../lib/layers/types'
  import ColorPicker from './ColorPicker.svelte'

  const { color, onChange }: {
    color: ShapeColor
    onChange: (c: ShapeColor) => void
  } = $props()

  type Mode = 'solid' | 'linear' | 'radial'

  const mode = $derived<Mode>(
    !color.gradient ? 'solid'
    : color.gradient.type === 'linear' ? 'linear'
    : 'radial'
  )

  function setMode(next: Mode) {
    if (next === mode) return
    if (next === 'solid') {
      const firstStop = color.gradient?.stops[0]
      onChange({ hex: firstStop?.hex ?? color.hex, opacity: firstStop?.opacity ?? color.opacity })
      return
    }
    const stops: ColorStop[] = color.gradient
      ? [...color.gradient.stops]
      : [
          { hex: color.hex, opacity: color.opacity, pos: 0 },
          { hex: color.hex, opacity: 0, pos: 1 },
        ]
    if (next === 'linear') {
      const angle = color.gradient?.type === 'linear' ? color.gradient.angle : 90
      onChange({ ...color, gradient: { type: 'linear', angle, stops } })
    } else {
      onChange({ ...color, gradient: { type: 'radial', cx: 0.5, cy: 0.5, stops } })
    }
  }

  function updateAngle(angle: number) {
    if (!color.gradient || color.gradient.type !== 'linear') return
    onChange({ ...color, gradient: { ...color.gradient, angle } })
  }

  function updateStop(index: number, update: Partial<ColorStop>) {
    if (!color.gradient) return
    const stops = color.gradient.stops.map((s, i) => i === index ? { ...s, ...update } : s)
    onChange({ ...color, gradient: { ...color.gradient, stops } })
  }

  function addStop() {
    if (!color.gradient) return
    const stops = color.gradient.stops
    const lastPos = stops[stops.length - 1]?.pos ?? 1
    const prevPos = stops[stops.length - 2]?.pos ?? 0
    const newPos  = Math.min(1, (lastPos + prevPos) / 2 + 0.1)
    const newHex  = stops[stops.length - 1]?.hex ?? '#ffffff'
    const newStop: ColorStop = { hex: newHex, opacity: 1, pos: parseFloat(newPos.toFixed(3)) }
    onChange({ ...color, gradient: { ...color.gradient, stops: [...stops, newStop] } })
  }

  function removeStop(index: number) {
    if (!color.gradient || color.gradient.stops.length <= 2) return
    const stops = color.gradient.stops.filter((_, i) => i !== index)
    onChange({ ...color, gradient: { ...color.gradient, stops } })
  }

  function gradientCSS(g: Gradient): string {
    const sorted = [...g.stops].sort((a, b) => a.pos - b.pos)
    const parts  = sorted.map(s => {
      const [r,gr,b] = hexToRgb(s.hex)
      return `rgba(${r},${gr},${b},${s.opacity}) ${(s.pos * 100).toFixed(1)}%`
    }).join(', ')
    if (g.type === 'linear') {
      const deg = ((180 - g.angle + 360) % 360).toFixed(0)
      return `linear-gradient(${deg}deg, ${parts})`
    }
    return `radial-gradient(circle, ${parts})`
  }

  function hexToRgb(hex: string): [number, number, number] {
    const c = hex.replace('#', '')
    return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)]
  }
</script>

<!-- Type toggle -->
<div class="gce-type-row">
  <button class="gce-type-btn" class:active={mode === 'solid'}  onclick={() => setMode('solid')}>Solid</button>
  <button class="gce-type-btn" class:active={mode === 'linear'} onclick={() => setMode('linear')}>Linear</button>
  <button class="gce-type-btn" class:active={mode === 'radial'} onclick={() => setMode('radial')}>Radial</button>
</div>

{#if mode === 'solid'}
  <div class="gce-solid-row">
    <ColorPicker
      hex={color.hex}
      opacity={color.opacity}
      onChange={(h, op) => onChange({ ...color, hex: h, opacity: op })}
    />
    <span class="gce-hex">{color.hex}</span>
    <span class="gce-val">{color.opacity.toFixed(2)}</span>
  </div>
{:else if color.gradient}
  <!-- Gradient preview bar -->
  <div class="gce-preview" style:background={gradientCSS(color.gradient)}></div>

  <!-- Angle (linear only) -->
  {#if mode === 'linear' && color.gradient.type === 'linear'}
    <div class="gce-param-row">
      <label class="gce-label" for="gce-angle">Angle</label>
      <input
        id="gce-angle"
        class="gce-range"
        type="range" min="0" max="360" step="1"
        value={color.gradient.angle}
        oninput={(e) => updateAngle(parseFloat((e.target as HTMLInputElement).value))}
      />
      <span class="gce-val">{color.gradient.angle}°</span>
    </div>
  {/if}

  <!-- Stops -->
  <div class="gce-stops">
    {#each color.gradient.stops as stop, i (i)}
      <div class="gce-stop-row">
        <ColorPicker
          hex={stop.hex}
          opacity={stop.opacity}
          onChange={(h, op) => updateStop(i, { hex: h, opacity: op })}
        />
        <input
          class="gce-range gce-pos-range"
          type="range" min="0" max="1" step="0.01"
          value={stop.pos}
          oninput={(e) => updateStop(i, { pos: parseFloat((e.target as HTMLInputElement).value) })}
          title="Position"
        />
        <span class="gce-val">{(stop.pos * 100).toFixed(0)}%</span>
        {#if color.gradient.stops.length > 2}
          <button class="gce-rm-btn" onclick={() => removeStop(i)} title="Remove stop">×</button>
        {/if}
      </div>
    {/each}
  </div>

  <button class="gce-add-btn" onclick={addStop}>+ Stop</button>
{/if}

<style>
  .gce-type-row {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
  }

  .gce-type-btn {
    flex: 1;
    padding: 3px 0;
    font-size: 10px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-3);
    cursor: pointer;
    transition: background .1s, color .1s, border-color .1s;
  }
  .gce-type-btn:hover { border-color: var(--text-5); color: var(--text-2); }
  .gce-type-btn.active {
    background: var(--bg-selected);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .gce-solid-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .gce-preview {
    height: 22px;
    border-radius: 4px;
    border: 1px solid var(--border);
    margin-bottom: 8px;
  }

  .gce-param-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .gce-label {
    font-size: 10px;
    color: var(--text-4);
    width: 36px;
    flex-shrink: 0;
  }

  .gce-range {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
    outline: none;
    cursor: pointer;
  }
  .gce-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px; height: 12px;
    border-radius: 50%;
    background: var(--accent);
    border: none;
    cursor: pointer;
  }
  .gce-range::-moz-range-thumb {
    width: 12px; height: 12px;
    border-radius: 50%;
    background: var(--accent);
    border: none;
    cursor: pointer;
  }

  .gce-val {
    font-family: monospace;
    font-size: 10px;
    color: var(--text-4);
    width: 32px;
    text-align: right;
    flex-shrink: 0;
  }

  .gce-hex {
    font-family: monospace;
    font-size: 10px;
    color: var(--text-3);
    flex: 1;
  }

  .gce-stops {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 6px;
  }

  .gce-stop-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .gce-pos-range { flex: 1; }

  .gce-rm-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-4);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color .1s, color .1s;
  }
  .gce-rm-btn:hover { border-color: #e55; color: #e55; }

  .gce-add-btn {
    width: 100%;
    padding: 4px;
    font-size: 10px;
    background: var(--bg-panel);
    border: 1px dashed var(--border);
    border-radius: 4px;
    color: var(--text-4);
    cursor: pointer;
    transition: border-color .1s, color .1s;
  }
  .gce-add-btn:hover { border-color: var(--accent); color: var(--accent); }
</style>
