// SpacePlanet: a second world, 90 km in radius, ~856 km from home (SpaceMap). From the edge of space it is a large dark-lit disc; you can fly right up to it.
// Nothing to land on yet: it is a place to be seen and reached, and the reason the ring faces it. (Landing, weather, a surface: later.)
//  - generated at load from a few octaves of 3D value noise: teal and indigo seas, rust-and-sand continents, ice caps, a separate drifting cloud layer, and a thin amber atmosphere
//    (a back-faced additive shell that is brightest at the planet's limb), so it looks like somewhere else, not another copy of home. 512x256 DataTexture + 256x128 clouds; <100 ms
//  - drawn as an IMPOSTOR like the home world (SpaceEnvironment): the far depth slice ends at 900 km, so beyond 600 km the planet is drawn 600 km away and scaled down by the
//    same factor, which keeps its angular size and perspective exactly while keeping it inside the depth range
//  - it fades in with the stars (nothing below ~35 km, half there at 60 km, fully by ~95 km), uses the scene's light (so its lit side follows the sun) plus a faint blue floor so the night side is not a hole
//  - solid: you are kept 600 m above its surface; approach assist (SpaceObjects def.assist) slows you to normal flight speed in the last 4 km, easing up from there to full speed at 120 km
//  - found like everything else: within 150 km, looking at it
// Globals used: THREE, S, camera, Space, SpaceObjects, SpaceMap.
const SpacePlanet=(()=>{
  const M=SpaceMap,C=M.planet.pos,R=M.planet.r,IMP_D=600000,HOVER=600,W=512,H=256;
  const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  const hex=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  const SEA_DEEP=hex('#0a2144'),SEA_SHAL=hex('#1f7a8c'),LOW=hex('#b5693a'),SAND=hex('#e2b56d'),HIGH=hex('#6d4331'),ICE=hex('#f1f4f9'),DUSK=hex('#7d5a74'),BASALT=hex('#3b3438');
  // equirectangular pixels (row 0 = south pole), generated a band of rows at a time so a phone never stalls on it. Pure functions of (w,h,rows): deterministic, no DOM, testable.
  function surfaceRows(px,w,h,j0,j1){
    for(let j=j0;j<j1;j++){const lat=((j+.5)/h-.5)*Math.PI,cl=Math.cos(lat),y=Math.sin(lat);
      for(let i=0;i<w;i++){const lon=(i+.5)/w*Math.PI*2,x=cl*Math.cos(lon),z=cl*Math.sin(lon);
        const e=M.fbm3(x*2.2+9,y*2.2+9,z*2.2+9,31,5),d=M.fbm3(x*7,y*7,z*7,5,3),rg=1-Math.abs(M.fbm3(x*4.5,y*4.5,z*4.5,19,3)*2-1);   // rg: ridged noise = mountain chains
        const hgt=e*.78+d*.10+rg*.12;let c;
        if(hgt<.545){const t=Math.min(1,(.545-hgt)/.24);c=mix(SEA_SHAL,SEA_DEEP,Math.pow(t,.7))}
        else{const t=(hgt-.545)/.33,v=d,bio=M.fbm3(x*1.4+4,y*1.4+4,z*1.4+4,63,3);
          c=t<.45?mix(LOW,SAND,t/.45*(.5+.5*v)):mix(SAND,HIGH,Math.min(1,(t-.45)/.55));
          c=mix(c,DUSK,sm(.52,.70,bio)*.75);                               // dusky violet plains
          c=mix(c,BASALT,sm(.66,.82,rg)*sm(.2,.5,t)*.8);                   // dark ridges
          c=mix(c,[c[0]*.82,c[1]*.8,c[2]*.78],v*.5)}
        const pole=sm(.80,.94,Math.abs(y)+.10*(M.fbm3(x*5,y*5,z*5,77,3)-.5));c=mix(c,ICE,pole);
        const k=(j*w+i)*4;px[k]=c[0];px[k+1]=c[1];px[k+2]=c[2];px[k+3]=255}}}
  // white swirls with alpha; the noise is warped by itself so the bands look sheared like weather
  function cloudRows(px,w,h,j0,j1){
    for(let j=j0;j<j1;j++){const lat=((j+.5)/h-.5)*Math.PI,cl=Math.cos(lat),y=Math.sin(lat);
      for(let i=0;i<w;i++){const lon=(i+.5)/w*Math.PI*2,x=cl*Math.cos(lon),z=cl*Math.sin(lon);
        const wx=M.fbm3(x*1.6,y*3.2,z*1.6,101,3)-.5,n=M.fbm3(x*3+wx*2.2,y*6+wx,z*3+wx*2.2,53,4);
        const a=sm(.42,.62,n)*.86*(1-.45*sm(.85,1,Math.abs(y)));const k=(j*w+i)*4;px[k]=px[k+1]=px[k+2]=250;px[k+3]=Math.round(a*255)}}}
  const surface=(w,h)=>{const px=new Uint8Array(w*h*4);surfaceRows(px,w,h,0,h);return px},clouds=(w,h)=>{const px=new Uint8Array(w*h*4);cloudRows(px,w,h,0,h);return px};
  const tex=(d,w,h)=>{const t=new THREE.DataTexture(d,w,h,THREE.RGBAFormat);t.wrapS=THREE.RepeatWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.anisotropy=2;if(THREE.sRGBEncoding!==undefined)t.encoding=THREE.sRGBEncoding;t.needsUpdate=true;return t};
  let P=null;const _v=new THREE.Vector3();
  function build(o){
    const g=new THREE.Group(),geo=new THREE.SphereGeometry(1,64,40);
    const body=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({roughness:.92,metalness:0,emissive:'#07101c',fog:false,transparent:true,opacity:0}));
    const cloud=new THREE.Mesh(new THREE.SphereGeometry(1.012,48,30),new THREE.MeshStandardMaterial({transparent:true,depthWrite:false,roughness:1,metalness:0,emissive:'#101820',fog:false,opacity:0}));
    const atm=new THREE.Mesh(new THREE.SphereGeometry(1.11,48,30),new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.BackSide,fog:false,
      uniforms:{c:{value:new THREE.Color('#ffb36b')},k:{value:0}},
      vertexShader:'varying vec3 vN;varying vec3 vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
      fragmentShader:'uniform vec3 c;uniform float k;varying vec3 vN;varying vec3 vV;void main(){float d=-dot(vN,vV);float f=pow(clamp(d/0.42,0.0,1.0),2.2);gl_FragColor=vec4(c*f,f)*k;}'}));
    for(const m of [body,cloud,atm]){m.frustumCulled=false;m.renderOrder=-5;g.add(m)}cloud.renderOrder=-4;atm.renderOrder=-3;
    P={g,body,cloud,atm,job:{s:new Uint8Array(W*H*4),c:new Uint8Array(W/2*H/2*4),j:0,jc:0,done:false}};return g}
  // texture generation, a few rows per frame, started on the way up (the planet only fades in at 40 km, so nobody waits for it)
  const ROWS=4,CROWS=2;
  function step(){
    const J=P.job;if(J.done)return;
    if(J.j<H){J.j=Math.min(H,J.j+ROWS);surfaceRows(J.s,W,H,J.j-ROWS<0?0:Math.max(0,J.j-ROWS),J.j)}
    if(J.jc<H/2){J.jc=Math.min(H/2,J.jc+CROWS);cloudRows(J.c,W/2,H/2,Math.max(0,J.jc-CROWS),J.jc)}
    if(J.j>=H&&J.jc>=H/2){J.done=true;P.body.material.map=tex(J.s,W,H);P.cloud.material.map=tex(J.c,W/2,H/2);P.body.material.needsUpdate=P.cloud.material.needsUpdate=true;J.s=J.c=null}}
  // where the planet is drawn for a camera at cp: true place if it is inside the depth range, else the same direction at IMP_D, scaled to keep its angular size
  function place(cp,out){
    const dx=C[0]-cp.x,dy=C[1]-cp.y,dz=C[2]-cp.z,D=Math.hypot(dx,dy,dz)||1,Dp=Math.min(D,IMP_D),k=Dp/D;
    out.x=cp.x+dx*k;out.y=cp.y+dy*k;out.z=cp.z+dz*k;out.s=R*k;out.D=D;return out}
  const _o={x:0,y:0,z:0,s:1,D:1};
  function update(o,dt,t){
    if(!P)return;
    if(!P.job.done&&(S.y>6000||Space.f.space>0))step();
    const fade=P.job.done?sm(.35,.8,Space.f.stars):0,g=P.g;g.position.set(0,0,0);g.visible=fade>.002;   // appears as the stars come out (the sky is dark enough for a world to hang in it)
    if(g.visible&&typeof camera!=='undefined'){
      place(camera.position,_o);
      for(const m of [P.body,P.cloud,P.atm]){m.position.set(_o.x,_o.y,_o.z);m.scale.setScalar(_o.s)}   // the shells' radii (1.012 / 1.11) are in their geometry
      P.body.rotation.y=t*.0014;P.cloud.rotation.y=t*.0021;
      const op=fade;P.body.material.opacity=op;P.body.material.transparent=op<.999;P.cloud.material.opacity=op;P.atm.material.uniforms.k.value=op}
    hold(S)}
  // never inside the planet: pushed straight out to HOVER metres above the surface
  function hold(p){
    const dx=p.x-C[0],dy=p.y-C[1],dz=p.z-C[2],d=Math.hypot(dx,dy,dz),min=R+HOVER;
    if(d<min){const k=d>1e-6?min/d:0;if(k){p.x=C[0]+dx*k;p.y=C[1]+dy*k;p.z=C[2]+dz*k}else p.y=C[1]+min;return true}
    return false}
  SpaceObjects.register({id:'planet',name:'A second world',pos:C,r:R,assist:[4000,120000],findR:150000,always:true,noBeacon:true,icon:'🪐',build,update,
    found:{text:'Found another world, far from home',banner:'Another world. Nobody has been here.'}});
  return {C,R,IMP_D,HOVER,W,H,surface,clouds,surfaceRows,cloudRows,place,hold,step,get parts(){return P}};
})();
if(typeof module!=='undefined')module.exports=SpacePlanet;
