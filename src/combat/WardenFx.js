// WARDEN: draws the sim's effects (CombatCore C.fx events 'fx' / 'fxburst' / 'fxend'): travelling bolts/orbs and ground telegraphs for area bursts.
// Bounded: a fixed pool (POOL projectiles + POOL rings), nothing is allocated per effect, and everything is hidden on clear(). The sim owns the truth (who gets hit); this only mirrors it,
// so a projectile moves at the same speed the sim uses (spd m/tick = spd*60 m/s) and disappears on the sim's 'fxend'.
// A ground ring is the TELL for an area move: it fades in over the sim's `delay` ticks (you can read it and leave), flashes on the burst, then fades out.
// Globals used: THREE, scene, H.
const WardenFx=(()=>{
  const POOL=6,TICK=1/60;
  let G=null,proj=[],ring=[],live={};
  function build(){
    if(G)return;G=new THREE.Group();G.name='WardenFx';scene.add(G);
    const sph=new THREE.SphereGeometry(.34,10,8),disc=new THREE.CircleGeometry(1,28),rim=new THREE.RingGeometry(.8,1,36),col=new THREE.CylinderGeometry(1,1,5,24,1,true);
    const mb=(c,o)=>new THREE.MeshBasicMaterial(Object.assign({color:c,transparent:true,depthWrite:false,fog:false},o||{}));
    for(let i=0;i<POOL;i++){
      const core=new THREE.Mesh(sph,mb('#fff4c0')),halo=new THREE.Mesh(sph,mb('#ff3a12',{opacity:.7,blending:THREE.AdditiveBlending,depthTest:false}));halo.scale.setScalar(3);halo.renderOrder=9;
      const shd=new THREE.Mesh(disc,mb('#ff2a1a',{opacity:.55,depthTest:false}));shd.rotation.x=-Math.PI/2;shd.scale.setScalar(.9);shd.renderOrder=8;
      const g=new THREE.Group();g.add(halo);g.add(core);g.add(shd);g.visible=false;g.frustumCulled=false;G.add(g);proj.push({g,core,halo,shd,id:0,x:0,z:0,dx:0,dz:0,v:0,t:0});
      const d=new THREE.Mesh(disc,mb('#ff1e12',{opacity:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})),r=new THREE.Mesh(rim,mb('#ffd24a',{opacity:0,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
      d.rotation.x=r.rotation.x=-Math.PI/2;const rg=new THREE.Group();const c=new THREE.Mesh(col,mb('#ff4a1a',{opacity:0,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));c.position.y=2.5;rg.add(d);rg.add(r);rg.add(c);rg.visible=false;rg.frustumCulled=false;G.add(rg);ring.push({g:rg,d,r,c,id:0,R:1,delay:0,t:0,burst:-1,end:-1})}}
  const free=a=>a.find(o=>!o.g.visible);
  function event(e){
    if(!G)return;
    if(e.t==='fx'){
      if(e.k==='proj'){const p=free(proj)||proj[0];p.id=e.fid;p.x=e.x;p.z=e.z;p.dx=e.dx;p.dz=e.dz;p.v=(e.spd||.25)/TICK;p.t=0;p.g.visible=true;p.g.scale.setScalar(Math.max(1.5,(e.r||.5)/.5*1.5));live[e.fid]=p}
      else{const r=free(ring)||ring[0];r.id=e.fid;r.R=e.r||2;r.delay=Math.max(1,e.delay||1)*TICK;r.t=0;r.burst=-1;r.end=-1;r.g.position.set(e.x,H(e.x,e.z)+.12,e.z);r.d.scale.setScalar(r.R);r.r.scale.setScalar(r.R);r.c.scale.set(r.R,1,r.R);r.c.material.opacity=0;r.g.visible=true;live[e.fid]=r}}
    else if(e.t==='fxburst'){const r=live[e.fid];if(r&&r.R!==undefined&&r.d)r.burst=r.t}
    else if(e.t==='fxend'){const o=live[e.fid];if(!o)return;if(o.d){o.end=o.t}else o.g.visible=false;delete live[e.fid]}}
  function update(dt){
    if(!G)return;
    for(const p of proj){if(!p.g.visible)continue;p.t+=dt;p.x+=p.dx*p.v*dt;p.z+=p.dz*p.v*dt;const gy=H(p.x,p.z);p.g.position.set(p.x,gy+1.3,p.z);p.shd.position.y=-1.15;const k=1+.15*Math.sin(p.t*30);p.halo.scale.setScalar(1.8*k);if(p.t>6)p.g.visible=false}
    for(const r of ring){if(!r.g.visible)continue;r.t+=dt;
      if(r.burst<0&&r.end<0){const u=Math.min(1,r.t/r.delay);r.d.material.opacity=.22+.3*u*u;r.r.material.opacity=.6+.4*u*(.6+.4*Math.sin(r.t*18));r.c.material.opacity=.12*u}
      else if(r.end<0){const u=Math.min(1,(r.t-r.burst)/.2);r.d.material.opacity=.85*(1-u*.3);r.r.material.opacity=1;r.c.material.opacity=.6*(1-u)}
      else{const u=(r.t-r.end)/.3;if(u>=1){r.g.visible=false;continue}r.d.material.opacity=.5*(1-u);r.r.material.opacity=1-u;r.c.material.opacity=0}}}
  function clear(){live={};for(const p of proj)p.g.visible=false;for(const r of ring)r.g.visible=false}
  return{build,event,update,clear,_t:()=>({proj,ring,live,G})}})();
if(typeof module!=='undefined')module.exports=WardenFx;
