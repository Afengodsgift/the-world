// Ocean: ONE wave function for the whole sea. The GPU (vertex shader on the existing sea mesh) and the CPU (ship heave/pitch/roll, swimmers,
// effects) evaluate exactly the same table, so what you see rising is what the hull rides.
//   - 4 deep-water waves, fixed directions (so the surface never "swirls" when the weather changes), dispersion w = sqrt(g k).
//   - Phase is computed on the CPU from Date.now() modulo 2PI (double precision) and handed to the shader: every client sees the same sea
//     with no networking, and float32 never has to hold a 1.7e9 second clock.
//   - `state.sea` (0..1) is the sea state: how big the waves are. It follows the weather (E.wx) but RISES quickly and FALLS slowly,
//     so a storm builds fast and the swell is still rolling after the sky clears.
//   - Pure maths at the top (no THREE, no DOM): unit-tested in tests/ocean.sim.js. build()/makeGeometry()/tick() are the rendering side.
const Ocean=(()=>{
  const TAU=Math.PI*2,G=9.8;
  // dir: angle (0 = +x, counter-clockwise toward +z), L: wavelength m, a: amplitude at sea state 1 (m), q: steepness (crest sharpening, 0..1)
  const WAVES=[
    {dir:.35,L:92,a:1.55,q:.35,ph:0.7},
    {dir:-.55,L:47,a:.72,q:.3,ph:2.9},
    {dir:1.25,L:23,a:.34,q:.25,ph:4.1},
    {dir:.1,L:11,a:.14,q:.2,ph:1.3}];
  for(const w of WAVES){w.k=TAU/w.L;w.w=Math.sqrt(G*w.k);w.dx=Math.cos(w.dir);w.dz=Math.sin(w.dir)}
  // ---- surf breaks: rideable swells that only exist at named spots (data/surf.js). Each break is a swell train marching toward the shore, its crest lines turned by `peel` so the wave
  // breaks progressively along the beach (a surfer rides ALONG the face). The wave is lopsided (steep front), grows toward the beach (shoaling) and comes in sets (groups of ~5, then a lull).
  // Pure maths shared with the sea vertex shader (same constants): height() below adds it, so ships, swimmers and surfers all ride what is drawn.
  const NB=8,BREAKS=[];
  const sstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  // b: {x,z (centre), dx,dz (unit, toward the beach), Lh (half length), Wh (half width), A (amplitude m), L (wavelength m), peel (rad)}
  function setBreaks(list){BREAKS.length=0;for(const b of (list||[]).slice(0,NB)){const k=TAU/b.L,w=Math.sqrt(G*k)*.92,c=Math.cos(b.peel||0),sn=Math.sin(b.peel||0);
      BREAKS.push({x:b.x,z:b.z,dx:b.dx,dz:b.dz,Lh:b.Lh||105,Wh:b.Wh||95,A:b.A,L:b.L,k,w,kx:b.dx*c-b.dz*sn,kz:b.dx*sn+b.dz*c,seed:b.seed||0,id:b.id||''})}
    if(U){syncBreaks()}}
  // phase of every break at time t (seconds): -w*t wrapped, so float32 on the GPU never sees a big clock
  function breakPh(t,out){out=out||new Float32Array(NB);for(let i=0;i<NB;i++){const b=BREAKS[i];out[i]=b?(((-b.w*(t%(TAU/b.w)))%TAU)+TAU)%TAU:0}return out}
  const F1=-.3;                                             // lop-sided profile: sin(th)+F1*sin(2th); negative F1 makes the face (falling side, travel direction) steep and the back gentle
  const prof=th=>(Math.sin(th)+F1*Math.sin(2*th))/1.12,dprof=th=>(Math.cos(th)+2*F1*Math.cos(2*th))/1.12;
  // one break at (x,z): {h,sx,sz} (height m, slope) -- env/set/shoaling factors in `e`
  function breakAt(b,x,z,ph,sea,o){const px=x-b.x,pz=z-b.z,s=px*b.dx+pz*b.dz,u=-px*b.dz+pz*b.dx;
    const env=(1-sstep(.55,1,Math.abs(u)/b.Wh))*sstep(-b.Lh,-b.Lh*.35,s)*(1-sstep(b.Lh*.55,b.Lh,s));
    if(env<=0){o.h=0;o.sx=0;o.sz=0;return o}
    const th=b.k*(b.kx*px+b.kz*pz)+ph,mod=.65+.35*Math.cos(th*.2+b.seed),amp=b.A*env*mod*(1+.6*sstep(-b.Lh*.3,b.Lh*.45,s))*(.8+.6*sea),d=dprof(th)*amp*b.k;
    o.h=prof(th)*amp;o.sx=d*b.kx;o.sz=d*b.kz;return o}
  // Where the wave is going at (x,z): the phase velocity of the break whose FRONT face you are on (w 0..1 = how much), so a surfer on the face is carried along with it.
  function waveAt(x,z,t,sea,out){out=out||{x:0,z:0,w:0,id:''};out.x=0;out.z=0;out.w=0;out.id='';if(!BREAKS.length)return out;if(sea===undefined)sea=state.sea;const ph=breakPh(t,_bph);let best=0;
    for(let i=0;i<BREAKS.length;i++){const b=BREAKS[i];breakAt(b,x,z,ph[i],sea,_bo);const along=_bo.sx*b.kx+_bo.sz*b.kz;      // dh along the travel direction: negative on the front face
      const w=Math.max(0,Math.min(1,-along/.2));if(w>best){best=w;const c=b.w/b.k;out.x=c*b.kx;out.z=c*b.kz;out.w=w;out.id=b.id}}
    return out}
  const _bo={h:0,sx:0,sz:0},_bph=new Float32Array(NB);
  function surfHeight(x,z,t,sea,bph){if(!BREAKS.length)return 0;if(sea===undefined)sea=state.sea;bph=bph||breakPh(t,_bph);let h=0;for(let i=0;i<BREAKS.length;i++)h+=breakAt(BREAKS[i],x,z,bph[i],sea,_bo).h;return h}
  function surfSlope(x,z,t,sea,out,bph){out=out||{x:0,z:0};out.x=0;out.z=0;if(!BREAKS.length)return out;if(sea===undefined)sea=state.sea;bph=bph||breakPh(t,_bph);for(let i=0;i<BREAKS.length;i++){breakAt(BREAKS[i],x,z,bph[i],sea,_bo);out.x+=_bo.sx;out.z+=_bo.sz}return out}
  const BASE=.07;                                    // sea state in dead calm: a gentle ~10 cm swell, never a mirror
  const state={sea:BASE,target:BASE,phase:new Float32Array(WAVES.length)};
  // sea-state target from a weather record {cloud,rain,storm} and the wind strength multiplier (1 = normal)
  function target(wx,windS){
    wx=wx||{};const c=wx.cloud||0,r=wx.rain||0,s=wx.storm||0,w=windS===undefined?1:windS;
    return Math.max(0,Math.min(1,BASE+.08*c+.22*r+.62*s+.12*Math.max(0,w-1)));
  }
  // rise ~ 8 s time constant, fall ~ 40 s: waves build with the storm and keep rolling after it
  function ease(cur,tgt,dt){const k=tgt>cur?1/8:1/40;return cur+(tgt-cur)*Math.min(1,dt*k)}
  // phase of each wave at time t (seconds, any epoch) -> out (radians, 0..2PI)
  function phases(t,out){out=out||new Float32Array(WAVES.length);for(let i=0;i<WAVES.length;i++){const w=WAVES[i];out[i]=((w.ph-w.w*(t%(TAU/w.w)))%TAU+TAU)%TAU}return out}
  // surface height above mean sea level at world (x,z). sea = sea state 0..1. ph optional precomputed phases.
  function height(x,z,t,sea,ph){
    if(sea===undefined)sea=state.sea;if(!ph)ph=phases(t);
    let h=0;for(let i=0;i<WAVES.length;i++){const w=WAVES[i];h+=w.a*Math.sin(w.k*(w.dx*x+w.dz*z)+ph[i])}
    return h*sea+(BREAKS.length?surfHeight(x,z,t,sea):0)}
  // slope (dh/dx, dh/dz): used for the shader normal and tests
  function slope(x,z,t,sea,out,ph){
    if(sea===undefined)sea=state.sea;if(!ph)ph=phases(t);out=out||{x:0,z:0};let sx=0,sz=0;
    for(let i=0;i<WAVES.length;i++){const w=WAVES[i],c=w.a*w.k*Math.cos(w.k*(w.dx*x+w.dz*z)+ph[i]);sx+=c*w.dx;sz+=c*w.dz}
    out.x=sx*sea;out.z=sz*sea;if(BREAKS.length){const q=surfSlope(x,z,t,sea,_sl);out.x+=q.x;out.z+=q.z}return out}
  const _sl={x:0,z:0};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  // How a hull of half length hl / half beam hb sits on the sea at (x,z) heading h (forward = (sin h, cos h)).
  // Samples centre, bow, stern, port and starboard; returns {y (heave of the keel line, m), pitch (+ = bow DOWN, three.js), roll (+ = port UP)}.
  // `k` (0..1) is how strongly this hull follows the surface (big hulls filter the short waves; the result is clamped so it can never flip).
  const _p={x:0,z:0};
  function pose(x,z,h,hl,hb,t,sea,out,k){
    out=out||{y:0,pitch:0,roll:0};if(sea===undefined)sea=state.sea;if(k===undefined)k=1;
    const ph=phases(t),s=Math.sin(h),c=Math.cos(h);
    const at=(px,pz)=>height(x+c*px+s*pz,z-s*px+c*pz,t,sea,ph);
    const hc=at(0,0),hb_=at(0,hl),hs=at(0,-hl),hp=at(hb,0),hsb=at(-hb,0);
    out.y=((hc*2+hb_+hs+hp+hsb)/6)*k;
    out.pitch=clamp(-Math.atan2(hb_-hs,2*hl)*k,-.13,.13);
    out.roll=clamp(Math.atan2(hp-hsb,2*hb)*k,-.17,.17);
    return out}
  function tick(dt,wx,windS){state.target=target(wx,windS);state.sea=ease(state.sea,state.target,dt);if(U){phases(Date.now()/1000,state.phase);if(BREAKS.length)breakPh(Date.now()/1000,U.uBp.value)}}
  // ---------- rendering side ----------
  let U=null,mat=null;
  // radial mesh: 2 m rings near the centre growing 10 % per ring, 128 segments. ~9k vertices for 6 km of sea. uv matches the old circle (bump map).
  function makeGeometry(R,inner){
    const radii=[inner||.01];let r=2;while(r<40){radii.push(r);r+=2}r=40;while(r<R){radii.push(r);r*=1.1}radii.push(R);
    const SEG=128,pos=[],uv=[],idx=[];
    for(let i=0;i<radii.length;i++)for(let j=0;j<=SEG;j++){const a=j/SEG*TAU,x=Math.cos(a)*radii[i],y=Math.sin(a)*radii[i];pos.push(x,y,0);uv.push((x/R+1)/2,(y/R+1)/2)}
    for(let i=0;i<radii.length-1;i++)for(let j=0;j<SEG;j++){const a=i*(SEG+1)+j,b=a+SEG+1;idx.push(a,b,a+1,b,b+1,a+1)}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_,i)=>i%3===2?1:0),3));g.setIndex(idx);return g}
  // patch the existing sea material (no second mesh): vertex waves + analytic normals + whitecaps; the mesh follows the camera near the ground
  function build(mesh,R){
    mat=mesh.material;mesh.frustumCulled=false;
    U={uPh:{value:state.phase},uSea:{value:state.sea},uC:{value:new THREE.Vector2()},uFol:{value:1},uR:{value:R||6000},uWk:{value:new THREE.Vector4(WAVES[0].k,WAVES[1].k,WAVES[2].k,WAVES[3].k)},
       uWa:{value:new THREE.Vector4(WAVES[0].a,WAVES[1].a,WAVES[2].a,WAVES[3].a)},uWx:{value:new THREE.Vector4(WAVES[0].dx,WAVES[1].dx,WAVES[2].dx,WAVES[3].dx)},uWz:{value:new THREE.Vector4(WAVES[0].dz,WAVES[1].dz,WAVES[2].dz,WAVES[3].dz)},uFoam:{value:0},uBa:{value:Array.from({length:NB},()=>new THREE.Vector4())},uBb:{value:Array.from({length:NB},()=>new THREE.Vector4())},uBc:{value:Array.from({length:NB},()=>new THREE.Vector4())},uBp:{value:new Float32Array(NB)}};syncBreaks();
    phases(Date.now()/1000,state.phase);
    mat.onBeforeCompile=sh=>{
      Object.assign(sh.uniforms,U);
      sh.vertexShader=sh.vertexShader
        .replace('#include <common>',`#include <common>
uniform float uPh[4];uniform float uSea,uFol,uR;uniform vec2 uC;uniform vec4 uWk,uWa,uWx,uWz;varying float vWh;varying float vFd;varying float vBc;uniform vec4 uBa[8];uniform vec4 uBb[8];uniform vec4 uBc[8];uniform float uBp[8];`)
        .replace('#include <uv_vertex>',`#ifdef USE_UV
  vec2 uvS=uv+uFol*vec2(uC.x,-uC.y)/(2.0*uR);vUv=(uvTransform*vec3(uvS,1.0)).xy;
#endif`)
        .replace('#include <beginnormal_vertex>',`vec2 wxz=vec2(position.x+uFol*uC.x,-position.y+uFol*uC.y);
float wH=0.0,wSx=0.0,wSz=0.0;
{float K[4];float A[4];float DX[4];float DZ[4];K[0]=uWk.x;K[1]=uWk.y;K[2]=uWk.z;K[3]=uWk.w;A[0]=uWa.x;A[1]=uWa.y;A[2]=uWa.z;A[3]=uWa.w;DX[0]=uWx.x;DX[1]=uWx.y;DX[2]=uWx.z;DX[3]=uWx.w;DZ[0]=uWz.x;DZ[1]=uWz.y;DZ[2]=uWz.z;DZ[3]=uWz.w;
 for(int i=0;i<4;i++){float a=K[i]*(DX[i]*wxz.x+DZ[i]*wxz.y)+uPh[i];wH+=A[i]*sin(a);float c=A[i]*K[i]*cos(a);wSx+=c*DX[i];wSz+=c*DZ[i];}}
float fade=1.0-smoothstep(500.0,1500.0,length(position.xy));float wS=uSea*fade;
float bH=0.0,bSx=0.0,bSz=0.0,bAm=0.0;
for(int i=0;i<8;i++){vec4 ba=uBa[i],bb=uBb[i],bc=uBc[i];if(bb.z<=0.0)continue;
 vec2 bp=wxz-ba.xy;float bs=bp.x*ba.z+bp.y*ba.w;float bu=-bp.x*ba.w+bp.y*ba.z;
 float env=(1.0-smoothstep(.55,1.0,abs(bu)/bb.y))*smoothstep(-bb.x,-bb.x*.35,bs)*(1.0-smoothstep(bb.x*.55,bb.x,bs));
 if(env<=0.0)continue;
 float th=bb.w*(bc.x*bp.x+bc.y*bp.y)+uBp[i];float md=.65+.35*cos(th*.2+bc.z);
 float amp=bb.z*env*md*(1.0+.6*smoothstep(-bb.x*.3,bb.x*.45,bs))*(.8+.6*uSea);
 float bf=(sin(th)-.3*sin(2.0*th))/1.12;float bdf=(cos(th)-.6*cos(2.0*th))/1.12;
 bH+=bf*amp;bSx+=bdf*amp*bb.w*bc.x;bSz+=bdf*amp*bb.w*bc.y;bAm=max(bAm,bf*env*md);}
vWh=wH*wS+bH*fade;vFd=fade;vBc=bAm*fade;
vec3 objectNormal=normalize(vec3(-(wSx*wS+bSx*fade),wSz*wS+bSz*fade,1.0));
#ifdef USE_TANGENT
vec3 objectTangent=vec3(tangent.xyz);
#endif`)
        .replace('#include <begin_vertex>',`vec3 transformed=vec3(position);transformed.x+=uFol*uC.x;transformed.y-=uFol*uC.y;transformed.z+=vWh;`);
      sh.fragmentShader=sh.fragmentShader
        .replace('#include <common>',`#include <common>
varying float vWh;varying float vFd;varying float vBc;uniform float uSea,uFoam;`)
        .replace('#include <color_fragment>',`#include <color_fragment>
{float crest=smoothstep(.38,.85,vWh/max(.001,1.7*uSea))*smoothstep(.22,.5,uSea);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.93,.96,.98),crest*.55*vFd);diffuseColor.a=mix(diffuseColor.a,min(1.0,diffuseColor.a+.25),crest);
float sc=smoothstep(.62,.95,vBc);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.95,.98,1.0),sc*.8);}`);
    };
    mat.needsUpdate=true;
  }
  function syncBreaks(){if(!U)return;for(let i=0;i<NB;i++){const b=BREAKS[i];U.uBa.value[i].set(b?b.x:0,b?b.z:0,b?b.dx:0,b?b.dz:0);U.uBb.value[i].set(b?b.Lh:0,b?b.Wh:1,b?b.A:0,b?b.k:0);U.uBc.value[i].set(b?b.kx:0,b?b.kz:0,b?b.seed:0,0)}breakPh(Date.now()/1000,U.uBp.value)}
  function updateUniforms(cx,cz,above){if(!U)return;U.uSea.value=state.sea;U.uC.value.set(cx,cz);U.uFol.value=1-clamp(above||0,0,1)}
  return {WAVES,state,BASE,target,ease,phases,height,slope,pose,tick,build,makeGeometry,updateUniforms,setBreaks,surfHeight,surfSlope,waveAt,breakPh,breaks:BREAKS,NB};
})();
