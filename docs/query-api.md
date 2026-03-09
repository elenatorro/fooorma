# Forma Query API

The query language is a sandboxed JavaScript environment. Write plain JS — no `import`, no `const` required (though you can use `let`/`const` freely). Everything below is available globally.

---

## Coordinate System

All positions and sizes use **normalized coordinates** (0–1):

- `x = 0` → left edge, `x = 1` → right edge
- `y = 0` → top edge, `y = 1` → bottom edge
- Widths and heights are expressed as **fractions of the artboard width** (`W`)
- Exception: arc angles are in **degrees**

Constants `W` and `H` give the artboard size in pixels (e.g. 794 × 1123 for A4).

---

## Shapes

### `rect(x, y, w, h, color?, opacity?, ...modifiers)`

Draws a rectangle centered at `(x, y)`.

| Param | Type | Default | Description |
|---|---|---|---|
| `x` | number | — | Center X (0–1) |
| `y` | number | — | Center Y (0–1) |
| `w` | number | — | Width as fraction of artboard width |
| `h` | number | — | Height as fraction of artboard width |
| `color` | string \| gradient | `'#8b5cf6'` | Fill color (hex) or gradient |
| `opacity` | number | `0.85` | Fill opacity (0–1) |
| `...modifiers` | stroke, rotate, transform, effects | — | Optional, any order |

```js
rect(0.5, 0.5, 0.3, 0.2, '#e74c3c', 0.9)
rect(0.5, 0.5, 0.4, 0.4, '#3498db', 1, stroke('#000', 0.5, 0.005), rotate(15), shadow())
```

---

### `ellipse(x, y, w, h, color?, opacity?, ...modifiers)`

Draws an ellipse (or circle when `w === h`) centered at `(x, y)`. Same signature as `rect`.

```js
ellipse(0.5, 0.5, 0.3, 0.3, '#27ae60')
ellipse(0.3, 0.6, 0.2, 0.1, grad(45, '#f39c12', '#e74c3c'), 1)
```

---

### `arc(cx, cy, r, startAngle, endAngle, color?, opacity?, ...modifiers)`

Draws a filled pie sector (center → arc → back to center).

| Param | Type | Default | Description |
|---|---|---|---|
| `cx` | number | — | Center X (0–1) |
| `cy` | number | — | Center Y (0–1) |
| `r` | number | — | Radius as fraction of artboard width |
| `startAngle` | number | — | Start angle in **degrees** (0 = right, clockwise) |
| `endAngle` | number | — | End angle in **degrees** |
| `color` | string \| gradient | `'#8b5cf6'` | Fill color or gradient |
| `opacity` | number | `0.85` | Fill opacity |
| `...modifiers` | stroke, rotate, transform, effects | — | Optional |

```js
arc(0.5, 0.5, 0.3, 0, 270, '#e74c3c')         // 3/4 circle
arc(0.5, 0.5, 0.2, 45, 135, '#3498db', 0.8)   // 90° wedge
```

---

### `line(x1, y1, x2, y2, color?, opacity?, strokeWidth?, ...modifiers)`

Draws a straight line from `(x1, y1)` to `(x2, y2)`.

| Param | Type | Default | Description |
|---|---|---|---|
| `x1, y1` | number | — | Start point |
| `x2, y2` | number | — | End point |
| `color` | string | `'#8b5cf6'` | Stroke color |
| `opacity` | number | `0.85` | Opacity |
| `strokeWidth` | number | `0.005` | Line width (fraction of artboard width) |

```js
line(0.1, 0.1, 0.9, 0.9, '#000000', 1, 0.003)
```

---

### `curve(x1, y1, cx, cy, x2, y2, color?, opacity?, strokeWidth?, ...modifiers)`

Draws a quadratic Bézier curve.

| Param | Type | Description |
|---|---|---|
| `x1, y1` | number | Start point |
| `cx, cy` | number | Control point |
| `x2, y2` | number | End point |

```js
curve(0.1, 0.9, 0.5, 0.1, 0.9, 0.9, '#9b59b6', 0.9, 0.004)
```

---

### `triangle(x1, y1, x2, y2, x3, y3, color?, opacity?, ...modifiers)`

Draws a filled triangle through three points. Supports `stroke`, `rotate`, `transform`, and effects.

```js
triangle(0.5, 0.2, 0.2, 0.8, 0.8, 0.8, '#e67e22', 0.9)
triangle(0.5, 0.1, 0.1, 0.9, 0.9, 0.9, '#2ecc71', 1, stroke('#000', 0.5, 0.004), rotate(5))
```

---

### `spline(pts, color?, opacity?, strokeWidth?, ...modifiers)`

Draws a **Catmull-Rom spline** through `N` points (smooth curve passing through each point).

| Param | Type | Description |
|---|---|---|
| `pts` | number[] | Flat array of `[x1, y1, x2, y2, ...]` — minimum 4 values (2 points) |

```js
spline([0.1, 0.5, 0.3, 0.2, 0.6, 0.8, 0.9, 0.4], '#3498db', 0.9, 0.004)
```

---

### `beginSpline()` / `vertex(x, y)` / `endSpline(color?, opacity?, strokeWidth?, ...modifiers)`

Imperative spline builder — useful in loops.

```js
beginSpline()
repeat(10, (i, t) => {
  vertex(t, 0.5 + 0.2 * sin(t * TAU * 2))
})
endSpline('#e74c3c', 1, 0.003)
```

---

## Styling

### `stroke(color, opacity?, width?, align?, join?)`

Returns a stroke modifier. Pass as a trailing argument to any shape.

| Param | Type | Default | Description |
|---|---|---|---|
| `color` | string \| gradient | `'#000000'` | Stroke color or gradient |
| `opacity` | number | `1` | Stroke opacity (0–1) |
| `width` | number | `0.005` | Stroke width (fraction of artboard width) |
| `align` | `'center'` \| `'inner'` \| `'outer'` | `'center'` | Stroke alignment |
| `join` | `'miter'` \| `'round'` \| `'bevel'` | `'miter'` | Line join style |

```js
rect(0.5, 0.5, 0.3, 0.3, '#fff', 1, stroke('#000000', 1, 0.006))
ellipse(0.5, 0.5, 0.4, 0.4, '#3498db', 0.8, stroke(grad(90, '#e74c3c', '#9b59b6'), 1, 0.01, 'outer'))
```

---

### `rotate(deg)`

Returns a rotation transform modifier.

```js
rect(0.5, 0.5, 0.2, 0.2, '#e74c3c', 1, rotate(45))
```

---

### `transform({ rotate?, scaleX?, scaleY?, skewX?, skewY? })`

Returns a full transform modifier. All properties are optional.

| Property | Type | Description |
|---|---|---|
| `rotate` | number | Rotation in degrees |
| `scaleX` | number | Horizontal scale (1 = normal) |
| `scaleY` | number | Vertical scale |
| `skewX` | number | Horizontal skew in degrees |
| `skewY` | number | Vertical skew in degrees |

```js
rect(0.5, 0.5, 0.3, 0.2, '#27ae60', 1, transform({ rotate: 30, scaleX: 1.5, skewY: 10 }))
```

---

## Gradients

Gradients can be used anywhere a color is accepted.

### `grad(angle, ...stops)`

Linear gradient at `angle` degrees (0 = left→right, 90 = top→bottom).

Each stop can be:
- `'#hex'` — evenly distributed, full opacity
- `['#hex', opacity]` — with explicit opacity
- `['#hex', opacity, position]` — with explicit opacity and position (0–1)

```js
grad(90, '#e74c3c', '#3498db')
grad(45, ['#f39c12', 1, 0], ['#e74c3c', 0.8, 0.5], ['#9b59b6', 1, 1])
grad(0, palette('Ocean'))    // pass a palette array directly
```

---

### `radGrad(...stops)`

Radial gradient from center outward. Same stop format as `grad`.

```js
radGrad('#ffffff', '#3498db')
radGrad(['#fff', 1, 0], ['#3498db', 0.5, 0.7], ['#1a252f', 1, 1])
```

---

## Effects

All effects are modifiers — pass them as trailing arguments to any shape.

### `shadow(color?, opacity?, blur?, offsetX?, offsetY?)`

Drop shadow.

| Param | Default | Description |
|---|---|---|
| `color` | `'#000000'` | Shadow color |
| `opacity` | `0.5` | Shadow opacity |
| `blur` | `10` | Blur radius in pixels |
| `offsetX` | `0` | Horizontal offset in pixels |
| `offsetY` | `4` | Vertical offset in pixels |

```js
rect(0.5, 0.5, 0.3, 0.2, '#fff', 1, shadow())
rect(0.5, 0.5, 0.3, 0.2, '#fff', 1, shadow('#3498db', 0.8, 20, 0, 8))
```

---

### `blur(amount?)`

Gaussian blur applied to the shape.

| Param | Default | Description |
|---|---|---|
| `amount` | `4` | Blur radius in pixels |

```js
ellipse(0.5, 0.5, 0.4, 0.4, '#e74c3c', 0.9, blur())
ellipse(0.5, 0.5, 0.4, 0.4, '#e74c3c', 0.9, blur(12))
```

---

### `bevel(intensity?)`

Adds a highlight/shadow bevel effect.

| Param | Default | Description |
|---|---|---|
| `intensity` | `0.6` | Effect intensity (0–1) |

```js
rect(0.5, 0.5, 0.3, 0.2, '#95a5a6', 1, bevel())
```

---

### `noise(amount?)`

Adds film grain / noise texture.

| Param | Default | Description |
|---|---|---|
| `amount` | `0.3` | Noise intensity (0–1) |

```js
rect(0.5, 0.5, 0.8, 0.8, '#ecf0f1', 1, noise(0.5))
```

---

### `warp(amount?, freq?)`

Warps the shape with a wave distortion.

| Param | Default | Description |
|---|---|---|
| `amount` | `8` | Distortion strength in pixels |
| `freq` | `0.05` | Distortion frequency |

```js
ellipse(0.5, 0.5, 0.4, 0.4, '#3498db', 1, warp())
ellipse(0.5, 0.5, 0.4, 0.4, '#3498db', 1, warp(20, 0.1))
```

---

## Loops

### `repeat(n, callback)`

Iterates `n` times.

```
callback(i, t)
  i  — index (0 to n-1)
  t  — normalized position (0 to 1)
```

```js
repeat(12, (i, t) => {
  ellipse(t, 0.5, 0.05, 0.05, palette('Ember', i))
})
```

---

### `grid(cols, rows, callback)`

Iterates over a `cols × rows` grid.

```
callback(c, r, ct, rt)
  c, r   — column and row index (0-based)
  ct, rt — normalized column/row position (0 to 1)
```

```js
grid(8, 8, (c, r, ct, rt) => {
  rect((c + 0.5) / 8, (r + 0.5) / 8, 1/8 * 0.9, 1/8 * 0.9, palette('Ocean', c + r))
})
```

---

### `wave(n, amplitude?, frequency?, callback)`

Iterates `n` times along a horizontal sine wave.

| Param | Default | Description |
|---|---|---|
| `n` | — | Number of items |
| `amplitude` | `0.15` | Wave height (fraction of artboard) |
| `frequency` | `1` | Number of full cycles across the artboard |

```
callback(i, t, x, y)
  x  — horizontal position (0 to 1)
  y  — 0.5 + amplitude * sin(frequency * t * TAU)
```

```js
wave(40, 0.2, 3, (i, t, x, y) => {
  ellipse(x, y, 0.02, 0.02, palette('Sunset', i))
})
```

---

### `circular(n, cx?, cy?, r?, callback)`

Distributes `n` items evenly around a circle.

| Param | Default | Description |
|---|---|---|
| `n` | — | Number of items |
| `cx` | `0.5` | Circle center X |
| `cy` | `0.5` | Circle center Y |
| `r` | `0.35` | Radius (fraction of artboard width) |

```
callback(i, t, x, y, angle)
  x, y  — position on the circle (aspect-ratio corrected)
  angle — angle in radians (0 to TAU)
```

```js
circular(16, 0.5, 0.5, 0.3, (i, t, x, y, angle) => {
  rect(x, y, 0.04, 0.04, palette('Crystal', i), 1, rotate(angle * 180 / PI))
})
```

---

## Palette

### `palette(name)` → `string[]`

Returns all colors from a named palette as a hex string array.

### `palette(name, index)` → `string`

Returns one color by index. Index wraps around (negative indices work too).

Built-in palettes include: **Ember**, **Ocean**, **Sunset**, **Crystal**, **Forest**, **Neon**, and more — see the palette picker in the sidebar.

```js
palette('Ember')           // ['#ff6b35', '#f7c59f', ...]
palette('Ocean', 2)        // '#1a6b8a'
palette('Neon', -1)        // last color in palette

// Pass a full palette to a gradient:
grad(90, palette('Sunset'))
```

---

## Math Helpers

| Function | Description |
|---|---|
| `lerp(a, b, t)` | Linear interpolation: `a + (b - a) * t` |
| `clamp(v, lo, hi)` | Clamp `v` between `lo` and `hi` |
| `map(v, a, b, c, d)` | Re-map `v` from range `[a,b]` to `[c,d]` |
| `fract(v)` | Fractional part: `v - floor(v)` |
| `smoothstep(e0, e1, x)` | Smooth Hermite interpolation between `e0` and `e1` |
| `nz(x, y?)` | Value noise, returns 0–1 for a given seed coordinate |

```js
repeat(50, (i, t) => {
  y = lerp(0.1, 0.9, t)
  x = 0.5 + 0.3 * nz(t * 5, i * 0.1)
  ellipse(x, y, 0.03, 0.03, '#3498db', clamp(t * 2, 0.2, 1))
})
```

---

## Constants & Math

All standard math functions and constants are available:

| Name | Value / Description |
|---|---|
| `W` | Artboard width in pixels (e.g. 794) |
| `H` | Artboard height in pixels (e.g. 1123) |
| `PI` | π ≈ 3.14159 |
| `TAU` | 2π ≈ 6.28318 |
| `E` | Euler's number ≈ 2.71828 |
| `sin(x)` | Sine (radians) |
| `cos(x)` | Cosine (radians) |
| `tan(x)` | Tangent (radians) |
| `abs(x)` | Absolute value |
| `floor(x)` | Floor |
| `ceil(x)` | Ceiling |
| `round(x)` | Round to nearest integer |
| `sqrt(x)` | Square root |
| `pow(x, y)` | Power |
| `min(a, b)` | Minimum |
| `max(a, b)` | Maximum |
| `random()` | Random float 0–1 |

---

## Limits

- Maximum **5,000 shapes** per query (additional calls are silently ignored)
- `grid` caps at 200 columns and 200 rows
- `repeat`, `wave`, `circular` cap at 5,000 iterations

---

## Examples

### Colored grid
```js
grid(10, 10, (c, r, ct, rt) => {
  rect((c + 0.5) / 10, (r + 0.5) / 10, 0.09, 0.09,
    palette('Ocean', c + r), 0.9, rotate((c + r) * 15))
})
```

### Concentric rings
```js
repeat(8, (i, t) => {
  ellipse(0.5, 0.5, 0.1 + t * 0.7, 0.1 + t * 0.7,
    palette('Sunset', i), 0, stroke(palette('Sunset', i), 0.6 - t * 0.4, 0.004))
})
```

### Noise field
```js
grid(20, 20, (c, r) => {
  x = (c + 0.5) / 20
  y = (r + 0.5) / 20
  n = nz(c * 0.4, r * 0.4)
  ellipse(x, y, 0.03, 0.03, palette('Ember', floor(n * 5)), n)
})
```

### Radial burst
```js
circular(24, 0.5, 0.5, 0.35, (i, t, x, y, angle) => {
  arc(x, y, 0.04, angle * 180 / PI, angle * 180 / PI + 200,
    palette('Crystal', i), 0.85, rotate(angle * 180 / PI))
})
```

### Sine wave ribbon
```js
wave(60, 0.25, 2, (i, t, x, y) => {
  rect(x, y, 0.02, 0.02, grad(90, palette('Neon')), 1, rotate(t * 360))
})
```
