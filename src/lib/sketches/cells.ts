import type { SketchDef } from './types'

export const cells: SketchDef = {
  id: 'cells',
  name: 'Cells',

  // p[0]=speed, p[1]=cell_scale, p[2]=edge_width
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

fn hash2(p: vec2<f32>) -> vec2<f32> {
  var q = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
  return fract(sin(q)*43758.5453);
}

fn voronoi(p: vec2<f32>, t: f32) -> vec3<f32> {
  let ip = floor(p);
  let fp = fract(p);
  var md1 = 8.; var md2 = 8.;
  var mc = vec2(0.);
  for(var j=-1;j<=1;j++){for(var i=-1;i<=1;i++){
    let c = vec2<f32>(f32(i),f32(j));
    let off = hash2(ip+c);
    let rp = c + .5*sin(t+6.2831*off) - fp;
    let d = dot(rp,rp);
    if(d < md1){ md2=md1; md1=d; mc=off; }
    else if(d < md2){ md2=d; }
  }}
  return vec3(sqrt(md1), sqrt(md2), mc.x);
}

@fragment fn fs(in: Vert) -> @location(0) vec4<f32> {
  let aspect=u.artWidth/u.artHeight;
  var uv=(in.uv-.5)*vec2(aspect,1.);
  let t = u.time*u.p[0];
  let scale = u.p[1];
  let ew = u.p[2];
  let v = voronoi(uv*scale, t);
  let edge = smoothstep(0., ew*.04, v.y - v.x);
  let c1 = vec3(.04,.04,.12);
  let c2 = vec3(.5,.15,.55);
  let c3 = vec3(.85,.75,.3);
  var col = mix(c1, mix(c2,c3,v.x*1.2), edge);
  col = mix(vec3(0.), col, edge);
  return vec4(col,1.);
}`,

  glsl: /* glsl */`#version 300 es
precision highp float;
uniform float u_time,u_artWidth,u_artHeight;
uniform float u_p0,u_p1,u_p2;
in vec2 v_uv; out vec4 fragColor;
vec2 hash2(vec2 p){
  vec2 q=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));
  return fract(sin(q)*43758.5453);
}
vec3 voronoi(vec2 p,float t){
  vec2 ip=floor(p),fp=fract(p);
  float md1=8.,md2=8.; vec2 mc=vec2(0.);
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 c=vec2(float(i),float(j));
    vec2 off=hash2(ip+c);
    vec2 rp=c+.5*sin(t+6.2831*off)-fp;
    float d=dot(rp,rp);
    if(d<md1){md2=md1;md1=d;mc=off;}else if(d<md2)md2=d;
  }
  return vec3(sqrt(md1),sqrt(md2),mc.x);
}
void main(){
  float aspect=u_artWidth/u_artHeight;
  vec2 uv=(v_uv-.5)*vec2(aspect,1.);
  float t=u_time*u_p0;
  vec3 v=voronoi(uv*u_p1,t);
  float edge=smoothstep(0.,u_p2*.04,v.y-v.x);
  vec3 c1=vec3(.04,.04,.12),c2=vec3(.5,.15,.55),c3=vec3(.85,.75,.3);
  vec3 col=mix(c1,mix(c2,c3,v.x*1.2),edge);
  col=mix(vec3(0.),col,edge);
  fragColor=vec4(col,1.);
}`,

  params: [
    { id: 'speed',      label: 'Speed',      min: 0,   max: 1,   default: 0.3, step: 0.01 },
    { id: 'cell_scale', label: 'Cell scale', min: 1,   max: 20,  default: 6,   step: 0.5  },
    { id: 'edge_width', label: 'Edge width', min: 0.1, max: 3,   default: 1,   step: 0.1  },
  ],
}
