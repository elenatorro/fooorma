import type { SketchDef } from '../sketches/types'

export type { SketchDef }

export interface Renderer {
  readonly type: 'webgpu' | 'webgl2'
  init(sketch: SketchDef, params: Float32Array): Promise<void>
  setSketch(sketch: SketchDef, params: Float32Array): Promise<void>
  setParams(params: Float32Array): void
  render(time: number): void
  resize(width: number, height: number): void
  exportPNG(): Promise<Blob>
  destroy(): void
}
