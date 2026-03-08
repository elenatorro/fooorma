import type { SketchDef } from '../sketches/types'
import type { Renderer } from './types'

export type { Renderer }

export async function createRenderer(
  canvas: HTMLCanvasElement,
  sketch: SketchDef,
  params: Float32Array,
): Promise<Renderer> {
  if ('gpu' in navigator) {
    try {
      const { WebGPURenderer } = await import('./webgpu')
      const r = new WebGPURenderer(canvas)
      await r.init(sketch, params)
      console.info('[forma] renderer: WebGPU')
      return r
    } catch (e) {
      console.warn('[forma] WebGPU unavailable, falling back to WebGL2', e)
    }
  }

  const { WebGL2Renderer } = await import('./webgl2')
  const r = new WebGL2Renderer(canvas)
  await r.init(sketch, params)
  console.info('[forma] renderer: WebGL2 (fallback)')
  return r
}
