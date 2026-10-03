// Ambient fish schools + shark patrol/chase/bite + rare dolphin/manta-ray sightings.
// Self-contained: reads rng/ISL/H/AURL/THREE/S (already global by call time) and calls
// banner()/onSmacked() which are defined later in index.html — same forward-reference
// pattern as every other extracted module. buildSeaLife() is called once from
// buildWorld(); seaTick(dt,t) is called once per frame from tick().
const FISH_TYPES=['Fish1','Fish2','Fish3'],FISH_LEN={Fish1:.65,Fish2:.62,Fish3:.62},FISH_RAW={Fish1:3.19,Fish2:1.97,Fish3:1.58};
let seaP,seaBufs={},sharkClip,sharks=[],fishState=[],fishInst={},specials=[],_fdum=new THREE.Object3D();
function loadSea(){
  if(!seaP)seaP=(async()=>{if(!THREE.GLTFLoader)throw new Error('no loader');
    for(const t of [...FISH_TYPES,'Shark','Dolphin','Manta_ray'])seaBufs[t]=await(await fetch(AURL+(t==='Shark'?'shark.glb':'fish_'+t+'.glb'))).arrayBuffer();
  })();
  return seaP;
}
function buildSeaLife(){
  const findWater=(I,deep)=>{for(let i=0;i<60;i++){const a=rng()*6.283,r=I.R*(.75+rng()*.7),x=I.x+Math.cos(a)*r,z=I.z+Math.sin(a)*r,h=H(x,z);
    if(h<(deep?-1.0:-.15)&&h>(deep?-30:-3.2))return {x,z}}return null};
  const zones=[{x:0,z:0,R:180},...ISL],clusters=[];
  for(let a=0;a<10;a++){const ang=a/10*6.283,r=45+rng()*70,x=Math.cos(ang)*r,z=185+Math.sin(ang)*r*.4,h=H(x,z);
    if(h<-.15&&h>-3.2)clusters.push({x,z})}
  for(const I of zones)for(let s=0;s<26;s++){const pt=findWater(I,false);if(pt)clusters.push(pt)}
  let fi=0;
  for(const pt of clusters){const n=6+(rng()*6|0),cy=-.55-rng()*.35,rad=3+rng()*4,speed=.5+rng()*.4;
    for(let i=0;i<n;i++){fishState.push({type:FISH_TYPES[fi++%3],cx:pt.x,cz:pt.z,cy,rad,speed,ph:rng()*6.283,off:rng()*6.283,rOff:.7+rng()*.6,yOff:(rng()-.5)*.3,jt:0,jc:6+rng()*20})}}
  loadSea().then(async()=>{
    const gl=new THREE.GLTFLoader(),parse=buf=>new Promise((res,rej)=>gl.parse(buf.slice(0),AURL,res,rej));
    for(const t of FISH_TYPES){const r=await parse(seaBufs[t]);let geo,mat;
      r.scene.traverse(o=>{if(o.isSkinnedMesh&&!geo){geo=o.geometry;mat=o.material.clone();mat.skinning=false}});
      if(!geo)continue;const im=new THREE.InstancedMesh(geo,mat,400);im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);im.count=0;im.frustumCulled=false;scene.add(im);
      fishInst[t]={im,scale:FISH_LEN[t]/FISH_RAW[t]};
    }
    const shr=await parse(seaBufs.Shark);sharkClip=shr.animations[0];
    for(const I of zones)for(let tries=0;tries<4;tries++){const pt=findWater(I,true);if(!pt)continue;
      const m=shr.scene.clone(true),sc=.45+rng()*.2;m.scale.setScalar(sc);m.traverse(c=>{if(c.isMesh)c.castShadow=true});scene.add(m);
      const mx=new THREE.AnimationMixer(m),act=mx.clipAction(sharkClip);act.play();
      sharks.push({m,mx,act,cx:pt.x,cz:pt.z,cy:-.62-rng()*.2,rad:10+rng()*10,ang:rng()*6.283,speed:.35,state:'patrol',bitAt:-9999});
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
// ---- visibility helpers: splash rings (fish jumps, shark wakes), points near the player, recycling far-away life next to the player ----
let splashes=null;
function splashInit(){splashes=[];const g=new THREE.RingGeometry(.55,.7,24);g.rotateX(-Math.PI/2);
  for(let i=0;i<16;i++){const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,depthWrite:false,fog:true}));m.visible=false;m.renderOrder=2;scene.add(m);splashes.push({m,age:9,life:1,size:1})}}
function splash(x,z,size,life){if(!splashes)splashInit();let p=splashes.find(q=>q.age>=q.life)||splashes[0];p.age=0;p.life=life||1;p.size=size||1;p.m.position.set(x,-.27,z);p.m.visible=true}
function splashTick(dt){if(!splashes)return;for(const p of splashes){if(p.age>=p.life){p.m.visible=false;continue}p.age+=dt;const u=Math.min(1,p.age/p.life);p.m.scale.setScalar(p.size*(.4+u*2.4));p.m.material.opacity=.7*(1-u)}}
// a random open-water point 'min..max' m from the player (ahead of the camera half the time), or null
function waterNear(min,max){for(let i=0;i<24;i++){const a=(i%2?Math.random()*6.283:S.rot+(Math.random()-.5)*2.2),r=min+Math.random()*(max-min),x=S.x+Math.sin(a)*r,z=S.z+Math.cos(a)*r,h=H(x,z);if(h<-.9)return {x,z}}return null}
let _recT=0;
function seaTick(dt,t){
  const cnt={};FISH_TYPES.forEach(k=>cnt[k]=0);
  for(const f of fishState){f.ph+=dt*f.speed;const a=f.ph+f.off,r=f.rad*f.rOff,inst=fishInst[f.type];if(!inst)continue;
    let x=f.cx+Math.cos(a)*r,z=f.cz+Math.sin(a)*r,y=f.cy+f.yOff+Math.sin(t/600+f.off)*.12,tx=f.cx+Math.cos(a+.25)*r,tz=f.cz+Math.sin(a+.25)*r,ty=y;
    // leaps: a fish near the player now and then arcs out of the water (1 s), with splash rings at both ends
    if(f.jt>0){f.jt+=dt;const u=Math.min(1,f.jt/1.1),au=Math.min(1,u+.06);y=-.3+Math.sin(u*Math.PI)*1.7;ty=-.3+Math.sin(au*Math.PI)*1.7;if(u>=1){f.jt=0;f.jc=8+Math.random()*25;splash(x,z,.8,.9)}}
    else{f.jc-=dt;if(f.jc<=0&&Math.hypot(x-S.x,z-S.z)<140){f.jt=.001;f.jc=9;splash(x,z,.8,.9)}else if(f.jc<=0)f.jc=3}
    _fdum.position.set(x,y,z);_fdum.lookAt(tx,ty,tz);_fdum.scale.setScalar(inst.scale*(f.jt>0?1.35:1));_fdum.updateMatrix();
    const idx=cnt[f.type]++;if(idx<inst.im.count||idx<400)inst.im.setMatrixAt(idx,_fdum.matrix);}
  for(const t2 in fishInst){fishInst[t2].im.count=Math.min(cnt[t2],400);fishInst[t2].im.instanceMatrix.needsUpdate=true}
  splashTick(dt);
  // keep life around the player: every ~1.5 s move one far-away school (and shark) to open water 70-190 m from the player, so wherever you swim or fly over the sea something is nearby
  _recT+=dt;if(_recT>1.5){_recT=0;
    const near=fishState.filter(f=>Math.hypot(f.cx-S.x,f.cz-S.z)<170);
    if(near.length<30){const far=fishState.find(f=>Math.hypot(f.cx-S.x,f.cz-S.z)>330),pt=far&&waterNear(70,190);
      if(pt){const sch=fishState.filter(f=>f.cx===far.cx&&f.cz===far.cz);for(const f of sch){f.cx=pt.x;f.cz=pt.z;f.jt=0}}}
    const nearSh=sharks.filter(s=>Math.hypot(s.m.position.x-S.x,s.m.position.z-S.z)<200).length;
    if(nearSh<2){const far=sharks.find(s=>s.state!=='chase'&&Math.hypot(s.m.position.x-S.x,s.m.position.z-S.z)>320),pt=far&&waterNear(90,200);
      if(pt){far.cx=pt.x;far.cz=pt.z;far.m.position.set(pt.x+far.rad,far.cy,pt.z)}}}
  for(const s of specials){s.ang+=dt*s.speed*.25;const tx=s.cx+Math.cos(s.ang)*s.rad,tz=s.cz+Math.sin(s.ang)*s.rad;
    const ddx=tx-s.m.position.x,ddz=tz-s.m.position.z,dd=Math.hypot(ddx,ddz)||1;
    s.m.position.x+=ddx/dd*Math.min(2.2*dt,dd);s.m.position.z+=ddz/dd*Math.min(2.2*dt,dd);s.m.position.y+=(s.cy-s.m.position.y)*Math.min(1,dt*1.2);
    s.m.rotation.y=lerpAngle(s.m.rotation.y,Math.atan2(ddx,ddz),Math.min(1,dt*2));s.mx.update(dt);}
  for(const s of sharks){
    // distances are to the SHARK itself (they used to be measured from its patrol centre, so it almost never reacted or bit)
    const px=s.m.position.x,pz=s.m.position.z,dx=S.x-px,dz=S.z-pz,sd=Math.hypot(dx,dz),inWater=S.y<-.4&&H(S.x,S.z)<-.3;
    if(s.state==='patrol'&&inWater&&sd<90&&t-s.bitAt>3000)s.state='stalk';
    if(s.state==='stalk'){if(!inWater||sd>130)s.state='patrol';else if(sd<24){s.state='chase';banner('Something is circling in the water…','⚠️')}}
    if(s.state==='chase'&&(!inWater||sd>40))s.state='patrol';
    let tx,tz,spd;
    if(s.state==='chase'){tx=S.x;tz=S.z;spd=7.5;s.act.timeScale=2.2;
      if(sd<2.6&&t-s.bitAt>3000){s.bitAt=t;s.state='patrol';onSmacked({dx:dx/Math.max(sd,.01),dz:dz/Math.max(sd,.01)});sharkBite();splash(px,pz,2.2,1.2)}}
    else if(s.state==='stalk'){tx=S.x-dx/Math.max(sd,1)*18;tz=S.z-dz/Math.max(sd,1)*18;spd=5;s.act.timeScale=1.6} // swing in towards 18 m from the swimmer
    else{s.ang+=dt*s.speed*.3;tx=s.cx+Math.cos(s.ang)*s.rad;tz=s.cz+Math.sin(s.ang)*s.rad;spd=2.5;s.act.timeScale=1}
    const cur=s.m.position,ddx=tx-cur.x,ddz=tz-cur.z,dd=Math.hypot(ddx,ddz)||1;
    cur.x+=ddx/dd*Math.min(spd*dt,dd);cur.z+=ddz/dd*Math.min(spd*dt,dd);
    cur.y+=(s.cy-cur.y)*Math.min(1,dt*1.5);
    s.wk=(s.wk||0)-dt;if(s.wk<=0&&Math.hypot(cur.x-S.x,cur.z-S.z)<160){s.wk=s.state==='patrol'?1.3:.5;splash(cur.x,cur.z,1.3,1.4)} // wake rings so you can spot a fin from far away
    const yaw=Math.atan2(ddx,ddz);s.m.rotation.y=lerpAngle(s.m.rotation.y,yaw,Math.min(1,dt*3));
    s.mx.update(dt);
  }
}
function sharkBite(){try{const a=new(window.AudioContext||webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.type='sawtooth';o.frequency.setValueAtTime(90,a.currentTime);o.frequency.exponentialRampToValueAtTime(30,a.currentTime+.3);o.connect(g);g.connect(a.destination);g.gain.setValueAtTime(.4,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.35);o.start();o.stop(a.currentTime+.35)}catch(e){}}

