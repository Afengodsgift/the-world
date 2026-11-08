// TIDAL RUINS: the drowned city site on the Warden Isles (site id 'tidal'). A dark teal sea rises and falls inside the ruins on a fixed 40 s clock.
//   ebb  (0-14 s)   dry stone: the Drowned King is sluggish
//   rise (14-20 s)  the water climbs
//   high (20-34 s)  ankle-deep: you wade slower, the King is faster and hits harder
//   fall (34-40 s)  the water drains
// The clock is Date.now() so every player (and the host-run boss) sees the same tide; it only nudges speeds, never hit rules. Pure maths up top (testable), THREE scenery below.
// Globals used (browser only, inside build): THREE, scene, WRD, WARDEN, H.
const TidalRuins=(()=>{
  const CYC=40,T_RISE=14,T_HIGH=20,T_FALL=34,WARN=3;
  const ss=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  // water level 0..1 at clock time ms
  function level(ms){const t=((ms/1000)%CYC+CYC)%CYC;if(t<T_RISE)return 0;if(t<T_HIGH)return ss(T_RISE,T_HIGH,t);if(t<T_FALL)return 1;return 1-ss(T_FALL,CYC,t)}
  const high=ms=>level(ms)>.6, ebb=ms=>level(ms)<.15;
  // boss tempo/damage multiplier: sluggish at ebb, empowered at high tide
  const bossMul=ms=>{const l=level(ms);return l>.6?1.15:l<.15?.9:1};
  // player wading speed multiplier
  const wade=ms=>1-.18*level(ms);
  // which event (if any) lies between two clock times: 'warnRise','rise','warnFall','fall'
  function event(a,b){const W=[[T_RISE-WARN,'warnRise'],[T_RISE+1.5,'rise'],[T_FALL-WARN,'warnFall'],[T_FALL+1.5,'fall']],C=CYC*1000;
    for(let k=Math.floor(a/C);k<=Math.floor(b/C);k++)for(const[w,n]of W){const tt=k*C+w*1000;if(tt>a&&tt<=b)return n}return null}
  const MSG={warnRise:'THE TIDE STIRS...',rise:'THE TIDE RISES',warnFall:'THE WATER SHUDDERS...',fall:'THE TIDE FALLS: STRIKE NOW'};
  let G=null,water=null,mist=null,lamps=[],site=null,last=0;
  function build(){
    if(G||typeof THREE==='undefined'||typeof WARDEN==='undefined')return;site=WARDEN.sites.find(s=>s.id==='tidal');if(!site)return;
    G=new THREE.Group();G.name='TidalRuins';scene.add(G);const cx=WRD.x+site.x,cz=WRD.z+site.z,R=site.R,y0=site.y;
    const stone=new THREE.MeshStandardMaterial({color:'#2c3a3d',roughness:1,flatShading:true}),moss=new THREE.MeshStandardMaterial({color:'#1d2f2a',roughness:1,flatShading:true});
    let s=7;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647};   // fixed seed: same ruins for everyone
    // broken pillars ringed round the fight circle
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2+rnd()*.2,d=R-1.5+rnd()*5,h=2+rnd()*5,r=.6+rnd()*.35;
      const m=new THREE.Mesh(new THREE.CylinderGeometry(r*.85,r,h,7),i%3?stone:moss);m.position.set(cx+Math.sin(a)*d,y0+h/2-.4,cz+Math.cos(a)*d);m.rotation.z=(rnd()-.5)*.14;m.rotation.x=(rnd()-.5)*.14;G.add(m);
      const cap=new THREE.Mesh(new THREE.BoxGeometry(r*2.3,.45,r*2.3),stone);cap.position.set(m.position.x,y0+h-.2,m.position.z);cap.rotation.y=rnd();if(rnd()<.6)G.add(cap)}
    // two drowned arches
    for(const[a,d]of[[.6,R+3],[3.5,R+4]]){const bx=cx+Math.sin(a)*d,bz=cz+Math.cos(a)*d,nx=Math.cos(a),nz=-Math.sin(a);
      for(const sg of[-1,1]){const l=new THREE.Mesh(new THREE.BoxGeometry(1.3,7,1.3),stone);l.position.set(bx+nx*3.2*sg,y0+3,bz+nz*3.2*sg);G.add(l)}
      const t=new THREE.Mesh(new THREE.BoxGeometry(8.4,1.2,1.5),stone);t.position.set(bx,y0+6.8,bz);t.rotation.y=Math.atan2(nx,nz)+Math.PI/2;G.add(t)}
    // rubble
    for(let i=0;i<22;i++){const a=rnd()*Math.PI*2,d=4+rnd()*(R-2),sz=.4+rnd()*.9;const m=new THREE.Mesh(new THREE.BoxGeometry(sz*1.6,sz*.7,sz),i%4?stone:moss);m.position.set(cx+Math.sin(a)*d,y0-.1+sz*.15,cz+Math.cos(a)*d);m.rotation.set(rnd()*.5,rnd()*6,rnd()*.5);G.add(m)}
    // the sea itself + a pale mist skin riding just above it
    water=new THREE.Mesh(new THREE.CircleGeometry(R+12,40),new THREE.MeshBasicMaterial({color:'#0a2b30',transparent:true,opacity:.78,depthWrite:false}));water.rotation.x=-Math.PI/2;water.position.set(cx,y0-.6,cz);water.renderOrder=3;water.frustumCulled=false;G.add(water);
    mist=new THREE.Mesh(new THREE.CircleGeometry(R+12,40),new THREE.MeshBasicMaterial({color:'#7fd6c8',transparent:true,opacity:.12,depthWrite:false,blending:THREE.AdditiveBlending}));mist.rotation.x=-Math.PI/2;mist.position.set(cx,y0-.55,cz);mist.renderOrder=4;mist.frustumCulled=false;G.add(mist);
    // drowned lanterns drifting over the water
    const lm=new THREE.MeshBasicMaterial({color:'#8fffe6',fog:false});
    for(let i=0;i<7;i++){const a=i/7*Math.PI*2,d=R*.55;const m=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),lm);m.userData={a,d,ph:rnd()*6};m.position.set(cx+Math.sin(a)*d,y0+1.4,cz+Math.cos(a)*d);G.add(m);lamps.push(m)}}
  // per-frame: tide height + lantern drift (cheap, skipped when you are far away)
  function tick(dt,ms){
    if(!G)return;const d=Math.hypot(S.x-(WRD.x+site.x),S.z-(WRD.z+site.z));G.visible=d<site.R+260;if(!G.visible)return;
    const l=level(ms),wob=Math.sin(ms/700)*.04;water.position.y=site.y-.6+l*1.15+wob;mist.position.y=water.position.y+.05;mist.material.opacity=.09+.1*l;
    for(const m of lamps){const u=m.userData;m.position.y=site.y+1.2+Math.sin(ms/900+u.ph)*.35+l*.5;const a=u.a+ms/9000;m.position.x=WRD.x+site.x+Math.sin(a)*u.d;m.position.z=WRD.z+site.z+Math.cos(a)*u.d}}
  return{CYC,level,high,ebb,bossMul,wade,event,MSG,build,tick,_g:()=>G}})();
