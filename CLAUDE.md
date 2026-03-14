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
  App.svelte                  # Root: state management, undo, clipboard, export, mode switching
  main.ts                     # Entry point
  components/
    TopBar.svelte             # Size presets, export, zoom controls
    RightPanel.svelte         # Shape list, property editors, template builder, palettes, patterns, API snippets
    Viewport.svelte           # Canvas with zoom/pan, hit-testing, drag-to-move, draw-to-create
    StatusBar.svelte          # Status footer
    AboutPage.svelte          # About page with changelog
    CodeEditor.svelte         # CodeMirror wrapper for code mode
    SliderRow.svelte          # Reusable labeled slider component
    GradColorEditor.svelte    # Color/gradient picker
  lib/
    query/
      index.ts                # evaluateQuery() — code API interpreter; shapesToCode() — serializer
    layers/
      types.ts                # Shape, ShapeStroke, ShapeGeom, ShapeTransform, ShapeEffect, Layer, Pattern
      renderer2d.ts           # Canvas2D renderer: 2D shapes, 3D isometric projection, materials, masks
    api-snippets.ts           # API reference snippets shown in code panel
    palettes/
      index.ts                # Built-in color palettes
    patterns/
      index.ts                # Built-in pattern/stamp definitions
    persist/
      index.ts                # .ooo file format save/load, localStorage auto-save
    export-cmyk-tiff.ts       # CMYK TIFF encoder for print export
    viewport.ts               # Zoom/pan constants (MIN_ZOOM, MAX_ZOOM)
    editor-font.ts            # CodeMirror font loader
    mcp-bridge/
      index.svelte.ts         # MCP WebSocket bridge (Svelte integration)
      handler.ts              # MCP command handler (shape/layer manipulation)
      protocol.ts             # MCP message protocol types
    sketches/
      index.ts                # Sketch registry
      types.ts                # SketchDef, ParamDef interfaces
      ripple.ts / cells.ts / warp.ts / marble.ts / crystal.ts
    renderer/
      index.ts                # createRenderer() factory (auto-selects API)
      types.ts                # Renderer interface
      webgpu.ts               # WebGPU implementation
      webgl2.ts               # WebGL2 fallback
mcp-server/                   # Standalone MCP server (Node.js, @modelcontextprotocol/sdk)
src-tauri/
  src/main.rs / lib.rs        # Tauri app entry + init
  tauri.conf.json             # Window: 1440×900, min 800×600
  Cargo.toml                  # tauri v2, serde, serde_json
  .cargo/config.toml          # Default build target (x86_64-unknown-linux-gnu)
.github/workflows/
  release.yml                 # Multi-platform release CI (tag-triggered, creates GitHub draft release)
```

## Architecture

### Sketch System
Each sketch is a `SketchDef` with:
- WGSL shader (WebGPU)
- GLSL shader (WebGL2)
- Up to 8 named parameters (`ParamDef` with min/max/default/step)

### GPU Sketch Rendering Pipeline
- `createRenderer()` transparently selects WebGPU or WebGL2
- Shared uniform buffer layout (48 bytes): `time (f32)`, `width (f32)`, `height (f32)`, `params[8] (f32)`
- RAF loop drives animation
- **Note**: This is for the GPU shader sketches only, not the 2D shape system

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

### Mask System

`beginMask()` / `endMask()` / `endClip()` clips content shapes to the alpha of mask shapes.

```js
beginMask()
  ellipse(0.15, 0.15, 0.7, 0.7, '#fff', 1)   // mask shape (alpha = visible)
endMask()
  rect(0, 0, 1, h(1), grad(45, '#8b5cf6', '#4ecdc4'), 1)  // content
endClip()
```

**Flow:** `beginMask()` captures mask shapes → `endMask()` transitions to content → `endClip()` wraps both into a `type: 'mask'` Shape with `mask` (clip shapes) and `children` (content).

**Rendering:** Uses an offscreen canvas + `destination-in` compositing. Content is rendered first, then mask shapes are composited with `destination-in` so only content within mask alpha survives. Works inside `tile()`, `stamp()`, and nested in groups.

**Data model:** `Shape.mask?: Shape[]` holds clip shapes, `Shape.children?: Shape[]` holds content (same as group).

### 3D Shape System

3D shapes (`cube`, `sphere`, `cylinder`, `torus`) are rendered as isometric projections onto the 2D canvas. They are **not** WebGL — everything is Canvas2D.

**Pipeline** (`src/lib/layers/renderer2d.ts`):
1. **Face generation** — `cubeFaces()`, `sphereFaces()`, `cylinderFaces()`, `torusFaces()` produce `RawFace[]` with 3D vertices + normals
2. **Rotation** — `rotMatrix(rx, ry, rz)` returns a rotation function; default angles: rotateX=35°, rotateY=45°, rotateZ=0°
3. **Projection** — `project(v3, cx, cy, depth)` maps 3D → 2D. `depth` controls perspective strength (0 = isometric, 1 = strong perspective)
4. **Shading** — `shadeFromNormal()` computes diffuse + specular + alpha per face based on material type
5. **Drawing** — `drawFaces()` sorts faces back-to-front (painter's algorithm), fills each face with shaded color, then strokes edges. Per-face fill-then-stroke ensures front faces occlude back face edges.

**Materials** (`Material3D`): `default`, `metal`, `plastic`, `marble`, `glass`. Each material modifies shading (roughness, specular, alpha). Glass uses semi-transparent faces. Marble overlays noise texture via convex hull clipping.

**Tessellation**: `smooth` parameter (3–128, default 32) controls subdivision segments. Glass auto-multiplies by 1.5× to reduce seam artifacts.

**Transform properties** (3D-specific): `rotateX`, `rotateY`, `rotateZ`, `depth`, `smooth` — all stored in `ShapeTransform`.

**Stroke modes**:
- `stroke(hex, opacity, width, align, join)` — filled faces + edge lines (per-face in painter order, so back edges are naturally occluded)
- `wireframe(hex, opacity, width, join)` — edges only, no face fill. Creates a `ShapeStroke` with `wireframe: true`.

**Hit testing** (`Viewport.svelte`): `get3DBounds()` projects all 3D faces to compute a 2D bounding box in artboard pixels.

### 2D Canvas Renderer

`renderLayers2D()` in `src/lib/layers/renderer2d.ts` is the main rendering entry point. It iterates all visible layers and draws each shape.

**Shape rendering** (non-3D):
- Rect, ellipse, arc, triangle, line, curve, spline — standard Canvas2D path operations
- **Sub-pixel bloat**: Rects expand by 0.5px to eliminate hairline seams between adjacent tiles
- **Offscreen compositing**: Used for effects that need isolation (blur, shadow, noise, warp, bevel). Creates a temporary canvas, draws the shape, applies effects, then composites back.
- **Gradient support**: `makeGradient()` converts `LinearGradient` / `RadialGradient` to `CanvasGradient`

**Stroke rendering**:
- Align: `center` (default), `inner` (clip to shape), `outer` (clip inverse)
- Join: `miter`, `round`, `bevel`
- Inner/outer alignment uses `clip()` + doubled line width

**Mask rendering**: Uses a temporary offscreen canvas. Content is drawn first, then mask shapes are composited with `destination-in` so only content within mask alpha survives.

**Effects** (`ShapeEffect`):
- `shadow` — Canvas2D shadowBlur/shadowOffset
- `blur` — CSS filter on offscreen canvas
- `bevel` — luminance-based edge highlighting
- `noise` — noise texture overlay via `globalCompositeOperation: 'overlay'`
- `warp` — pixel displacement via sine waves on ImageData
- `material` — 3D shapes only (see 3D section)

### Layer & State Model

**Layer** (`src/lib/layers/types.ts`):
- `mode: 'manual' | 'code'` — manual stores `shapes[]`, code stores `query` string
- `shapes: Shape[]` — manual mode source of truth
- `query: string` — code mode source of truth (always preserved across mode switches)
- `visible: boolean`, `bgColor?: string`

**Mode switching** (`App.svelte: handleSetMode`):
- **manual → code**: Regenerates query from shapes via `shapesToCode()`. If existing query produces matching shapes (fingerprint check), keeps original query to preserve loops/structure.
- **code → manual**: Evaluates query via `evaluateQuery()`, bakes results into `shapes[]`. Groups are flattened via `flattenShapes()`, but masks are preserved.

**State management** (`App.svelte`):
- All state lives in `App.svelte` as `$state` runes
- `resolvedLayers` (`$derived`): for code-mode layers, replaces `shapes` with evaluated results from `evaluateQuery()`. This is what the renderer and hit-testing use.
- `drawableLayerId` (`$derived`): `null` for code-mode layers (disables canvas draw/select in Viewport)
- Undo/redo: `commit()` snapshots `layers` state; undo stack managed manually

**Composite shapes (mask/group)**:
- Have a computed `geom` bounding box (set by `childrenBbox()` at creation time in `evaluateQuery`)
- Drag-to-move in Viewport shifts all nested children's `geom` and `pts` recursively via `shiftShapeChildren()` in `App.svelte`

### Viewport Interactions

`Viewport.svelte` handles all canvas interaction:

**Hit testing** (`shapeHit`):
- Rect: axis-aligned bounding box
- Ellipse: point-in-ellipse equation
- Pts-based (line/curve/triangle/spline): bounding box of all points
- 3D shapes: projected 2D bounding box via `get3DBounds()`
- Mask/group: recursively test children and mask shapes

**Drag modes**:
- `moveDrag` — geom-based shapes (rect, ellipse, arc, 3D, mask, group). Updates `geom` via `onUpdateGeom`.
- `ptsDrag` — pts-based shapes (line, curve, triangle). Shifts all `pts` by delta.
- `multiMoveDrag` — multi-selection (Shift+click). Uses `onMoveBatch` to update all selected shapes at once.
- `drawDrag` — click-on-empty creates new shape by dragging a rectangle.

**Zoom/pan**: Mouse wheel zooms (0.05–20×), Space+drag or middle-click pans.

### Persistence & Export

**`.ooo` format** (`src/lib/persist/index.ts`): JSON-based project file containing layers, palettes, patterns (stamps), artboard size, project name.

**Auto-save**: Debounced to localStorage on every state change.

**Export**:
- PNG at 1×, 2×, 4× scale
- CMYK TIFF (`src/lib/export-cmyk-tiff.ts`) with naive RGB→CMYK conversion
- CMYK soft-proof preview mode

### MCP Server

Two parts:
- **`mcp-server/`** — standalone Node.js MCP server using `@modelcontextprotocol/sdk`. Runs as a subprocess, communicates via stdio.
- **`src/lib/mcp-bridge/`** — in-app WebSocket bridge that connects the MCP server to the Svelte app state. `handler.ts` maps MCP tool calls to app state mutations (add/delete/modify layers, shapes, palettes).

### Desktop (Tauri 2)

- `src-tauri/` contains the Rust backend. Minimal — just launches a WebKitGTK webview.
- `.cargo/config.toml` forces `x86_64-unknown-linux-gnu` target to avoid wasm target contamination.
- Icons: PNG only (32x32, 128x128, 256x256). macOS/Windows icon formats removed from `tauri.conf.json` for now.
- CI: `.github/workflows/release.yml` builds for Linux (ubuntu-22.04), macOS (aarch64 + x86_64), Windows on tag push. Creates draft GitHub Release via `tauri-apps/tauri-action@v0`.

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
- **Svelte 5 proxy gotcha**: `$state` objects are Proxies. `structuredClone()` throws on them — use `JSON.parse(JSON.stringify(obj))` for deep copies.
- **API snippets**: `src/lib/api-snippets.ts` must be updated when adding/changing code API functions
- **`new Function` exposure**: When adding a new code API function in `evaluateQuery()`, it must be added to both the parameter list and argument list of the `new Function(...)()` call at the bottom of the function

## Configuration Notes

- Vite port **5173** is hardcoded (required by Tauri)
- PWA enabled with Workbox caching (js, css, html, wasm, svg, png)
- App ID: `dev.fooorma.app`
- No CSP restrictions (`"csp": null`)
