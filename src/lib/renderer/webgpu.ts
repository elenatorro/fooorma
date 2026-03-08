import type { Renderer, SketchDef } from './types'

// Vertex shader — shared across all sketches
const VERT_WGSL = /* wgsl */`
struct Uniforms {
  time: f32, artWidth: f32, artHeight: f32, _pad: f32,
  p: array<f32, 8>,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
struct Vert { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> Vert {
  var q = array<vec2<f32>,6>(
    vec2(-1.,-1.), vec2(1.,-1.), vec2(-1.,1.),
    vec2(-1.,1.),  vec2(1.,-1.), vec2(1.,1.));
  let p = q[vi];
  return Vert(vec4(p,0.,1.), p*.5+.5);
}
`

export class WebGPURenderer implements Renderer {
  readonly type = 'webgpu' as const

  private device!: GPUDevice
  private context!: GPUCanvasContext
  private format!: GPUTextureFormat
  private pipeline!: GPURenderPipeline
  private uniformBuf!: GPUBuffer
  private bindGroup!: GPUBindGroup
  private width = 1
  private height = 1

  // Uniform buffer layout: [time, artW, artH, _pad, p0..p7] = 12 x f32 = 48 bytes
  private uniforms = new Float32Array(12)

  constructor(private canvas: HTMLCanvasElement) {}

  async init(sketch: SketchDef, params: Float32Array): Promise<void> {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('No WebGPU adapter')

    this.device = await adapter.requestDevice()
    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext
    this.format = navigator.gpu.getPreferredCanvasFormat()
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' })

    this.uniformBuf = this.device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    await this.buildPipeline(sketch)
    this.setParams(params)
  }

  async setSketch(sketch: SketchDef, params: Float32Array): Promise<void> {
    await this.buildPipeline(sketch)
    this.setParams(params)
  }

  private async buildPipeline(sketch: SketchDef): Promise<void> {
    // Extract just the fragment entry point from the sketch WGSL
    // The sketch WGSL must include @fragment fn fs(...) and the Uniforms struct
    // We prepend the vertex shader and let the sketch define everything else
    const code = sketch.wgsl

    const module = this.device.createShaderModule({ code })
    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex:   { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    })
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuf } }],
    })
  }

  setParams(params: Float32Array): void {
    // params[0..7] go into uniforms[4..11]
    for (let i = 0; i < 8; i++) {
      this.uniforms[4 + i] = params[i] ?? 0
    }
  }

  resize(width: number, height: number): void {
    this.width  = width
    this.height = height
    this.uniforms[1] = width
    this.uniforms[2] = height
  }

  render(time: number): void {
    this.uniforms[0] = time / 1000

    this.device.queue.writeBuffer(this.uniformBuf, 0, this.uniforms)

    const enc  = this.device.createCommandEncoder()
    const view = this.context.getCurrentTexture().createView()
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp:  'clear',
        storeOp: 'store',
      }],
    })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bindGroup)
    pass.draw(6)
    pass.end()
    this.device.queue.submit([enc.finish()])
  }

  async exportPNG(): Promise<Blob> {
    // Render one final frame to ensure content is fresh
    this.render(performance.now())
    // Wait for the GPU queue to finish before reading the canvas
    await this.device.queue.onSubmittedWorkDone()

    return new Promise((resolve, reject) => {
      this.canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('toBlob returned null'))
      }, 'image/png')
    })
  }

  destroy(): void {
    this.uniformBuf?.destroy()
    this.device?.destroy()
  }
}
