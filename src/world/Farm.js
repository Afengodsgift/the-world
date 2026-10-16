// NOTE: the animals are loaded from the original FBX files with THREE.FBXLoader. Converting them to GLB (assimp) breaks their
// skeletons (inconsistent bind matrices -> flattened / floating bodies), so FBX it is.
// Farm: a fenced meadow south of Town Square (FARM in data/islands.js) with a barn and a herd of individuals.
// Animals are Quaternius "Farm Animals" (assets/animals/*.fbx). Cow/Horse/Zebra have real Walk/WalkSlow/Run clips; Sheep/Pig/Llama/Pug
// only have Idle + Jump, so their legs are swung procedurally (additive bone rotation after the mixer runs).
// Every animal has a name and a temperament (SPECIES row) plus personal quirks from a hash of its index, and runs a small state machine:
// idle / graze / walk / gallop (zoom) / hop, plus reactions to you: curious ones come over to say hi, nervous ones bolt if you charge
// them, everyone glances at you with their head. Waypoints come from a hash of (animal, leg counter), so partners see similar routines.
// Globals: S, scene, H, FARM, solids, THREE.
const Farm=(()=>{
  // temperament per species. len: body length (m); clip: has real walk/run clips; walk/run: ground speeds (m/s); w: behaviour weights;
  // shy: share of the species that bolts when startled; curious: share that comes over to you; stop: how close they come; herd: pull toward
  // their own group; space: personal-space radius; gz: [neck, head] pitch (rad) when grazing; grp: who they flock with.
  const SPECIES=[
    {n:'Cow',  len:2.3,cnt:2,clip:1,walk:.75,run:3.2,w:{graze:.5,idle:.2,walk:.3},               shy:0,  curious:.35,stop:3.5,herd:.35,space:2.2,gz:[.95,.1],grp:'cow',  names:['Daisy','Bessie']},
    {n:'Horse',len:2.8,cnt:2,clip:1,walk:1.1,run:4.6,w:{graze:.3,idle:.2,walk:.3,gallop:.2},    shy:.3, curious:.75,stop:3.8,herd:.3, space:2.4,gz:[1.15,.1],grp:'eq',   names:['Biscuit','Thunder']},
    {n:'Zebra',len:2.4,cnt:1,clip:1,walk:1,  run:4.6,w:{graze:.4,idle:.3,walk:.3},               shy:1,  curious:.15,stop:6,  herd:.8, space:4,  gz:[1.1,.1],grp:'eq',   names:['Stripes']},
    {n:'Sheep',len:1.3,cnt:3,clip:0,walk:.7, run:2.8,w:{graze:.55,idle:.2,walk:.2,hop:.05},    shy:.6, curious:.1, stop:4,  herd:1,  space:1.4,gz:[.85,.15],grp:'sheep',names:['Woolly','Fluff','Cloud']},
    {n:'Pig',  len:1.3,cnt:2,clip:0,walk:.9, run:3.4,w:{graze:.4,idle:.1,walk:.3,zoom:.2},      shy:0,  curious:.25,stop:2.5,herd:.2, space:1.5,gz:[.7,.15],grp:'pig',  names:['Pickles','Truffle'],sniff:1},
    {n:'Llama',len:1.5,cnt:1,clip:0,walk:.8, run:3,  w:{graze:.3,idle:.45,walk:.25},            shy:.1, curious:1,  stop:6.5,herd:.1, space:2,  gz:[.95,.1],grp:'llama',names:['Larry']},
    {n:'Pug',  len:.75,cnt:1,clip:0,walk:1,  run:3.2,w:{graze:.15,idle:.25,walk:.3,hop:.1},    shy:0,  curious:1,  stop:2.2,herd:0,  space:0,  gz:[.65,.15],grp:'pug',  names:['Waffles']}];
  const hash=n=>{n=Math.sin(n*127.1+311.7)*43758.5453;return n-Math.floor(n)};
  const F=FARM;

  // ---------- farm buildings & fence ----------
  function build(){
    const y=H(F.x,F.z),mat=(c,r)=>new THREE.MeshStandardMaterial({color:c,roughness:r||.9});
    // fence: instanced posts + two rails per segment, with a gate gap on the town side (toward -z)
    const N=36,R=F.R+2,gap=-Math.PI/2,post=new THREE.InstancedMesh(new THREE.BoxGeometry(.18,1.2,.18),mat('#6b4a2a'),N),rail=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.1,.08),mat('#8a6238'),N*2);
    const m=new THREE.Matrix4(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),pos=new THREE.Vector3();let ri=0;
    for(let i=0;i<N;i++){const a=i/N*Math.PI*2,x=F.x+Math.cos(a)*R,z=F.z+Math.sin(a)*R;
      m.compose(pos.set(x,H(x,z)+.6,z),q.identity(),sc.set(1,1,1));post.setMatrixAt(i,m);
      const da=Math.abs(Math.atan2(Math.sin(a-gap),Math.cos(a-gap)));if(da<.2)continue;      // gate opening
      const a2=(i+1)/N*Math.PI*2,x2=F.x+Math.cos(a2)*R,z2=F.z+Math.sin(a2)*R,len=Math.hypot(x2-x,z2-z),ang=Math.atan2(-(z2-z),x2-x);
      for(const hh of [.45,.95]){const mx=(x+x2)/2,mz=(z+z2)/2;m.compose(pos.set(mx,H(mx,mz)+hh,mz),q.setFromAxisAngle(new THREE.Vector3(0,1,0),ang),sc.set(len,1,1));rail.setMatrixAt(ri++,m)}}
    rail.count=ri;post.castShadow=rail.castShadow=true;scene.add(post,rail);
    // barn (red, with a gable roof) at the back of the pasture, hay bales beside it
    const bx=F.x,bz=F.z+F.R+9,by=H(bx,bz),barn=new THREE.Group();barn.position.set(bx,by,bz);barn.rotation.y=Math.PI;scene.add(barn);
    const body=new THREE.Mesh(new THREE.BoxGeometry(11,5,8),mat('#a63d2f'));body.position.y=2.5;body.castShadow=body.receiveShadow=true;barn.add(body);
    const sh=new THREE.Shape();sh.moveTo(-5.8,0);sh.lineTo(5.8,0);sh.lineTo(0,3.4);sh.closePath();
    const roof=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:8.6,bevelEnabled:false}),mat('#5a3a1e'));roof.position.set(0,5,-4.3);roof.castShadow=true;barn.add(roof);
    const door=new THREE.Mesh(new THREE.BoxGeometry(3.4,3.6,.15),mat('#f1e9d8'));door.position.set(0,1.8,4.05);barn.add(door);
    for(let i=0;i<3;i++){const c={x:bx+(i-1)*4,z:bz,r:3.2};solids.push(c)}
    [[-8,-3],[9,-2],[7,3]].forEach(([dx,dz],i)=>{const hx=bx+dx,hz=bz+dz,b=new THREE.Mesh(new THREE.CylinderGeometry(.8,.8,1.1,12),mat('#d9b95a'));b.rotation.z=Math.PI/2*(i%2);b.position.set(hx,H(hx,hz)+.6,hz);b.castShadow=true;scene.add(b);solids.push({x:hx,z:hz,r:1.1})});
    // sign at the gate
    const cv=document.createElement('canvas');cv.width=256;cv.height=64;const g=cv.getContext('2d');g.fillStyle='#6b4a2a';g.fillRect(0,0,256,64);g.fillStyle='#f6e7c1';g.font='bold 38px serif';g.textAlign='center';g.textBaseline='middle';g.fillText('🐄 FARM',128,34);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.2,.8),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),side:THREE.DoubleSide}));sign.position.set(F.x,H(F.x,F.z-R)+2.6,F.z-R);scene.add(sign);
    ready=spawn().catch(()=>{});
  }

  // ---------- animals ----------
  const TAU=Math.PI*2,angDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b)),clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const animals=[],cache={};
  const _q=new THREE.Quaternion(),_v0=new THREE.Vector3(),_v1=new THREE.Vector3();
  let psx=null,psz=0,pspd=0;                                                    // player speed (smoothed), for startle / "player is standing still"
  async function buffer(name){return cache[name]||(cache[name]=fetch('assets/animals/'+name+'.fbx').then(r=>r.arrayBuffer()))}
  // size of the model as actually rendered (skinned vertices), in the model's own units
  function skinBox(root){
    root.updateMatrixWorld(true);const box=new THREE.Box3(),v=new THREE.Vector3();let mesh=null;root.traverse(o=>{if(o.isSkinnedMesh&&!mesh)mesh=o});
    if(!mesh||!mesh.boneTransform)return box.setFromObject(root);
    mesh.skeleton.update();const pos=mesh.geometry.attributes.position;
    for(let i=0;i<pos.count;i+=2){v.fromBufferAttribute(pos,i);mesh.boneTransform(i,v);v.applyMatrix4(mesh.matrixWorld);box.expandByPoint(v)}
    return box}
  // ---- rig: find the bones we pose by hand, and for each the local axis that moves a target in the direction we want ----
  const findBone=(root,name)=>{let b=null;root.traverse(o=>{if(!b&&o.isBone&&o.name.replace(/[._]/g,'').toLowerCase()===name)b=o});return b};
  const AXES=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(a=>new THREE.Vector3(...a));
  function findAxis(root,bone,target,dir){                                      // dir is in the animal's own frame (+z forward, +y up, +x its left)
    root.updateMatrixWorld(true);const p0=target.getWorldPosition(new THREE.Vector3());root.worldToLocal(p0);
    let best=AXES[0],bs=-1e9;
    for(const ax of AXES){const q0=bone.quaternion.clone();bone.quaternion.multiply(_q.setFromAxisAngle(ax,.25));root.updateMatrixWorld(true);
      const p1=target.getWorldPosition(_v0);root.worldToLocal(p1);const sc=p1.sub(p0).dot(dir);bone.quaternion.copy(q0);if(sc>bs){bs=sc;best=ax}}
    root.updateMatrixWorld(true);return best.clone()}
  function buildRig(root){
    const g=n=>findBone(root,n),neck=g('neck'),head=g('head'),rig={neck,head,legs:[]};
    if(neck&&head){rig.pitch=findAxis(root,neck,head,new THREE.Vector3(0,-1,0));rig.yaw=findAxis(root,neck,head,new THREE.Vector3(1,0,0))}
    for(const [f,ph] of [['frontupleg',0],['backupleg',Math.PI]])for(const [side,sp] of [['l',0],['r',Math.PI]]){
      const up=g(f+side),low=g(f.replace('up','low')+side),foot=g(f.replace('upleg','foot')+side);
      if(!up||!foot)continue;
      const L={up,low,ph:(ph+sp)%TAU,swing:findAxis(root,up,foot,new THREE.Vector3(0,0,1))};
      if(low)L.flex=findAxis(root,low,foot,new THREE.Vector3(0,.6,-.8).normalize());
      rig.legs.push(L)}
    // Remember each hand-posed bone's rest rotation. If a clip doesn't key a bone, the mixer never resets it, so our additive rotation
    // would pile up frame after frame; restoring before every mixer update keeps the pose from drifting.
    rig.posed=[];for(const b of [neck,head,...rig.legs.flatMap(l=>[l.up,l.low])])if(b)rig.posed.push([b,b.quaternion.clone()]);
    return rig}
  function nameTag(txt,y){
    const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.font='bold 30px Georgia';x.textAlign='center';x.lineWidth=6;x.strokeStyle='#000a';x.fillStyle='#fff';
    x.strokeText(txt,128,42);x.fillText(txt,128,42);
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false,transparent:true,opacity:0}));
    s.scale.set(1.5,.375,1);s.position.y=y;s.renderOrder=10;return s}
  function make(i,sp,buf,k){
    return new Promise(res=>{
      let m;try{m=new THREE.FBXLoader().parse(buf.slice(0),'')}catch(e){res(null);return}
      const root=new THREE.Group();root.add(m);
      const bb=skinBox(m),sz=bb.getSize(new THREE.Vector3()),len=Math.max(sz.x,sz.z);
      let sc=len>0?sp.len/len:.01;if(!isFinite(sc)||sc<=0)sc=.01;
      m.scale.setScalar(sc);m.position.y=-bb.min.y*sc;                       // measured size -> real-world metres, feet on the ground
      m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false}});
      const mixer=new THREE.AnimationMixer(m),act={};
      for(const c of m.animations){const n=c.name.split('|').pop().toLowerCase();act[n]=mixer.clipAction(c)}
      if(act.jump){act.jump.setLoop(THREE.LoopOnce,1);act.jump.clampWhenFinished=true}
      const a={i,sp,name:sp.names[k]||sp.n,root,m,mixer,act,cur:null,x:0,z:0,head:0,v:0,st:'idle',stT:1+hash(i*4.1)*3,wp:null,spd:0,n:0,lock:0,
        gz:0,lk:0,phase:hash(i*2.2)*TAU,gait:0,by:m.position.y,bold:hash(i*2.9+.5),nerv:hash(i*5.1+.3),zen:hash(i*8.3+.7),bob:0,hopL:1,tag:null};
      play(a,'idle',1);mixer.update(0);a.rig=buildRig(root);                 // head posing (all species) + procedural legs (clip-less species)
      const ang=hash(i*3.3)*TAU,rad=4+hash(i*7.7)*(F.R-8);
      a.x=F.x+Math.cos(ang)*rad;a.z=F.z+Math.sin(ang)*rad;a.head=hash(i*1.9)*TAU;
      root.position.set(a.x,H(a.x,a.z),a.z);root.rotation.y=a.head;scene.add(root);
      a.tag=nameTag(a.name,sp.len*.5+.9);root.add(a.tag);
      res(a)})
  }
  function play(a,name,ts,fade){
    const nx=a.act[name]||a.act.idle;if(!nx)return;
    if(a.cur!==nx){nx.reset().fadeIn(fade||.25).play();if(a.cur)a.cur.fadeOut(fade||.25);a.cur=nx;if(name==='jump')a.hopL=nx.getClip().duration}
    nx.setEffectiveTimeScale(ts);
  }
  async function spawn(){
    if(!THREE.FBXLoader)return;                                                   // loader script failed to load: skip animals, never break the world
    let i=0;
    for(const sp of SPECIES){
      let buf;try{buf=await buffer(sp.n)}catch(e){continue}
      for(let n=0;n<sp.cnt;n++){const a=await make(i++,sp,buf,n);if(a)animals.push(a);await new Promise(r=>setTimeout(r,6))}} // just a yield so the loading screen stays responsive (this used to be spread over ~80 ms per animal DURING play)
  }

  // ---- behaviour ----
  const inPen=(x,z,m)=>{const d=Math.hypot(x-F.x,z-F.z),R=F.R-(m||1.5);if(d<=R)return[x,z];return[F.x+(x-F.x)/d*R,F.z+(z-F.z)/d*R]};
  function wander(a,far){
    const r1=hash(a.i*7.3+a.n*3.1),r2=hash(a.i*11.9+a.n*5.3);
    if(!far&&hash(a.i*2.7+a.n*9.1)<a.sp.herd){                                    // drift toward the rest of the group
      let cx=0,cz=0,c=0;for(const o of animals)if(o!==a&&o.sp.grp===a.sp.grp){cx+=o.x;cz+=o.z;c++}
      if(c){const ang=r1*TAU,rr=1.5+r2*3;return inPen(cx/c+Math.cos(ang)*rr,cz/c+Math.sin(ang)*rr)}}
    if(far){                                                                       // a long run across the pasture
      for(let t=0;t<6;t++){const ang=hash(a.i*3.7+a.n*1.3+t)*TAU,x=F.x+Math.cos(ang)*(F.R-3),z=F.z+Math.sin(ang)*(F.R-3);if(Math.hypot(x-a.x,z-a.z)>9)return[x,z]}}
    const ang=r1*TAU,rad=3+r2*(F.R-7);return[F.x+Math.cos(ang)*rad,F.z+Math.sin(ang)*rad]}
  function setSt(a,st,T,wp,spd){a.st=st;a.stT=T;a.wp=wp||null;a.spd=spd||0}
  function choose(a){
    const sp=a.sp,W=sp.w;let tot=0;for(const k in W)tot+=W[k];
    let x=hash(a.i*31.7+(a.n++)*1.913)*tot,k='idle';for(const kk in W){x-=W[kk];if(x<=0){k=kk;break}}
    const r=hash(a.i*13.1+a.n*2.3),run=sp.run*(.85+.15*r),walk=sp.walk*(.8+.4*r)*(.85+.3*a.zen);
    if(k==='idle')setSt(a,'idle',3+r*5);
    else if(k==='graze')setSt(a,'graze',6+r*9);
    else if(k==='walk')setSt(a,'walk',30,wander(a),walk);
    else if(k==='gallop'||k==='zoom')setSt(a,'run',20,wander(a,true),run);
    else if(k==='hop'&&a.act.jump)setSt(a,'hop',a.hopL+.2);
    else setSt(a,'idle',3)}
  function react(a,dp){
    const sp=a.sp;if(a.lock>0)return;
    // bolt: nervous animals run when you sprint at them (or get right in their face)
    if(a.nerv<sp.shy&&((pspd>8&&dp<15)||dp<(sp.n==='Zebra'?5:3))&&a.st!=='run'){
      const away=Math.atan2(a.x-S.x,a.z-S.z)+(hash(a.i+a.n*1.7)-.5)*1.2,d=9+hash(a.i*3+a.n)*5;
      setSt(a,'run',4,inPen(a.x+Math.sin(away)*d,a.z+Math.cos(away)*d),sp.run);a.lock=4;a.n++;return}
    // curious: wander over and hang out while you're standing around
    if(a.bold<sp.curious&&a.st!=='run'&&a.st!=='hop'){
      if(dp<22&&dp>sp.stop+.8&&pspd<3.5){if(a.st!=='come'){a.st='come';a.stT=12}a.spd=sp.walk*(dp>9?1.5:1);return}
      if(a.st==='come'&&(dp>=26||pspd>=6)){setSt(a,'idle',1);a.lock=3}}
  }
  function steer(a,dt){
    const sp=a.sp;let tx=null,tz=0,tv=0,face=null;
    if(a.st==='come'){const dp=Math.hypot(S.x-a.x,S.z-a.z);
      if(dp>sp.stop){tx=S.x;tz=S.z;tv=a.spd}else{face=Math.atan2(S.x-a.x,S.z-a.z);a.stT=Math.max(a.stT,.5)}}
    else if(a.wp&&(a.st==='walk'||a.st==='run')){tx=a.wp[0];tz=a.wp[1]}
    if(tx!==null&&a.st!=='come'){const dw=Math.hypot(tx-a.x,tz-a.z);if(dw<.9){setSt(a,'idle',.3+hash(a.i+a.n)*1.5)}else tv=a.spd}
    // personal space: shuffle away if you crowd the animal
    const dp=Math.hypot(S.x-a.x,S.z-a.z);
    if(sp.space&&dp<sp.space&&a.st!=='run'&&a.st!=='come'){face=Math.atan2(a.x-S.x,a.z-S.z);tv=sp.walk*.8}
    let want=a.head;
    if(tx!==null&&tv>0&&face===null)want=Math.atan2(tx-a.x,tz-a.z);else if(face!==null)want=face;
    else if((a.st==='idle'||a.st==='graze')&&dp<12&&a.bold<sp.curious&&Math.abs(angDiff(Math.atan2(S.x-a.x,S.z-a.z),a.head))>1)want=Math.atan2(S.x-a.x,S.z-a.z);
    const da=angDiff(want,a.head),maxT=(a.st==='run'?3.2:1.8)*dt,moving=tv>0;
    a.head+=clamp(da*Math.min(1,dt*(moving?5:2.5)),-maxT,maxT);
    if(face!==null&&tv>0&&sp.space&&dp<sp.space){}                              // backing off: keep tv
    else if(face!==null&&a.st==='come')tv=0;
    const align=Math.max(0,1-Math.abs(da)/1.3);if(tv>0)tv=Math.max(tv*align,Math.min(tv,.3));
    a.v+=(tv-a.v)*Math.min(1,dt*(tv>a.v?2.6:4.5));if(a.v<.02&&tv===0)a.v=0;
    a.x+=Math.sin(a.head)*a.v*dt;a.z+=Math.cos(a.head)*a.v*dt;
    const p=inPen(a.x,a.z,1.2);a.x=p[0];a.z=p[1]}
  function pose(a,dt,t,dp){
    const sp=a.sp,rig=a.rig;
    // --- which clip ---
    if(a.st==='hop'&&a.act.jump)play(a,'jump',1,.15);
    else if(sp.clip){
      const v=a.v,L=sp.len;
      if(v<.08)play(a,'idle',1);
      else if(v<L*.38&&a.act.walkslow)play(a,'walkslow',clamp(v/(L*.28),.6,1.5));
      else if(v<L*.9)play(a,'walk',clamp(v/(L*.5),.6,1.5));
      else play(a,'run',clamp(v/(L*1.4),.8,1.4))}
    else play(a,'idle',1);
    if(rig)for(const e of rig.posed)e[0].quaternion.copy(e[1]);
    a.mixer.update(dt);
    // --- procedural layer, applied after the mixer ---
    a.phase+=dt*clamp(a.v/(sp.len*.42),0,7)*TAU*.5;
    a.gait+=((a.v>.12&&!sp.clip?1:0)-a.gait)*Math.min(1,dt*7);
    const run=clamp(a.v/sp.run,0,1);
    if(rig){
      for(const L of rig.legs){if(a.gait<.01)break;
        const s=Math.sin(a.phase+L.ph),amp=(.5+.35*run)*a.gait;
        _q.setFromAxisAngle(L.swing,s*amp);L.up.quaternion.multiply(_q);
        if(L.low&&L.flex){_q.setFromAxisAngle(L.flex,Math.max(0,Math.cos(a.phase+L.ph))*(.5+.45*run)*a.gait);L.low.quaternion.multiply(_q)}}
      // graze (head to the ground) and glance at the player (head turn)
      const grazing=a.st==='graze'?1:0;a.gz+=(grazing-a.gz)*Math.min(1,dt*2.2);
      let lt=0;if(dp<(a.bold<sp.curious?20:11)&&a.st!=='run')lt=clamp(angDiff(Math.atan2(S.x-a.x,S.z-a.z),a.head),-.9,.9);
      a.lk+=(lt-a.lk)*Math.min(1,dt*(a.st==='come'?5:3));
      if(rig.neck&&rig.pitch){
        const sn=sp.sniff?.78+.22*Math.sin(t*9+a.i):1,g=a.gz*sn;
        if(g>.005){_q.setFromAxisAngle(rig.pitch,g*sp.gz[0]);rig.neck.quaternion.multiply(_q);_q.setFromAxisAngle(rig.pitch,g*sp.gz[1]);rig.head.quaternion.multiply(_q)}
        if(Math.abs(a.lk)>.005&&rig.yaw){const k=a.lk*(1-.5*a.gz);_q.setFromAxisAngle(rig.yaw,k*.55);rig.neck.quaternion.multiply(_q);_q.setFromAxisAngle(rig.yaw,k*.45);rig.head.quaternion.multiply(_q)}}}
    // body: a little bounce and roll while trotting (clip animals already have it baked in)
    a.bob+=((a.gait)-a.bob)*Math.min(1,dt*6);
    a.m.position.y=a.by+Math.abs(Math.sin(a.phase))*.04*sp.len*a.bob;a.m.rotation.z=Math.sin(a.phase)*.04*a.bob;
    // name tag fades in as you get close
    const ta=clamp((9-dp)/3,0,1);if(a.tag.material.opacity!==ta)a.tag.material.opacity=ta;a.tag.visible=ta>0}

  let _fn=0,ready=null;
  function tick(dt,t){
    if(!animals.length)return;
    dt=Math.min(dt,.1);
    if(psx===null){psx=S.x;psz=S.z}
    pspd+=((Math.hypot(S.x-psx,S.z-psz)/Math.max(dt,1e-3))-pspd)*Math.min(1,dt*5);psx=S.x;psz=S.z;
    for(const a of animals){
      const dp=Math.hypot(S.x-a.x,S.z-a.z);
      a.root.visible=dp<220;if(dp>220)continue;
      a.stT-=dt;a.lock-=dt;
      react(a,dp);
      if(a.stT<=0)choose(a);
      steer(a,dt);
    }
    // keep bodies from overlapping
    for(let i=0;i<animals.length;i++)for(let j=i+1;j<animals.length;j++){
      const p=animals[i],q=animals[j],dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz),rr=(p.sp.len+q.sp.len)*.32;
      if(d<rr&&d>1e-3){const k=(rr-d)*.5*Math.min(1,dt*4)/d;p.x-=dx*k;p.z-=dz*k;q.x+=dx*k;q.z+=dz*k}}
    _fn++;
    for(const a of animals){
      const dp=Math.hypot(S.x-a.x,S.z-a.z);if(dp>=220)continue;
      // only animate what you can actually see up close; the farther, the less often (the skeleton + procedural pose was ~3.7 ms/frame for the whole farm). dt is accumulated so motion stays correct.
      if(dp<110){const lod=dp<28?1:dp<55?2:4;a._pdt=(a._pdt||0)+dt;if(lod===1||(_fn+a.i)%lod===0){pose(a,a._pdt,t,dp);a._pdt=0}}
      a.root.position.set(a.x,H(a.x,a.z),a.z);a.root.rotation.y=a.head}
  }
  return {build,tick,pos:F,animals,whenReady:()=>ready||Promise.resolve()};
})();
