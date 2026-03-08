import type { SketchDef } from './types'

const GLSL_NOISE = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);
}
float fbm(vec2 p){
  float v=0.,a=.5;
  for(int i=0;i<6;i++){v+=a*noise(p);p=p*2.+vec2(1.7,9.2);a*=.5;}
  return v;
}`

export const marble: SketchDef = {
  id: 'marble',
  name: 'Marble',

  // p[0]=speed, p[1]=vein_scale, p[2]=turbulence
  wgsl: /* wgsl */`
struct Uniforms {
  time: f32, artWidth: f32, artHeight: f32, _pad: f32,
  p: array<f32, 8>,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
struct Vert { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> Vert {
  var q=array<vec2<f32>,6>(vec2(-1.,-1.),vec2(1.,-1.),vec2(-1.,1.),vec2(-1.,1.),vec2(1.,-1.),vec2(1.,1.));
  let p=q[vi]; return Vert(vec4(p,0.,1.),p*.5+.5);
}
fn hash(p: vec2<f32>)->f32{return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
fn noise(p: vec2<f32>)->f32{
  let i=floor(p);let f=fract(p);let u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);
}
fn fbm(p_in: vec2<f32>)->f32{
  var v=0.;var a=.5;var p=p_in;
  for(var i=0;i<6;i++){v+=a*noise(p);p=p*2.+vec2(1.7,9.2);a*=.5;}
  return v;
}
@fragment fn fs(in: Vert) -> @location(0) vec4<f32> {
  let aspect=u.artWidth/u.artHeight;
  var uv=(in.uv-.5)*vec2(aspect,1.);
  let t    = u.time*u.p[0];
  let scale= u.p[1];
  let turb = u.p[2];
  uv = uv * scale;
  let n = fbm(uv + vec2(t*.3, t*.1));
  let vein = sin((uv.x + turb*n)*6.2831 + t*.5) * .5 + .5;
  let v2   = sin((uv.y*1.3 + turb*n*1.2)*4.712) * .5 + .5;
  let f = vein * .6 + v2 * .4;
  let c1 = vec3(.95,.93,.88);
  let c2 = vec3(.3,.25,.2);
  let c3 = vec3(.15,.13,.1);
  let col = mix(mix(c1,c2,f),c3,pow(f,3.));
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
  vec2 uv=(v_uv-.5)*vec2(aspect,1.)*u_p1;
  float t=u_time*u_p0;
  float n=fbm(uv+vec2(t*.3,t*.1));
  float vein=sin((uv.x+u_p2*n)*6.2831+t*.5)*.5+.5;
  float v2=sin((uv.y*1.3+u_p2*n*1.2)*4.712)*.5+.5;
  float f=vein*.6+v2*.4;
  vec3 c1=vec3(.95,.93,.88),c2=vec3(.3,.25,.2),c3=vec3(.15,.13,.1);
  vec3 col=mix(mix(c1,c2,f),c3,pow(f,3.));
  fragColor=vec4(col,1.);
}`,

  params: [
    { id: 'speed',       label: 'Speed',       min: 0,   max: 0.5, default: 0.08, step: 0.01 },
    { id: 'vein_scale',  label: 'Vein scale',  min: 0.5, max: 6,   default: 2,    step: 0.1  },
    { id: 'turbulence',  label: 'Turbulence',  min: 0,   max: 3,   default: 1.2,  step: 0.05 },
  ],
}
