export type ShapeType = 'rect' | 'ellipse' | 'line' | 'curve' | 'triangle'

export interface ShapeColor { hex: string; opacity: number }

export interface ShapeGeom {
  x: number; y: number   // center, normalized 0–1
  w: number; h: number   // extents, normalized 0–1
}

export interface Shape {
  id: string
  type: ShapeType
  color: ShapeColor
  geom: ShapeGeom
  // pts: flat normalized coords for line/curve/triangle
  // line: [x1,y1, x2,y2]  curve: [x1,y1, cx,cy, x2,y2]  triangle: [x1,y1, x2,y2, x3,y3]
  pts?: number[]
  strokeWidth?: number   // artW-fraction; used by line and curve
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
