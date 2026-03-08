import type { SketchDef } from './types'

export const crystal: SketchDef = {
  id: 'crystal',
  name: 'Crystal',

  // p[0]=speed, p[1]=segments(3-16), p[2]=twist
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
@fragment fn fs(in: Vert) -> @location(0) vec4<f32> {
  let aspect=u.artWidth/u.artHeight;
  var uv=(in.uv-.5)*vec2(aspect,1.);
  let t    = u.time*u.p[0];
  let segs = u.p[1];
  let twist= u.p[2];

  let r = length(uv);
  let a = atan2(uv.y, uv.x);
  // kaleidoscope fold
  let slice = 6.2831 / segs;
  var ka = (a + t*.2) / slice;
  ka = abs(fract(ka)-.5) * slice;
  // add twist
  ka = ka + twist * r;
  let kx = cos(ka)*r;
  let ky = sin(ka)*r;

  // interior pattern
  let f1 = noise(vec2(kx,ky)*4. + t);
  let f2 = noise(vec2(ky,-kx)*3. - t*.7);
  let f  = f1*.6 + f2*.4;
  let mask = 1. - smoothstep(.45,.5,r);

  let c1 = vec3(.04,.02,.12);
  let c2 = vec3(.2,.05,.5);
  let c3 = vec3(.8,.3,.9);
  let c4 = vec3(1.,.85,.4);
  var col = mix(mix(c1,c2,f*1.5),mix(c3,c4,f),pow(f,2.));
  col *= mask;
  return vec4(col,1.);
}`,

  glsl: /* glsl */`#version 300 es
precision highp float;
uniform float u_time,u_artWidth,u_artHeight;
uniform float u_p0,u_p1,u_p2;
in vec2 v_uv; out vec4 fragColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);
}
void main(){
  float aspect=u_artWidth/u_artHeight;
  vec2 uv=(v_uv-.5)*vec2(aspect,1.);
  float t=u_time*u_p0,segs=u_p1,twist=u_p2;
  float r=length(uv),a=atan(uv.y,uv.x);
  float slice=6.2831/segs;
  float ka=abs(fract((a+t*.2)/slice)-.5)*slice+twist*r;
  vec2 k=vec2(cos(ka)*r,sin(ka)*r);
  float f1=noise(k*4.+t),f2=noise(vec2(k.y,-k.x)*3.-t*.7);
  float f=f1*.6+f2*.4;
  float mask=1.-smoothstep(.45,.5,r);
  vec3 c1=vec3(.04,.02,.12),c2=vec3(.2,.05,.5),c3=vec3(.8,.3,.9),c4=vec3(1.,.85,.4);
  vec3 col=mix(mix(c1,c2,f*1.5),mix(c3,c4,f),pow(f,2.))*mask;
  fragColor=vec4(col,1.);
}`,

  params: [
    { id: 'speed',    label: 'Speed',    min: 0,  max: 1,  default: 0.2, step: 0.01 },
    { id: 'segments', label: 'Segments', min: 3,  max: 16, default: 6,   step: 1    },
    { id: 'twist',    label: 'Twist',    min: 0,  max: 4,  default: 1,   step: 0.1  },
  ],
}
