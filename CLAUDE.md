# Fooorma - Procedural Art Studio

## Project Overview

Cross-platform procedural art studio (desktop + PWA) built with Svelte 5, Tauri 2, and WebGPU/WebGL2.

## Tech Stack

- **Frontend**: Svelte 5, TypeScript (strict), Vite
- **Desktop**: Tauri 2 (Rust backend)
- **Rendering**: WebGPU (primary), WebGL2 (fallback)
- **Package manager**: pnpm

## Key Scripts

```bash
pnpm dev           # Frontend dev server (port 5173)
pnpm build         # Production build
pnpm check         # Type-check (svelte-check + tsc)
pnpm tauri:dev     # Desktop app in dev mode
pnpm tauri:build   # Build native app
```

## Project Structure

```
src/
  App.svelte                  # Root component
  main.ts                     # Entry point
  components/
    TopBar.svelte             # Size presets + export
    RightPanel.svelte         # Sketch selector + parameter sliders
    Viewport.svelte           # Canvas with zoom/pan
    StatusBar.svelte          # Status footer
  lib/
    sketches/
      index.ts                # Sketch registry
      types.ts                # SketchDef, ParamDef interfaces
      ripple.ts / cells.ts / warp.ts / marble.ts / crystal.ts
    renderer/
      index.ts                # createRenderer() factory (auto-selects API)
      types.ts                # Renderer interface
      webgpu.ts               # WebGPU implementation
      webgl2.ts               # WebGL2 fallback
src-tauri/
  src/main.rs / lib.rs        # Tauri app entry + init
  tauri.conf.json             # Window: 1440×900, min 1024×600
  Cargo.toml                  # tauri v2, serde, serde_json
```

## Architecture

### Sketch System
Each sketch is a `SketchDef` with:
- WGSL shader (WebGPU)
- GLSL shader (WebGL2)
- Up to 8 named parameters (`ParamDef` with min/max/default/step)

### Rendering Pipeline
- `createRenderer()` transparently selects WebGPU or WebGL2
- Shared uniform buffer layout (48 bytes): `time (f32)`, `width (f32)`, `height (f32)`, `params[8] (f32)`
- RAF loop drives animation

### Canvas / Viewport
- Default artboard: 794×1123 px (A4 portrait)
- Canvas range: 100–8192 px
- Viewport = window width − 260 px (right panel) − margins
- Zoom: 0.05–20×, pan via Space+drag or scroll

### Coordinate & Sizing Model

- **Position**: `x,y` is the **top-left corner** of the shape. `x` is 0–1 fraction of artW, `y` is 0–1 fraction of artH. `(0, 0)` = top-left of artboard.
- **Size**: `w` and `h` are both in **artW-fractions** (uniform space). This means equal w/h values always produce a square, regardless of artboard aspect ratio.
- **Dimension helpers** in the code API:
  - `w(v)` / `width(v)` — size as fraction of artboard width (identity, since sizes are already width-relative)
  - `h(v)` / `height(v)` — size as fraction of artboard height (converts to uniform space: `v * H / W`)
  - `sy(v)` — convert a size (artW-fraction) to a y-position offset (artH-fraction). Useful for centering: `ellipse(cx - s/2, cy - sy(s)/2, s, s)`
  - Example: `rect(0, 0, 0.3, 0.3)` = top-left at origin, always a square
  - Example: `rect(0.35, 0.35, 0.3, 0.3)` = roughly centered on artboard
- **Internal representation**: The geom data model uses center-based coordinates. The code API converts top-left → center in `makeShape()` and center → top-left in `shapesToCode()`. Manual mode and the renderer work with center-based geom.

## Code API — Loop & Tile Functions

The query language (`src/lib/query/index.ts`) exposes these iteration/distribution functions:

| Function | Signature | Purpose |
|----------|-----------|---------|
| `repeat` | `(n, (i, t) => {})` | Loop n times. `i`: index, `t`: normalized 0→1 |
| `grid` | `(cols, rows, (c, r, ct, rt) => {})` | Iterate over a grid. Shapes positioned manually |
| `wave` | `(n, amp, freq, (i, t, x, y) => {})` | Distribute along a sine wave |
| `circular` | `(n, cx, cy, r, (i, t, x, y, angle) => {})` | Distribute around a circle |
| `tile` | `(cols, cb, opts?)` or `(cols, rows, cb, opts?)` | **Tile grid**: shapes drawn in local 0–1 space, auto-placed in cells |

### Tile System

`tile()` is the primary tool for repeating patterns. Unlike `grid()`, shapes inside a `tile()` callback are drawn in **tile-local normalized space** (0–1) and automatically repositioned into each grid cell.

Two signatures:
- **`tile(cols, cb, opts?)`** — square tiles. Rows auto-computed from artboard aspect ratio (`cols × artH/artW`). Tiles are always square and adapt to the viewport.
- **`tile(cols, rows, cb, opts?)`** — explicit grid. Cells may be non-square when cols/rows don't match the aspect ratio.

```js
// Square tiles — rows auto-computed, always perfect squares
tile(5, (c, r, ct, rt) => {
  rect(0.5, 0.5, 0.9, 0.9, palette('Neon', c + r), 0.85)
  ellipse(0.5, 0.5, 0.3, 0.3, '#fff', 0.4)
  if (c % 2) mirror('x')
})

// Explicit grid with gaps
tile(4, 6, (c, r, ct, rt) => {
  rect(0.5, 0.5, 0.8, 0.8, palette('Neon', c + r), 0.85)
}, { gapX: 0.005, gapY: 0.005 })
```

**Callback params:** `c` (col index), `r` (row index), `ct` (col normalized 0–1), `rt` (row normalized 0–1)

**Sizing:** Both `w` and `h` scale by cell width, so `w=h` is always a perfect circle/square regardless of cell aspect ratio.

**`mirror(axis)`** — call inside a tile callback to flip shapes: `'x'` (horizontal), `'y'` (vertical), `'xy'` (both). Useful for alternating tile orientation.

**Options:** `{ offsetX, offsetY, gapX, gapY }` — margins and inter-tile spacing.

**Implementation:** `tile()` captures shapes drawn in the callback, remaps their `geom`, `pts`, and `transform` from local to cell coordinates, then pushes them to the main shapes array. Supports all shape types including groups, pts-based shapes (line/curve/triangle/spline), and arcs.

### Stamp System

Stamps are reusable shape groups saved as code snippets. They are stored as `Pattern` objects with a `code` field.

```js
// Place a saved stamp
stamp('Diamond')

// With transforms (scale around center, rotate, mirror)
stamp('Diamond', { scale: 0.8, rotate: 45, mirror: 'x' })

// Inside tile — stamp shapes are in local 0–1 space, tile remaps them
tile(4, (c, r) => {
  stamp('Diamond', { scale: 0.6 })
  if (c % 2) mirror('x')
})
```

**Saving stamps:** From the Patterns tab — either from selected shapes (manual mode) or from current code (code mode). Stamps are saved to `customPatterns` with `code` set.

**Persistence:** Stamps are serialized in `.ooo` files as plain code blocks and auto-saved to localStorage:
```
// @stamp "Diamond"
rect(0.5, 0.5, 0.3, 0.3, '#8b5cf6', 0.85)
ellipse(0.5, 0.3, 0.1, 0.1, '#fff', 0.5)
// @endstamp
```

**Implementation:** `stamp()` in `evaluateQuery()` looks up the pattern by name, evaluates its code via a recursive `evaluateQuery()` call, then applies scale/rotate/mirror transforms to the resulting shapes before pushing them into the main shapes array.

## Shape / Model Consistency Rule

**Any new shape type, shape property, or model change must be reflected across all three surfaces simultaneously — no exceptions:**

1. **Query language** (`src/lib/query/index.ts`) — `evaluateQuery`: add the function and expose it in the `new Function` call; update `shapesToCode` to serialize it back
2. **Manual UI** (`src/components/RightPanel.svelte`) — shape type button list, property sliders/controls for that shape's unique params, stroke/effects visibility conditions
3. **Code UI** (`src/components/RightPanel.svelte`) — `apiSnippets` array with correct signature and an example snippet

Missing any surface is a bug. Always check all three before considering a shape task done.

## Coding Conventions

- **Svelte 5 runes**: use `$state`, `$props`, `$derived`, `$effect`
- TypeScript strict mode throughout
- Sketches are self-contained modules — add new ones by creating a file in `src/lib/sketches/` and registering in `index.ts`
- Renderer abstraction hides API differences; shaders must be provided in both WGSL and GLSL

## Configuration Notes

- Vite port **5173** is hardcoded (required by Tauri)
- PWA enabled with Workbox caching (js, css, html, wasm, svg, png)
- App ID: `dev.fooorma.app`
- No CSP restrictions (`"csp": null`)
