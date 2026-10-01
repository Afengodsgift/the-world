  for(const nm in P){const f=scatter(nm,TH[nm],P[nm]);if(!f)continue;for(const p of P[nm]){if(nm.startsWith('tree_'))solids.push({x:p.x,z:p.z,r:.3*p.s});else if(!nm.startsWith('plant_'))solids.push({x:p.x,z:p.z,r:f.w*.35*p.s,h:p.y+2*p.s})}}

  const shard=new THREE.MeshStandardMaterial({color:'#ffe08a',emissive:'#ffb020',emissiveIntensity:.95});
  for(let i=0;i<10;i++){
    const a=rng()*6.283,r=rng()*SKY.R*.72,x=SKY.x+Math.cos(a)*r,z=SKY.z+Math.sin(a)*r,y=SKYH(x-SKY.x,z-SKY.z)+1.3;
    const m=new THREE.Mesh(new THREE.OctahedronGeometry(.48),shard);m.position.set(x,y,z);scene.add(m);orbs.push({m,x,z,y,on:true});
  }
  for(let i=0;i<5;i++){
    const a=i/5*6.283+0.4,dist=SKY.R+55+rng()*40,px=SKY.x+Math.cos(a)*dist,pz=SKY.z+Math.sin(a)*dist;
    const pr=12+rng()*10,ph=SKY.base-15-rng()*25;
    const pgeo=new THREE.CylinderGeometry(pr,pr*1.1,4,16);pgeo.translate(0,-2,0);
    const plat=new THREE.Mesh(pgeo,new THREE.MeshStandardMaterial({color:'#7a9a5a',roughness:.9,flatShading:true}));
    plat.position.set(px,ph,pz);plat.castShadow=true;plat.receiveShadow=true;scene.add(plat);
    if(rng()<.6){
      const tr=AM['tree_pineRoundA'];if(tr){const t=tr.clone();t.position.set(px,ph,pz);t.scale.setScalar(1.2+rng());scene.add(t)}
    }
    const cr=new THREE.Mesh(new THREE.OctahedronGeometry(1.1),crystalM);cr.position.set(px+(rng()-.5)*6,ph+2,pz+(rng()-.5)*6);scene.add(cr);
  }
}
const S={x:0,y:0,z:0,vy:0,rot:0,yaw:0,pitch:.35,grounded:true,state:'idle',flying:false,kx:0,kz:0,hurt:0,iframe:0};

async function startGame(){
  $('lobby').style.display='none';
  ['hud','stick'].forEach(i=>$(i).style.display=i==='hud'?'flex':'block');$('jump').style.display='block';
  renderer=new THREE.WebGLRenderer({antialias:true});renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
  document.body.appendChild(renderer.domElement);
  camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,4200);
  boot('Loading world…');
  try{await Promise.race([Promise.all([loadAssets(),loadKartAssets(),loadChar().catch(e=>showErr('char: '+e))]),new Promise(r=>setTimeout(r,20000))])}catch(e){showErr(e)}
  try{buildWorld(roomCode);load()}catch(e){showErr(e);throw e}
  boot('');
  me=makeAvatar(myName,myColor);scene.add(me);dress(me,mySkin);
  S.x=TOWN.x+(Math.random()-.5)*4;S.z=TOWN.z+7+(Math.random()-.5)*2;S.y=H(S.x,S.z)+.1;
  addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()});
  bindInput();syncPresence();updateHud();
  history.replaceState(null,'','?room='+roomCode);
  requestAnimationFrame(tick);
  setInterval(send,100);
  setTimeout(()=>banner('Jump, then tap Jump again in the air to fly','TIP'),6000);
  setTimeout(()=>banner('Glowing beams on the horizon are new islands','TIP'),40000);
}

function addOther(id,name,color,skin){
  if(!scene||!me)return;
  const g=makeAvatar(name||'Partner',color||'#fff');g.userData.nm=name||'Partner';scene.add(g);dress(g,skin||0);
  others.set(id,{group:g,tx:0,ty:0,tz:0,tr:0,st:'idle'});
}
function removeOther(id){const o=others.get(id);if(o){scene.remove(o.group);others.delete(id)}updateHud()}
function onState(p){
  if(!scene||!me)return;
  let o=others.get(p.id);
  if(!o){const m=(chan.presenceState()[p.id]||[{}])[0];addOther(p.id,m.name,m.color,m.skin);o=others.get(p.id);if(!o)return;o.group.position.set(p.x,p.y,p.z)}
  o.tx=p.x;o.ty=p.y;o.tz=p.z;o.tr=p.r;
  if(o.st==='fall'&&p.st!=='fall'&&p.st!=='jump')o.group.userData.land=.15;o.st=p.st||'idle';
}
function send(){
  if(!chan||!entered)return;
  chan.send({type:'broadcast',event:'s',payload:{id:myId,x:+S.x.toFixed(2),y:+S.y.toFixed(2),z:+S.z.toFixed(2),r:+S.rot.toFixed(2),st:S.state}});
}

let disc=new Set(),orbs=[],got=0,pil,pulse=0;
function save(){try{localStorage.setItem('w4:'+roomCode,JSON.stringify({d:[...disc],o:orbs.map((o,i)=>o.on?-1:i).filter(i=>i>=0)}))}catch(e){}}
