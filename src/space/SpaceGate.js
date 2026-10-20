// SpaceGate: a ring standing in the clearing at the heart of the asteroid belt, facing the second world. Three arcs of dark metal with gaps where it has failed, a thin
// cyan inlay, a faint shimmer across it, and two tall posts inside it, ~92 m apart. Looking through the ring you see the planet.
// It does nothing for one person. When two players stand at the two posts at the same moment, and hold it for a few seconds, it wakes: the inlay and the posts light, the
// shimmer fills the ring and a thin column of light runs from it toward the planet. That is built on Link.both (src/interaction/Link.js): both phones derive it from the
// two avatars' positions, so there is no new network traffic, and each one writes the same idempotent journal entry (SpaceEvents.discover('gate_awake')) so it stays awake for good.
// Alone at a post you get one quiet line after a few seconds telling you it wants someone at the other. Found like everything else out here: get close, look at it.
// Globals used: THREE, S, SpaceObjects, SpaceEvents, SpaceMap, Link (lazily: the world builds before anything is tied to it).
const SpaceGate=(()=>{
  const M=SpaceMap,POS=M.belt.pos,RING=75,POST_X=46,POST_R=26,HOLD_MS=3000;
  let awake=false,obj=null,link=null,hint=0,hinted=false,parts=null,glowT=0;
  const zones=[];                                                     // world positions of the two posts (filled when built)
  function glowTexture(){const n=64,d=new Uint8Array(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const r=Math.hypot(x-n/2+.5,y-n/2+.5)/(n/2),a=Math.max(0,1-r);const i=(y*n+x)*4;d[i]=150;d[i+1]=235;d[i+2]=255;d[i+3]=Math.round(255*Math.pow(a,1.6)*(r>.97?0:1))}
    const t=new THREE.DataTexture(d,n,n,THREE.RGBAFormat);t.needsUpdate=true;t.magFilter=t.minFilter=THREE.LinearFilter;return t}
  function build(o){
    obj=o;const g=new THREE.Group(),MAT=(c,m,r)=>new THREE.MeshStandardMaterial({color:c,metalness:m,roughness:r,flatShading:true});
    const stone=MAT('#59616d',.55,.5),dark=MAT('#2b3038',.4,.65),CY='#7fe8ff';
    // ring: three arcs with gaps
    for(const [a0,len] of [[.15,2.0],[2.55,1.85],[4.85,1.3]]){
      const arc=new THREE.Mesh(new THREE.TorusGeometry(RING,3.6,8,Math.max(6,Math.round(len*8)),len),stone);arc.rotation.z=a0;g.add(arc);
      const cap=(ang,s)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(8.2,8.2,8.2),dark);m.position.set(Math.cos(ang)*RING,Math.sin(ang)*RING,0);m.rotation.set(.3*s,.2,ang);g.add(m)};cap(a0,1);cap(a0+len,-1)}   // blocky end caps: broken, not cut
    // inlay along the ring (a thin full circle, mostly hidden until it wakes)
    const inlay=new THREE.Mesh(new THREE.TorusGeometry(RING-2.6,.42,5,72),new THREE.MeshBasicMaterial({color:CY,transparent:true,opacity:.25,fog:false,depthWrite:false,blending:THREE.AdditiveBlending}));g.add(inlay);
    const disc=new THREE.Mesh(new THREE.CircleGeometry(RING-3,40),new THREE.MeshBasicMaterial({map:glowTexture(),transparent:true,opacity:0,fog:false,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));g.add(disc);
    // the two posts
    const posts=[];
    for(const sx of [-1,1]){
      const p=new THREE.Group();p.position.set(sx*POST_X,-14,-3);p.scale.setScalar(1.6);   // big enough to read from the far side of the ring
      const base=new THREE.Mesh(new THREE.CylinderGeometry(3.4,5.2,5,7),dark);base.position.y=-2.5;p.add(base);
      const col=new THREE.Mesh(new THREE.CylinderGeometry(1.5,2.3,17,6),stone);col.position.y=9;p.add(col);
      const capMat=new THREE.MeshBasicMaterial({color:CY,fog:false}),cap=new THREE.Mesh(new THREE.OctahedronGeometry(2.6,0),capMat);cap.position.y=21;p.add(cap);
      const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:CY,transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,toneMapped:false}));halo.position.y=21;halo.scale.set(26,26,1);p.add(halo);
      g.add(p);posts.push({g:p,cap,capMat,halo})}
    // the column of light toward the planet (+Z is the gate's axis)
    const BL=30000,beam=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.3,BL,8,1,true),new THREE.MeshBasicMaterial({color:CY,transparent:true,opacity:.4,fog:false,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    beam.rotation.x=Math.PI/2;beam.position.z=BL/2+RING;beam.visible=false;g.add(beam);
    parts={g,inlay,disc,posts,beam};
    // face the planet; then the posts' world positions are known (the object's position is set here as well, SpaceObjects sets the same one)
    g.position.set(POS[0],POS[1],POS[2]);g.lookAt(M.planet.pos[0],M.planet.pos[1],M.planet.pos[2]);g.updateMatrixWorld(true);
    zones.length=0;for(const p of posts){const w=new THREE.Vector3(0,12,0);p.g.localToWorld(w);zones.push({x:w.x,y:w.y,z:w.z,r:POST_R,dy:POST_R})}
    awake=typeof SpaceEvents!=='undefined'&&SpaceEvents.isFound('gate_awake');
    if(!awake&&typeof Link!=='undefined')arm();
    paint(awake?1:0,[null,null]);
    return g}
  function arm(){
    if(link||typeof Link==='undefined')return;
    link=Link.both({zones,holdMs:HOLD_MS,onProgress:(p,occ,dt)=>progress(p,occ,dt),onDone:()=>wake()})}
  // p = hold progress 0..1, occ = who stands at each post ('me' | 'them' | null)
  function progress(p,occ,dt){
    if(awake)return;
    const mine=occ.some(x=>x==='me'),both=occ.every(Boolean);
    hint=mine&&!both?hint+dt:0;
    if(hint>5&&!hinted){hinted=true;if(typeof banner==='function')banner('It hums. It wants someone at the other post.','THE RING')}
    paint(p,occ)}
  function paint(p,occ){
    if(!parts)return;
    const lit=awake?1:p;
    parts.inlay.material.opacity=.22+.78*lit;parts.disc.material.opacity=awake?.5:.32*p;
    parts.posts.forEach((q,i)=>{const on=awake||(occ&&occ[i]);const k=awake?1:on?.55+.45*p:.18;q.capMat.color.set('#7fe8ff').multiplyScalar(k);q.halo.material.opacity=.12+.6*k})
    parts.beam.visible=awake}
  function wake(){
    awake=true;paint(1,[null,null]);
    if(typeof SpaceEvents!=='undefined'&&SpaceEvents.discover('gate_awake',{text:'The ring woke when two of us stood at its posts',icon:'⭕',x:Math.round(POS[0]),y:Math.round(POS[1]),z:Math.round(POS[2])})){
      if(typeof banner==='function')banner('The ring wakes. A light runs out across the dark.','THE RING');
      try{if(typeof WAudio!=='undefined'){const a=WAudio.get();if(a){const t=a.currentTime;for(const [f,v] of [[130.8,.08],[196,.06],[261.6,.05]]){const o=a.createOscillator(),gn=a.createGain();o.type='sine';o.frequency.value=f;o.connect(gn);gn.connect(WAudio.out());gn.gain.setValueAtTime(0,t);gn.gain.linearRampToValueAtTime(v,t+.4);gn.gain.exponentialRampToValueAtTime(.0001,t+3.2);o.start(t);o.stop(t+3.3)}}}}catch(e){}}}
  function update(o,dt,t){
    if(!parts)return;
    const ph=t*.35;parts.disc.rotation.z=ph*.2;
    if(awake){const f=.75+.25*Math.sin(t*1.7);parts.beam.material.opacity=.3+.2*f;parts.inlay.material.opacity=.7+.3*Math.sin(t*1.1)*.5+.15}
    else for(const q of parts.posts)q.cap.rotation.y+=dt*.6;
    for(const q of parts.posts)q.cap.rotation.y+=dt*.8}
  SpaceObjects.register({id:'gate',name:'The ring',pos:POS,r:RING,icon:'⭕',build,update,
    found:{text:'Found a ring standing in a clearing in the asteroids, with two posts inside it',banner:'A ring, standing in the rock. Two posts. It faces something far away.'}});
  return {zones,HOLD_MS,RING,POST_X,get awake(){return awake},get parts(){return parts},wake,progress,arm};
})();
if(typeof module!=='undefined')module.exports=SpaceGate;
