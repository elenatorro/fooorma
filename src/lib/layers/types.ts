export type ShapeType = 'rect' | 'ellipse' | 'line' | 'curve' | 'triangle' | 'arc' | 'spline' | 'group' | 'mask'
  | 'cube' | 'sphere' | 'cylinder' | 'torus'

export interface ColorStop    { hex: string; opacity: number; pos: number }
export interface LinearGradient { type: 'linear'; angle: number; stops: ColorStop[] }
export interface RadialGradient { type: 'radial'; cx: number; cy: number; stops: ColorStop[] }
export type Gradient = LinearGradient | RadialGradient

export interface ShapeColor  { hex: string; opacity: number; gradient?: Gradient }
export interface ShapeStroke {
  hex: string
  opacity: number
  width: number                              // artW-fraction
  align?: 'center' | 'inner' | 'outer'
  join?:  'miter'  | 'round' | 'bevel'
  wireframe?: boolean                        // 3D only: edges only, no filled faces
  gradient?: Gradient
}

export interface ShapeGeom {
  x: number; y: number   // center, normalized 0–1
  w: number; h: number   // extents, normalized 0–1
}

export type Material3D = 'default' | 'metal' | 'plastic' | 'marble' | 'glass'

export interface ShapeEffect {
  type: 'shadow' | 'blur' | 'bevel' | 'noise' | 'warp' | 'material'
  color?:     string      // shadow color
  opacity?:   number      // shadow/bevel opacity  0–1
  blur?:      number      // shadow blur radius OR blur amount (px)
  offsetX?:   number      // shadow x offset (px)
  offsetY?:   number      // shadow y offset (px)
  amount?:    number      // noise grain intensity 0–1  /  warp displacement px
  freq?:      number      // warp wave frequency (cycles/px, e.g. 0.05)
  material?:  Material3D  // material kind (default 'default')
  roughness?: number      // material: surface roughness 0–1 (default 0.5)
  intensity?: number      // material: effect strength 0–1 (default 0.5)
}

export interface ShapeTransform {
  rotate?: number       // degrees, clockwise, around shape center
  scaleX?: number       // default 1
  scaleY?: number       // default 1
  skewX?:  number       // degrees
  skewY?:  number       // degrees
  // 3D properties (cube, sphere, cylinder, torus)
  rotateX?:  number     // degrees, tilt forward/back (default 35)
  rotateY?:  number     // degrees, spin left/right (default 45)
  rotateZ?:  number     // degrees, roll (default 0)
  depth?:    number     // perspective strength 0–1 (default 0)
  smooth?:   number     // tessellation segments 3–128 (default 32)
}

export interface Shape {
  id: string
  type: ShapeType
  color: ShapeColor
  stroke?: ShapeStroke
  geom: ShapeGeom
  // pts: flat normalized coords for line/curve/triangle
  // line: [x1,y1, x2,y2]  curve: [x1,y1, cx,cy, x2,y2]  triangle: [x1,y1, x2,y2, x3,y3]
  pts?: number[]
  strokeWidth?: number   // artW-fraction; used by line and curve
  transform?: ShapeTransform
  effects?: ShapeEffect[]
  children?: Shape[]         // group: child shapes / mask: content shapes
  mask?: Shape[]             // only for type === 'mask': shapes defining the clip region
}

export type PatternType = 'single' | 'row' | 'grid' | 'spiral' | 'wave' | 'circular'

export interface Pattern {
  id: string
  name: string
  type: PatternType
  shape: ShapeType
  color: string
  opacity: number
  count: number         // for repeat-based patterns
  cols: number          // for grid
  rows: number          // for grid
  builtin?: boolean
  code?: string         // stamp: raw code snippet (shapes in 0–1 local space)
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  bgColor?: string   // solid fill behind shapes, e.g. '#1a1a2e'
  mode: 'manual' | 'code'
  shapes: Shape[]    // manual mode source of truth (also cached baked output when switching to manual)
  query: string      // code mode source of truth (always stored, survives mode switches)
}
