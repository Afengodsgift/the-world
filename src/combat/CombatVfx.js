// WARDEN combat VFX. Slash trails + hit sparks for melee.
// Fixed pool of billboards (no per-hit alloc). Optionally loads Cethiel-style
// spritesheets from assets/warden/vfx/slash/. Without files, draws additive geometric arcs.
// Globals: THREE, scene, H (optional ground height).
const CombatVfx=(()=>{
  const POOL_S=8,POOL_K=10,BASE='assets/warden/vfx/';
  let G=null,slashes=[],sparks=[],sheet=null,ready=false;

  function ground(x,z){return typeof H==='function'?H(x,z):0}

  function build(){
    if(G)return;G=new THREE.Group();G.name='CombatVfx';G.frustumCulled=false;scene.add(G);
    const geo=new THREE.PlaneGeometry(2.4,0.55);
    for(let i=0;i<POOL_S;i++){
      const mat=new THREE.MeshBasicMaterial({color:0xffe8a0,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false});
      const m=new THREE.Mesh(geo,mat);m.visible=false;m.renderOrder=20;G.add(m);
      slashes.push({m,mat,t:0,life:.28,face:0});
    }
    const sph=new THREE.SphereGeometry(.12,6,5);
    for(let i=0;i<POOL_K;i++){
      const mat=new THREE.MeshBasicMaterial({color:0xfff2c0,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
      const m=new THREE.Mesh(sph,mat);m.visible=false;m.renderOrder=21;G.add(m);
      sparks.push({m,mat,t:0,life:.18,vx:0,vy:0,vz:0});
    }
    try{
      const loader=new THREE.TextureLoader();
      loader.load(BASE+'slash/Classic/1/Classic_01.png',tex=>{sheet=tex;tex.colorSpace=THREE.SRGBColorSpace;for(const s of slashes){s.mat.map=tex;s.mat.needsUpdate=true}},undefined,()=>{});
    }catch(e){}
    ready=true;
  }

  function free(arr){for(const o of arr)if(!o.m.visible)return o;return arr[0]}

  function slash(x,y,z,face,kind){
    if(!G)build();const s=free(slashes);if(!s)return;
    const heavy=kind==='heavy'||kind==='finisher';
    s.t=0;s.life=heavy?.38:.26;s.face=face||0;
    const gy=(y!=null?y:ground(x,z)+1.2);
    s.m.position.set(x+Math.sin(face)*0.9,gy,z+Math.cos(face)*0.9);
    s.m.rotation.set(0,face,heavy?0.15:0.35);
    s.m.scale.set(heavy?1.6:1.15,heavy?1.3:1,1);
    s.mat.color.setHex(heavy?0xffc070:0xffe8a0);
    s.mat.opacity=0.95;s.m.visible=true;
  }

  function spark(x,y,z,n){
    if(!G)build();n=n||4;
    for(let i=0;i<n;i++){
      const s=free(sparks);if(!s)break;
      s.t=0;s.life=.14+Math.random()*.1;
      const gy=(y!=null?y:ground(x,z)+1.15);
      s.m.position.set(x,gy,z);
      const a=Math.random()*Math.PI*2,sp=.8+Math.random()*1.6;
      s.vx=Math.cos(a)*sp;s.vy=1.2+Math.random()*2;s.vz=Math.sin(a)*sp;
      s.mat.opacity=1;s.m.scale.setScalar(.7+Math.random()*.6);s.m.visible=true;
    }
  }

  function event(e,pos){
    if(!e||!e.t)return;
    const p=pos||{};
    if(e.t==='start'){
      const heavy=e.move==='heavy';
      slash(p.x||0,p.y,p.z||0,p.face||0,heavy?'heavy':'light');
    }else if(e.t==='hit'||e.t==='block'||e.t==='deflect'){
      spark(p.x||0,p.y,p.z||0,e.t==='deflect'?6:e.t==='hit'?5:3);
    }else if(e.t==='posturebreak'||e.t==='guardbreak'){
      spark(p.x||0,p.y,p.z||0,8);
    }
  }

  function update(dt){
    if(!G)return;
    for(const s of slashes){
      if(!s.m.visible)continue;s.t+=dt;const u=s.t/s.life;
      if(u>=1){s.m.visible=false;continue}
      s.mat.opacity=0.95*(1-u)*(1-u);
      s.m.scale.x*=1+dt*1.8;s.m.scale.y*=1-dt*.6;
    }
    for(const s of sparks){
      if(!s.m.visible)continue;s.t+=dt;const u=s.t/s.life;
      if(u>=1){s.m.visible=false;continue}
      s.m.position.x+=s.vx*dt;s.m.position.y+=s.vy*dt;s.m.position.z+=s.vz*dt;s.vy-=9*dt;
      s.mat.opacity=1-u;s.m.scale.multiplyScalar(1-dt*.8);
    }
  }

  function clear(){for(const s of slashes)s.m.visible=false;for(const s of sparks)s.m.visible=false}
  return{build,slash,spark,event,update,clear}})();
if(typeof module!=='undefined')module.exports=CombatVfx;
