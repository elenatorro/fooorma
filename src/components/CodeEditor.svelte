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
  import { HighlightStyle, syntaxHighlighting, indentOnInput } from '@codemirror/language'
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
      background: '#0d0d0f',
      color: '#c8c8d0',
      fontFamily: "'Menlo', 'Consolas', 'Monaco', monospace",
      fontSize: '11px',
    },
    '.cm-content': {
      caretColor: '#c4b0f8',
      padding: '10px 0',
      lineHeight: '1.65',
    },
    '.cm-line': { padding: '0 12px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#c4b0f8' },
    '&.cm-focused': { outline: 'none', boxShadow: 'inset 2px 0 0 #8b5cf6' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      background: '#2d2540 !important',
    },
    '.cm-activeLine': { background: 'rgba(139, 92, 246, 0.05)' },
    '.cm-placeholder': { color: '#2a2a36' },
    // Autocomplete popup
    '.cm-tooltip': {
      background: '#18181c',
      border: '1px solid #2d2d38',
      borderRadius: '6px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete > ul': {
      fontFamily: "'Menlo', 'Consolas', 'Monaco', monospace",
      fontSize: '11px',
      maxHeight: '200px',
    },
    '.cm-tooltip-autocomplete > ul > li': {
      padding: '3px 10px',
      color: '#c8c8d0',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      background: '#2a1f3d',
      color: '#c4b0f8',
    },
    '.cm-completionDetail': {
      marginLeft: '6px',
      color: '#444454',
      fontStyle: 'normal',
      fontSize: '10px',
    },
    '.cm-completionMatchedText': {
      color: '#8b5cf6',
      textDecoration: 'none',
      fontWeight: 'bold',
    },
  }, { dark: true })

  // ── Syntax highlighting ───────────────────────────────────────────────────
  const formaHighlight = HighlightStyle.define([
    { tag: tags.comment,                      color: '#444454', fontStyle: 'italic' },
    { tag: tags.string,                       color: '#86c99a' },
    { tag: tags.number,                       color: '#d19a66' },
    { tag: [tags.bool, tags.null],            color: '#c4b0f8' },
    { tag: tags.keyword,                      color: '#c4b0f8' },
    { tag: tags.operator,                     color: '#88889a' },
    { tag: tags.punctuation,                  color: '#88889a' },
    { tag: tags.function(tags.variableName),  color: '#93c5fd' },
    { tag: tags.propertyName,                 color: '#e5c07b' },
    { tag: tags.variableName,                 color: '#c8c8d0' },
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
    snippetCompletion("line(${x1}, ${y1}, ${x2}, ${y2})",
      { label: 'line', detail: 'x1, y1, x2, y2, color?, opacity?, width?', type: 'function', boost: 10 }),
    snippetCompletion("curve(${x1}, ${y1}, ${cx}, ${cy}, ${x2}, ${y2})",
      { label: 'curve', detail: 'x1, y1, cx, cy, x2, y2, color?, opacity?, width?', type: 'function', boost: 10 }),
    // Styling
    snippetCompletion("stroke('${#000000}', ${1}, ${0.005})",
      { label: 'stroke', detail: "hex, opacity?, width?, align?, join?", type: 'function', boost: 9 }),
    snippetCompletion("rotate(${45})",
      { label: 'rotate', detail: 'deg', type: 'function', boost: 9 }),
    snippetCompletion("transform({ rotate: ${0} })",
      { label: 'transform', detail: '{ rotate?, scaleX?, scaleY?, skewX?, skewY? }', type: 'function', boost: 9 }),
    snippetCompletion("grad(${90}, '${#8b5cf6}', '${#4ecdc4}')",
      { label: 'grad', detail: 'angle, ...stops', type: 'function', boost: 8 }),
    snippetCompletion("radGrad('${#8b5cf6}', '${#4ecdc4}')",
      { label: 'radGrad', detail: '...stops', type: 'function', boost: 8 }),
    // Loops
    snippetCompletion("repeat(${8}, (i, t) => {\n  ${}\n})",
      { label: 'repeat', detail: 'n, (i, t) => { }', type: 'function', boost: 9 }),
    snippetCompletion("grid(${4}, ${4}, (c, r, ct, rt) => {\n  ${}\n})",
      { label: 'grid', detail: 'cols, rows, (c, r, ct, rt) => { }', type: 'function', boost: 9 }),
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
    const re = /#[0-9a-fA-F]{6}/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(doc)) !== null) {
      if (pos >= m.index && pos <= m.index + 7) return { hex: m[0], from: m.index, to: m.index + 7 }
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
    border-bottom: 1px solid #1e1e22;
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
