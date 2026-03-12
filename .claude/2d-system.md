# Fooorma 2D Shape System — Architecture Reference

## Shape Types (8 total)
`rect`, `ellipse`, `line`, `curve`, `triangle`, `arc`, `spline`, `group`

## Core Files
- **Types**: `src/lib/layers/types.ts`
- **Renderer**: `src/lib/layers/renderer2d.ts` (Canvas 2D API)
- **Query/Code API**: `src/lib/query/index.ts`
- **API Snippets**: `src/lib/api-snippets.ts`
- **Manual UI**: `src/components/RightPanel.svelte`
- **Viewport/hit-test**: `src/components/Viewport.svelte`
- **App state/undo**: `src/App.svelte`

## Coordinate System
- All geometry normalized 0–1 (artboard-relative)
- `ShapeGeom { x, y, w, h }` — center + extents
- `pts?: number[]` — flat array for point-based shapes (line, curve, triangle, arc, spline)
- Converted to physical pixels (artW, artH) during rendering

## Shape Data Model (`Shape` interface)
```
id, type, color (fill + gradient + opacity), stroke?, geom {x,y,w,h},
pts?, strokeWidth?, transform? {rotate, scaleX, scaleY, skewX, skewY},
effects? (shadow, blur, bevel, noise, warp), children? (groups only)
```

## Rendering Pipeline (renderer2d.ts)
- Entry: `renderLayers2D(ctx, layers, artW, artH, clear?)`
- Builds Canvas 2D paths per shape type (lines 268-288)
- Fill: solid color or linear/radial gradient
- Stroke: color/gradient, width, align (center/inner/outer), join
- Effects pipeline: shadow → blur → bevel → noise → warp
- Warp uses offscreen canvas for per-shape pixel displacement
- Groups: flattens group effects onto children recursively

## Code API (query/index.ts)
### Shape functions
`rect(x,y,w,h,color?,opacity?,...trailing)`
Same pattern for: `ellipse`, `line`, `curve`, `triangle`, `arc`, `spline`
Plus: `beginSpline()/vertex(x,y)/endSpline()`

### Loop helpers (key for procedural art)
- `grid(cols, rows, cb(c, r, ct, rt))` — normalized grid iteration
- `repeat(n, cb(i, t))` — simple loop with normalized t
- `wave(n, amp, freq, cb(i, t, x, y))` — sine wave distribution
- `circular(n, cx, cy, r, cb(i, t, x, y, angle))` — ring distribution

### Trailing args protocol
Shape functions accept flexible trailing: `stroke()`, `transform()`, effect objects, or legacy positional `hex, opacity?, width?`

### Utilities
- `nz(x, y?)` — value noise 0→1
- `palette(name, index?)` — color palette lookup
- `grad(angle, ...stops)` / `radGrad(...stops)` — gradients
- `shadow()`, `blur()`, `bevel()`, `noise()`, `warp()` — effects
- `rotate(deg)`, `transform({...})`, `stroke(...)` — modifiers
- `beginGroup(...effects)` / `endGroup()` — grouping

## Three-Surface Rule
Every shape/property must exist in ALL three:
1. Query language (`evaluateQuery` + `shapesToCode`)
2. Manual UI (RightPanel shape buttons + sliders)
3. API snippets (`api-snippets.ts`)

## Limits
- Max 5,000 shapes per layer
- Grid max 200x200 cells
- Artboard 100–8192 px
- Stroke width 0.001–0.05 artboard fraction
- History: 50 undo/redo states

## Key Insight for 3D Extension
The renderer uses Canvas 2D exclusively. 3D shapes would need to be projected to 2D paths
(isometric or perspective projection) before being drawn through the same Canvas 2D pipeline.
The normalized coordinate system (0–1) and trailing-args pattern are the main API conventions to follow.
