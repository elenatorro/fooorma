import type { SketchDef } from './types'

export const ripple: SketchDef = {
  id: 'ripple',
  name: 'Ripple',

  // p[0]=speed, p[1]=frequency, p[2]=sources (2-6)
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

fn wave(uv: vec2<f32>, src: vec2<f32>, freq: f32, t: f32) -> f32 {
  let d = length(uv - src);
  return sin(d * freq - t) / (1. + d * 3.);
}

@fragment fn fs(in: Vert) -> @location(0) vec4<f32> {
  let aspect=u.artWidth/u.artHeight;
  var uv=(in.uv-.5)*vec2(aspect,1.);
  let t    = u.time * u.p[0];
  let freq = u.p[1];
  let nsrc = i32(clamp(u.p[2], 2., 6.));

  let srcs = array<vec2<f32>,6>(
    vec2(.4,.3), vec2(-.35,.2), vec2(.1,-.4),
    vec2(-.3,-.25), vec2(.45,-.1), vec2(-.1,.45));

  var w = 0.;
  for(var i=0;i<6;i++){
    if(i>=nsrc){break;}
    w += wave(uv, srcs[i], freq, t + f32(i)*1.3);
  }
  w = w * .5 + .5;

  let c1 = vec3(.02,.05,.18);
  let c2 = vec3(.1,.4,.8);
  let c3 = vec3(.8,.95,1.);
  let col = mix(mix(c1,c2,clamp(w*1.2,0.,1.)),c3,pow(clamp(w,0.,1.),4.));
  return vec4(col,1.);
}`,

  glsl: /* glsl */`#version 300 es
precision highp float;
uniform float u_time,u_artWidth,u_artHeight;
uniform float u_p0,u_p1,u_p2;
in vec2 v_uv; out vec4 fragColor;
float wave(vec2 uv,vec2 src,float freq,float t){
  float d=length(uv-src);
  return sin(d*freq-t)/(1.+d*3.);
}
void main(){
  float aspect=u_artWidth/u_artHeight;
  vec2 uv=(v_uv-.5)*vec2(aspect,1.);
  float t=u_time*u_p0, freq=u_p1;
  int nsrc=int(clamp(u_p2,2.,6.));
  vec2 srcs[6];
  srcs[0]=vec2(.4,.3);srcs[1]=vec2(-.35,.2);srcs[2]=vec2(.1,-.4);
  srcs[3]=vec2(-.3,-.25);srcs[4]=vec2(.45,-.1);srcs[5]=vec2(-.1,.45);
  float w=0.;
  for(int i=0;i<6;i++){
    if(i>=nsrc)break;
    w+=wave(uv,srcs[i],freq,t+float(i)*1.3);
  }
  w=w*.5+.5;
  vec3 c1=vec3(.02,.05,.18),c2=vec3(.1,.4,.8),c3=vec3(.8,.95,1.);
  vec3 col=mix(mix(c1,c2,clamp(w*1.2,0.,1.)),c3,pow(clamp(w,0.,1.),4.));
  fragColor=vec4(col,1.);
}`,

  params: [
    { id: 'speed',     label: 'Speed',     min: 0.1, max: 3,  default: 1,  step: 0.05 },
    { id: 'frequency', label: 'Frequency', min: 5,   max: 40, default: 18, step: 1    },
    { id: 'sources',   label: 'Sources',   min: 2,   max: 6,  default: 3,  step: 1    },
  ],
}
