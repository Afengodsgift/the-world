// Ambient fish schools + shark patrol/chase/bite + rare dolphin/manta-ray sightings.
// Self-contained: reads rng/ISL/H/AURL/THREE/S (already global by call time) and calls
// banner()/onSmacked() which are defined later in index.html — same forward-reference
// pattern as every other extracted module. buildSeaLife() is called once from
// buildWorld(); seaTick(dt,t) is called once per frame from tick().
const FISH_TYPES=['Fish1','Fish2','Fish3'],FISH_LEN={Fish1:.42,Fish2:.4,Fish3:.4},FISH_RAW={Fish1:3.19,Fish2:1.97,Fish3:1.58};
let seaP,seaBufs={},sharkClip,sharks=[],fishState=[],fishInst={},specials=[],_fdum=new THREE.Object3D();
function loadSea(){
  if(!seaP)seaP=(async()=>{if(!THREE.GLTFLoader)throw new Error('no loader');
    for(const t of [...FISH_TYPES,'Shark','Dolphin','Manta_ray'])seaBufs[t]=await(await fetch(AURL+(t==='Shark'?'shark.glb':'fish_'+t+'.glb'))).arrayBuffer();
  })();
  return seaP;
}
function buildSeaLife(){
  const findWater=(I,deep)=>{for(let i=0;i<60;i++){const a=rng()*6.283,r=I.R*(.75+rng()*.7),x=I.x+Math.cos(a)*r,z=I.z+Math.sin(a)*r,h=H(x,z);
    if(h<(deep?-1.6:-.15)&&h>-3.2)return {x,z}}return null};
  const zones=[{x:0,z:0,R:180},...ISL],clusters=[];
  for(let a=0;a<10;a++){const ang=a/10*6.283,r=45+rng()*70,x=Math.cos(ang)*r,z=185+Math.sin(ang)*r*.4,h=H(x,z);
    if(h<-.15&&h>-3.2)clusters.push({x,z})}
  for(const I of zones)for(let s=0;s<12;s++){const pt=findWater(I,false);if(pt)clusters.push(pt)}
  let fi=0;
  for(const pt of clusters){const n=6+(rng()*6|0),cy=Math.max(-2.6,H(pt.x,pt.z)*.4-.6-rng()*.9),rad=3+rng()*4,speed=.5+rng()*.4;
    for(let i=0;i<n;i++){fishState.push({type:FISH_TYPES[fi++%3],cx:pt.x,cz:pt.z,cy,rad,speed,ph:rng()*6.283,off:rng()*6.283,rOff:.7+rng()*.6,yOff:(rng()-.5)*1.1})}}
  loadSea().then(async()=>{
    const gl=new THREE.GLTFLoader(),parse=buf=>new Promise((res,rej)=>gl.parse(buf.slice(0),AURL,res,rej));
    for(const t of FISH_TYPES){const r=await parse(seaBufs[t]);let geo,mat;
      r.scene.traverse(o=>{if(o.isSkinnedMesh&&!geo){geo=o.geometry;mat=o.material.clone();mat.skinning=false}});
      if(!geo)continue;const im=new THREE.InstancedMesh(geo,mat,300);im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);im.count=0;im.frustumCulled=false;scene.add(im);
      fishInst[t]={im,scale:FISH_LEN[t]/FISH_RAW[t]};
    }
    const shr=await parse(seaBufs.Shark);sharkClip=shr.animations[0];
    for(const I of zones)for(let tries=0;tries<2;tries++){const pt=findWater(I,true);if(!pt)continue;
      const m=shr.scene.clone(true),sc=.32+rng()*.14;m.scale.setScalar(sc);m.traverse(c=>{if(c.isMesh)c.castShadow=true});scene.add(m);
      const mx=new THREE.AnimationMixer(m),act=mx.clipAction(sharkClip);act.play();
      sharks.push({m,mx,act,cx:pt.x,cz:pt.z,cy:H(pt.x,pt.z)-1.2-rng()*1,rad:10+rng()*10,ang:rng()*6.283,speed:.35,state:'patrol',bitAt:-9999});
    }
    const dol=await parse(seaBufs.Dolphin),man=await parse(seaBufs.Manta_ray);
    const specDefs=[{r:dol,clip:dol.animations[0],len:2,raw:9.27,n:2},{r:man,clip:man.animations[0],len:2.6,raw:11.73,n:1}];
    for(const d of specDefs)for(const I of zones){if(rng()>.4)continue;const pt=findWater(I,true);if(!pt)continue;
      const m=d.r.scene.clone(true);m.scale.setScalar(d.len/d.raw);m.traverse(c=>{if(c.isMesh)c.castShadow=true});scene.add(m);
      const mx=new THREE.AnimationMixer(m),act=mx.clipAction(d.clip);act.play();
      specials.push({m,mx,act,cx:pt.x,cz:pt.z,cy:H(pt.x,pt.z)-2-rng()*1.5,rad:12+rng()*10,ang:rng()*6.283,speed:.18+rng()*.08});
    }
  }).catch(()=>{});
}
function seaTick(dt,t){
  const cnt={};FISH_TYPES.forEach(k=>cnt[k]=0);
  for(const f of fishState){f.ph+=dt*f.speed;const a=f.ph+f.off,r=f.rad*f.rOff,inst=fishInst[f.type];if(!inst)continue;
    const x=f.cx+Math.cos(a)*r,z=f.cz+Math.sin(a)*r,y=f.cy+f.yOff+Math.sin(t/600+f.off)*.25;
    _fdum.position.set(x,y,z);_fdum.lookAt(f.cx+Math.cos(a+.25)*r,y,f.cz+Math.sin(a+.25)*r);_fdum.scale.setScalar(inst.scale);_fdum.updateMatrix();
    const idx=cnt[f.type]++;if(idx<inst.im.count||idx<300)inst.im.setMatrixAt(idx,_fdum.matrix);}
  for(const t2 in fishInst){fishInst[t2].im.count=Math.min(cnt[t2],300);fishInst[t2].im.instanceMatrix.needsUpdate=true}
  for(const s of specials){s.ang+=dt*s.speed*.25;const tx=s.cx+Math.cos(s.ang)*s.rad,tz=s.cz+Math.sin(s.ang)*s.rad;
    const ddx=tx-s.m.position.x,ddz=tz-s.m.position.z,dd=Math.hypot(ddx,ddz)||1;
    s.m.position.x+=ddx/dd*Math.min(2.2*dt,dd);s.m.position.z+=ddz/dd*Math.min(2.2*dt,dd);s.m.position.y+=(s.cy-s.m.position.y)*Math.min(1,dt*1.2);
    s.m.rotation.y=lerpAngle(s.m.rotation.y,Math.atan2(ddx,ddz),Math.min(1,dt*2));s.mx.update(dt);}
  for(const s of sharks){
    const dx=S.x-s.cx,dz=S.z-s.cz,pd=Math.hypot(dx,dz),near=S.y<-.4&&pd<26&&t-s.bitAt>3000;
    if(near&&s.state==='patrol'){s.state='chase';banner('Something is circling in the water…','⚠️')}
    if(!near&&s.state==='chase'&&pd>34)s.state='patrol';
    let tx,tz;
    if(s.state==='chase'){tx=S.x;tz=S.z;s.act.timeScale=2.2;
      if(pd<2.4&&t-s.bitAt>3000){s.bitAt=t;onSmacked({dx:dx/Math.max(pd,.01),dz:dz/Math.max(pd,.01)});sharkBite()}}
    else{s.ang+=dt*s.speed*.3;tx=s.cx+Math.cos(s.ang)*s.rad;tz=s.cz+Math.sin(s.ang)*s.rad;s.act.timeScale=1;}
    const cur=s.m.position,ddx=tx-cur.x,ddz=tz-cur.z,dd=Math.hypot(ddx,ddz)||1,spd=(s.state==='chase'?7.5:2.5);
    s.m.position.x+=ddx/dd*Math.min(spd*dt,dd);s.m.position.z+=ddz/dd*Math.min(spd*dt,dd);
    s.m.position.y+=(s.cy-s.m.position.y)*Math.min(1,dt*1.5);
    const yaw=Math.atan2(ddx,ddz);s.m.rotation.y=lerpAngle(s.m.rotation.y,yaw,Math.min(1,dt*3));
    s.mx.update(dt);
  }
}
function sharkBite(){try{const a=new(window.AudioContext||webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.type='sawtooth';o.frequency.setValueAtTime(90,a.currentTime);o.frequency.exponentialRampToValueAtTime(30,a.currentTime+.3);o.connect(g);g.connect(a.destination);g.gain.setValueAtTime(.4,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.35);o.start();o.stop(a.currentTime+.35)}catch(e){}}

