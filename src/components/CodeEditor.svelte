<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
  import { EditorState } from '@codemirror/state'
  import { javascript } from '@codemirror/lang-javascript'
  import {
    autocompletion, completionKeymap,
    type CompletionContext, type Completion,
    snippetCompletion,
  } from '@codemirror/autocomplete'
  import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
  import { HighlightStyle, syntaxHighlighting, indentOnInput, indentUnit } from '@codemirror/language'
  import { tags } from '@lezer/highlight'

  const {
    value,
    onChange,
    onCursorChange,
    extraCompletions = [],
    minHeight = '220px',
  }: {
    value: string
    onChange: (v: string) => void
    onCursorChange?: () => void
    extraCompletions?: string[]
    minHeight?: string
  } = $props()

  let container: HTMLDivElement | null = null
  let view = $state.raw<EditorView | null>(null)
  let _syncing = false

  // ── Theme ─────────────────────────────────────────────────────────────────
  const formaTheme = EditorView.theme({
    '&': {
      background: 'var(--cm-bg)',
      color: 'var(--cm-text)',
      fontFamily: "'Menlo', 'Consolas', 'Monaco', monospace",
      fontSize: 'var(--cm-font-size, 11px)',
    },
    '.cm-content': {
      caretColor: 'var(--cm-cursor)',
      padding: '10px 0',
      lineHeight: '1.65',
    },
    '.cm-line': { padding: '0 12px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--cm-cursor)' },
    '&.cm-focused': { outline: 'none', boxShadow: 'inset 2px 0 0 var(--cm-focus-shadow)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      background: 'var(--cm-selection) !important',
    },
    '.cm-activeLine': { background: 'var(--cm-active-line)' },
    '.cm-placeholder': { color: 'var(--cm-placeholder)' },
    // Autocomplete popup
    '.cm-tooltip': {
      background: 'var(--cm-tooltip-bg)',
      border: '1px solid var(--cm-tooltip-border)',
      borderRadius: '6px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete > ul': {
      fontFamily: "'Menlo', 'Consolas', 'Monaco', monospace",
      fontSize: 'var(--cm-font-size, 11px)',
      maxHeight: '200px',
    },
    '.cm-tooltip-autocomplete > ul > li': {
      padding: '3px 10px',
      color: 'var(--cm-text)',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      background: 'var(--cm-item-selected)',
      color: 'var(--cm-item-text)',
    },
    '.cm-completionDetail': {
      marginLeft: '6px',
      color: 'var(--cm-placeholder)',
      fontStyle: 'normal',
      fontSize: '10px',
    },
    '.cm-completionMatchedText': {
      color: 'var(--cm-matched)',
      textDecoration: 'none',
      fontWeight: 'bold',
    },
  }, { dark: true })

  // ── Syntax highlighting ───────────────────────────────────────────────────
  const formaHighlight = HighlightStyle.define([
    { tag: tags.comment,                      color: 'var(--cm-comment)', fontStyle: 'italic' },
    { tag: tags.string,                       color: 'var(--cm-string)' },
    { tag: tags.number,                       color: 'var(--cm-number)' },
    { tag: [tags.bool, tags.null],            color: 'var(--cm-keyword)' },
    { tag: tags.keyword,                      color: 'var(--cm-keyword)' },
    { tag: tags.operator,                     color: 'var(--cm-operator)' },
    { tag: tags.punctuation,                  color: 'var(--cm-operator)' },
    { tag: tags.function(tags.variableName),  color: 'var(--cm-function)' },
    { tag: tags.propertyName,                 color: 'var(--cm-property)' },
    { tag: tags.variableName,                 color: 'var(--cm-text)' },
  ])

  // ── Completions ───────────────────────────────────────────────────────────
  const FORMA_COMPLETIONS: Completion[] = [
    // Drawing
    snippetCompletion("rect(${x}, ${y}, ${w}, ${h})",
      { label: 'rect', detail: 'x, y, w, h, color?, opacity?, stroke?', type: 'function', boost: 10 }),
    snippetCompletion("ellipse(${x}, ${y}, ${w}, ${h})",
      { label: 'ellipse', detail: 'x, y, w, h, color?, opacity?, stroke?', type: 'function', boost: 10 }),
    snippetCompletion("triangle(${x1}, ${y1}, ${x2}, ${y2}, ${x3}, ${y3})",
      { label: 'triangle', detail: 'x1,y1, x2,y2, x3,y3, color?, opacity?, stroke?', type: 'function', boost: 10 }),
    snippetCompletion("arc(${cx}, ${cy}, ${r}, ${startDeg}, ${endDeg})",
      { label: 'arc', detail: 'cx, cy, r, startDeg, endDeg, color?, opacity?, stroke?', type: 'function', boost: 10 }),
    snippetCompletion("line(${x1}, ${y1}, ${x2}, ${y2})",
      { label: 'line', detail: 'x1, y1, x2, y2, color?, opacity?, width?', type: 'function', boost: 10 }),
    snippetCompletion("curve(${x1}, ${y1}, ${cx}, ${cy}, ${x2}, ${y2})",
      { label: 'curve', detail: 'x1, y1, cx, cy, x2, y2, color?, opacity?, width?', type: 'function', boost: 10 }),
    snippetCompletion("spline([${x1}, ${y1}, ${x2}, ${y2}, ${x3}, ${y3}])",
      { label: 'spline', detail: '[x1,y1,...], color?, opacity?, width?', type: 'function', boost: 10 }),
    { label: 'beginSpline', detail: 'start vertex accumulation', type: 'function', boost: 9 },
    snippetCompletion("vertex(${x}, ${y})",
      { label: 'vertex', detail: 'x, y', type: 'function', boost: 9 }),
    snippetCompletion("endSpline(${color}, ${opacity})",
      { label: 'endSpline', detail: 'color?, opacity?, width?', type: 'function', boost: 9 }),
    // Styling
    snippetCompletion("stroke('${#000000}', ${1}, ${0.005})",
      { label: 'stroke', detail: "hex, opacity?, width?, align?, join?", type: 'function', boost: 9 }),
    snippetCompletion("rotate(${45})",
      { label: 'rotate', detail: 'deg', type: 'function', boost: 9 }),
    snippetCompletion("transform({ rotate: ${0} })",
      { label: 'transform', detail: '{ rotate?, scaleX?, scaleY?, skewX?, skewY? }', type: 'function', boost: 9 }),
    // Effects
    snippetCompletion("shadow('${#000000}', ${0.5}, ${10}, ${0}, ${4})",
      { label: 'shadow', detail: "color?, opacity?, blur?, offsetX?, offsetY?", type: 'function', boost: 8 }),
    snippetCompletion("blur(${4})",
      { label: 'blur', detail: 'amount?', type: 'function', boost: 8 }),
    snippetCompletion("bevel(${0.6})",
      { label: 'bevel', detail: 'intensity?', type: 'function', boost: 8 }),
    snippetCompletion("noise(${0.3})",
      { label: 'noise', detail: 'amount?', type: 'function', boost: 8 }),
    snippetCompletion("warp(${8}, ${0.05})",
      { label: 'warp', detail: 'strength?, freq?', type: 'function', boost: 8 }),
    snippetCompletion("grad(${90}, '${#8b5cf6}', '${#4ecdc4}')",
      { label: 'grad', detail: 'angle, ...stops', type: 'function', boost: 8 }),
    snippetCompletion("radGrad('${#8b5cf6}', '${#4ecdc4}')",
      { label: 'radGrad', detail: '...stops', type: 'function', boost: 8 }),
    // Loops
    snippetCompletion("repeat(${8}, (i, t) => {\n  ${}\n})",
      { label: 'repeat', detail: 'n, (i, t) => { }', type: 'function', boost: 9 }),
    snippetCompletion("grid(${4}, ${4}, (c, r, ct, rt) => {\n  ${}\n})",
      { label: 'grid', detail: 'cols, rows, (c, r, ct, rt) => { }', type: 'function', boost: 9 }),
    snippetCompletion("wave(${12}, ${0.2}, ${1}, (i, t, x, y) => {\n  ${}\n})",
      { label: 'wave', detail: 'n, amplitude, frequency, (i, t, x, y) => { }', type: 'function', boost: 9 }),
    snippetCompletion("circular(${12}, ${0.5}, ${0.5}, ${0.35}, (i, t, x, y, angle) => {\n  ${}\n})",
      { label: 'circular', detail: 'n, cx, cy, r, (i, t, x, y, angle) => { }', type: 'function', boost: 9 }),
    // Math helpers
    snippetCompletion("lerp(${a}, ${b}, ${t})",
      { label: 'lerp', detail: 'a, b, t', type: 'function', boost: 5 }),
    snippetCompletion("clamp(${v}, ${0}, ${1})",
      { label: 'clamp', detail: 'v, lo, hi', type: 'function', boost: 5 }),
    snippetCompletion("map(${v}, ${0}, ${1}, ${0}, ${1})",
      { label: 'map', detail: 'v, a, b, c, d', type: 'function', boost: 5 }),
    snippetCompletion("smoothstep(${0}, ${1}, ${x})",
      { label: 'smoothstep', detail: 'e0, e1, x', type: 'function', boost: 5 }),
    { label: 'fract',  type: 'function', boost: 4 },
    { label: 'sin',    type: 'function', boost: 4 },
    { label: 'cos',    type: 'function', boost: 4 },
    { label: 'tan',    type: 'function', boost: 3 },
    { label: 'abs',    type: 'function', boost: 3 },
    { label: 'floor',  type: 'function', boost: 3 },
    { label: 'ceil',   type: 'function', boost: 3 },
    { label: 'round',  type: 'function', boost: 3 },
    { label: 'sqrt',   type: 'function', boost: 3 },
    { label: 'pow',    type: 'function', boost: 3 },
    { label: 'min',    type: 'function', boost: 3 },
    { label: 'max',    type: 'function', boost: 3 },
    { label: 'random', type: 'function', boost: 3 },
    snippetCompletion("nz(${x}, ${y})",
      { label: 'nz', detail: 'x, y? → 0..1 value noise', type: 'function', boost: 4 }),
    // Constants
    { label: 'W',   detail: 'artboard width',  type: 'constant', boost: 6 },
    { label: 'H',   detail: 'artboard height', type: 'constant', boost: 6 },
    { label: 'PI',  type: 'constant', boost: 4 },
    { label: 'TAU', type: 'constant', boost: 4 },
    { label: 'E',   type: 'constant', boost: 2 },
  ]

  function completionSource(context: CompletionContext) {
    const word = context.matchBefore(/[\w$]*/)
    if (!word || (word.from === word.to && !context.explicit)) return null
    const extras: Completion[] = extraCompletions.map(label => ({
      label, type: 'variable' as const, detail: 'palette', boost: 7,
    }))
    return { from: word.from, options: [...FORMA_COMPLETIONS, ...extras], validFor: /^\w*$/ }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onMount(() => {
    if (!container) return
    view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          javascript(),
          syntaxHighlighting(formaHighlight),
          autocompletion({ override: [completionSource], activateOnTyping: true }),
          indentUnit.of('  '),
          keymap.of([indentWithTab, ...historyKeymap, ...completionKeymap, ...defaultKeymap]),
          indentOnInput(),
          cmPlaceholder('// rect(x, y, w, h)  ellipse(x, y, w, h)  line(x1,y1,x2,y2)\n// repeat(n, (i, t) => { })  ·  grid(cols, rows, (c, r) => { })'),
          formaTheme,
          EditorView.updateListener.of(update => {
            if (update.docChanged && !_syncing) onChange(update.state.doc.toString())
            if (update.selectionSet || update.focusChanged) onCursorChange?.()
          }),
        ],
      }),
      parent: container,
    })
  })

  // Sync external value changes into the editor
  $effect(() => {
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    _syncing = true
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    _syncing = false
  })

  onDestroy(() => { view?.destroy(); view = null })

  // ── Public API ────────────────────────────────────────────────────────────
  export function insertAtCursor(text: string) {
    if (!view) return
    const { from, to } = view.state.selection.main
    const before = view.state.doc.sliceString(0, from)
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
    view.dispatch({
      changes: { from, to, insert: prefix + text },
      selection: { anchor: from + prefix.length + text.length },
    })
    view.focus()
  }

  export function getColorAtCursor(): { hex: string; from: number; to: number } | null {
    if (!view) return null
    const pos = view.state.selection.main.head
    const doc = view.state.doc.toString()

    // Pass 1: hex directly at cursor (include surrounding quote chars in the hit area)
    const hexRe = /#[0-9a-fA-F]{6}/gi
    let m: RegExpExecArray | null
    while ((m = hexRe.exec(doc)) !== null) {
      const lo = m.index - (doc[m.index - 1] === "'" || doc[m.index - 1] === '"' ? 1 : 0)
      const hi = m.index + 7 + (doc[m.index + 7] === "'" || doc[m.index + 7] === '"' ? 1 : 0)
      if (pos >= lo && pos <= hi) return { hex: m[0], from: m.index, to: m.index + 7 }
    }

    // Pass 2: cursor inside a color-accepting function call → return its first hex arg
    const fnRe = /\b(stroke|grad|radGrad|shadow)\s*\(/g
    let fn: RegExpExecArray | null
    while ((fn = fnRe.exec(doc)) !== null) {
      const callStart = fn.index
      const parenOpen = fn.index + fn[0].length - 1
      let depth = 1, i = parenOpen + 1
      while (i < doc.length && depth > 0) {
        if (doc[i] === '(') depth++
        else if (doc[i] === ')') depth--
        i++
      }
      const callEnd = i - 1  // index of closing ')'
      if (pos >= callStart && pos <= callEnd) {
        const seg = doc.slice(parenOpen + 1, callEnd)
        const h = /#[0-9a-fA-F]{6}/i.exec(seg)
        if (h) {
          const from = parenOpen + 1 + h.index
          return { hex: h[0], from, to: from + 7 }
        }
      }
    }

    return null
  }

  export function replaceRange(from: number, to: number, text: string) {
    view?.dispatch({ changes: { from, to, insert: text } })
  }

  export function focus() { view?.focus() }
</script>

<div bind:this={container} class="cm-wrap" style:min-height={minHeight}></div>

<style>
  .cm-wrap {
    border-bottom: 1px solid var(--border-inner);
    overflow: hidden;
    box-sizing: border-box;
    transition: min-height .2s ease;
  }
  .cm-wrap :global(.cm-editor) {
    min-height: inherit;
  }
  .cm-wrap :global(.cm-scroller) {
    min-height: inherit;
    overflow-x: auto;
  }
</style>
