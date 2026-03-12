import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const RESOURCES: Record<string, { name: string; description: string; mimeType: string; content: string }> = {
  'fooorma://api-reference': {
    name: 'fooorma API Reference',
    description: 'Complete code API for the fooorma query language',
    mimeType: 'text/markdown',
    content: `# fooorma Code API Reference

All coordinates are normalized 0–1. Sizes (w, h) are in artboard-width fractions, so w=h always produces a perfect square/circle.

## Shapes

| Function | Signature | Description |
|----------|-----------|-------------|
| \`rect\` | \`(x, y, w, h, color?, opacity?, stroke?)\` | Rectangle centered at (x,y) |
| \`ellipse\` | \`(x, y, w, h, color?, opacity?, stroke?)\` | Ellipse centered at (x,y) |
| \`triangle\` | \`(x1,y1, x2,y2, x3,y3, color?, opacity?, stroke?)\` | Triangle from 3 vertices |
| \`arc\` | \`(cx, cy, r, startDeg, endDeg, color?, opacity?)\` | Arc / pie slice |
| \`line\` | \`(x1, y1, x2, y2, color?, opacity?, width?)\` | Line segment |
| \`curve\` | \`(x1, y1, cx, cy, x2, y2, color?, opacity?, width?)\` | Quadratic bezier |
| \`spline\` | \`([x1,y1,...], color?, opacity?, width?)\` | Catmull-Rom spline |
| \`beginSpline\` / \`vertex\` / \`endSpline\` | Imperative spline building | Build splines point by point |

## 3D Shapes

| Function | Signature | Description |
|----------|-----------|-------------|
| \`cube\` | \`(x, y, size, color?, opacity?, stroke?)\` | 3D cube |
| \`sphere\` | \`(x, y, size, color?, opacity?, stroke?)\` | 3D sphere |
| \`cylinder\` | \`(x, y, w, h, color?, opacity?, stroke?)\` | 3D cylinder |
| \`torus\` | \`(x, y, size, color?, opacity?, stroke?)\` | 3D torus |

## Iteration / Distribution

| Function | Signature | Description |
|----------|-----------|-------------|
| \`repeat\` | \`(n, (i, t) => {})\` | Loop n times. i: index, t: normalized 0→1 |
| \`grid\` | \`(cols, rows, (c, r, ct, rt) => {})\` | Iterate grid. Shapes positioned manually |
| \`wave\` | \`(n, amp, freq, (i, t, x, y) => {})\` | Distribute along sine wave |
| \`circular\` | \`(n, cx, cy, r, (i, t, x, y, angle) => {})\` | Distribute around a circle |
| \`tile\` | \`(cols, cb, opts?)\` or \`(cols, rows, cb, opts?)\` | Tile grid: shapes drawn in local 0–1 space |
| \`mirror\` | \`('x' \\| 'y' \\| 'xy')\` | Flip shapes inside tile callback |

### Tile Details
- \`tile(cols, cb)\` — square tiles, rows auto-computed from artboard aspect ratio
- \`tile(cols, rows, cb)\` — explicit grid (cells may be non-square)
- Options: \`{ offsetX, offsetY, gapX, gapY }\`
- w and h scale uniformly (by cell width), so w=h is always a circle

## Stamps

| Function | Signature | Description |
|----------|-----------|-------------|
| \`stamp\` | \`(name, opts?)\` | Place a saved stamp (reusable shape group) |

Options: \`{ scale, rotate, mirror: 'x'\\|'y'\\|'xy' }\`

## Styling

| Function | Signature | Description |
|----------|-----------|-------------|
| \`stroke\` | \`(hex, opacity?, width?, align?, join?)\` | Stroke style (pass as last arg to shapes) |
| \`rotate\` | \`(deg)\` | Rotation transform |
| \`transform\` | \`({ rotate?, scaleX?, scaleY?, skewX?, skewY?, rotateX?, rotateY?, rotateZ?, depth?, smooth? })\` | Full transform |
| \`material\` | \`(kind, roughness?, intensity?)\` | 3D material: 'default', 'metal', 'plastic', 'marble', 'glass' |

## Effects (pass as args to shapes or beginGroup)

| Function | Signature |
|----------|-----------|
| \`shadow\` | \`(color?, opacity?, blur?, offsetX?, offsetY?)\` |
| \`blur\` | \`(amount?)\` |
| \`bevel\` | \`(intensity?)\` |
| \`noise\` | \`(amount?)\` |
| \`warp\` | \`(strength?, freq?)\` |

## Gradients

| Function | Signature |
|----------|-----------|
| \`grad\` | \`(angle, ...stops)\` — linear gradient |
| \`radGrad\` | \`(...stops)\` — radial gradient |

Stops can be hex strings (evenly spaced) or \`['#hex', opacity, position]\` tuples.

## Groups

\`\`\`js
beginGroup(warp(10, 0.03))
  repeat(8, (i, t) => { rect(t, 0.5, 0.1, 0.1) })
endGroup()
\`\`\`

## Color Helpers

| Function | Signature | Description |
|----------|-----------|-------------|
| \`palette\` | \`(name, index)\` | Get color from a named palette |
| \`nz\` | \`(x, y?)\` | Simplex noise → 0..1 |
| \`lerp\` | \`(a, b, t)\` | Linear interpolation |
| \`w\` / \`width\` | \`(v)\` | Size as fraction of artboard width (identity) |
| \`h\` / \`height\` | \`(v)\` | Size as fraction of artboard height (converts to uniform space) |

## Constants

\`PI\`, \`TAU\`, \`floor\`, \`ceil\`, \`round\`, \`abs\`, \`min\`, \`max\`, \`sqrt\`, \`sin\`, \`cos\`, \`atan2\`, \`pow\`, \`random\`
`,
  },

  'fooorma://project-format': {
    name: 'fooorma Project Format (.ooo)',
    description: 'Documentation of the .ooo file format for serializing fooorma projects',
    mimeType: 'text/markdown',
    content: `# .ooo File Format

Line-based text format. Example:

\`\`\`
// fooorma v1
// Artboard: 794 × 1123

// @palette "MyPalette" #8b5cf6 #4ecdc4 #f7c68a

// @stamp "Diamond"
rect(0.5, 0.5, 0.3, 0.3, '#8b5cf6', 0.85, rotate(45))
// @endstamp

// @pattern "Dots" grid ellipse #ffffff 0.8 16 4 4

// @layer "Background" bg:#1a1a2e
rect(0.5, 0.5, 1, 1, '#1a1a2e', 1)

// @layer "Shapes"
tile(5, (c, r) => {
  ellipse(0.5, 0.5, 0.3, 0.3, palette('MyPalette', c + r), 0.85)
})

// @layer "Hidden Layer" hidden
rect(0.5, 0.5, 0.1, 0.1)
\`\`\`

## Header
- \`// fooorma v1\` — version marker
- \`// Artboard: {width} × {height}\` — artboard dimensions in pixels

## Custom Palettes
\`// @palette "{name}" {color1} {color2} ...\`
Colors are hex (#RRGGBB).

## Stamps (code-based patterns)
\`\`\`
// @stamp "{name}"
{code lines}
// @endstamp
\`\`\`

## Template Patterns
\`// @pattern "{name}" {type} {shape} {color} {opacity} {count} {cols} {rows}\`

## Layers
\`// @layer "{name}" [hidden] [bg:{#hex}]\`
Followed by the layer's code (one or more lines, until the next directive or EOF).
All layers are loaded in code mode.
`,
  },

  'fooorma://coordinate-system': {
    name: 'fooorma Coordinate System',
    description: 'How coordinates and sizes work in fooorma',
    mimeType: 'text/markdown',
    content: `# fooorma Coordinate System

## Position (Top-Left)
- \`x,y\` is the **top-left corner** of the shape
- \`x\`: 0 (left) to 1 (right) — fraction of artboard width
- \`y\`: 0 (top) to 1 (bottom) — fraction of artboard height
- \`rect(0, 0, 0.3, 0.3)\` — starts at top-left corner, extends 0.3 right and down

## Size (Uniform Model)
- Both \`w\` and \`h\` are in **artboard-width fractions**
- This means \`w=0.3, h=0.3\` is always a perfect square (and a circle for ellipse)
- On a 794×1123 artboard, w=0.3 = 238px wide AND 238px tall

## Helpers
- \`w(v)\` / \`width(v)\` — size as fraction of artboard width (identity)
- \`h(v)\` / \`height(v)\` — size as fraction of artboard height (converts to uniform space: v * H / W)
- \`sy(v)\` — convert a size (artW-fraction) to a y-position offset (artH-fraction). Useful for centering shapes at a point: \`ellipse(cx - s/2, cy - sy(s)/2, s, s)\`

## Inside tile()
Shapes are drawn in local 0–1 space per cell:
- (0, 0) = top-left of the cell
- \`rect(0.05, 0.05, 0.9, 0.9)\` = centered rect filling 90% of the cell
- w and h scale by cell width, preserving the circle guarantee
`,
  },
}

export function registerResources(server: Server) {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: Object.entries(RESOURCES).map(([uri, r]) => ({
      uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
  }))

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const r = RESOURCES[request.params.uri]
    if (!r) throw new Error(`Unknown resource: ${request.params.uri}`)
    return {
      contents: [{
        uri: request.params.uri,
        mimeType: r.mimeType,
        text: r.content,
      }],
    }
  })
}
