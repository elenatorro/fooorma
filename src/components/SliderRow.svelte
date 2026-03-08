<script lang="ts">
  let {
    id,
    label,
    min,
    max,
    step,
    value,
    onchange,
    style,
  }: {
    id: string
    label: string
    min: number
    max: number
    step: number
    value: number
    onchange: (v: number) => void
    style?: string
  } = $props()

  let editing = $state(false)
  let draft = $state('')

  function clamp(v: number) {
    return Math.max(min, Math.min(max, v))
  }

  function displayValue(v: number) {
    // Show enough decimal places based on step
    const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0
    return v.toFixed(decimals)
  }

  function startEdit() {
    draft = displayValue(value)
    editing = true
  }

  function commitEdit() {
    editing = false
    const v = parseFloat(draft)
    if (!isNaN(v)) onchange(clamp(v))
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
    if (e.key === 'Escape') { editing = false }
  }
</script>

<div class="param-row" {style}>
  <label class="param-label" for={id}>{label}</label>
  <div class="param-control">
    <input
      {id}
      type="range"
      {min} {max} {step} {value}
      oninput={(e) => onchange(parseFloat((e.target as HTMLInputElement).value))}
    />
    {#if editing}
      <input
        type="text"
        class="param-val"
        value={draft}
        oninput={(e) => draft = (e.target as HTMLInputElement).value}
        onblur={commitEdit}
        onkeydown={onKeydown}
        autocomplete="off"
      />
    {:else}
      <button class="param-val" onclick={startEdit} tabindex="0">
        {displayValue(value)}
      </button>
    {/if}
  </div>
</div>

<style>
  .param-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .param-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: #555560;
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
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 10px;
    color: #c4c4cc;
    width: 44px;
    text-align: right;
    flex-shrink: 0;
    background: #111114;
    border: 1px solid #2b2b30;
    border-radius: 3px;
    padding: 2px 4px;
    cursor: text;
    line-height: 1.4;
  }

  button.param-val {
    cursor: pointer;
  }

  button.param-val:hover {
    border-color: #444450;
    color: #e0e0e8;
  }

  input.param-val {
    -moz-appearance: textfield;
    outline: none;
    border-color: #8b5cf6;
  }

  /* hide browser spin buttons */
  input.param-val::-webkit-inner-spin-button,
  input.param-val::-webkit-outer-spin-button {
    -webkit-appearance: none;
  }
</style>
