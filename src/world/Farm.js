// NOTE: the animals are loaded from the original FBX files with THREE.FBXLoader. Converting them to GLB (assimp) breaks their
// skeletons (inconsistent bind matrices -> flattened / floating bodies), so FBX it is.
// Farm: a fenced meadow south of Town Square (FARM in data/islands.js) with a barn and roaming animals.
// Animals are Quaternius "Farm Animals" (assets/animals/*.fbx). Cow/Horse/Zebra have real walk clips; Pig/Sheep/Llama/Pug
// only have idle, so they get a procedural waddle while moving.
// Behaviour is deterministic: every 10 s each animal derives a waypoint (or a rest) from a hash of (animal, epoch), where
// epoch = floor(Date.now()/10000), so you and your partner see the herd in the same places without any networking.
// Animals near you stop and turn to look at you. Globals: S, scene, H, FARM, solids, THREE.
const Farm=(()=>{
  // name, body length (m), count, has walk clip
  const SPECIES=[['Cow',2.3,2,1],['Horse',2.8,2,1],['Zebra',2.4,1,1],['Sheep',1.3,3,0],['Pig',1.3,2,0],['Llama',1.5,1,0],['Pug',.75,1,0]];
  const animals=[],cache={};
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
    spawn();
  }

  // ---------- animals ----------
  async function buffer(name){return cache[name]||(cache[name]=fetch('assets/animals/'+name+'.fbx').then(r=>r.arrayBuffer()))}
  // size of the model as actually rendered (skinned vertices), in the model's own units
  function skinBox(root){
    root.updateMatrixWorld(true);const box=new THREE.Box3(),v=new THREE.Vector3();let mesh=null;root.traverse(o=>{if(o.isSkinnedMesh&&!mesh)mesh=o});
    if(!mesh||!mesh.boneTransform)return box.setFromObject(root);
    mesh.skeleton.update();const pos=mesh.geometry.attributes.position;
    for(let i=0;i<pos.count;i+=2){v.fromBufferAttribute(pos,i);mesh.boneTransform(i,v);v.applyMatrix4(mesh.matrixWorld);box.expandByPoint(v)}
    return box}
  function make(i,sp,buf){
    return new Promise(res=>{
      let m;try{m=new THREE.FBXLoader().parse(buf.slice(0),'')}catch(e){res(null);return}
      const root=new THREE.Group();root.add(m);
      const bb=skinBox(m),sz=bb.getSize(new THREE.Vector3()),len=Math.max(sz.x,sz.z);
      let k=len>0?sp[1]/len:.01;if(!isFinite(k)||k<=0)k=.01;
      m.scale.setScalar(k);m.position.y=-bb.min.y*k;                         // measured size -> real-world metres, feet on the ground
      m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false}});
      const mixer=new THREE.AnimationMixer(m),act={};
      for(const c of m.animations){const n=c.name.split('|').pop().toLowerCase();act[n]=mixer.clipAction(c)}
      const a={i,name:sp[0],hasWalk:!!sp[3],root,m,k,mixer,act,cur:null,mode:'rest',x:0,z:0,head:0,bob:0,t:hash(i)*10};
      const ang=hash(i*3.3)*6.283,rad=4+hash(i*7.7)*(F.R-8);
      a.x=F.x+Math.cos(ang)*rad;a.z=F.z+Math.sin(ang)*rad;a.head=hash(i*1.9)*6.283;
      root.position.set(a.x,H(a.x,a.z),a.z);root.rotation.y=a.head;scene.add(root);
      play(a,'idle',1);res(a)})
  }
  function play(a,name,ts){
    const nx=a.act[name]||a.act.idle;if(!nx)return;
    if(a.cur!==nx){nx.reset().fadeIn(.3).play();if(a.cur)a.cur.fadeOut(.3);a.cur=nx}
    nx.setEffectiveTimeScale(ts);
  }
  async function spawn(){
    if(!THREE.FBXLoader)return;                                                   // loader script failed to load: skip animals, never break the world
    let i=0;
    for(const sp of SPECIES){
      let buf;try{buf=await buffer(sp[0])}catch(e){continue}
      for(let n=0;n<sp[2];n++){const a=await make(i++,sp,buf);if(a)animals.push(a);await new Promise(r=>setTimeout(r,80))}} // spread parsing over time so loading never hitches the game
  }

  function tick(dt,t){
    if(!animals.length)return;
    const e=Math.floor(Date.now()/10000);
    for(const a of animals){
      const dp=Math.hypot(S.x-a.x,S.z-a.z);
      a.root.visible=dp<220;if(dp>220)continue;
      // decide: rest this epoch (35%), or walk to this epoch's waypoint
      const rest=hash(a.i*5.5+e*7.7)<.35,ang=hash(a.i*13.7+e)*6.283,rad=3+hash(a.i*91.3+e*3.1)*(F.R-6);
      const wx=F.x+Math.cos(ang)*rad,wz=F.z+Math.sin(ang)*rad,dx=wx-a.x,dz=wz-a.z,dw=Math.hypot(dx,dz);
      let move=!rest&&dw>.8,tgt=a.head;
      if(dp<9){move=false;tgt=Math.atan2(S.x-a.x,S.z-a.z)}                         // curious: stop and look at the player
      else if(move)tgt=Math.atan2(dx,dz);
      let da=tgt-a.head;da=Math.atan2(Math.sin(da),Math.cos(da));a.head+=da*Math.min(1,dt*(move?3:2));
      const sp=a.hasWalk?.9:.7;
      if(move&&Math.abs(da)<1.2){a.x+=Math.sin(a.head)*sp*dt;a.z+=Math.cos(a.head)*sp*dt}
      else move=move&&Math.abs(da)<1.2;
      a.mode=move?'walk':'idle';
      if(dp<110){                                                                   // only animate what you can actually see up close
        if(a.mode==='walk')play(a,a.hasWalk?(a.act.walkslow?'walkslow':'walk'):'idle',a.hasWalk?1:1.8);else play(a,'idle',1);
        a.mixer.update(dt);
        // no walk clip: bob and rock the body so it reads as walking
        a.t+=dt;const w=a.mode==='walk'&&!a.hasWalk?1:0;a.bob+=((w)-a.bob)*Math.min(1,dt*6);
        a.m.rotation.z=Math.sin(a.t*7)*.07*a.bob;a.m.position.y=-0+Math.abs(Math.sin(a.t*7))*.05*a.bob+(a.m.userData.base===undefined?(a.m.userData.base=a.m.position.y):a.m.userData.base);
      }
      a.root.position.set(a.x,H(a.x,a.z),a.z);a.root.rotation.y=a.head;
    }
  }
  return {build,tick,pos:F,animals};
})();
