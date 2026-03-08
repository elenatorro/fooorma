export interface ParamDef {
  id: string
  label: string
  min: number
  max: number
  default: number
  step?: number
}

export interface SketchDef {
  id: string
  name: string
  wgsl: string  // complete WebGPU fragment shader
  glsl: string  // complete WebGL2 fragment shader
  params: ParamDef[]
}

// Standard uniforms available in every sketch shader:
//
// WebGPU (WGSL):
//   u.time       : f32   — seconds elapsed
//   u.artWidth   : f32   — artboard width in pixels
//   u.artHeight  : f32   — artboard height in pixels
//   u.p[0..7]    : f32   — custom params (by ParamDef order)
//   in.uv        : vec2  — 0..1 UV, origin bottom-left
//
// WebGL2 (GLSL):
//   u_time, u_artWidth, u_artHeight : float
//   u_p0 .. u_p7                   : float
//   v_uv                           : vec2
