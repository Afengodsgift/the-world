// BattleFX: the "heat" of a gunfight. Everything here is a cheap, pooled, fire-and-forget effect that is driven by the SAME events both players already receive
// (tracers of shots, impacts, snapshots), so a partner sees exactly what you see:  muzzle light + smoke + ejected brass, bullet impacts (dust / sparks / chips), body hit puffs.
//   BattleFX.init({scene,fx,H,rnd}) once;  BattleFX.shot(ax,ay,az,dx,dy,dz,big)  BattleFX.impact(x,y,z,kind)  BattleFX.hit(x,y,z,heavy)  BattleFX.tick(dt)
// kinds: 'dirt' | 'wood' | 'spark' | 'flesh'. All limits are hard caps so a minigun cannot flood the scene.
const BattleFX=(()=>{
  let C=null,light=null,lightT=0,smokeTex=null,n=0;const MAXP=70;
  const KIND={dirt:{c:'#b89a6a',s:'#d8c49a',up:2.2},wood:{c:'#8a6238',s:'#e0c080',up:2.6},spark:{c:'#ffd070',s:'#fff2b0',up:3.2},flesh:{c:'#b02828',s:'#d85050',up:2.4}};
  function init(o){C=o;const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,2,32,32,30);r.addColorStop(0,'rgba(255,255,255,.9)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);
    smokeTex=new THREE.CanvasTexture(c);
    // no real PointLight any more: ONE extra scene light makes every lit material in the world pay for it in every pixel (a big cost on phones); the muzzle-flash sprites carry the flash instead
    light=null}
  const ok=()=>C&&n<MAXP;
  // shared debris geometry/materials (no allocation per bullet) and a distance gate: effects far from the camera are invisible anyway
  let DG=null;const DM={};
  const dgeo=()=>DG||(DG=new THREE.BoxGeometry(.045,.045,.045));
  const dmat=c=>DM[c]||(DM[c]=new THREE.MeshBasicMaterial({color:c}));
  let BG=null,BMt=null;
  const near=(x,y,z,r)=>{try{const p=camera.position;return Math.abs(p.x-x)<r&&Math.abs(p.z-z)<r}catch(e){return true}};
  function puff(x,y,z,col,sz,life,vy,op){if(!ok())return;const m=new THREE.SpriteMaterial({map:smokeTex,color:col,transparent:true,opacity:op||.5,depthWrite:false}),s=new THREE.Sprite(m);s.scale.setScalar(sz);s.position.set(x,y,z);C.scene.add(s);n++;
    P.push({s,m,t:life,l:life,vy:vy||.8,gr:sz*.9})}
  const P=[],B=[];
  // a shot leaves the barrel: light flicker, a wisp of smoke, brass out of the ejection port (player-sized guns only: big=true for minigun / rocket)
  function shot(ax,ay,az,dx,dy,dz,big){if(!C||!near(ax,ay,az,55))return;
    if(light){light.position.set(ax+dx*.6,ay+dy*.6+.1,az+dz*.6);light.intensity=big?5:3.2;lightT=.07}
    puff(ax+dx*.5,ay+dy*.5,az+dz*.5,'#cfcfcf',big?.9:.55,big?1.1:.8,.6,.35);
    if(ok()&&near(ax,ay,az,22)&&Math.random()<(big?.35:.5)){const m=new THREE.Mesh(BG||(BG=new THREE.BoxGeometry(.03,.03,.09)),BMt||(BMt=new THREE.MeshBasicMaterial({color:'#d8a838'})));m.position.set(ax,ay,az);C.scene.add(m);n++;
      const rx=-dz,rz=dx,l=Math.hypot(rx,rz)||1;B.push({m,t:.9,v:[rx/l*(2+Math.random()*1.5),2+Math.random()*1.5,rz/l*(2+Math.random()*1.5)],sp:[Math.random()*20,Math.random()*20,Math.random()*20]})}}
  // a bullet strikes the world
  function impact(x,y,z,kind){if(!C||!near(x,y,z,45))return;const K=KIND[kind]||KIND.dirt;puff(x,y+.1,z,K.c,kind==='spark'?.5:.9,.7,K.up*.25,.55);
    const k=kind==='flesh'?3:5;for(let i=0;i<k&&ok();i++){const m=new THREE.Mesh(dgeo(),dmat(i%2?K.c:K.s));m.position.set(x,y,z);C.scene.add(m);n++;
      B.push({m,t:.45,v:[(Math.random()-.5)*4,K.up*(.5+Math.random()),(Math.random()-.5)*4],sp:[0,0,0]})}}
  const hit=(x,y,z,heavy)=>impact(x,y,z,'flesh');
  function tick(dt){
    if(light&&lightT>0){lightT-=dt;if(lightT<=0){light.intensity=0;light.position.y=-50}else light.intensity*=Math.exp(-14*dt)}
    for(let i=P.length-1;i>=0;i--){const p=P[i];p.t-=dt;const u=1-p.t/p.l;p.s.position.y+=p.vy*dt;p.s.scale.setScalar(p.s.scale.x+p.gr*dt);p.m.opacity=Math.max(0,p.m.opacity*(1-dt*2.2));
      if(p.t<=0){C.scene.remove(p.s);p.m.dispose();P.splice(i,1);n--}}
    for(let i=B.length-1;i>=0;i--){const b=B[i];b.t-=dt;b.v[1]-=11*dt;b.m.position.x+=b.v[0]*dt;b.m.position.y+=b.v[1]*dt;b.m.position.z+=b.v[2]*dt;b.m.rotation.x+=b.sp[0]*dt;b.m.rotation.y+=b.sp[1]*dt;
      if(b.m.position.y<C.H(b.m.position.x,b.m.position.z)+.03){b.v[1]*=-.3;b.v[0]*=.5;b.v[2]*=.5;b.m.position.y=C.H(b.m.position.x,b.m.position.z)+.03}
      if(b.t<=0){C.scene.remove(b.m);B.splice(i,1);n--}}}
  return {init,shot,impact,hit,tick,get count(){return n}};
})();
