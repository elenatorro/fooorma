import type { SketchDef } from './types'

// Shared GLSL noise helpers (injected at top of GLSL shader)
const GLSL_NOISE = `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    v += a * noise(p); p = p * 2.1 + vec2(1.7, 9.2); a *= 0.5;
  }
  return v;
}`

export const warp: SketchDef = {
  id: 'warp',
  name: 'Warp',

  // p[0]=speed, p[1]=octaves(2-8), p[2]=warp_strength
  wgsl: /* wgsl */`
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

fn hash(p: vec2<f32>) -> f32 { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
fn noise(p: vec2<f32>) -> f32 {
  let i=floor(p); let f=fract(p); let u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);
}
fn fbm(p_in: vec2<f32>, oct: i32) -> f32 {
  var v=0.; var a=.5; var p=p_in;
  for(var i=0;i<8;i++){if(i>=oct){break;} v+=a*noise(p); p=p*2.1+vec2(1.7,9.2); a*=.5;}
  return v;
}

@fragment fn fs(in: Vert) -> @location(0) vec4<f32> {
  let aspect = u.artWidth / u.artHeight;
  var uv = (in.uv - .5) * vec2(aspect, 1.);
  let t   = u.time * u.p[0];
  let oct = i32(clamp(u.p[1], 2., 8.));
  let ws  = u.p[2];

  let q = vec2(fbm(uv+t, oct), fbm(uv+vec2(t,1.), oct));
  let r = vec2(fbm(uv+ws*q+vec2(1.7,9.2), oct), fbm(uv+ws*q+vec2(8.3,2.8), oct));
  let f = fbm(uv + ws*r, oct);

  let c1 = vec3(0.06,0.02,0.14);
  let c2 = vec3(0.48,0.08,0.38);
  let c3 = vec3(0.92,0.62,0.18);
  let col = mix(mix(c1,c2,clamp(f*1.6,0.,1.)),c3,pow(clamp(f,0.,1.),3.));
  return vec4(col,1.);
}`,

  glsl: /* glsl */`#version 300 es
precision highp float;
uniform float u_time,u_artWidth,u_artHeight;
uniform float u_p0,u_p1,u_p2;
in vec2 v_uv; out vec4 fragColor;
${GLSL_NOISE}
void main(){
  float aspect=u_artWidth/u_artHeight;
  vec2 uv=(v_uv-.5)*vec2(aspect,1.);
  float t=u_time*u_p0;
  int oct=int(clamp(u_p1,2.,8.));
  float ws=u_p2;
  vec2 q=vec2(fbm(uv+t,oct),fbm(uv+vec2(t,1.),oct));
  vec2 r=vec2(fbm(uv+ws*q+vec2(1.7,9.2),oct),fbm(uv+ws*q+vec2(8.3,2.8),oct));
  float f=fbm(uv+ws*r,oct);
  vec3 c1=vec3(.06,.02,.14),c2=vec3(.48,.08,.38),c3=vec3(.92,.62,.18);
  vec3 col=mix(mix(c1,c2,clamp(f*1.6,0.,1.)),c3,pow(clamp(f,0.,1.),3.));
  fragColor=vec4(col,1.);
}`,

  params: [
    { id: 'speed',    label: 'Speed',    min: 0.01, max: 0.5,  default: 0.12, step: 0.01 },
    { id: 'octaves',  label: 'Octaves',  min: 2,    max: 8,    default: 6,    step: 1    },
    { id: 'warp',     label: 'Warp',     min: 0.5,  max: 8,    default: 4,    step: 0.1  },
  ],
}
