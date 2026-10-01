  $('info').innerHTML=roomCode+'  ·  '+(others.size?'Together':'Waiting for your partner…')+'<br>✦ '+got+'/'+orbs.length+'  ·  📍 '+disc.size+'/'+LOCS.length+'  ·  🧰 '+treas+'  ·  🥊 '+smacks;
}

// ---------- three ----------
let renderer,scene,camera,me,rng,sun,sky,seaTex;

function label(text){
  const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');
  x.font='bold 32px Georgia';x.textAlign='center';x.lineWidth=6;x.strokeStyle='#000a';x.fillStyle='#fff';
  x.strokeText(text,128,44);x.fillText(text,128,44);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false,transparent:true}));
  s.scale.set(2.4,.6,1);s.position.y=2.3;s.renderOrder=10;return s;
}
const solids=[];
function makeAvatar(name,color){
  const g=new THREE.Group(),rig=new THREE.Group();g.add(rig);
  const M=c=>new THREE.MeshStandardMaterial({color:c,roughness:.6}),cm=M(color),sk=M('#f1c9a5'),dk=M('#2a2f4a');
  const part=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);rig.add(m);return m};
  part(new THREE.CapsuleGeometry(.32,.5,4,10),cm,0,1.15,0);
  part(new THREE.SphereGeometry(.28,14,12),sk,0,1.75,0);
  part(new THREE.BoxGeometry(.4,.14,.16),dk,0,1.78,.2);
  const limb=(x,y,mat,len,r)=>{const p=new THREE.Group();p.position.set(x,y,0);rig.add(p);
    const m=new THREE.Mesh(new THREE.CapsuleGeometry(r,len,3,8),mat);m.position.y=-(len/2+r);p.add(m);return p};
  const arms=[limb(-.42,1.4,cm,.5,.11),limb(.42,1.4,cm,.5,.11)];
  const legs=[limb(-.16,.78,dk,.5,.13),limb(.16,.78,dk,.5,.13)];
  g.add(label(name));
  g.userData={rig,arms,legs,ph:0,land:0};
  return g;
}
const _v1=new THREE.Vector3(),_v2=new THREE.Vector3(),_qa=new THREE.Quaternion(),_qb=new THREE.Quaternion(),_qm=new THREE.Quaternion(),_qw=new THREE.Quaternion();
function aim(b,c,dir){
  b.updateWorldMatrix(true,false);c.updateWorldMatrix(true,false);
  b.getWorldPosition(_v1);c.getWorldPosition(_v2);_v2.sub(_v1).normalize();
  _qa.setFromUnitVectors(_v2,dir);b.getWorldQuaternion(_qb);_qb.premultiply(_qa);
  b.parent.getWorldQuaternion(_qm).invert();b.quaternion.copy(_qm.multiply(_qb));b.updateMatrixWorld(true);
}
function pose(q,st,dt){
  const B=q.bones;q.model.updateMatrixWorld(true);q.model.getWorldQuaternion(_qw);
  const D=(x,y,z)=>new THREE.Vector3(x,y,z).normalize().applyQuaternion(_qw);
  q.ph+=dt*(st==='swim'?5:3);
  for(const s of [1,-1]){const n=s===1?'Left':'Right',off=s===1?0:Math.PI;let ad,ld;
    if(st==='fly'){ad=D(s*.08,1,0);ld=D(s*.05,-1,.06*Math.sin(q.ph*2+off))}
    else{const phi=q.ph+off;ad=D(s*.15,Math.cos(phi),Math.sin(phi));ld=D(s*.06,-1,.35*Math.sin(q.ph*2+off))}
    aim(B[n+'Arm'],B[n+'ForeArm'],ad);aim(B[n+'ForeArm'],B[n+'Hand'],ad);aim(B[n+'UpLeg'],B[n+'Leg'],ld);aim(B[n+'Leg'],B[n+'Foot'],ld);
  }
}
function animate(g,dt,st){
  const q=g.userData;
  if(q.mixer){
    const want=(st==='idle'||st==='fly')?'idle':(st==='jump'||st==='fall')?'jump':'run';
    if(q.cur!==want){q.act[want].reset().fadeIn(.15).play();if(q.cur)q.act[q.cur].fadeOut(.15);q.cur=want}
    q.act.run.timeScale=st==='walk'?.7:st==='swim'?1.2:1.15;
    if(q.pan){q.swing=Math.max(0,(q.swing||0)-dt*4.2);const sw=Math.min(1,q.swing||0);q.pan.rotation.z=-Math.PI/2.3+Math.sin(sw*Math.PI)*2.4*(sw>0?1:0);q.pan.rotation.x=sw*0.6}
    q.land=Math.max(0,q.land-dt);q.model.rotation.x+=((st==='swim'?1.45:st==='fly'?1.4:0)-q.model.rotation.x)*Math.min(1,dt*10);
    q.model.position.set(0,.65*(1-Math.cos(q.model.rotation.x)),-.65*Math.sin(q.model.rotation.x));
    q.model.scale.set(.5*(1+q.land*.3),.5*(1-q.land*.6),.5*(1+q.land*.3));q.mixer.update(dt);if(st==='fly'||st==='swim')pose(q,st,dt);return;
  }
  const u=g.userData,air=st==='jump'||st==='fall',w=st==='run'?1:st==='walk'?.6:st==='swim'?.7:0;
  u.ph+=dt*(st==='run'?13:9);const s=Math.sin(u.ph),k=Math.min(1,dt*18);
  const to=(p,v)=>p.rotation.x+=(v-p.rotation.x)*k;
  to(u.legs[0],air?(st==='jump'?-.5:.3):s*w*.9);to(u.legs[1],air?(st==='jump'?.4:-.3):-s*w*.9);
  to(u.arms[0],air?-2.3:st==='swim'?-1.7-s*1.1:-s*w*.8);to(u.arms[1],air?-2.3:st==='swim'?-1.7+s*1.1:s*w*.8);
  const lean=st==='swim'?.9:st==='run'?.25:st==='walk'?.08:0;
  u.rig.rotation.x+=(lean-u.rig.rotation.x)*Math.min(1,dt*10);
  u.land=Math.max(0,u.land-dt);
  u.rig.position.y=(st==='idle'?Math.sin(performance.now()/500)*.015:Math.abs(s)*w*.06);
  u.rig.scale.set(1+u.land*.3,1-u.land*.6,1+u.land*.3);
}

const K=2.5;
function dress(g,skin){
