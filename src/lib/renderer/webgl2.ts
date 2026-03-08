import type { Renderer, SketchDef } from './types'

const VERT_GLSL = /* glsl */`#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_pos * 0.5 + 0.5;
}`

export class WebGL2Renderer implements Renderer {
  readonly type = 'webgl2' as const

  private gl!: WebGL2RenderingContext
  private program!: WebGLProgram
  private locs: Record<string, WebGLUniformLocation | null> = {}

  constructor(private canvas: HTMLCanvasElement) {}

  async init(sketch: SketchDef, params: Float32Array): Promise<void> {
    const gl = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL2 not supported')
    this.gl = gl

    this.createQuad()
    await this.buildProgram(sketch)
    this.setParams(params)
  }

  async setSketch(sketch: SketchDef, params: Float32Array): Promise<void> {
    if (this.program) this.gl.deleteProgram(this.program)
    await this.buildProgram(sketch)
    this.setParams(params)
  }

  private createQuad(): void {
    const { gl } = this
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]), gl.STATIC_DRAW)
    // Vertex attribute setup is re-done per program (location may differ)
  }

  private async buildProgram(sketch: SketchDef): Promise<void> {
    const { gl } = this
    const prog = gl.createProgram()!
    gl.attachShader(prog, this.compile(gl.VERTEX_SHADER,   VERT_GLSL))
    gl.attachShader(prog, this.compile(gl.FRAGMENT_SHADER, sketch.glsl))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog) ?? 'Link failed')

    this.program = prog
    gl.useProgram(prog)

    // Re-bind vertex attribute
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    // Cache uniform locations
    this.locs = {
      time:     gl.getUniformLocation(prog, 'u_time'),
      artWidth: gl.getUniformLocation(prog, 'u_artWidth'),
      artHeight:gl.getUniformLocation(prog, 'u_artHeight'),
    }
    for (let i = 0; i < 8; i++) {
      this.locs[`p${i}`] = gl.getUniformLocation(prog, `u_p${i}`)
    }
  }

  private compile(type: number, src: string): WebGLShader {
    const { gl } = this
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? 'Compile failed')
    return s
  }

  setParams(params: Float32Array): void {
    if (!this.program) return
    const { gl } = this
    gl.useProgram(this.program)
    for (let i = 0; i < 8; i++) {
      gl.uniform1f(this.locs[`p${i}`], params[i] ?? 0)
    }
  }

  resize(width: number, height: number): void {
    this.gl.viewport(0, 0, width, height)
    if (this.program) {
      const { gl } = this
      gl.useProgram(this.program)
      gl.uniform1f(this.locs.artWidth,  width)
      gl.uniform1f(this.locs.artHeight, height)
    }
  }

  render(time: number): void {
    const { gl } = this
    gl.useProgram(this.program)
    gl.uniform1f(this.locs.time, time / 1000)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  async exportPNG(): Promise<Blob> {
    this.render(performance.now())
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('toBlob returned null'))
      }, 'image/png')
    })
  }

  destroy(): void {
    if (this.program) this.gl.deleteProgram(this.program)
  }
}
