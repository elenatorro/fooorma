# Forma — Development Skills & Knowledge

## 1. Architecture Overview

```
App.svelte (root state, RAF loop, history, keyboard shortcuts)
├── TopBar.svelte          (artboard size, presets, export, file I/O, theme)
├── Viewport.svelte        (canvas, zoom/pan, hit test, draw, select, drag)
├── RightPanel.svelte      (tabs: Layers, Palettes, Patterns, Samples)
│   ├── CodeEditor.svelte  (CodeMirror 6, JS syntax, completions)
│   ├── ColorPicker.svelte (HSV square + hue slider + hex input)
│   ├── GradColorEditor    (gradient stops, linear/radial, angle)
│   └── SliderRow.svelte   (labeled slider + number input)
├── BottomCodePanel.svelte (docked code editor, resizable)
└── StatusBar.svelte       (zoom controls, CMYK proof toggle)
```

## 2. State Management

All state lives in `App.svelte` using Svelte 5 runes. Child components receive props + callbacks.

### Core State
| Variable | Type | Persistence |
|----------|------|-------------|
| `layers` | `Layer[]` | autosave (localStorage) |
| `activeLayerId` | `string \| null` | autosave (index) |
| `activeShapeId` | `string \| null` | session only |
| `selectedShapeIds` | `string[]` | session only |
| `artW`, `artH` | `number` | autosave |
| `customPalettes` | `Palette[]` | autosave |
| `customPatterns` | `Pattern[]` | autosave |
| `zoom`, `panX`, `panY` | `number` | session only |
| `theme` | `'dark' \| 'light'` | localStorage `forma_theme` |
| `panelWidth` | `number` | localStorage `forma_panel_w` |
| `codePanelPos` | `'right' \| 'bottom'` | localStorage `forma_code_pos` |
| `codePanelH` | `number` | localStorage `forma_code_h` |
| `activeTab` | tab union | session only |
| `exportScale` | `number` | session only |
| `exportFormat` | `'png' \| 'cmyk-tiff'` | session only |

### Autosave
- Key: `forma_autosave`
- Debounced 500ms via `$effect`
- Saves: `{ layers, artW, artH, customPalettes, customPatterns, activeIdx }`

### History (Undo/Redo)
- `past` / `future` arrays of `HistoryEntry` (max 50)
- `HistoryEntry = { layers, activeShapeId, selectedShapeIds }`
- Call `commit()` **before** any mutation
- Code editor changes do NOT commit (CodeMirror has its own undo)

### Derived State
- `resolvedLayers` — layers with code-mode shapes evaluated
- `allPalettes` — `[...BUILTIN_PALETTES, ...customPalettes]`
- `allPatterns` — `[...BUILTIN_PATTERNS, ...customPatterns]`
- `drawableLayerId` — null if active layer is code mode (disables canvas draw)

## 3. Type System (`src/lib/layers/types.ts`)

### Shape Hierarchy
```
Shape
├── type: ShapeType (rect|ellipse|line|curve|triangle|arc|spline|group|cube|sphere|cylinder|torus)
├── color: ShapeColor { hex, opacity, gradient? }
├── geom: ShapeGeom { x, y, w, h }      ← all shapes have this (center + size)
├── pts?: number[]                        ← line/curve/triangle/spline flat coords
├── strokeWidth?: number                  ← line/curve only
├── stroke?: ShapeStroke                  ← border (color, width, align, join, gradient)
├── transform?: ShapeTransform            ← rotate, scale, skew, 3D angles
├── effects?: ShapeEffect[]               ← shadow, blur, bevel, noise, warp, material
└── children?: Shape[]                    ← group only
```

### Coordinate System
- **Position**: `x` = fraction of artW, `y` = fraction of artH. `(0.5, 0.5)` = center.
- **Size**: `w` and `h` are both **artW-fractions** (uniform space). Equal w/h = square regardless of aspect ratio.
- **pts**: flat `[x0,y0, x1,y1, ...]`, each in normalized 0–1 space.

### Other Types
- `Layer` — id, name, visible, bgColor?, mode (manual|code), shapes[], query
- `Pattern` — id, name, type, shape, color, opacity, count, cols, rows, builtin?, code?
- `Palette` — id, name, colors[], builtin?
- `Gradient` — LinearGradient (angle + stops) | RadialGradient (cx, cy + stops)

## 4. Code API (`src/lib/query/index.ts`)

The code sandbox runs user code via `new Function(...)` with these globals:

### Shape Primitives
| Function | Signature |
|----------|-----------|
| `rect` | `(x, y, w, h, color?, opacity?, ...effects)` |
| `ellipse` | `(x, y, w, h, color?, opacity?, ...effects)` |
| `triangle` | `(x1, y1, x2, y2, x3, y3, color?, opacity?, ...effects)` |
| `arc` | `(cx, cy, r, startDeg, endDeg, color?, opacity?, ...effects)` |
| `line` | `(x1, y1, x2, y2, color?, opacity?, width?, ...effects)` |
| `curve` | `(x1, y1, cx, cy, x2, y2, color?, opacity?, width?, ...effects)` |
| `spline` | `(pts[], color?, opacity?, width?, ...effects)` |
| `beginSpline/vertex/endSpline` | spline builder |
| `cube/sphere/torus` | `(x, y, size, color?, opacity?, ...effects)` |
| `cylinder` | `(x, y, w, h, color?, opacity?, ...effects)` |

### Modifiers (trailing args)
| Function | Returns |
|----------|---------|
| `stroke(color, opacity?, width?, align?, join?)` | ShapeStroke |
| `rotate(deg)` | ShapeTransform |
| `transform({rotate?, scaleX?, ...})` | ShapeTransform |
| `shadow(color?, opacity?, blur?, offsetX?, offsetY?)` | ShapeEffect |
| `blur(amount?)` | ShapeEffect |
| `bevel(intensity?)` | ShapeEffect |
| `noise(amount?)` | ShapeEffect |
| `warp(strength?, freq?)` | ShapeEffect |
| `material(kind, roughness?, intensity?)` | ShapeEffect |
| `grad(angle, ...stops)` | LinearGradient |
| `radGrad(...stops)` | RadialGradient |

### Loops
| Function | Callback params |
|----------|-----------------|
| `repeat(n, cb)` | `(i, t)` — index, normalized 0→1 |
| `grid(cols, rows, cb)` | `(c, r, ct, rt)` — indices + normalized |
| `wave(n, amp, freq, cb)` | `(i, t, x, y)` — position on sine wave |
| `circular(n, cx, cy, r, cb)` | `(i, t, x, y, angle)` — radial position |
| `tile(cols, rows, cb, opts?)` | `(c, r, ct, rt)` — shapes in local 0–1 space |

### Tile System
- Shapes inside `tile()` are drawn in **tile-local 0–1 space**, auto-mapped to grid cells
- `mirror('x'|'y'|'xy')` — flip shapes inside tile callback
- Options: `{ offsetX, offsetY, gapX, gapY }`
- Remaps geom, pts, transforms from local to cell coordinates

### Dimension Helpers
- `w(v)` / `width(v)` — identity (sizes are width-relative)
- `h(v)` / `height(v)` — converts height-fraction to width-fraction (`v * H / W`)
- `W`, `H` — artboard width/height constants

### Math
- `sin, cos, tan, abs, floor, ceil, round, sqrt, pow, min, max, random`
- `lerp(a, b, t)`, `clamp(v, lo, hi)`, `map(v, a, b, c, d)`, `fract(v)`, `smoothstep(e0, e1, x)`
- `nz(x, y?)` — Perlin-like noise 0–1
- `PI, TAU, E`

### Palette Access
- `palette(name)` → `string[]` of hex colors
- `palette(name, index)` → single hex (wraps modulo)

### Limits
- MAX_SHAPES = 5000 (silently ignored beyond)
- Grid max 200×200 cells

### Trailing Argument Parser
After positional args, shapes accept stroke/transform/effects in any order. The `collectTrailing()` function auto-detects types via predicates (isEffect, isTransform, has 'width' for stroke).

## 5. Renderer (`src/lib/layers/renderer2d.ts`)

### Main: `renderLayers2D(ctx, layers, artW, artH, clear?)`
- Iterates visible layers in order
- Layer background fill if `bgColor` set
- Per-shape: apply transform → fill → stroke → effects

### Effect Rendering
| Effect | Technique |
|--------|-----------|
| Shadow | `ctx.shadowColor/Blur/OffsetX/Y` |
| Blur | `ctx.filter = 'blur(Npx)'` |
| Bevel | Clipped gradients (light/dark) |
| Noise | 128×128 noise texture, overlay composite |
| Warp | Per-shape displacement via offscreen canvas |

### 3D Rendering
- Euler rotation: Y→X→Z order
- Orthographic→perspective projection
- Painter's algorithm (face depth sorting)
- Light direction: `[-0.4, 0.6, -0.7]`
- Materials: default, metal (mirror specular), plastic (dull), marble (noise veins), glass (rim+transparency)
- Tessellation: `smooth` param (3–128 segments, default 32)

### Key Functions
- `applyTransform(ctx, transform, cx, cy)` — translate→skew→rotate→scale
- `hexToRgba(hex, opacity)` → rgba string
- `makeGradient(ctx, gradient, bbox)` → CanvasGradient

## 6. Viewport (`src/components/Viewport.svelte`)

### Interactions
| Action | Behavior |
|--------|----------|
| Click empty | Deselect (+ start draw in manual mode) |
| Click shape | Select (switches layer if needed) |
| Shift+click | Toggle multi-selection |
| Drag from empty | Draw new rect |
| Drag selected | Move shape(s) |
| Space+drag | Pan |
| Wheel | Zoom (mouse-centered) |
| Middle-mouse | Pan |

### Hit Testing
- Top-to-bottom layer order, last shape first
- 6px pad for pts shapes (bounding box)
- Ellipse: `(dx/rw)² + (dy/rh)² ≤ 1`
- 3D: uses `get3DBounds()` for isometric bounds

### Constants (`src/lib/viewport.ts`)
- `MIN_ZOOM = 0.05`, `MAX_ZOOM = 20`, `MAX_RENDER_SCALE = 6`

## 7. Persistence

### Autosave (localStorage)
Key `forma_autosave` — JSON with layers, dimensions, palettes, patterns, active index.

### .forma File Format (`src/lib/persist/index.ts`)
```
// forma v1
// Artboard: 794 × 1123
// @palette "Name" #hex1 #hex2 ...
// @layer "Name" [hidden] [bg:#hex] [mode:manual]
rect(0.5, 0.5, 0.3, 0.3, '#8b5cf6', 0.85)
```
- `serializeProject()` → text, `parseProject()` → `{ layers, artW, artH, customPalettes }`

### Export
- **PNG**: render at `exportScale` → `canvas.toDataURL('image/png')`
- **CMYK TIFF**: `encodeCmykTiff(imageData)` — naive RGB→CMYK, uncompressed, 300 DPI
- **CMYK proof**: `applyCmykSoftProof(imageData)` — in-place round-trip for preview

## 8. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y | Redo |
| Ctrl/Cmd+D | Duplicate selected |
| Ctrl/Cmd+C | Copy |
| Ctrl/Cmd+X | Cut |
| Ctrl/Cmd+V | Paste |
| Ctrl/Cmd+A | Select all in layer |
| Escape | Deselect |
| 0 | Fit to view |
| 1 | Zoom 100% |
| +/= | Zoom in |
| - | Zoom out |

## 9. Theming

`data-theme="dark|light"` on `<html>`. All colors via CSS variables.

Key variables: `--bg-bar`, `--bg-panel`, `--bg-selected`, `--border`, `--text-1` through `--text-6`, `--accent` (purple), `--viewport-bg`.

CodeMirror has its own set: `--cm-bg`, `--cm-text`, `--cm-keyword`, `--cm-string`, `--cm-number`, etc.

## 10. Adding Features — Checklists

### New Shape Type
1. Add to `ShapeType` union in `types.ts`
2. Add rendering in `renderer2d.ts` (draw function + hit test)
3. Add to code API in `query/index.ts` (shape function + expose in `new Function` + `shapesToCode`)
4. Add to RightPanel: shape type button, property controls, stroke/effects conditions
5. Add to `apiSnippets` in `api-snippets.ts`
6. Add to Viewport hit testing if non-standard bounds

### New Effect
1. Add to `ShapeEffect.type` union in `types.ts`
2. Add rendering in `renderer2d.ts`
3. Add API function in `query/index.ts` + expose in sandbox
4. Add toggle + controls in RightPanel Shaders section
5. Add to `apiSnippets`

### New Loop/Distribution
1. Add function in `query/index.ts`
2. Expose in `new Function` call
3. Add to `apiSnippets`
4. Optionally add to template builder in RightPanel

### New Palette
Add to `BUILTIN_PALETTES` in `src/lib/palettes/index.ts`.

### New Pattern
Add to `BUILTIN_PATTERNS` in `src/lib/patterns/index.ts`. Patterns with `code` field are stamp-type (raw code snippet in 0–1 local space).

## 11. Common Patterns in the Code

### Handler Pattern (App.svelte)
```ts
function handleFoo(id: string, ...) {
  commit()                          // snapshot for undo
  layers = layers.map(l => ...)     // immutable update
}
```

### Prop Drilling (RightPanel.svelte)
```ts
const { layers, activeLayerId, onUpdateShape, ... }: { ... } = $props()
```

### Immutable Updates
Always create new arrays/objects — never mutate. Use `layers.map()`, spread operators, `filter()`.

### Multi-selection
`forAll(mkPatch)` applies a patch to all selected shapes (or just active if single). `forAllGeom(mkGeom)` for position/size.

## 12. File Index

| File | Lines | Purpose |
|------|-------|---------|
| `src/App.svelte` | ~1100 | Root state, RAF, history, keyboard, clipboard |
| `src/components/RightPanel.svelte` | ~2300 | Tabs, shape editor, template builder, code editor |
| `src/components/Viewport.svelte` | ~350 | Canvas, zoom/pan, draw, select, drag |
| `src/components/CodeEditor.svelte` | ~200 | CodeMirror 6 wrapper |
| `src/components/TopBar.svelte` | ~150 | Size presets, export, file I/O |
| `src/components/StatusBar.svelte` | ~110 | Zoom display, CMYK toggle |
| `src/components/BottomCodePanel.svelte` | ~80 | Docked code panel |
| `src/components/ColorPicker.svelte` | ~80 | HSV color picker |
| `src/components/GradColorEditor.svelte` | ~80 | Gradient editor |
| `src/components/SliderRow.svelte` | ~80 | Reusable slider |
| `src/lib/query/index.ts` | ~700 | Code sandbox, all shape/loop/effect functions |
| `src/lib/layers/renderer2d.ts` | ~1000 | Canvas 2D rendering, 3D, effects |
| `src/lib/layers/types.ts` | ~95 | All type definitions |
| `src/lib/persist/index.ts` | ~120 | .forma serialization |
| `src/lib/export-cmyk-tiff.ts` | ~155 | CMYK TIFF encoding |
| `src/lib/palettes/index.ts` | ~70 | Palette type + 8 builtins |
| `src/lib/patterns/index.ts` | ~80 | Pattern type + 6 builtins |
| `src/lib/api-snippets.ts` | ~200 | 35+ API snippet definitions |
| `src/lib/viewport.ts` | ~5 | Zoom/scale constants |
| `src/lib/editor-font.ts` | ~30 | Code editor font size (9–20px) |

## 13. localStorage Keys

| Key | Content |
|-----|---------|
| `forma_autosave` | Full project JSON |
| `forma_theme` | `'dark'` or `'light'` |
| `forma_panel_w` | Right panel width (px) |
| `forma_code_pos` | `'right'` or `'bottom'` |
| `forma_code_h` | Bottom panel height (px) |
| `forma_code_font` | Editor font size (px) |
