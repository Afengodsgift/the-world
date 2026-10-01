const SUPABASE_URL='https://lzqnxawxehmqgswuzpyn.supabase.co';
const SUPABASE_KEY='sb_publishable_bAm2KsLV8__Y4nWSFesZeQ_38-Ly6DE';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const $=id=>document.getElementById(id);
const msg=t=>$('msg').textContent=t||'';
const ALPHA='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode=()=>{let s='';for(let i=0;i<8;i++)s+=ALPHA[Math.random()*ALPHA.length|0];return s.slice(0,4)+'-'+s.slice(4)};
const normCode=v=>{const c=v.toUpperCase().replace(/[^A-Z0-9]/g,'');return c.length===8?c.slice(0,4)+'-'+c.slice(4):null};
const myId=(crypto.randomUUID?crypto.randomUUID():String(Math.random()).slice(2));
if(THREE.ColorManagement)THREE.ColorManagement.legacyMode=false;
function showErr(e){let d=document.getElementById('err');if(!d){d=document.createElement('div');d.id='err';d.style.cssText='position:fixed;z-index:99;left:8px;right:8px;top:110px;padding:10px;background:#5a0d0dcc;color:#fff;font:12px monospace;white-space:pre-wrap;word-break:break-all;pointer-events:none';document.body.appendChild(d)}const t=String(e&&(e.stack||e.message)||e).slice(0,300);if(!d.textContent.includes(t))d.textContent+=t+'\n';clearTimeout(d._t);d._t=setTimeout(()=>d.remove(),8000)}
addEventListener('error',ev=>showErr(ev.error||ev.message));addEventListener('unhandledrejection',ev=>showErr(ev.reason));
function boot(t){let d=document.getElementById('boot');if(!t){d&&d.remove();return}if(!d){d=document.createElement('div');d.id='boot';d.style.cssText='position:fixed;z-index:9;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-style:italic;pointer-events:none;color:#fff';document.body.appendChild(d)}d.textContent=t}
const COLORS=['#ff6b8b','#ffb454','#6bd6ff','#8dff9a','#c08bff','#ffe66b'];
const myColor=COLORS[Math.random()*COLORS.length|0];
const SKINLABELS=['Man','Woman','Warrior','Robot'];
let mySkin=1;
{const row=$('skinRow');SKINLABELS.forEach((lab,i)=>{const b=document.createElement('button');b.textContent=lab;if(i===mySkin)b.className='sel';
  b.onclick=()=>{mySkin=i;[...row.children].forEach((c,k)=>c.className=k===i?'sel':'')};row.appendChild(b)})}

const pre=new URLSearchParams(location.search).get('room');
if(pre)$('code').value=pre;

$('create').onclick=()=>enter(genCode());
$('join').onclick=()=>{const c=normCode($('code').value);if(!c)return msg('Enter a code like KAMI-7X4P');enter(c)};

let chan,roomCode,myName,entered=false;
const others=new Map(); // id -> {group,tx,ty,tz,tr,meta}

async function enter(code){
  myName=($('name').value.trim()||'Player').slice(0,16);
  roomCode=code;msg('Connecting…');
  chan=sb.channel('world:'+code,{config:{broadcast:{self:false},presence:{key:myId}}});
  chan.on('broadcast',{event:'s'},({payload})=>onState(payload));
  chan.on('presence',{event:'sync'},syncPresence);
  chan.on('broadcast',{event:'c'},({payload})=>take(payload.i,false));
  chan.on('broadcast',{event:'u'},()=>{pulse=1.5;chime()});
  chan.on('broadcast',{event:'rs'},()=>startRace(false));
  chan.on('broadcast',{event:'ks'},()=>startKartRace(false));
  chan.on('broadcast',{event:'kp'},({payload})=>{kart.pi=payload.i});
  chan.on('broadcast',{event:'kf'},({payload})=>{if(kart.on)banner('Partner finished in '+fmt(payload.ms),'RACE TRACK')});
  chan.on('broadcast',{event:'hs'},({payload})=>startHunt(false,payload.n));
  chan.on('broadcast',{event:'hf'},()=>dig(false));
  chan.on('broadcast',{event:'rp'},({payload})=>{race.pi=payload.i});
  chan.on('broadcast',{event:'rf'},({payload})=>{if(race.on)banner('Partner finished in '+fmt(payload.ms),'SKY RACE')});
  chan.on('broadcast',{event:'sm'},({payload})=>{if(payload.from!==myId)onSmacked(payload)});
  chan.subscribe(async status=>{
    if(status==='SUBSCRIBED'&&!entered){
      await new Promise(r=>setTimeout(r,700));
      if(Object.keys(chan.presenceState()).length>=2){msg('This world is full (2 players max).');sb.removeChannel(chan);return}
      entered=true;
      await chan.track({name:myName,color:myColor,skin:mySkin});
      startGame();
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){msg('Could not connect. Check your connection and try again.')}
  });
}

function syncPresence(){
  if(!entered||!scene||!me)return;
  const st=chan.presenceState();
  for(const id of Object.keys(st)){
    if(id===myId||others.has(id))continue;
    const m=st[id][0];addOther(id,m.name,m.color,m.skin);
  }
  for(const id of [...others.keys()])if(!st[id])removeOther(id);
  updateHud();
}
function updateHud(){
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
  loadChar().then(()=>new Promise((res,rej)=>new THREE.GLTFLoader().parse(charBuf.slice(0),AURL,res,rej))).then(r=>{
    const m=r.scene,bones={};m.scale.setScalar(.5);
    m.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.bones.forEach(b=>bones[b.name]=b);o.frustumCulled=false;o.material=new THREE.MeshStandardMaterial({map:skinT[skin%skinT.length],roughness:.85,metalness:0})}});
    const mx=new THREE.AnimationMixer(m),act={};for(const n in clips)act[n]=mx.clipAction(clips[n]);
    act.jump.setLoop(THREE.LoopOnce,1);act.jump.clampWhenFinished=true;
    const u=g.userData;u.rig.visible=false;m.traverse(c=>{if(c.isMesh){c.castShadow=true}});g.add(m);Object.assign(u,{mixer:mx,act,model:m,bones,cur:null,ph:0,swing:0});
    if(PAN_ENABLED&&bones.RightHand)loadPan().then(()=>new Promise((res,rej)=>new THREE.GLTFLoader().parse(panBuf.slice(0),AURL,res,rej))).then(pr=>{
      const piv=new THREE.Group(),pn=pr.scene;pn.traverse(c=>{if(c.isMesh)c.castShadow=true});
      // tuned so pan sits naturally in right hand when equipped
      pn.position.set(0.02, -0.08, 0.04);
      piv.add(pn);
      piv.scale.setScalar(0.028);
      piv.rotation.set(-0.4, 0.1, -Math.PI/2.3);
      bones.RightHand.add(piv);
      u.pan = piv;
      piv.visible = false; // start unequipped
    }).catch(()=>{});
  }).catch(()=>{});
}
loadAssets();loadChar().catch(()=>{});

function SKYH(dx,dz){const d=Math.hypot(dx,dz);const dome=Math.max(0,1-(d/SKY.R)**2);let h=SKY.base+dome*20+Math.sin(dx*.06)*Math.cos(dz*.05)*1.3;
  if(d>SKY.R){const t=Math.min(1,(d-SKY.R)/45);h=SKY.base-t*t*95}
  return h}
function H(x,z){
  const d=Math.hypot(x,z);
  let h=Math.max(-3,(1-(d/(85*K))**2)*3.5-.6)+Math.sin(x*.11/K)*Math.cos(z*.13/K)*.8;
  h+=40*Math.exp(-(x*x+(z+55*K)**2)/4050);
  const t=1-sstep(30,55,Math.hypot(x-TOWN.x,z-TOWN.z));
  h=h*(1-t)+1.6*t;
  for(const I of ISL){const dx=x-I.x,dz=z-I.z,dd=Math.hypot(dx,dz);if(dd>I.R*1.6)continue;
    const v=Math.max(-3,(1-(dd/I.R)**2)*4-.6)+Math.sin(x*.09)*Math.cos(z*.11)*.7+I.pk*Math.exp(-dd*dd/(2*(I.R*.35)**2));
    if(v>h)h=v}
  return h;
}
function terrain(cx,cz,size,seg){
  const geo=new THREE.PlaneGeometry(size,size,seg,seg);geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position,cols=new Float32Array(pos.count*3),c=new THREE.Color();
  for(let i=0;i<pos.count;i++){const x=pos.getX(i)+cx,z=pos.getZ(i)+cz,h=H(x,z);pos.setY(i,h);terrainColor(h,x,z,c);cols.set([c.r,c.g,c.b],i*3)}
  geo.setAttribute('color',new THREE.BufferAttribute(cols,3));geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));m.position.set(cx,0,cz);m.receiveShadow=true;scene.add(m);
}
const _cg1=new THREE.Color('#4d7a32'),_cg2=new THREE.Color('#86a34a'),_cdry=new THREE.Color('#a19a5a'),_crock=new THREE.Color('#7b786f'),_csand=new THREE.Color('#dccba0'),_csand2=new THREE.Color('#bfa97f'),_csnow=new THREE.Color('#eef3fa'),_ct=new THREE.Color();
function terrainColor(h,x,z,c){
  const n=(Math.sin(x*.045)*Math.cos(z*.038)+Math.sin(x*.13+z*.09)*.5+Math.sin(z*.21-x*.17)*.25)*.28+.5,q=Math.max(0,Math.min(1,n));
  const sl=Math.hypot(H(x+2,z)-H(x-2,z),H(x,z+2)-H(x,z-2))/4;
  c.copy(_cg1).lerp(_cg2,q);if(n<.12)c.lerp(_cdry,.5);
  c.lerp(_crock,Math.max(sstep(.5,.85,sl),sstep(11,17,h)));
  c.lerp(_csnow,sstep(27,31,h));
  _ct.copy(_csand).lerp(_csand2,h<.1?.85:.2+q*.25);c.lerp(_ct,1-sstep(.3,.95,h));
}
function scatter(name,th,pl){
  const m=AM[name];if(!m||!pl.length)return null;
  m.updateMatrixWorld(true);
  const bx=new THREE.Box3().setFromObject(m),k=th/(bx.max.y-bx.min.y),V=new THREE.Vector3(),Q=new THREE.Quaternion(),Sc=new THREE.Vector3(),P=new THREE.Matrix4(),M=new THREE.Matrix4(),Y=new THREE.Vector3(0,1,0);
  m.traverse(o=>{if(!o.isMesh)return;const im=new THREE.InstancedMesh(o.geometry,o.material,pl.length);
    pl.forEach((p,i)=>{V.set(p.x,p.y-bx.min.y*k*p.s,p.z);Q.setFromAxisAngle(Y,p.ry);Sc.setScalar(k*p.s);P.compose(V,Q,Sc);M.multiplyMatrices(P,o.matrixWorld);im.setMatrixAt(i,M)});
    im.castShadow=true;im.receiveShadow=true;const tc=new THREE.Color();pl.forEach((p,i)=>im.setColorAt(i,tc.setScalar(.78+((p.x*12.9898+p.z*78.233)%1+1)%1*.4)));
    im.frustumCulled=false;scene.add(im)});
  return {w:Math.max(bx.max.x-bx.min.x,bx.max.z-bx.min.z)*k};
}
function place(par,n,x,y,z,ry,sx,sy,sz){
  const m=AM[n];if(!m)return null;const o=m.clone();o.position.set(x,y,z);o.rotation.y=ry;
  o.scale.set(sx,sy===undefined?sx:sy,sz===undefined?sx:sz);o.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true}});par.add(o);return o;
}
function house(hx,hz,ry,w,d){
  const g=new THREE.Group(),S=2.6;
  for(let i=0;i<w;i++)for(let j=0;j<d;j++){
    const cx=(i-(w-1)/2)*S,cz=(j-(d-1)/2)*S,sides=[];
    if(i===w-1)sides.push([1,0]);if(i===0)sides.push([-1,0]);if(j===d-1)sides.push([0,1]);if(j===0)sides.push([0,-1]);
    for(const [dx,dz] of sides){
      const n=(dz===1&&i===(w>>1))?'wall-wood-door':((i+j+dx+dz)&1?'wall-wood-window-small':'wall-wood');
      place(g,n,cx,0,cz,Math.atan2(-dz,dx),S);
    }
  }
  for(let i=0;i<w;i++){const cx=(i-(w-1)/2)*S,end=i===0||i===w-1;
    place(g,end?'roof-gable-end':'roof-gable',cx,S,0,i===w-1?Math.PI:0,S,S,S*d)}
  g.position.set(hx,H(hx,hz)+.05,hz);g.rotation.y=ry;scene.add(g);solids.push({x:hx,z:hz,r:S*Math.max(w,d)*.5*1.15});
}
function buildWorld(code){
  scene=new THREE.Scene();
  scene.background=new THREE.Color('#cfe3f2');
  scene.fog=new THREE.Fog('#cfe3f2',150,1700);
  scene.add(new THREE.HemisphereLight('#bcd7ff','#7d7355',.75));scene.add(new THREE.AmbientLight('#ffffff',.12));
  const sd=new THREE.Vector3(.5,.62,.32).normalize();
  sun=new THREE.DirectionalLight('#fff0d2',1.35);sun.userData.sd=sd;sun.position.copy(sd).multiplyScalar(140);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);const sc=sun.shadow.camera;sc.left=-75;sc.right=75;sc.top=75;sc.bottom=-75;sc.near=10;sc.far=320;sun.shadow.bias=-.0004;sun.shadow.normalBias=.6;
  scene.add(sun);scene.add(sun.target);
  sky=new THREE.Mesh(new THREE.SphereGeometry(2800,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false,uniforms:{sd:{value:sd}},
    vertexShader:'varying vec3 vd;void main(){vd=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 vd;uniform vec3 sd;void main(){vec3 d=normalize(vd);float h=clamp(d.y,0.,1.);vec3 hor=vec3(.81,.89,.95),zen=vec3(.2,.42,.74);vec3 c=mix(hor,zen,pow(h,.5));float s=max(dot(d,sd),0.);c+=vec3(1.,.86,.62)*(pow(s,700.)*2.5+pow(s,10.)*.22);if(d.y<0.)c=mix(hor,vec3(.6,.72,.8),clamp(-d.y*4.,0.,1.));gl_FragColor=vec4(c,1.);}'}));
  sky.renderOrder=-1;scene.add(sky);
  terrain(0,0,600,200);
  for(const I of ISL){terrain(I.x,I.z,I.R*2.6,Math.min(120,Math.round(I.R*2.6/6)));
    const bm=new THREE.Mesh(new THREE.CylinderGeometry(2,2,140,8,1,true),new THREE.MeshBasicMaterial({color:I.c,transparent:true,opacity:.4,fog:false,side:THREE.DoubleSide}));
    bm.position.set(I.x,H(I.x,I.z)+70,I.z);scene.add(bm)}
  const sea=new THREE.Mesh(new THREE.CircleGeometry(6000,48),new THREE.MeshStandardMaterial({color:'#2f6f9a',roughness:.12,metalness:.15,transparent:true,opacity:.82}));
  {const cv=document.createElement('canvas');cv.width=cv.height=256;const cx2=cv.getContext('2d'),im2=cx2.createImageData?cx2.createImageData(256,256):null;
   if(im2){for(let y=0;y<256;y++)for(let x=0;x<256;x++){const a=x/256*6.2832,b=y/256*6.2832,v=128+40*Math.sin(a*3+Math.sin(b*2))+30*Math.sin(b*5+a)+20*Math.sin(a*8-b*6);const i=(y*256+x)*4;im2.data[i]=im2.data[i+1]=im2.data[i+2]=v;im2.data[i+3]=255}cx2.putImageData(im2,0,0)}
   seaTex=new THREE.CanvasTexture(cv);seaTex.wrapS=seaTex.wrapT=THREE.RepeatWrapping;seaTex.repeat.set(500,500);sea.material.bumpMap=seaTex;sea.material.bumpScale=.35}
  sea.rotation.x=-Math.PI/2;sea.position.y=-.3;scene.add(sea);
  rng=mulberry(hashSeed(code));
  if(AM.plant_bushLarge)AM.plant_bushLarge.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.side=THREE.DoubleSide;o.material.emissive=new THREE.Color('#2a6a30')}});
  const dist=(x,z)=>Math.hypot(x-TOWN.x,z-TOWN.z),P={};
  const add=(n,x,z,s)=>{(P[n]=P[n]||[]).push({x,y:H(x,z),z,ry:rng()*6.283,s})};
  // forest (west), scattered trees, beach palms, bushes, rocks
  const kinds=['tree_pineDefaultA','tree_pineRoundA','tree_oak','tree_fat'];
  for(let i=0,n=0;i<1500&&n<300;i++){const a=rng()*6.283,r=rng()*80,x=-110+Math.cos(a)*r,z=40+Math.sin(a)*r,h=H(x,z);
    if(h<.8||h>18||dist(x,z)<50)continue;add(kinds[rng()*4|0],x,z,.8+rng()*.5);n++}
  for(let i=0,n=0;i<900&&n<70;i++){const a=rng()*6.283,r=rng()*210,x=Math.cos(a)*r,z=Math.sin(a)*r,h=H(x,z);
    if(h<.8||h>22||dist(x,z)<50)continue;add(kinds[rng()*4|0],x,z,.8+rng()*.5);n++}
  for(let i=0,n=0;i<900&&n<45;i++){const a=rng()*6.283,r=170+rng()*50,x=Math.cos(a)*r,z=Math.sin(a)*r,h=H(x,z);
    if(h<.4||h>2)continue;add('tree_palmTall',x,z,.8+rng()*.4);n++}
  for(let i=0,n=0;i<900&&n<120;i++){const a=rng()*6.283,r=rng()*215,x=Math.cos(a)*r,z=Math.sin(a)*r,h=H(x,z);
    if(h<.6||h>26||dist(x,z)<40)continue;add('plant_bushLarge',x,z,.7+rng()*.7);n++}
  for(let i=0,n=0;i<900&&n<60;i++){const a=rng()*6.283,r=15+rng()*200,x=Math.cos(a)*r,z=Math.sin(a)*r,h=H(x,z);
    if(h<-.2||dist(x,z)<40)continue;add(rng()<.5?'stone_largeA':'rock_tallB',x,z,.5+rng()*.9);n++}
  for(const I of ISL){const palm=I.pk<15;
    for(let i=0,n=0;i<1500&&n<Math.round(I.R*.6);i++){const a=rng()*6.283,r=rng()*I.R*.95,x=I.x+Math.cos(a)*r,z=I.z+Math.sin(a)*r,h=H(x,z);
      if(h<(palm?.4:1.2)||h>16)continue;add(palm?'tree_palmTall':kinds[rng()*4|0],x,z,.8+rng()*.5);n++}
    for(let i=0,n=0;i<600&&n<24;i++){const a=rng()*6.283,r=rng()*I.R*.9,x=I.x+Math.cos(a)*r,z=I.z+Math.sin(a)*r;
      if(H(x,z)<-.2)continue;add(rng()<.5?'stone_largeA':'rock_tallB',x,z,.5+rng()*.9);n++}}
  const TH={tree_pineDefaultA:9,tree_pineRoundA:8,tree_oak:7,tree_fat:6.5,tree_palmTall:8,plant_bushLarge:.9,stone_largeA:.9,rock_tallB:2.6};
  for(const nm in P){const f=scatter(nm,TH[nm],P[nm]);if(!f)continue;
    for(const p of P[nm]){
      if(nm.startsWith('tree_'))solids.push({x:p.x,z:p.z,r:f.w*p.s*(nm==='tree_palmTall'?.05:.12)});
      else if(nm.endsWith('A')||nm.startsWith('rock'))solids.push({x:p.x,z:p.z,r:f.w*p.s*.38,h:p.y+TH[nm]*p.s*.85})}}
// town: fountain + golden pillar, lanterns, stalls, cottages facing the plaza
  place(scene,'fountain-round',TOWN.x,1.6,TOWN.z,0,6);solids.push({x:TOWN.x,z:TOWN.z,r:5.4});
  pil=new THREE.Mesh(new THREE.CylinderGeometry(.5,.6,3,10),new THREE.MeshStandardMaterial({color:'#ffd27a',emissive:'#000000'}));pil.position.set(TOWN.x,3.4,TOWN.z);scene.add(pil);
  for(let i=0;i<8;i++){const a=i/8*6.283,x=TOWN.x+Math.cos(a)*11,z=TOWN.z+Math.sin(a)*11;place(scene,'lantern',x,H(x,z),z,0,2.2);solids.push({x,z,r:.25})}
  [['stall-red',0.3],['stall-green',2.4],['stall-red',4.5]].forEach(([n,a])=>{const x=TOWN.x+Math.cos(a)*17,z=TOWN.z+Math.sin(a)*17;
    place(scene,n,x,H(x,z),z,Math.atan2(-Math.cos(a),-Math.sin(a))+Math.PI/2*0,3);solids.push({x,z,r:1.8})});
  {const x=TOWN.x-16,z=TOWN.z+15;place(scene,'cart',x,H(x,z),z,.6,2.6);solids.push({x,z,r:1.6})}
  for(let i=0;i<8;i++){const a=i/8*6.283+.2;
    house(TOWN.x+Math.cos(a)*30,TOWN.z+Math.sin(a)*30,Math.atan2(-Math.cos(a),-Math.sin(a)),3,3)}

  // cave mouth on the mountain's south face
  const cx=18,cz=-88,cg=new THREE.Group(),stone=new THREE.MeshStandardMaterial({color:'#7a7f8c'}),CS=2.4;
  cg.position.set(cx,H(cx,cz),cz);cg.scale.setScalar(CS);
  for(const px of [-2.4,2.4]){const p=new THREE.Mesh(new THREE.BoxGeometry(1.4,5,1.6),stone);p.position.set(px,1.5,0);cg.add(p);solids.push({x:cx+px*CS,z:cz,r:.7*CS})}
  const lin=new THREE.Mesh(new THREE.BoxGeometry(6.4,1.3,1.8),stone);lin.position.y=4.3;cg.add(lin);
  const dk=new THREE.Mesh(new THREE.BoxGeometry(3.6,4.2,.4),new THREE.MeshBasicMaterial({color:'#05060c'}));dk.position.set(0,1.9,-.6);cg.add(dk);
  solids.push({x:cx,z:cz-CS,r:1.6*CS});scene.add(cg);
  // collectible star shards (2 by the peak/cave, 3 out in the water, rest on land)
  const om=new THREE.MeshStandardMaterial({color:'#ffe08a',emissive:'#ffb020',emissiveIntensity:.9}),pts=[[0,-137],[18,-83]];
  for(let i=0;i<3;i++){const a=rng()*6.283;pts.push([Math.cos(a)*235,Math.sin(a)*235])}
  while(pts.length<40){const a=rng()*6.283,r=12+rng()*195,x=Math.cos(a)*r,z=Math.sin(a)*r,h=H(x,z);if(h>.5&&h<40&&dist(x,z)>45)pts.push([x,z])}
  for(const I of ISL)for(let i=0;i<8;i++){const a=rng()*6.283,r=rng()*I.R*.6,x=I.x+Math.cos(a)*r,z=I.z+Math.sin(a)*r;if(H(x,z)>.5)pts.push([x,z])}
  for(const [x,z] of pts){const m=new THREE.Mesh(new THREE.OctahedronGeometry(.5),om),y=Math.max(H(x,z),-.8)+1.2;m.position.set(x,y,z);scene.add(m);orbs.push({m,x,z,y,on:true})}
  buildRace();buildHunt();buildSeaLife();buildSkyIsland();buildKartTrack();
}
function buildSkyIsland(){
  // ─── MAIN TOP SURFACE ───
  const geo=new THREE.PlaneGeometry(SKY.R*2.8,SKY.R*2.8,80,80);geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position,cols=new Float32Array(pos.count*3),c=new THREE.Color();
  const cGrass1=new THREE.Color('#5fa84a'),cGrass2=new THREE.Color('#8fd46a'),cDirt=new THREE.Color('#9a8b6a'),cRock=new THREE.Color('#8a8074'),cPath=new THREE.Color('#c9b896');
  for(let i=0;i<pos.count;i++){
    const dx=pos.getX(i),dz=pos.getZ(i),d=Math.hypot(dx,dz),y=SKYH(dx,dz);
    pos.setY(i,y-SKY.base);
    // soft meadow with path toward shrine (north) and pond (center-south)
    const pathN=Math.exp(-((dx*dx+(dz-30)**2)/900)); // path to shrine
    const pond=Math.exp(-((dx*dx+(dz+20)**2)/180));
    c.copy(cGrass1).lerp(cGrass2,Math.sin(dx*.28+dz*.19)*.5+.5);
    c.lerp(cDirt,sstep(SKY.R*.92,SKY.R*1.15,d)*.7);
    c.lerp(cPath,pathN*.55);
    c.lerp(new THREE.Color('#4a8fc8'),pond*.85);
    cols.set([c.r,c.g,c.b],i*3);
  }
  geo.setAttribute('color',new THREE.BufferAttribute(cols,3));geo.computeVertexNormals();
  const top=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95}));
  top.position.set(SKY.x,SKY.base,SKY.z);top.receiveShadow=true;scene.add(top);

  // ─── DRAMATIC UNDERSIDE ───
  const rockM=new THREE.MeshStandardMaterial({color:'#6e655c',roughness:1,flatShading:true});
  const under=new THREE.Group();
  const core=[[SKY.R*.88,22,0,0],[SKY.R*.65,38,SKY.R*.1,SKY.R*.06],[SKY.R*.62,34,-SKY.R*.14,SKY.R*.04],[SKY.R*.42,48,SKY.R*.04,-SKY.R*.08],[SKY.R*.4,44,-SKY.R*.07,SKY.R*.11]];
  let yy=8;
  for(const [r,h,ox,oz] of core){
    const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,8+(rng()*3|0)),rockM);
    m.position.set(ox,yy-h*.5,oz);m.rotation.y=rng()*6.283;m.scale.set(1+rng()*.25,1,1+rng()*.25);under.add(m);yy-=h*.58;
  }
  for(let i=0;i<32;i++){
    const a=rng()*6.283,r=SKY.R*(.12+rng()*.72);
    const rk=new THREE.Mesh(new THREE.DodecahedronGeometry(2.5+rng()*11,0),rockM);
    rk.position.set(Math.cos(a)*r,-8-rng()*110,Math.sin(a)*r);
    rk.rotation.set(rng()*3,rng()*3,rng()*3);rk.scale.set(1,.55+rng()*.7,1);under.add(rk);
  }
  // long hanging roots
  for(let i=0;i<12;i++){
    const a=rng()*6.283,r=SKY.R*(.08+rng()*.5),len=50+rng()*80,rad=1.8+rng()*3.2;
    const m=new THREE.Mesh(new THREE.ConeGeometry(rad,len,5),rockM);
    m.position.set(Math.cos(a)*r,-25-rng()*35-len*.35,Math.sin(a)*r);
    m.rotation.set((rng()-.5)*.55,rng()*6.283,(rng()-.5)*.55);under.add(m);
  }
  // glowing crystals under the island
  const crystalM=new THREE.MeshStandardMaterial({color:'#a8e8ff',emissive:'#40c0ff',emissiveIntensity:1.1,roughness:.2});
  for(let i=0;i<9;i++){
    const a=rng()*6.283,r=SKY.R*(.15+rng()*.4);
    const cr=new THREE.Mesh(new THREE.OctahedronGeometry(1.2+rng()*1.8,0),crystalM);
    cr.position.set(Math.cos(a)*r,-15-rng()*40,Math.sin(a)*r);
    cr.rotation.set(rng(),rng(),rng());under.add(cr);
  }
  under.position.set(SKY.x,SKY.base-2,SKY.z);under.traverse(o=>{if(o.isMesh)o.castShadow=true});scene.add(under);

  // rim rock spires
  for(let i=0;i<11;i++){
    const a=i/11*6.283+rng()*.25,r=SKY.R*(.9+rng()*.18);
    const x=SKY.x+Math.cos(a)*r,z=SKY.z+Math.sin(a)*r,base=SKYH(x-SKY.x,z-SKY.z),h=12+rng()*26;
    const m=new THREE.Mesh(new THREE.ConeGeometry(3.5+rng()*4,h,6),rockM);
    m.position.set(x,base+h*.28,z);m.rotation.set((rng()-.5)*.25,rng()*6.283,(rng()-.5)*.25);m.castShadow=true;scene.add(m);
    solids.push({x,z,r:3.5});
  }

  // ─── GIANT WATERFALL + CAVE ───
  {
    const a=2.35,ex=SKY.x+Math.cos(a)*SKY.R*.88,ez=SKY.z+Math.sin(a)*SKY.R*.88,top_y=SKYH(ex-SKY.x,ez-SKY.z);
    // main sheet
    const wf=new THREE.Mesh(new THREE.PlaneGeometry(18,140),new THREE.MeshStandardMaterial({color:'#c8f0ff',roughness:.12,metalness:.15,transparent:true,opacity:.72,side:THREE.DoubleSide}));
    wf.position.set(ex+Math.cos(a)*7,top_y-68,ez+Math.sin(a)*7);wf.rotation.y=a+Math.PI/2;scene.add(wf);
    // secondary thinner sheets for volume
    for(let k=0;k<3;k++){
      const w2=new THREE.Mesh(new THREE.PlaneGeometry(6+rng()*5,90+rng()*40),new THREE.MeshStandardMaterial({color:'#b0e8ff',roughness:.2,transparent:true,opacity:.45,side:THREE.DoubleSide}));
      w2.position.set(ex+Math.cos(a)*(5+k*2)+(rng()-.5)*4,top_y-50-rng()*20,ez+Math.sin(a)*(5+k*2)+(rng()-.5)*4);
      w2.rotation.y=a+Math.PI/2+(rng()-.5)*.2;scene.add(w2);
    }
    // mist pool at bottom
    const mist=new THREE.Mesh(new THREE.CircleGeometry(22,24),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.38}));
    mist.rotation.x=-Math.PI/2;mist.position.set(ex+Math.cos(a)*8,top_y-130,ez+Math.sin(a)*8);scene.add(mist);
    // cave mouth behind waterfall
    const caveM=new THREE.MeshStandardMaterial({color:'#2a2520',roughness:1});
    const cave=new THREE.Mesh(new THREE.CylinderGeometry(5.5,6.5,9,12,1,true),caveM);
    cave.position.set(ex-Math.cos(a)*4,top_y-3,ez-Math.sin(a)*4);cave.rotation.z=Math.PI/2;cave.rotation.y=a;scene.add(cave);
    // crystals inside cave
    for(let i=0;i<6;i++){
      const cr=new THREE.Mesh(new THREE.OctahedronGeometry(.7+rng()*.9,0),crystalM);
      cr.position.set(ex-Math.cos(a)*(6+i*1.2)+(rng()-.5)*2,top_y-1+rng()*3,ez-Math.sin(a)*(6+i*1.2)+(rng()-.5)*2);
      cr.rotation.set(rng(),rng(),rng());scene.add(cr);
    }
    // pond near waterfall start
    const pond=new THREE.Mesh(new THREE.CircleGeometry(11,28),new THREE.MeshStandardMaterial({color:'#3a9ad4',roughness:.05,metalness:.3,transparent:true,opacity:.85}));
    pond.rotation.x=-Math.PI/2;pond.position.set(ex-Math.cos(a)*18,top_y+.15,ez-Math.sin(a)*18);scene.add(pond);
  }

  // ─── SKY VILLAGE (tiny cozy) ───
  {
    const vx=SKY.x+18,vz=SKY.z-35;
    const vy=SKYH(18,-35);
    // 3 little houses using existing wall/roof assets
    for(let i=0;i<3;i++){
      const hx=vx+(i-1)*11,hz=vz+ (i===1?4:0);
      place(scene,'wall-wood',hx,vy,hz,0,2.4);
      place(scene,'wall-wood-door',hx,vy,hz+1.2,0,2.4);
      place(scene,'roof-gable',hx,vy+2.6,hz,0,2.6);
    }
    // stalls + lanterns + campfire feel
    place(scene,'stall-green',vx-14,vy,vz+8,1.2,1.6);
    place(scene,'stall-red',vx+14,vy,vz+6,-.8,1.5);
    place(scene,'lantern',vx,vy+0.1,vz+10,0,1.3);
    place(scene,'lantern',vx-8,vy+0.1,vz-2,0,1.2);
    place(scene,'fountain-round',vx,vy,vz-8,0,1.4);
    // benches as low boxes
    const benchM=new THREE.MeshStandardMaterial({color:'#8b6914',roughness:.8});
    for(let i=0;i<4;i++){
      const b=new THREE.Mesh(new THREE.BoxGeometry(2.2,.35,.55),benchM);
      b.position.set(vx+(i%2?6:-6),vy+.25,vz+(i<2?12:-4));b.castShadow=true;scene.add(b);
    }
  }

  // ─── SUNSET CAMP (edge viewpoint) ───
  {
    const cx=SKY.x-55,cz=SKY.z+70,cy=SKYH(-55,70);
    // logs around fire
    const logM=new THREE.MeshStandardMaterial({color:'#5c3a1e',roughness:1});
    for(let i=0;i<5;i++){
      const a=i/5*6.283,log=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,2.4,8),logM);
      log.position.set(cx+Math.cos(a)*3.2,cy+.3,cz+Math.sin(a)*3.2);log.rotation.z=Math.PI/2;log.rotation.y=a;log.castShadow=true;scene.add(log);
    }
    // fire glow
    const fire=new THREE.Mesh(new THREE.SphereGeometry(.9,10,8),new THREE.MeshStandardMaterial({color:'#ff6a00',emissive:'#ff4500',emissiveIntensity:1.4,transparent:true,opacity:.9}));
    fire.position.set(cx,cy+1.1,cz);scene.add(fire);
    // lantern
    place(scene,'lantern',cx+5,cy,cz-3,0,1.1);
  }

  // ─── SKY SHRINE (high point) ───
  {
    const sx=SKY.x+5,sz=SKY.z-90,sy=SKYH(5,-90)+1;
    // circular platform
    const plat=new THREE.Mesh(new THREE.CylinderGeometry(14,15,1.2,28),new THREE.MeshStandardMaterial({color:'#c8c0b0',roughness:.7}));
    plat.position.set(sx,sy,sz);plat.receiveShadow=true;plat.castShadow=true;scene.add(plat);
    // stone arches
    const archM=new THREE.MeshStandardMaterial({color:'#a09888',roughness:.85,flatShading:true});
    for(let i=0;i<4;i++){
      const a=i/4*Math.PI*2;
      const pillar=new THREE.Mesh(new THREE.BoxGeometry(1.6,9,1.6),archM);
      pillar.position.set(sx+Math.cos(a)*9,sy+4.5,sz+Math.sin(a)*9);pillar.castShadow=true;scene.add(pillar);
    }
    // floating crystal center
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(2.8,0),new THREE.MeshStandardMaterial({color:'#ffe8a0',emissive:'#ffb020',emissiveIntensity:1.3,roughness:.15}));
    core.position.set(sx,sy+6,sz);scene.add(core);
    solids.push({x:sx,z:sz,r:12,h:sy+2});
  }

  // ─── VEGETATION (composition over quantity) ───
  const kinds=['tree_pineDefaultA','tree_pineRoundA','tree_oak','tree_fat'],P={},TH={tree_pineDefaultA:9,tree_pineRoundA:8,tree_oak:7,tree_fat:6.5,plant_bushLarge:1.4,stone_largeA:2.2,rock_tallB:2.6};
  const addk=(n,x,z,s)=>{(P[n]=P[n]||[]).push({x,y:SKYH(x-SKY.x,z-SKY.z),z,ry:rng()*6.283,s})};
  // carefully placed clusters instead of random spam
  const clusters=[[-40,-20,12],[30,25,10],[55,-50,8],[-60,40,9],[10,60,7],[-20,-70,11],[70,10,6]];
  for(const [cx,cz,n] of clusters){
    for(let i=0;i<n;i++){
      const a=rng()*6.283,r=3+rng()*14;
      addk(kinds[rng()*4|0],SKY.x+cx+Math.cos(a)*r,SKY.z+cz+Math.sin(a)*r,.75+rng()*.55);
    }
  }
  for(let i=0;i<28;i++){const a=rng()*6.283,r=rng()*SKY.R*.7;addk('plant_bushLarge',SKY.x+Math.cos(a)*r,SKY.z+Math.sin(a)*r,.85+rng()*.7)}
  for(let i=0;i<16;i++){const a=rng()*6.283,r=rng()*SKY.R*.82;addk(rng()<.5?'stone_largeA':'rock_tallB',SKY.x+Math.cos(a)*r,SKY.z+Math.sin(a)*r,.55+rng()*1.1)}
  for(const nm in P){const f=scatter(nm,TH[nm],P[nm]);if(!f)continue;for(const p of P[nm]){if(nm.startsWith('tree_'))solids.push({x:p.x,z:p.z,r:.3*p.s});else if(!nm.startsWith('plant_'))solids.push({x:p.x,z:p.z,r:f.w*.35*p.s,h:p.y+2*p.s})}}

  // ─── STAR SHARDS ───
  const shard=new THREE.MeshStandardMaterial({color:'#ffe08a',emissive:'#ffb020',emissiveIntensity:.95});
  for(let i=0;i<10;i++){
    const a=rng()*6.283,r=rng()*SKY.R*.72,x=SKY.x+Math.cos(a)*r,z=SKY.z+Math.sin(a)*r,y=SKYH(x-SKY.x,z-SKY.z)+1.3;
    const m=new THREE.Mesh(new THREE.OctahedronGeometry(.48),shard);m.position.set(x,y,z);scene.add(m);orbs.push({m,x,z,y,on:true});
  }
// ─── SMALLER FLOATING PLATFORMS nearby (for sky play) ───
  for(let i=0;i<5;i++){
    const a=i/5*6.283+0.4,dist=SKY.R+55+rng()*40,px=SKY.x+Math.cos(a)*dist,pz=SKY.z+Math.sin(a)*dist;
    const pr=12+rng()*10,ph=SKY.base-15-rng()*25;
    const pgeo=new THREE.CylinderGeometry(pr,pr*1.1,4,16);pgeo.translate(0,-2,0);
    const plat=new THREE.Mesh(pgeo,new THREE.MeshStandardMaterial({color:'#7a9a5a',roughness:.9,flatShading:true}));
    plat.position.set(px,ph,pz);plat.castShadow=true;plat.receiveShadow=true;scene.add(plat);
    // little tree or crystal on some
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
  // spawn: slot by join order (offset so partners don't overlap)
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

// ---------- exploration ----------
let disc=new Set(),orbs=[],got=0,pil,pulse=0;
function save(){try{localStorage.setItem('w4:'+roomCode,JSON.stringify({d:[...disc],o:orbs.map((o,i)=>o.on?-1:i).filter(i=>i>=0)}))}catch(e){}}
function load(){try{const v=JSON.parse(localStorage.getItem('w4:'+roomCode)||'{}');disc=new Set(v.d||[]);for(const i of v.o||[])if(orbs[i]){orbs[i].on=false;orbs[i].m.visible=false;got++}}catch(e){}}
function banner(t,l){const b=$('banner');b.innerHTML='<small>'+(l||'NEW LOCATION DISCOVERED')+'</small><br>'+t;b.style.opacity=1;clearTimeout(banner.t);banner.t=setTimeout(()=>b.style.opacity=0,3200)}
function take(i,local){const o=orbs[i];if(!o||!o.on)return;o.on=false;o.m.visible=false;got++;save();updateHud();if(local&&chan)chan.send({type:'broadcast',event:'c',payload:{i}})}
function chime(){try{const a=new(window.AudioContext||webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.frequency.value=660;o.connect(g);g.connect(a.destination);g.gain.setValueAtTime(.2,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+1.4);o.start();o.stop(a.currentTime+1.4)}catch(e){}}
function doUse(){Interaction.use()}
Interaction.register('dig','Dig!',
  ()=>hunt.on&&Math.hypot(S.x-hunt.x,S.z-hunt.z)<6&&Math.abs(S.y-hunt.y)<20,
  ()=>dig(true));
Interaction.register('hunt','Start Treasure Hunt',
  ()=>Math.hypot(S.x-BOARD.x,S.z-BOARD.z)<5,
  ()=>startHunt(true));
Interaction.register('race','Start Sky Race',
  ()=>Math.hypot(S.x-WP[0][0],S.z-WP[0][1])<7,
  ()=>startRace(true));
Interaction.register('pil','Use',
  ()=>Math.hypot(S.x-TOWN.x,S.z-TOWN.z)<8,
  ()=>{pulse=1.5;chime();if(chan)chan.send({type:'broadcast',event:'u',payload:{}})});
Interaction.register('kart','Start Ground Race',
  ()=>kart.padX!==undefined&&Math.hypot(S.x-kart.padX,S.z-kart.padZ)<7,
  ()=>startKartRace(true));
function explore(dt,t){
  for(const L of LOCS)if(!disc.has(L.n)&&Math.hypot(S.x-L.x,S.z-L.z)<L.r&&(!L.y||S.y>L.y)){disc.add(L.n);banner(L.n);save();updateHud()}
  orbs.forEach((o,i)=>{if(!o.on)return;o.m.rotation.y+=dt*2;o.m.position.y=o.y+Math.sin(t/400+i)*.15;
    if(Math.hypot(S.x-o.x,S.z-o.z)<1.6&&Math.abs(S.y+1-o.y)<2.2)take(i,true)});
  Interaction.update();
  raceTick(t);huntTick(dt,t);partnerTrack();seaTick(dt,t);kartTick(t);
  if(!race.on&&!hunt.on&&mk)mk.style.display='none';
  if(pulse>0){pulse=Math.max(0,pulse-dt);pil.material.emissive.setRGB(pulse*.6,pulse*.45,pulse*.1)}
                                                                                             }
// ---------- kart race track ----------
function kartPt(t){ // t in [0,1) around a rounded-rectangle loop, centered on KT
  const per=2*(KT.hw-KT.rc)*2+2*(KT.hh-KT.rc)*2+2*Math.PI*KT.rc,d=((t%1)+1)%1*per;
  const segs=[
    {len:2*(KT.hw-KT.rc),f:u=>[-(KT.hw-KT.rc)+u*2*(KT.hw-KT.rc), -KT.hh],tf:()=>[1,0]},
    {len:.5*Math.PI*KT.rc,f:u=>{const a=-Math.PI/2+u*Math.PI/2;return [(KT.hw-KT.rc)+Math.cos(a)*KT.rc,-(KT.hh-KT.rc)+Math.sin(a)*KT.rc]},tf:u=>{const a=-Math.PI/2+u*Math.PI/2;return [-Math.sin(a),Math.cos(a)]}},
    {len:2*(KT.hh-KT.rc),f:u=>[KT.hw, -(KT.hh-KT.rc)+u*2*(KT.hh-KT.rc)],tf:()=>[0,1]},
    {len:.5*Math.PI*KT.rc,f:u=>{const a=0+u*Math.PI/2;return [(KT.hw-KT.rc)+Math.cos(a)*KT.rc,(KT.hh-KT.rc)+Math.sin(a)*KT.rc]},tf:u=>{const a=u*Math.PI/2;return [-Math.sin(a),Math.cos(a)]}},
    {len:2*(KT.hw-KT.rc),f:u=>[(KT.hw-KT.rc)-u*2*(KT.hw-KT.rc), KT.hh],tf:()=>[-1,0]},
    {len:.5*Math.PI*KT.rc,f:u=>{const a=Math.PI/2+u*Math.PI/2;return [-(KT.hw-KT.rc)+Math.cos(a)*KT.rc,(KT.hh-KT.rc)+Math.sin(a)*KT.rc]},tf:u=>{const a=Math.PI/2+u*Math.PI/2;return [-Math.sin(a),Math.cos(a)]}},
    {len:2*(KT.hh-KT.rc),f:u=>[-KT.hw, (KT.hh-KT.rc)-u*2*(KT.hh-KT.rc)],tf:()=>[0,-1]},
    {len:.5*Math.PI*KT.rc,f:u=>{const a=Math.PI+u*Math.PI/2;return [-(KT.hw-KT.rc)+Math.cos(a)*KT.rc,-(KT.hh-KT.rc)+Math.sin(a)*KT.rc]},tf:u=>{const a=Math.PI+u*Math.PI/2;return [-Math.sin(a),Math.cos(a)]}},
  ];
  let acc=0;for(const sg of segs){if(d<=acc+sg.len){const u=(d-acc)/sg.len,[lx,lz]=sg.f(u),[tx,tz]=sg.tf(u);return {x:KT.x+lx,z:KT.z+lz,tx,tz}}acc+=sg.len}
  const last=segs[segs.length-1],[lx,lz]=last.f(1),[tx,tz]=last.tf(1);return {x:KT.x+lx,z:KT.z+lz,tx,tz};
}
const kart={on:false,i:0,pi:0,t0:0,gates:[],el:null,perim:0,boosts:[],obstacles:[]};
function buildKartTrack(){
  const per=2*(KT.hw-KT.rc)*2+2*(KT.hh-KT.rc)*2+2*Math.PI*KT.rc;kart.perim=per;
  if(!AM_KART.straight||!AM_KART.finish)return;
  const n=Math.round(per/3),pieceM=AM_KART;
  for(let i=0;i<n;i++){const p=kartPt(i/n),yaw=Math.atan2(p.tx,p.tz),y=H(p.x,p.z)+.05;
    const m=pieceM.straight.clone(true);m.position.set(p.x,y,p.z);m.rotation.y=yaw;m.scale.z=per/n/3;scene.add(m);
    if(i%6===0)solids.push({x:p.x,z:p.z,r:1});
  }
  const p0=kartPt(0),yaw0=Math.atan2(p0.tx,p0.tz);
  const fin=pieceM.finish.clone(true);fin.position.set(p0.x,H(p0.x,p0.z)+.06,p0.z);fin.rotation.y=yaw0;scene.add(fin);
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(4,4,.3,24),new THREE.MeshStandardMaterial({color:'#ffd24a',emissive:'#ff9d00',emissiveIntensity:.8}));
  pad.position.set(p0.x-p0.tx*8,H(p0.x-p0.tx*8,p0.z-p0.tz*8)+.2,p0.z-p0.tz*8);scene.add(pad);kart.padX=pad.position.x;kart.padZ=pad.position.z;

  // BOOST PADS (glowing cyan)
  kart.boosts=[];
  const boostMat=new THREE.MeshStandardMaterial({color:'#40e0ff',emissive:'#00c8ff',emissiveIntensity:1.2,roughness:.3});
  for(const t of [0.18,0.42,0.68,0.88]){
    const p=kartPt(t),y=H(p.x,p.z)+.12;
    const b=new THREE.Mesh(new THREE.BoxGeometry(5.5,0.18,3.2),boostMat);
    b.position.set(p.x,y,p.z);b.rotation.y=Math.atan2(p.tx,p.tz);scene.add(b);
    kart.boosts.push({m:b,x:p.x,z:p.z,tx:p.tx,tz:p.tz,cd:0});
  }

  // OBSTACLES – rocks + barriers that slow you
  kart.obstacles=[];
  const rockMat=new THREE.MeshStandardMaterial({color:'#7a7368',roughness:1,flatShading:true});
  for(const t of [0.12,0.28,0.35,0.55,0.62,0.78,0.92]){
    const p=kartPt(t),side=(t*17%1>0.5?1:-1);
    const ox=p.x+p.tz*side*(4.5+rng()*2.5),oz=p.z-p.tx*side*(4.5+rng()*2.5);
    const y=H(ox,oz);
    const rk=new THREE.Mesh(new THREE.DodecahedronGeometry(1.4+rng()*1.1,0),rockMat);
    rk.position.set(ox,y+1.1,oz);rk.rotation.set(rng(),rng(),rng());rk.castShadow=true;scene.add(rk);
    kart.obstacles.push({m:rk,x:ox,z:oz,r:2.2});
    solids.push({x:ox,z:oz,r:1.8});
  }
  // a couple of low barriers across the track
  for(const t of [0.48,0.82]){
    const p=kartPt(t),y=H(p.x,p.z)+.6;
    const bar=new THREE.Mesh(new THREE.BoxGeometry(9,.9,.7),new THREE.MeshStandardMaterial({color:'#c45c26',roughness:.7}));
    bar.position.set(p.x,y,p.z);bar.rotation.y=Math.atan2(p.tx,p.tz);bar.castShadow=true;scene.add(bar);
    kart.obstacles.push({m:bar,x:p.x,z:p.z,r:3.5,slow:true});
  }

  const NG=12;
  for(let i=0;i<NG;i++){const t=(i+1)/NG,p=kartPt(t),y=H(p.x,p.z)+3.4;
    const m=new THREE.Mesh(new THREE.TorusGeometry(6.5,.65,8,28),new THREE.MeshBasicMaterial({color:'#7fd0ff',fog:false,transparent:true,opacity:.55}));
    m.position.set(p.x,y,p.z);m.rotation.y=Math.atan2(p.tx,p.tz);m.rotation.x=Math.PI/2;scene.add(m);
    kart.gates.push({m,x:p.x,y,z:p.z});
  }
  if(!kart.el){const d=document.createElement('div');d.style.cssText='position:fixed;z-index:6;top:calc(env(safe-area-inset-top,0px) + 92px);left:0;right:0;text-align:center;font-size:18px;text-shadow:0 2px 8px #000;pointer-events:none;display:none';document.body.appendChild(d);kart.el=d}
  paintKart();
}
function paintKart(){kart.gates.forEach((g,i)=>{const on=kart.on,act=on&&i===kart.i;g.m.visible=!(on&&i<kart.i);
  g.m.material.color.set(act?'#ffd24a':'#7fd0ff');g.m.material.opacity=act?1:on?.55:.5;g.m.scale.setScalar(act?1.2:1)})}
function startKartRace(local){
  if(!kart.gates.length)return;
  kart.on=true;kart.i=0;kart.pi=0;kart.t0=performance.now()+3000;paintKart();
  if(local&&chan)chan.send({type:'broadcast',event:'ks',payload:{}});
}
function kartTick(t){
  if(!kart.on){if(kart.el)kart.el.style.display='none';return}
  const now=performance.now();kart.el.style.display='block';
  if(now<kart.t0){kart.el.style.fontSize='44px';kart.el.textContent=Math.ceil((kart.t0-now)/1000);return}
  kart.el.style.fontSize='18px';
  // boost pads
  if(kart.boosts)for(const b of kart.boosts){
    b.cd=Math.max(0,b.cd-0.016);
    if(b.cd<=0&&Math.hypot(S.x-b.x,S.z-b.z)<3.8){
      S.burst=Math.max(S.burst||0,1.6);S.kx+=(b.tx||0)*18;S.kz+=(b.tz||0)*18;
      b.cd=1.8;b.m.material.emissiveIntensity=2.5;
      setTimeout(()=>{if(b.m)b.m.material.emissiveIntensity=1.2},400);
      if(navigator.vibrate)navigator.vibrate(30);
    }
  }
  // obstacles slow / bounce
  if(kart.obstacles)for(const o of kart.obstacles){
    const d=Math.hypot(S.x-o.x,S.z-o.z);
    if(d<o.r){
      if(o.slow){S.kx*=0.4;S.kz*=0.4;S.burst=0}
      else{const nx=(S.x-o.x)/d,nz=(S.z-o.z)/d;S.kx+=nx*9;S.kz+=nz*9}
    }
  }
  const g=kart.gates[kart.i];
  if(Math.hypot(S.x-g.x,S.z-g.z)<8){kart.i++;chime();
    if(chan)chan.send({type:'broadcast',event:'kp',payload:{i:kart.i}});
    if(kart.i>=kart.gates.length){const ms=now-kart.t0;let best=+localStorage.getItem('w4kart')||1e12;const nb=ms<best;try{if(nb)localStorage.setItem('w4kart',ms)}catch(e){}
      banner(fmt(ms)+(nb?' · new best!':' · best '+fmt(best)),'RACE COMPLETE');kart.on=false;paintKart();if(chan)chan.send({type:'broadcast',event:'kf',payload:{ms}});return}
    paintKart()}
  const a=kart.gates[kart.i];
  kart.el.textContent='Gate '+(kart.i+1)+'/'+kart.gates.length+'  ·  '+Math.round(Math.hypot(S.x-a.x,S.z-a.z))+' m  ·  '+fmt(now-kart.t0)+(kart.pi?'  ·  Partner: gate '+(kart.pi+1):'');
  a.m.scale.setScalar(1.2+Math.sin(t/200)*.08);
}

// ---------- sky race ----------
const race={on:false,i:0,pi:0,t0:0,rings:[],el:null};
let bvis=false;const bst=()=>S.flying&&(S.boost||S.burst>0);
function buildRace(){
  const pts=[];
  for(let k=0;k<WP.length-1;k++){const [ax,az]=WP[k],[bx,bz]=WP[k+1],n=Math.max(1,Math.round(Math.hypot(bx-ax,bz-az)/230));
    for(let j=k?1:0;j<=n;j++){const x=ax+(bx-ax)*j/n,z=az+(bz-az)*j/n;pts.push([x,Math.max(H(x,z)+34,40),z])}}
  race.rings=pts.map((p,i)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(14,1.4,10,48),new THREE.MeshBasicMaterial({color:'#7fd0ff',fog:false,transparent:true,opacity:.45}));
    m.position.set(p[0],p[1],p[2]);const q=pts[Math.min(i+1,pts.length-1)],r=pts[Math.max(i-1,0)];
    m.lookAt(i<pts.length-1?q[0]:p[0]+(p[0]-r[0]),i<pts.length-1?q[1]:p[1],i<pts.length-1?q[2]:p[2]+(p[2]-r[2]));scene.add(m);return {m,x:p[0],y:p[1],z:p[2]}});
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(4,4,.3,24),new THREE.MeshStandardMaterial({color:'#ffd24a',emissive:'#ff9d00',emissiveIntensity:.8}));
  pad.position.set(WP[0][0],H(WP[0][0],WP[0][1])+.2,WP[0][1]);scene.add(pad);
  if(!race.el){const d=document.createElement('div');d.style.cssText='position:fixed;z-index:6;top:calc(env(safe-area-inset-top,0px) + 92px);left:0;right:0;text-align:center;font-size:18px;text-shadow:0 2px 8px #000;pointer-events:none;display:none';document.body.appendChild(d);race.el=d}
  race.beam=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,500,12,1,true),new THREE.MeshBasicMaterial({color:'#ffd24a',transparent:true,opacity:.3,fog:false,depthWrite:false,side:THREE.DoubleSide}));race.beam.visible=false;scene.add(race.beam);
  paint();
}
function paint(){race.rings.forEach((r,i)=>{const on=race.on,act=on&&i===race.i;r.m.visible=!(on&&i<race.i);
  r.m.material.color.set(act?'#ffd24a':'#7fd0ff');r.m.material.opacity=act?1:on?.5:.45;r.m.scale.setScalar(act?1.15:1)});
  if(race.beam){const a=race.rings[race.i];race.beam.visible=race.on&&!!a;if(a)race.beam.position.set(a.x,a.y,a.z)}}
function startRace(local){
  if(!race.rings.length)return;
  race.on=true;race.i=0;race.pi=0;race.t0=performance.now()+3000;paint();
  if(local&&chan)chan.send({type:'broadcast',event:'rs',payload:{}});
}
function raceTick(t){
  if(!race.on){if(race.el)race.el.style.display='none';return}
  const now=performance.now();race.el.style.display='block';
  if(now<race.t0){race.el.style.fontSize='44px';race.el.textContent=Math.ceil((race.t0-now)/1000);return}
  race.el.style.fontSize='18px';
  const R=race.rings[race.i];
  if(Math.hypot(S.x-R.x,S.y+1-R.y,S.z-R.z)<13){race.i++;chime();S.burst=1.4;
    if(chan)chan.send({type:'broadcast',event:'rp',payload:{i:race.i}});
    if(race.i>=race.rings.length){const ms=now-race.t0;let best=+localStorage.getItem('w4best')||1e12;const nb=ms<best;try{if(nb)localStorage.setItem('w4best',ms)}catch(e){}
      banner(fmt(ms)+(nb?' · new best!':' · best '+fmt(best)),'RACE COMPLETE');race.on=false;paint();if(chan)chan.send({type:'broadcast',event:'rf',payload:{ms}});return}
    paint()}
  const a=race.rings[race.i];
  race.el.textContent='Ring '+(race.i+1)+'/'+race.rings.length+'  ·  '+Math.round(Math.hypot(S.x-a.x,S.y-a.y,S.z-a.z))+' m  ·  '+fmt(now-race.t0)+(race.pi?'  ·  Partner: ring '+(race.pi+1):'');
  a.m.scale.setScalar(1.15+Math.sin(t/200)*.08);markTo(a.x,a.y,a.z,'Ring '+(race.i+1));
}

// ---------- treasure hunt ----------
let mk=null,pmk=null,treas=0;try{treas=+localStorage.getItem('w4t')||0}catch(e){}
const hunt={on:false,n:0,x:0,y:0,z:0,open:0,chest:null,beam:null};
const _mv=new THREE.Vector3();
function markToEl(el,x,y,z,label){
  if(!el)return;_mv.set(x,y,z).project(camera);let px=_mv.x,py=_mv.y;if(_mv.z>1){px=-px;py=-py}
  const m=Math.max(Math.abs(px)/.85,Math.abs(py)/.72,1);px/=m;py/=m;
  el.style.display='block';el.style.left=(px*.5+.5)*100+'%';el.style.top=(-py*.5+.5)*100+'%';el.lastChild.textContent=label;
}
function markTo(x,y,z,label){markToEl(mk,x,y,z,label)}
function partnerTrack(){
  const o=others.size?others.values().next().value:null;
  if(!o){if(pmk)pmk.style.display='none';return}
  const p=o.group.position,d=Math.hypot(S.x-p.x,S.z-p.z);
  markToEl(pmk,p.x,p.y+2.4,p.z,(o.group.userData.nm||'Partner')+' · '+(d<50?Math.round(d):Math.round(d/10)*10)+'m');
}
function buildHunt(){
  const g=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:'#6b4a2f'}),pap=new THREE.MeshStandardMaterial({color:'#f3e2b3',emissive:'#5a4a20'});
  const p1=new THREE.Mesh(new THREE.BoxGeometry(.25,3,.25),wood);p1.position.set(-1.3,1.5,0);const p2=p1.clone();p2.position.x=1.3;
  const bd=new THREE.Mesh(new THREE.BoxGeometry(3.4,1.8,.15),pap);bd.position.y=2.6;g.add(p1,p2,bd);
  g.position.set(BOARD.x,H(BOARD.x,BOARD.z),BOARD.z);scene.add(g);solids.push({x:BOARD.x,z:BOARD.z,r:1.4});
  const c=new THREE.Group(),base=new THREE.Mesh(new THREE.BoxGeometry(1.6,.9,1),new THREE.MeshStandardMaterial({color:'#7a4a1f'}));base.position.y=.45;
  const lid=new THREE.Group();lid.position.set(0,.9,-.5);const lm=new THREE.Mesh(new THREE.BoxGeometry(1.6,.35,1),new THREE.MeshStandardMaterial({color:'#f2c14e',emissive:'#7a5a00'}));lm.position.set(0,.17,.5);lid.add(lm);
  c.add(base,lid);c.userData.lid=lid;c.scale.setScalar(1.6);c.visible=false;scene.add(c);hunt.chest=c;
  hunt.beam=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,90,10,1,true),new THREE.MeshBasicMaterial({color:'#ffd24a',transparent:true,opacity:.45,fog:false,depthWrite:false,side:THREE.DoubleSide}));hunt.beam.visible=false;scene.add(hunt.beam);
  pmk=document.getElementById('pmk');
if(!mk){mk=document.createElement('div');mk.style.cssText='position:fixed;z-index:5;transform:translate(-50%,-50%);color:#ffd24a;text-align:center;font-size:28px;line-height:1;text-shadow:0 0 8px #000,0 2px 6px #000;pointer-events:none;display:none';mk.innerHTML='<div>◆</div><small style="font-size:13px"></small>';document.body.appendChild(mk)}
}
function pickTarget(n){
  const r=mulberry(hashSeed(roomCode+':hunt:'+n)),lands=[{x:0,z:0,R:200}].concat(ISL.map(I=>({x:I.x,z:I.z,R:I.R*.8})));
  for(let i=0;i<400;i++){const L=lands[r()*lands.length|0],a=r()*6.283,d=Math.sqrt(r())*L.R,x=L.x+Math.cos(a)*d,z=L.z+Math.sin(a)*d,h=H(x,z);
    if(h>1&&h<14&&Math.hypot(x-TOWN.x,z-TOWN.z)>60&&Math.hypot(x-WP[0][0],z-WP[0][1])>25)return {x,z,y:h}}
  return {x:-110,z:40,y:H(-110,40)};
}
function startHunt(local,n){
  if(!hunt.chest)return;
  hunt.n=n!==undefined?n:hunt.n+1;Object.assign(hunt,pickTarget(hunt.n),{on:true,open:0});
  hunt.chest.visible=false;hunt.chest.userData.lid.rotation.x=0;hunt.beam.position.set(hunt.x,hunt.y+45,hunt.z);hunt.beam.visible=false;
  banner('Something is buried out there. Follow the marker and dig it up!','TREASURE HUNT');
  if(local&&chan)chan.send({type:'broadcast',event:'hs',payload:{n:hunt.n}});
}
function dig(local){
  if(!hunt.on)return;hunt.on=false;hunt.open=2.5;hunt.chest.visible=true;hunt.chest.position.set(hunt.x,hunt.y-.9,hunt.z);hunt.beam.visible=false;chime();
  treas++;try{localStorage.setItem('w4t',treas)}catch(e){}updateHud();
  banner(local?'You found the treasure!':'Your partner found the treasure!','TREASURE FOUND');
  if(local&&chan)chan.send({type:'broadcast',event:'hf',payload:{}});
}
function huntTick(dt,t){
  if(hunt.on){const d=Math.hypot(S.x-hunt.x,S.z-hunt.z);hunt.beam.visible=d<160;
    if(!race.on)markTo(hunt.x,hunt.y+2,hunt.z,'Treasure · '+(d<50?Math.round(d):Math.round(d/10)*10)+' m')}
  if(hunt.open>0){hunt.open=Math.max(0,hunt.open-dt);const k=1-hunt.open/2.5;
    hunt.chest.position.y=hunt.y-.9+Math.min(1,k*2)*1.3;hunt.chest.userData.lid.rotation.x=-Math.min(1,Math.max(0,k*2-.6))*1.8;hunt.chest.rotation.y+=dt*.6}
}

// ---------- loop ----------// ---------- loop ----------
let last=performance.now(),camY=0,fpsA=.016,fpsN=0;
function tick(t){
  const dt=Math.min(.05,(t-last)/1000);last=t;
  let ix=stickV.x,iy=stickV.y;
  if(keys.KeyA||keys.ArrowLeft)ix-=1;if(keys.KeyD||keys.ArrowRight)ix+=1;
  if(keys.KeyW||keys.ArrowUp)iy-=1;if(keys.KeyS||keys.ArrowDown)iy+=1;
  const len=Math.hypot(ix,iy);if(len>1){ix/=len;iy/=len}
  const sprint=keys.ShiftLeft||len>.9;
  const speed=S.flying?(bst()?70:24)*Math.min(1,len):(H(S.x,S.z)<-.5?(sprint?16:9):(sprint?12:6))*Math.min(1,len);
  const sy=Math.sin(S.yaw),cy=Math.cos(S.yaw),px=S.x,pz=S.z;
  const dx=cy*ix+sy*iy,dz=-sy*ix+cy*iy;
  if(len>.05){S.x+=dx*speed*dt;S.z+=dz*speed*dt;S.rot=lerpAngle(S.rot,Math.atan2(dx,dz),1-Math.exp(-14*dt))}
  S.x+=S.kx*dt;S.z+=S.kz*dt;const kd=Math.exp(-4*dt);S.kx*=kd;S.kz*=kd;
  S.iframe=Math.max(0,S.iframe-dt);S.hurt=Math.max(0,S.hurt-dt);$('flash').style.opacity=S.hurt>0?Math.min(.35,S.hurt*.7):0;
  const rr=Math.hypot(S.x,S.z);const RB=3300;if(rr>RB){S.x*=RB/rr;S.z*=RB/rr}
  let gY=H(S.x,S.z);
  {const dxs=S.x-SKY.x,dzs=S.z-SKY.z,dsky=Math.hypot(dxs,dzs);if(dsky<SKY.R*1.4){const sh=SKYH(dxs,dzs);if(S.y>=sh-3)gY=Math.max(gY,sh)}}
  const wat=gY<-.5;if(wat)gY=-1;
  const hi=S.flying&&S.y>gY+14&&Math.hypot(S.x-SKY.x,S.z-SKY.z)>SKY.R+60;
  for(const c of solids){if(hi)break;const ax=S.x-c.x,az=S.z-c.z,dd=Math.hypot(ax,az),R=c.r+.4;
    if(dd<R){if(c.h&&S.y>=c.h-.15)gY=Math.max(gY,c.h);else if(!c.noSide&&dd>1e-4){S.x=c.x+ax/dd*R;S.z=c.z+az/dd*R}}}
  const wasG=S.grounded;
  if(jumpQ){if(wasG&&!S.flying)S.vy=wat?6:9;else{S.flying=!S.flying;if(S.flying&&!S.tipped){S.tipped=1;banner('Drag up to climb · drag down to dive','FLYING')}}}jumpQ=false;
  if(S.flying)S.vy+=((len>.05?Math.max(-20*(bst()?2.4:1),Math.min(14*(bst()?2.4:1),(.4-S.pitch)*40*(bst()?2.4:1))):0)-S.vy)*Math.min(1,dt*6);else S.vy-=25*dt;
  const imp=-S.vy;S.y+=S.vy*dt;if(S.flying)S.y=Math.min(S.y,260);
  if(S.flying&&S.y<=gY)S.flying=false;
  if(S.y<=gY||(wasG&&S.vy<=0&&S.y-gY<.35)){S.y=gY;S.vy=0;S.grounded=true;if(!wasG&&imp>5)me.userData.land=Math.min(.18,imp*.014)}else S.grounded=false;
  S.state=S.flying?'fly':!S.grounded?(S.vy>0?'jump':'fall'):wat?'swim':len>.05?(sprint?'run':'walk'):'idle';
  me.position.set(S.x,S.y,S.z);me.rotation.y=S.rot;animate(me,dt,S.state);explore(dt,t);
  const k=1-Math.exp(-12*dt);
  for(const o of others.values()){
    const p=o.group.position;p.x+=(o.tx-p.x)*k;p.y+=(o.ty-p.y)*k;p.z+=(o.tz-p.z)*k;
    o.group.rotation.y=lerpAngle(o.group.rotation.y,o.tr,k);animate(o.group,dt,o.st);
  }
  camY+=(S.y-camY)*(1-Math.exp(-6*dt));
  const d=9,cp=Math.cos(S.pitch);
  const cx=S.x+Math.sin(S.yaw)*d*cp,cz=S.z+Math.cos(S.yaw)*d*cp;
  camera.position.set(cx,Math.max(H(cx,cz)+.8,camY+1.6+Math.sin(S.pitch)*d),cz);
  camera.lookAt(S.x,camY+1.4,S.z);
  if(sun){sun.target.position.set(S.x,S.y,S.z);sun.position.copy(sun.userData.sd).multiplyScalar(140).add(sun.target.position);sky.position.copy(camera.position);if(seaTex){seaTex.offset.x+=dt*.0006;seaTex.offset.y+=dt*.0004}
    fpsA=fpsA*.97+dt*.03;if(sun.castShadow&&++fpsN>240&&fpsA>.034){sun.castShadow=false;scene.traverse(o=>{if(o.material)o.material.needsUpdate=true})}}
  S.burst=Math.max(0,(S.burst||0)-dt);if(!S.flying)S.boost=false;
  if(S.flying!==bvis){bvis=S.flying;$('boost').style.display=bvis?'block':'none';if(!bvis){$('boost').textContent='Boost';$('boost').style.opacity=.75}}
  // Pan button: show when partner present and not flying
  if(PAN_ENABLED&&others.size&&!S.flying){
    $('smack').style.display='block';
    $('smack').textContent=panEquipped?'Smack':'Equip';
    $('smack').style.background=panEquipped?'#ff7070dd':'#ffd27acc';
    $('smack').style.color=panEquipped?'#4a0606':'#2a1c00';
  }else $('smack').style.display='none';
  const tf=S.flying?(bst()?95:80):65;if(Math.abs(camera.fov-tf)>.1){camera.fov+=(tf-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix()}
  smackTick(dt);
  renderer.render(scene,camera);
  requestAnimationFrame(tick);
      }
