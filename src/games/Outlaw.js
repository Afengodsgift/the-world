// Outlaw Town: co-op wave shooter. Weapons from Max_Wp-Pack (assets/weapons/*.glb).
// Net: ONE broadcast event 'og'. The player who pressed Start is HOST and runs all NPC AI;
// the other client renders host snapshots (10Hz) and reports its hits to the host.
// Globals used from index.html: S, chan, others, myId, scene, camera, H, solids, LOCS, TOWN, WP,
// makeAvatar, dress, animate, banner, chime, togglePan, panOn, Interaction, THREE.
const Outlaw=(()=>{
  const WEAPONS=[
    {n:'Revolver',f:'Revolver-A',len:.45,cd:.42,d:34,sp:.004,pel:1,rng:75,mag:6,rl:1.3,price:0,snd:'pistol'},
    {n:'C96 Pistol',f:'MS-C96',len:.5,cd:.18,d:15,sp:.02,pel:1,rng:60,mag:14,rl:1.4,price:0,snd:'pistol'},
    {n:'SMG',f:'R2014-2806',len:.7,cd:.075,d:8,sp:.04,pel:1,rng:55,mag:35,rl:1.7,price:0,snd:'smg'},
    {n:'Assault Rifle',f:'AHKN-LV',len:1.0,cd:.11,d:12,sp:.025,pel:1,rng:95,mag:30,rl:1.9,price:650,snd:'rifle'},
    {n:'Pump Shotgun',f:'PMPSG',len:1.0,cd:.8,d:13,sp:.09,pel:7,rng:32,mag:6,rl:2.1,price:0,snd:'shotgun'},
    {n:'Hunting Rifle',f:'TMS-1909',len:1.2,cd:1.1,d:100,sp:0,pel:1,rng:200,mag:5,rl:2.3,price:900,snd:'sniper'},
    {n:'Pistol',f:'UPistol',len:.4,cd:.22,d:19,sp:.012,pel:1,rng:60,mag:12,rl:1.2,price:0,snd:'pistol'},
    {n:'Magnum',f:'UMagnum',len:.5,cd:.62,d:62,sp:.003,pel:1,rng:85,mag:6,rl:1.8,price:700,snd:'sniper'},
    {n:'Tommy SMG',f:'USMG',len:.65,cd:.09,d:10,sp:.035,pel:1,rng:55,mag:40,rl:1.8,price:0,snd:'smg'},
    {n:'Sawed-Off',f:'USawedOff',len:.6,cd:.5,d:17,sp:.13,pel:8,rng:20,mag:2,rl:1.5,price:450,snd:'shotgun'},
    {n:'Combat Shotgun',f:'UCombatSG',len:1.0,cd:.34,d:11,sp:.08,pel:6,rng:30,mag:8,rl:2.2,price:800,snd:'shotgun'},
    {n:'AR-2',f:'UAssault',len:1.0,cd:.085,d:11,sp:.02,pel:1,rng:100,mag:40,rl:2.0,price:800,snd:'rifle'},
    {n:'Bullpup',f:'UBullpup',len:.85,cd:.065,d:12,sp:.022,pel:1,rng:95,mag:36,rl:1.8,price:950,snd:'rifle'},
    {n:'Marksman',f:'USniper',len:1.2,cd:.8,d:78,sp:0,pel:1,rng:220,mag:8,rl:2.2,price:1100,snd:'sniper'},
    {n:'Minigun',f:'Minigun',len:.9,cd:.045,d:6,sp:.07,pel:1,rng:70,mag:150,rl:3.5,price:2500,snd:'smg'},
    {n:'Rocket Launcher',f:'Bazooka',len:1.2,cd:1.4,d:90,sp:0,pel:1,rng:120,mag:1,rl:2.4,price:3000,snd:'shotgun',rocket:true,rad:6}];
  const RECOIL=[1.3,.8,.35,.5,1.8,2.2,.8,1.8,.35,1.9,1.4,.5,.45,1.6,.15,2.4]; // per weapon, same order as WEAPONS
  const FREE=[0,1,2,4,6,8]; // unlocked from the start; the rest are bought at the Gunsmith
  // NPC archetypes. 0 Bandit 1 Brute 2 Sniper 3 Sheriff(boss) 4 Dynamiter 5 Shotgunner 6 Medic 7 Warlord(gatling boss)
  const TYPES=[
    {n:'Bandit',skin:2,hp:60,sp:5,range:28,dmg:8,cd:1.15,acc:.5,react:.55,sc:1},
    {n:'Brute',skin:2,hp:120,sp:7.4,range:2.2,dmg:14,cd:.9,acc:1,react:0,sc:1.15},
    {n:'Sniper',skin:3,hp:40,sp:3.6,range:60,dmg:24,cd:2.6,acc:.7,react:.9,sc:1},
    {n:'Sheriff',skin:3,hp:520,sp:4.6,range:34,dmg:11,cd:.5,acc:.55,react:.3,sc:1.6},
    {n:'Dynamiter',skin:2,hp:55,sp:4.4,range:34,dmg:38,cd:3.4,acc:1,react:.6,sc:1},
    {n:'Shotgunner',skin:2,hp:90,sp:6.2,range:13,dmg:26,cd:1.5,acc:.62,react:.35,sc:1.05},
    {n:'Medic',skin:3,hp:70,sp:5,range:0,dmg:0,cd:2.2,acc:0,react:0,sc:.95},
    {n:'Warlord',skin:3,hp:900,sp:4,range:40,dmg:9,cd:.12,acc:.55,react:.3,sc:1.9}];
  const COL=['#c05030','#c05030','#8050c0','#ff3030','#e0a020','#c05030','#30c060','#ff3030'];
  const COIN=[10,18,22,150,20,18,16,300];
  const DIFF=[{n:'Normal',hp:1,dmg:1,cnt:1,coin:1},{n:'Hard',hp:1.4,dmg:1.25,cnt:1.3,coin:1.5},{n:'Outlaw',hp:2,dmg:1.6,cnt:1.7,coin:2.2}];
  const cover=[],npcs=new Map(),cache={};
  let wiped=false,clock=0,C=null,active=false,host=null,wave=0,kills=0,best=0,nextWave=0,queue=[],spawnT=0,nid=1,snapT=0;
  let wi=-1,hp=100,down=false,downT=0,cdT=0,firing=false,pdown=false,pw=-1,hudEl,hpEl,xh,fireBtn,gunBtn,hitT=0,fx=[];
  const prev={x:0,z:0,vx:0,vz:0},pprev={x:0,z:0,vx:0,vz:0};
  let diff=1,mode='survive',bank={x:0,z:0,hp:1500,max:1500},ammo=[],reloadT=0,reloading=false,dyn=[],drops=[],reloadBtn,shopEl,pick={m:'survive',d:1};
  let SAVE={coins:0,own:WEAPONS.map((_,i)=>FREE.includes(i)?1:0),lv:WEAPONS.map(()=>0),hp:0,mag:0,rl:0,crit:0,v:0};
  try{Object.assign(SAVE,JSON.parse(localStorage.getItem('w4ow2')||'{}'))}catch(e){}
  while(SAVE.own.length<WEAPONS.length)SAVE.own.push(0);while(SAVE.lv.length<WEAPONS.length)SAVE.lv.push(0);
  FREE.forEach(i=>SAVE.own[i]=1);if(!SAVE.v||SAVE.v<3){SAVE.v=3;SAVE.coins+=500} // arsenal update: welcome gift so the shop is worth a look
  const save=()=>{try{localStorage.setItem('w4ow2',JSON.stringify(SAVE))}catch(e){}};
  const maxHp=()=>100+20*SAVE.hp,magOf=i=>Math.round(WEAPONS[i].mag*(1+.2*SAVE.mag)),dmgOf=i=>WEAPONS[i].d*(1+.18*SAVE.lv[i]),am=i=>ammo[i]===undefined?magOf(i):ammo[i];
  try{best=+localStorage.getItem('w4ow')||0}catch(e){}
  const send=p=>{if(chan)chan.send({type:'broadcast',event:'og',payload:p})};
  const partner=()=>[...others.entries()][0];
  const isHost=()=>host===myId;
  const rnd=(a,b)=>a+Math.random()*(b-a);

  // ---------- geometry helpers ----------
  function segCircle(ax,az,bx,bz,c){ // does segment a->b pass through circle c?
    const dx=bx-ax,dz=bz-az,fx=ax-c.x,fz=az-c.z,a=dx*dx+dz*dz;if(a<1e-6)return false;
    const b=2*(fx*dx+fz*dz),k=fx*fx+fz*fz-c.r*c.r,D=b*b-4*a*k;if(D<0)return false;
    const s=Math.sqrt(D);return (-b-s)/(2*a)<1&&(-b+s)/(2*a)>.02}
  const los=(ax,az,bx,bz)=>!cover.some(c=>segCircle(ax,az,bx,bz,c));
  let rcHit=null; // the cover entry the last rayCover() hit (breakable cover reacts to bullets)
  function rayCover(o,d,max){ // nearest cover hit distance along 3D ray (horizontal test), or max
    rcHit=null;let best=max;const a=d.x*d.x+d.z*d.z;if(a<1e-8)return best;
    for(const c of cover){const fx=o.x-c.x,fz=o.z-c.z,b=2*(fx*d.x+fz*d.z),k=fx*fx+fz*fz-c.r*c.r,D=b*b-4*a*k;if(D<0)continue;
      const t=(-b-Math.sqrt(D))/(2*a);if(t>0&&t<best){best=t;rcHit=c}}
    return best}
  function raySphere(o,d,cx,cy,cz,r){const lx=cx-o.x,ly=cy-o.y,lz=cz-o.z,tca=lx*d.x+ly*d.y+lz*d.z;if(tca<0)return null;
    const d2=lx*lx+ly*ly+lz*lz-tca*tca;if(d2>r*r)return null;return tca-Math.sqrt(r*r-d2)}

  // ---------- town ----------
  function label(txt,w,h){const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.fillStyle='#3b2412';x.fillRect(0,0,256,64);x.fillStyle='#f3d9a4';x.font='bold 34px serif';x.textAlign='center';x.textBaseline='middle';x.fillText(txt,128,34);
    return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c)}))}
  function building(x,z,w,d,h,col,txt,ry){
    const g=new THREE.Group();g.position.set(x,C.y,z);g.rotation.y=ry;
    const m=(sx,sy,sz,c,px,py,pz)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),new THREE.MeshStandardMaterial({color:c,roughness:.9}));b.position.set(px,py,pz);b.castShadow=b.receiveShadow=true;g.add(b)};
    m(w,h,d,col,0,h/2,0);m(w+1,.6,d+1,'#5a3a1e',0,h+.3,0);m(w*.9,1.4,.4,col,0,h+1.3,d/2-.2); // body, roof, false front
    m(w,.35,2.2,'#6b4423',0,.18,d/2+1.1);                 // porch
    const s=label(txt,w*.7,1.2);s.position.set(0,h-.4,d/2+.06);g.add(s);scene.add(g);
    const n=Math.ceil(w/3);for(let i=0;i<n;i++){const lx=-w/2+w*(i+.5)/n,wx=x+Math.cos(ry)*lx,wz=z-Math.sin(ry)*lx;const c={x:wx,z:wz,r:Math.max(2,d*.45)};solids.push(c);cover.push(c)}}
  function prop(x,z,kind){
    const y=C.y,g=kind==='barrel'?new THREE.CylinderGeometry(.55,.55,1.2,10):new THREE.BoxGeometry(1.4,1.3,1.4);
    const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:kind==='barrel'?'#7a4a22':'#a9803f',roughness:.9}));m.position.set(x,y+.65,z);m.rotation.y=Math.random()*3;m.castShadow=true;scene.add(m);
    const c={x,z,r:.95};solids.push(c);cover.push(c)}
  function build(){
    C={x:OUT.x,z:OUT.z,y:OUT.y+.05};cover.length=0; // dedicated Outlaw Isle (see data/islands.js)
    const ground=new THREE.Mesh(new THREE.CircleGeometry(46,40),new THREE.MeshStandardMaterial({color:'#b79a68',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(C.x,C.y+.04,C.z);ground.receiveShadow=true;scene.add(ground);
    building(C.x-14,C.z-8,11,7,6,'#8a5a30','SALOON',0);building(C.x+14,C.z-8,11,7,5.4,'#7d6a52','BANK',0);
    building(C.x-14,C.z+10,10,6,5,'#9a7440','HOTEL',Math.PI);building(C.x+14,C.z+10,9,6,4.6,'#6e5a46','JAIL',Math.PI);
    bank.x=C.x+14;bank.z=C.z-8;bank.max=bank.hp=1500;
    building(C.x-34,C.z,12,7,5,'#8f6a3c','STABLE',Math.PI/2);building(C.x+34,C.z,10,8,7.5,'#d8cdb8','CHURCH',-Math.PI/2);
    building(C.x-24,C.z-26,9,6,5,'#7a5a3a','DEPOT',0);building(C.x+12,C.z+26,8,5,4.4,'#a07a48','GUNSMITH',Math.PI);
    {const wy=C.y,mt=new THREE.MeshStandardMaterial({color:'#6b4a2a'}),tk=new THREE.Mesh(new THREE.CylinderGeometry(2.6,2.6,3,14),mt);tk.position.set(C.x+26,wy+9,C.z-24);tk.castShadow=true;scene.add(tk);
     const ro=new THREE.Mesh(new THREE.ConeGeometry(3,1.6,14),new THREE.MeshStandardMaterial({color:'#4a3320'}));ro.position.set(C.x+26,wy+11.3,C.z-24);scene.add(ro);
     const lg=new THREE.Mesh(new THREE.CylinderGeometry(1.4,2,7.5,6),mt);lg.position.set(C.x+26,wy+3.7,C.z-24);scene.add(lg);const cc={x:C.x+26,z:C.z-24,r:2.3};solids.push(cc);cover.push(cc)}
    [[-24,8],[24,6],[-4,18],[4,-18],[-28,-14],[28,-16],[-8,-24],[20,-30],[-30,18],[30,16],[0,28],[-18,22]].forEach(([dx,dz],i)=>prop(C.x+dx,C.z+dz,i%2?'crate':'barrel'));
    [[-5,-2],[4,3],[-2,6],[7,-3],[-8,2],[0,-5],[10,2],[-10,-3]].forEach(([dx,dz],i)=>prop(C.x+dx,C.z+dz,i%2?'barrel':'crate'));
    const pad=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.4,.3,24),new THREE.MeshStandardMaterial({color:'#c0392b',emissive:'#7a1a10',emissiveIntensity:.6}));pad.position.set(C.x,C.y+.15,C.z+1);scene.add(pad);
    const sg=label('OUTLAW TOWN',6,1.5);sg.position.set(C.x,5,C.z+1);sg.userData.bb=1;scene.add(sg);fx.push({sign:sg});
    portals();
    OutlawArena.build({C,cover,solids,scene,send:o=>send(o),isHost,boom,sfx,spark,hurtMe:(d,x,z)=>hurt(d,x,z),
      dropAt:(x,z)=>{const id=nid++;send({k:'dr',id,x,z});addDrop(id,x,z)},
      aoeNpc:(x,z,rad,dmg)=>{for(const n of npcs.values()){if(n.dead)continue;const d=Math.hypot(n.x-x,n.z-z);if(d<rad+1)damageNpc(n.id,Math.max(1,Math.round(dmg*(1-d/(rad+1)))))}}}); // zones, breakable cover, train (src/games/OutlawArena.js)
  }

  // ---------- portals: town <-> Outlaw Isle ----------
  function portalPad(x,z,col,txt){
    const y=H(x,z),g=new THREE.Group();g.position.set(x,y,z);
    const b=new THREE.Mesh(new THREE.CylinderGeometry(2.6,2.8,.4,28),new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.55}));b.position.y=.2;g.add(b);
    const r=new THREE.Mesh(new THREE.TorusGeometry(1.9,.16,10,36),new THREE.MeshBasicMaterial({color:'#ffffff',fog:false}));r.rotation.x=Math.PI/2;r.position.y=1.5;g.add(r);
    const c=document.createElement('canvas');c.width=512;c.height=128;const x2=c.getContext('2d');x2.fillStyle='#2b1608';x2.fillRect(0,0,512,128);x2.fillStyle='#fff';x2.font='bold 54px sans-serif';x2.textAlign='center';x2.textBaseline='middle';x2.fillText(txt,256,68);
    const sg=new THREE.Mesh(new THREE.PlaneGeometry(4.4,1.1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide}));sg.position.y=4;g.add(sg);scene.add(g);fx.push({sign:sg})}
  function tp(x,z,msg){S.x=x;S.z=z;S.y=H(x,z)+.6;S.vy=0;S.kx=0;S.kz=0;banner(msg,'TRAVEL')}
  function portals(){
    const a=5.7,T={x:TOWN.x+Math.cos(a)*19,z:TOWN.z+Math.sin(a)*19},I={x:C.x-12,z:C.z+20};
    portalPad(T.x,T.z,'#c0392b','🤠 OUTLAW ISLE');portalPad(I.x,I.z,'#2e86de','🏠 BACK TO TOWN');
    Interaction.register('ow-shop','Gunsmith',()=>Math.hypot(S.x-(C.x+12),S.z-(C.z+21))<5,()=>shopPanel());
    Interaction.register('ow-go','Go to Outlaw Isle',()=>Math.hypot(S.x-T.x,S.z-T.z)<5,()=>tp(C.x+(Math.random()-.5)*4,C.z+14,'Welcome to Outlaw Isle 🤠'));
    Interaction.register('ow-home','Back to Town',()=>Math.hypot(S.x-I.x,S.z-I.z)<5,()=>tp(TOWN.x+(Math.random()-.5)*4,TOWN.z+7,'Back in town 🏠'));
  }

  // ---------- weapons (visual) ----------
  function loadGun(i){
    if(cache[i])return cache[i];
    return cache[i]=new Promise(res=>new THREE.GLTFLoader().load('assets/weapons/'+WEAPONS[i].f+'.glb',g=>res(g.scene),undefined,()=>res(null)));
  }
  async function setGun(group,i){
    const u=group.userData;if(u.gun){group.remove(u.gun);u.gun=null}u.gunI=i;
    if(i<0)return;const src=await loadGun(i);if(!src||u.gunI!==i)return;
    const piv=new THREE.Group(),m=src.clone(true);m.rotation.y=Math.PI;m.scale.setScalar(WEAPONS[i].len);m.traverse(c=>{if(c.isMesh)c.castShadow=true});
    piv.add(m);piv.visible=false;group.add(piv);u.gun=piv;u.gunLen=WEAPONS[i].len;u.gunTwo=WEAPONS[i].len>=.7;
  }
  const nextW=()=>{for(let i=wi+1;i<WEAPONS.length;i++)if(SAVE.own[i])return i;return -1};
  function equip(i){
    if(i>=0&&!SAVE.own[i]){banner('Locked. Buy it at the Gunsmith 🔫','GUNSMITH');return}
    if(i===wi)i=-1;wi=i;reloading=false;if(i>=0&&panOn)togglePan();
    setGun(me,i);send({k:'wg',i});updateHud()}

  // ---------- effects ----------
  const ac=()=>WAudio.resume();
  function noise(f,len,vol,type){const a=ac();if(!a)return;const n=a.createBuffer(1,Math.max(1,a.sampleRate*len|0),a.sampleRate),d=n.getChannelData(0);for(let k=0;k<d.length;k++)d[k]=(Math.random()*2-1)*Math.pow(1-k/d.length,3);const o=a.createBufferSource(),g=a.createGain(),fl=a.createBiquadFilter();fl.type=type||'lowpass';fl.frequency.value=f;g.gain.value=vol;o.buffer=n;o.connect(fl);fl.connect(g);g.connect(WAudio.out());o.start()}
  function tone(f0,f1,len,vol,type){const a=ac();if(!a)return;const o=a.createOscillator(),g=a.createGain(),t=a.currentTime;o.type=type||'sine';o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+len);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+len);o.connect(g);g.connect(WAudio.out());o.start();o.stop(t+len)}
  function sfx(k){switch(k){
    case 'pistol':noise(2200,.1,.3);tone(220,60,.08,.2,'square');break;
    case 'smg':noise(2600,.06,.22);break;
    case 'rifle':noise(1800,.09,.3);tone(160,50,.1,.2,'square');break;
    case 'shotgun':noise(900,.28,.45);tone(110,35,.2,.3,'sawtooth');break;
    case 'sniper':noise(700,.45,.5);tone(90,30,.3,.35,'sawtooth');break;
    case 'enemy':noise(1200,.1,.18);break;
    case 'reload':tone(900,500,.05,.15,'square');setTimeout(()=>tone(500,900,.07,.15,'square'),350);break;
    case 'hit':tone(1500,1200,.05,.18,'triangle');break;
    case 'crit':tone(1800,2600,.12,.25,'triangle');break;
    case 'hurt':noise(400,.18,.3);tone(180,90,.15,.2,'sawtooth');break;
    case 'coin':tone(880,1320,.12,.15,'triangle');break;
    case 'boom':noise(260,.6,.7);tone(70,25,.5,.4,'sawtooth');break;
    case 'horn':tone(180,140,.7,.25,'sawtooth');break;
    case 'heal':tone(500,900,.2,.15,'sine');break;}}
  function tracer(ax,ay,az,bx,by,bz,col){
    const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax,ay,az),new THREE.Vector3(bx,by,bz)]);
    const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:col||'#ffe9a0',transparent:true}));scene.add(l);fx.push({l,t:.09});
    const f=new THREE.Mesh(new THREE.SphereGeometry(.16,6,6),new THREE.MeshBasicMaterial({color:'#fff2b0'}));f.position.set(ax,ay,az);scene.add(f);fx.push({l:f,t:.05})}
  function popText(x,y,z,txt,col,sz){const c=document.createElement('canvas');c.width=160;c.height=64;const g=c.getContext('2d');g.font='bold 40px sans-serif';g.textAlign='center';g.lineWidth=6;g.strokeStyle='#000';g.fillStyle=col||'#fff';g.strokeText(txt,80,44);g.fillText(txt,80,44);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));sp.scale.set(1.9*(sz||1),.76*(sz||1),1);sp.position.set(x,y,z);sp.renderOrder=11;scene.add(sp);fx.push({sp,t:.9,v:[0,1.6,0]})}
  function spark(x,y,z,col){for(let i=0;i<5;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.07,5,5),new THREE.MeshBasicMaterial({color:col||'#ffd24a'}));m.position.set(x,y,z);scene.add(m);fx.push({l:m,t:.3,v:[rnd(-3,3),rnd(1,4),rnd(-3,3)]})}}
  function boom(x,z,r){const y=H(x,z)+.5,m=new THREE.Mesh(new THREE.SphereGeometry(1,14,12),new THREE.MeshBasicMaterial({color:'#ff9a2e',transparent:true,opacity:.85}));m.position.set(x,y,z);scene.add(m);fx.push({l:m,t:.4,grow:r});sfx('boom');spark(x,y,z,'#ff7a1a')}
  const _mv=new THREE.Vector3();
  const muzzle=(group,i)=>{const u=group.userData,gi=u.gunI>=0?u.gunI:(i>=0?i:0),L=WEAPONS[gi].len;
    if(u.gun&&u.gun.userData.ok){u.gun.updateWorldMatrix(true,false);_mv.set(0,0,L*.55);u.gun.localToWorld(_mv);return {x:_mv.x,y:_mv.y,z:_mv.z}}
    const r=group.rotation.y;return {x:group.position.x+Math.sin(r)*(.35+L*.75)-Math.cos(r)*.3,y:group.position.y+1.15,z:group.position.z+Math.cos(r)*(.35+L*.75)+Math.sin(r)*.3}};
  // Holding a gun: raise the right arm (and left arm for long guns) toward the aim direction, put the gun in the hand,
  // kick it back on every shot. Called from animate() in index.html for every avatar that has a gun (me, partner, NPCs).
  const _gq=new THREE.Quaternion(),_hp=new THREE.Vector3(),_ge=new THREE.Euler(),_gr=new THREE.Quaternion(),_go=new THREE.Vector3();
  function poseGun(g,q,st,dt){
    const B=q.bones,gun=q.gun;if(!gun||!B||!B.RightHand||!B.RightArm||!B.RightForeArm)return;
    q.recoil=Math.max(0,(q.recoil||0)-dt*7);const k=q.recoil,p=q.aimP||0,cp=Math.cos(p),sp=Math.sin(p);
    g.updateWorldMatrix(true,false);g.getWorldQuaternion(_gq);
    const D=(x,y,z)=>new THREE.Vector3(x,y,z).normalize().applyQuaternion(_gq);   // direction in avatar space (+Z forward, +X = his left)
    aim(B.RightArm,B.RightForeArm,D(-.3,sp*.9-.2+k*.25,cp*.9));aim(B.RightForeArm,B.RightHand,D(-.08,sp+k*.3,cp));
    if(q.gunTwo&&B.LeftArm&&B.LeftForeArm&&B.LeftHand){aim(B.LeftArm,B.LeftForeArm,D(.35,sp*.9-.28+k*.2,cp*.9));aim(B.LeftForeArm,B.LeftHand,D(.14,sp+k*.25,cp))}
    B.RightHand.updateWorldMatrix(true,false);B.RightHand.getWorldPosition(_hp);g.worldToLocal(_hp);
    _ge.set(-p-k*.14,0,0);gun.rotation.copy(_ge);_gr.setFromEuler(_ge);
    _go.set(0,.1*q.gunLen,.2*q.gunLen-k*.12).applyQuaternion(_gr);gun.position.copy(_hp).add(_go);gun.userData.ok=true;
  }

  // ---------- player shooting ----------
  const camDir=new THREE.Vector3();
  // Aim assist: lock the best live NPC near the crosshair (cone ~34 deg, must be visible, not behind cover).
  let lockM=null,lockN=null;
  function lockTarget(range){
    camera.getWorldDirection(camDir);const o=camera.position;let best=null,bs=1e9;
    for(const n of npcs.values()){if(n.dead||!n.group)continue;const p=n.group.position,sc=TYPES[n.type].sc,
      vx=p.x-o.x,vy=p.y+sc-o.y,vz=p.z-o.z,L=Math.hypot(vx,vy,vz);if(L>range||L<1)continue;
      const ang=Math.acos(Math.max(-1,Math.min(1,(vx*camDir.x+vy*camDir.y+vz*camDir.z)/L)));
      if(ang>(CameraRig.isFPS()?.2:.6)||!los(S.x,S.z,p.x,p.z))continue;const sc2=ang+L*.004;if(sc2<bs){bs=sc2;best=n}}
    return best}
  function aoe(pt,dmg,rad){ // explosion: damages every enemy near the impact point
    boom(pt[0],pt[2],rad*.8);OutlawArena.blast(pt[0],pt[2],rad,dmg*.6);
    for(const n of npcs.values()){if(n.dead||!n.group)continue;const p=n.group.position,d=Math.hypot(p.x-pt[0],p.y+1-pt[1],p.z-pt[2]);if(d<rad+1.5)reportHit(n.id,Math.max(1,Math.round(dmg*(1-d/(rad+1.5)))))}}
  function reload(){if(wi<0||reloading||am(wi)>=magOf(wi))return;reloading=true;reloadT=WEAPONS[wi].rl*(1-.12*SAVE.rl);sfx('reload');updateHud()}
  function fire(){
    if(wi<0||down||!camera||reloading)return;const W=WEAPONS[wi];if(cdT>0)return;
    if(am(wi)<=0){reload();return}
    cdT=W.cd;ammo[wi]=am(wi)-1;
    const lk=lockTarget(W.rng),o=camera.position.clone(),base=camDir.clone();
    let lp=null,lsc=1;if(lk){lp=lk.group.position;lsc=TYPES[lk.type].sc;S.rot=Math.atan2(lp.x-S.x,lp.z-S.z)}else S.rot=Math.atan2(camDir.x,camDir.z);
    me.rotation.y=S.rot;const M=CameraRig.isFPS()?Viewmodel.muzzleWorld(camera):muzzle(me,wi);
    if(lk){o.set(M.x,M.y,M.z);base.set(lp.x-M.x,lp.y+lsc-M.y,lp.z-M.z).normalize()}
    let anyHit=false,anyCrit=false,endp=null;
    for(let p=0;p<W.pel;p++){
      const d=base.clone();if(W.sp){d.x+=rnd(-W.sp,W.sp);d.y+=rnd(-W.sp,W.sp);d.z+=rnd(-W.sp,W.sp);d.normalize()}
      const wall=rayCover(o,d,W.rng),wc=rcHit;let tn=wall,hit=null;
      for(const n of npcs.values()){if(n.dead)continue;const p3=n.group.position,sc=TYPES[n.type].sc,
        t=raySphere(o,d,p3.x,p3.y+1*sc,p3.z,.95*sc+Math.min(1.6,(Math.hypot(p3.x-o.x,p3.z-o.z))*.025));
        if(t!==null&&t<tn){tn=t;hit=n}}
      endp=[o.x+d.x*tn,o.y+d.y*tn,o.z+d.z*tn];
      if(!hit&&wc&&tn===wall&&!W.rocket&&wc.brk!==undefined){OutlawArena.hitCover(wc,dmgOf(wi));spark(endp[0],endp[1],endp[2],'#d8b45a');anyHit=true}
      if(W.rocket){aoe(endp,dmgOf(wi),W.rad||6);tracer(M.x,M.y,M.z,endp[0],endp[1],endp[2],'#ff9a2e');anyHit=true;continue}
      if(hit){const crit=Math.random()<.08+.05*SAVE.crit,dmg=Math.round(dmgOf(wi)*(crit?2:1));anyHit=true;if(crit)anyCrit=true;reportHit(hit.id,dmg);spark(endp[0],endp[1],endp[2]);
        if(p<3)popText(endp[0],endp[1]+.7,endp[2],(crit?'💥':'')+dmg,crit?'#ffd24a':'#fff',crit?1.25:1)}
      if(p<3)tracer(M.x,M.y,M.z,endp[0],endp[1],endp[2]);
    }
    me.userData.recoil=1;Viewmodel.kick(RECOIL[wi]);CameraRig.kick(.016*RECOIL[wi],rnd(-.004,.004)*RECOIL[wi]);sfx(W.snd);if(anyHit){hitT=.18;sfx(anyCrit?'crit':'hit')}
    if(clock-lastF>110){lastF=clock;send({k:'f',w:wi,m:[M.x,M.y,M.z],e:endp})}
    if(am(wi)<=0)reload();else updateHud();
  }
  function lockMarker(){
    const lk=wi>=0&&!down?lockTarget(WEAPONS[wi].rng):null;lockN=lk;
    if(!lockM){lockM=new THREE.Mesh(new THREE.RingGeometry(.55,.7,28),new THREE.MeshBasicMaterial({color:'#ff3030',depthTest:false,transparent:true,opacity:.9,side:THREE.DoubleSide}));lockM.renderOrder=10;lockM.visible=false;scene.add(lockM)}
    if(!lk){lockM.visible=false;return}
    const p=lk.group.position,sc=TYPES[lk.type].sc;lockM.visible=true;lockM.position.set(p.x,p.y+sc,p.z);lockM.scale.setScalar(sc);lockM.lookAt(camera.position)}
  const hitBuf={};let lastF=0,lastH=0;
  function reportHit(id,d){if(isHost())damageNpc(id,d);else hitBuf[id]=(hitBuf[id]||0)+d} // client hits are batched (flushed in tick)
  function damageNpc(id,d){const n=npcs.get(id);if(!n||n.dead)return;n.hp-=d;n.flash=.12;if(n.hp<=0)killNpc(n)}
  function earn(c){SAVE.coins+=c;save();sfx('coin');popText(S.x,S.y+2.6,S.z,'+'+c+' 🪙','#ffd24a');updateHud()}
  function killNpc(n){n.dead=1;kills++;const c=Math.round(COIN[n.type]*DIFF[diff].coin*(1+wave*.03));send({k:'kill',c});earn(c);if(Math.random()<.16){const id=nid++;send({k:'dr',id,x:n.x,z:n.z});addDrop(id,n.x,n.z)}}
  function addDrop(id,x,z){const m=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.6),new THREE.MeshStandardMaterial({color:'#2ecc71',emissive:'#1e9e55',emissiveIntensity:.8}));m.position.set(x,H(x,z)+.6,z);scene.add(m);drops.push({id,m,x,z})}
  function dropTick(dt,t){for(let i=drops.length-1;i>=0;i--){const d=drops[i];d.m.rotation.y+=dt*2;d.m.position.y=H(d.x,d.z)+.7+Math.sin(t/300+i)*.15;
    if(!down&&Math.hypot(S.x-d.x,S.z-d.z)<2){hp=Math.min(maxHp(),hp+35);send({k:'pk',id:d.id});scene.remove(d.m);drops.splice(i,1);sfx('heal');popText(S.x,S.y+2.4,S.z,'+35 ❤️','#5dff8a');updateHud()}}}

  // ---------- player health ----------
  function hurt(d,fx_,fz_){
    if(down)return;hp-=d;S.hurt=.35;sfx('hurt');if(fx_!==undefined){const l=Math.hypot(S.x-fx_,S.z-fz_)||1;S.kx+=(S.x-fx_)/l*4;S.kz+=(S.z-fz_)/l*4}
    if(navigator.vibrate)navigator.vibrate(30);
    if(hp<=0){hp=0;down=true;downT=6;send({k:'dn',v:1});banner('You are down! Respawning…','OUTLAW TOWN')}
    updateHud();
  }
  function respawn(){hp=maxHp();down=false;S.x=C.x+(Math.random()-.5)*4;S.z=C.z+14;S.y=H(S.x,S.z)+.1;S.vy=0;send({k:'dn',v:0});updateHud()}

  // ---------- NPC visuals ----------
  function spawnVisual(n){
    const T=TYPES[n.type],g=makeAvatar(T.n,COL[n.type]);g.userData.nm=T.n;g.scale.setScalar(T.sc);scene.add(g);dress(g,T.skin);
    const bar=new THREE.Group(),bg=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.14),new THREE.MeshBasicMaterial({color:'#000',depthTest:false,transparent:true,opacity:.6})),
      fg=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.14),new THREE.MeshBasicMaterial({color:'#ff4040',depthTest:false}));
    fg.position.z=.01;bar.add(bg,fg);bar.position.y=2.5;bar.renderOrder=9;g.add(bar);
    const laser=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,1,6).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:'#ff2020'}));laser.visible=false;scene.add(laser);
    n.group=g;n.bar=bar;n.fg=fg;n.laser=laser;
    setGun(g,[0,-1,5,3,-1,4,-1,3][n.type]); // bandit revolver, brute bare-handed, sniper rifle, boss assault rifle
  }
  function removeVisual(n){if(n.group){scene.remove(n.group)}if(n.laser)scene.remove(n.laser)}

  // ---------- HOST: AI ----------
  function players(){
    const l=[{id:myId,x:S.x,z:S.z,vx:prev.vx,vz:prev.vz,down}],p=partner();
    if(p){const g=p[1].group.position;l.push({id:p[0],x:g.x,z:g.z,vx:pprev.vx,vz:pprev.vz,down:pdown})}
    return l}
  function addNpc(type,x,z){
    const T=TYPES[type],D=DIFF[diff],hv=T.hp*(1+wave*.08)*D.hp;
    const n={id:nid++,type,x,z,hp:hv,max:hv,dm:D.dmg*(1+wave*.03),r:0,st:'idle',cd:rnd(.5,1.5),react:T.react,t:0,ph:rnd(0,6),flank:Math.random()<.5?1:-1,mode:'advance',dec:0,pt:0,peek:0,tid:null,aim:0,seen:false,dead:0,
      raider:mode==='defend'&&(type<3||type===4||type===5)?Math.random()<.55:false};
    n.group=null;npcs.set(n.id,n);spawnVisual(n);n.group.position.set(x,H(x,z),z)}
  function spawnPoint(type){if(type!==undefined)return OutlawArena.front(type);for(let i=0;i<20;i++){const a=Math.random()*6.283,x=C.x+Math.cos(a)*62,z=C.z+Math.sin(a)*62;if(H(x,z)>1)return [x,z]}return [C.x+30,C.z]}
  function startWave(){
    wave++;const D=DIFF[diff],q=[],boss=wave%3===0;
    if(boss)q.push(wave%6===3?3:7);
    const pool=[0,0];if(wave>=2)pool.push(1,5);if(wave>=3)pool.push(0,5);if(wave>=4)pool.push(2,4);if(wave>=5)pool.push(4,1,6);if(wave>=7)pool.push(2,5,6);
    const n=Math.round(Math.min(2+wave*1.9,22)*D.cnt);for(let i=0;i<n;i++)q.push(pool[Math.random()*pool.length|0]);
    queue=q;banner('Wave '+wave+(boss?' · BOSS!':''),'OUTLAW TOWN');sfx('horn');send({k:'wv',n:wave});
    {const fr=OutlawArena.pickFronts(wave);OutlawArena.setFronts(fr,true);send({k:'fr',f:fr});OutlawArena.reset();send({k:'rs'})} // raiders come from 1-3 of the island's fronts; cover grows back
  }
  function pickCover(n,t){
    let b=null,bs=1e9;
    for(const c of cover){const dn=Math.hypot(c.x-n.x,c.z-n.z);if(dn>32)continue;
      const ux=c.x-t.x,uz=c.z-t.z,l=Math.hypot(ux,uz)||1,px=c.x+ux/l*(c.r+1.1),pz=c.z+uz/l*(c.r+1.1);
      if(los(px,pz,t.x,t.z))continue;const dt=Math.hypot(px-t.x,pz-t.z),s=dn+Math.abs(dt-(n.type===2?35:16))*.6;if(s<bs){bs=s;b={x:px,z:pz,c}}}
    return b}
  function dealDmg(n,t,d){d=Math.round(d*n.dm);if(t.id==='bank'){bank.hp=Math.max(0,bank.hp-d);return}if(t.id===myId)hurt(d,n.x,n.z);else send({k:'hurt',to:t.id,d,x:n.x,z:n.z})}
  function healBeam(a,b){tracer(a.x,H(a.x,a.z)+1.3,a.z,b.x,H(b.x,b.z)+1.3,b.z,'#5dff8a');popText(b.x,H(b.x,b.z)+2.6,b.z,'+','#5dff8a');sfx('heal')}
  function throwDyn(n,t){const p={k:'dy',x0:n.x,z0:n.z,x1:t.x+t.vx*1.2,z1:t.z+t.vz*1.2,d:Math.round(TYPES[4].dmg*n.dm)};send(p);addDyn(p)}
  function addDyn(p){
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.5,8),new THREE.MeshStandardMaterial({color:'#d33',emissive:'#a00'}));scene.add(m);
    const r=new THREE.Mesh(new THREE.RingGeometry(4.2,5.2,32),new THREE.MeshBasicMaterial({color:'#ff3030',transparent:true,opacity:.55,side:THREE.DoubleSide}));r.rotation.x=-Math.PI/2;r.position.set(p.x1,H(p.x1,p.z1)+.15,p.z1);scene.add(r);
    dyn.push({p,m,r,t:0,fuse:1.7})}
  function dynTick(dt){
    for(let i=dyn.length-1;i>=0;i--){const e=dyn[i],p=e.p,u=Math.min(1,e.t/e.fuse);e.t+=dt;
      e.m.position.set(p.x0+(p.x1-p.x0)*u,H(p.x0,p.z0)+1.4+Math.sin(u*Math.PI)*6*(1-u*.3)-1.2*u,p.z0+(p.z1-p.z0)*u);e.m.rotation.x+=dt*12;e.r.material.opacity=.35+.3*Math.sin(e.t*14);
      if(e.t>=e.fuse){scene.remove(e.m);scene.remove(e.r);dyn.splice(i,1);boom(p.x1,p.z1,5);if(isHost())OutlawArena.blast(p.x1,p.z1,5,p.d*2);
        const dd=Math.hypot(S.x-p.x1,S.z-p.z1);if(!down&&dd<5.2)hurt(Math.max(1,Math.round(p.d*(1-dd/6.5))),p.x1,p.z1);
        if(isHost()&&mode==='defend'&&Math.hypot(bank.x-p.x1,bank.z-p.z1)<9)bank.hp=Math.max(0,bank.hp-p.d*2)}}}
  function enemyShoot(n,t,d,T){
    const mv=Math.hypot(t.vx,t.vz),p=Math.max(.08,Math.min(.85,T.acc+wave*.012-d*.006-(mv>2?.18:0)));
    n.group.userData.recoil=1;const M=muzzle(n.group,-1);const hitIt=Math.random()<p;
    const lx=t.x+t.vx*d/60,lz=t.z+t.vz*d/60,j=hitIt?0:rnd(-2,2);
    tracer(M.x,M.y,M.z,lx+j,(t.id===myId?S.y:n.group.position.y)+1.1,lz+j,'#ff9a7a');sfx('enemy');
    send({k:'f',m:[M.x,M.y,M.z],e:[lx+j,n.group.position.y+1.1,lz+j],ai:1});
    if(hitIt){dealDmg(n,t,T.dmg)}}
  function detour(n,t){ // nearest blocking cover on the line to the target -> a point beside it to walk around
    let best=null,bd=1e9;for(const c of cover){if(!segCircle(n.x,n.z,t.x,t.z,c))continue;const d=Math.hypot(c.x-n.x,c.z-n.z);if(d<bd){bd=d;best=c}}
    if(!best)return null;const ex=t.x-n.x,ez=t.z-n.z,l=Math.hypot(ex,ez)||1;return {x:best.x+(-ez/l)*n.flank*(best.r+3.5),z:best.z+(ex/l)*n.flank*(best.r+3.5)}}
  function think(n,dt,pl){
    const T=TYPES[n.type],alive=pl.filter(p=>!p.down);if(!alive.length){n.st='idle';return}
    let t=null,bs=1e9;for(const p of alive){let load=0;for(const o of npcs.values())if(o!==n&&o.tid===p.id&&!o.dead)load++;
      const s=Math.hypot(p.x-n.x,p.z-n.z)+load*7-(n.tid===p.id?6:0);if(s<bs){bs=s;t=p}}
    n.tid=t.id;n.cd-=dt;n.t+=dt;n.dec-=dt;n.age=(n.age||0)+dt;const brave=n.age>35; // after 35s enemies stop hiding and push in (prevents stalemates)
    if(n.raider&&bank.hp>0&&!alive.some(p=>Math.hypot(p.x-n.x,p.z-n.z)<14))t={id:'bank',x:bank.x,z:bank.z+7,vx:0,vz:0,down:false}; // raiders hit the vault unless a player is close
    let dx=t.x-n.x,dz=t.z-n.z;const d=Math.hypot(dx,dz)||1,ux=dx/d,uz=dz/d,seen=los(n.x,n.z,t.x,t.z);
    let gx=ux,gz=uz;if(!seen){const dv=detour(n,t);if(dv){const q=Math.hypot(dv.x-n.x,dv.z-n.z)||1;gx=(dv.x-n.x)/q;gz=(dv.z-n.z)/q}}
    if(seen&&!n.seen)n.react=T.react*Math.max(.35,1-wave*.06);n.seen=seen;if(n.react>0)n.react-=dt;
    let mx=0,mz=0,sp=T.sp;n.st='run';
    if(n.type===7){if(n.hp<n.max*.3)sp*=1.4;for(const th of [.6,.3])if(n.hp<n.max*th&&!n['s'+th]){n['s'+th]=1;queue.unshift(0,0,5);send({k:'bn',t:'The Warlord calls for backup!'});banner('The Warlord calls for backup!','OUTLAW TOWN')}}
    if(n.type===6){ // MEDIC: heal the most wounded ally, otherwise keep away from players
      let a=null,r=1;for(const o of npcs.values()){if(o===n||o.dead||o.type===6)continue;const q=o.hp/o.max;if(q<r&&Math.hypot(o.x-n.x,o.z-n.z)<26){r=q;a=o}}
      if(a&&r<.9){const ax=a.x-n.x,az=a.z-n.z,ad=Math.hypot(ax,az)||1;if(ad>8){mx=ax/ad;mz=az/ad}else{sp=0;n.st='idle';if(n.cd<=0){n.cd=T.cd;a.hp=Math.min(a.max,a.hp+a.max*.3);send({k:'hl',a:n.id,b:a.id});healBeam(n,a)}}}
      else if(d<20){mx=-ux;mz=-uz}else{sp=0;n.st='idle'}
    }else if(n.type===1){ // BRUTE: flanking weaving charge
      const a=n.flank*Math.min(.9,d/22),c=Math.cos(a),s=Math.sin(a),w=Math.sin(n.t*4+n.ph)*.45;
      mx=gx*c-gz*s-gz*w;mz=gx*s+gz*c+gx*w;if(d<2.2){sp=0;n.st='idle';if(n.cd<=0){n.cd=T.cd;dealDmg(n,t,T.dmg)}}
    }else{
      const want=n.type===2?34:n.type===3?16:n.type===7?20:15,boss=n.type===3||n.type===7,hurtMode=n.hp<n.max*.35&&!boss&&!brave;
      if(brave&&n.mode==='cover')n.mode='advance';
      if(n.dec<=0){n.dec=rnd(.5,.9);
        if(hurtMode){n.mode='cover';n.cp=pickCover(n,t)}
        else if(n.mode==='cover'&&n.cp&&n.pt>0){/* stay */}
        else if((n.type===2&&!brave)||(!boss&&!brave&&Math.random()<.3&&seen)){n.cp=pickCover(n,t);n.mode=n.cp?'cover':'fight';n.pt=rnd(2,4)}
        else n.mode=seen&&d<=T.range?'fight':'advance'}
      if(n.mode==='cover'&&n.cp){
        n.pt-=dt;n.peek-=dt;const cx=n.cp.x-n.x,cz=n.cp.z-n.z,cd=Math.hypot(cx,cz);
        if(cd>1){mx=cx/cd;mz=cz/cd;n.peekOut=false}
        else{ // at cover: hide, then peek sideways and shoot
          if(n.peek<=0){n.peekOut=!n.peekOut;n.peek=n.peekOut?rnd(.9,1.4):rnd(.8,1.5);if(n.type===2)n.aim=0}
          sp=0;n.st='idle';if(n.peekOut){mx=-uz*n.flank;mz=ux*n.flank;sp=T.sp*.8;n.st='run'}}
        if(n.pt<=0&&!hurtMode)n.mode='fight';
      }else if(n.mode==='fight'){
        // hold standoff distance, strafe, back off when crowded
        const off=d-want,s=Math.sin(n.t*1.3+n.ph);mx=ux*Math.max(-1,Math.min(1,off*.25))-uz*s*.9;mz=uz*Math.max(-1,Math.min(1,off*.25))+ux*s*.9;sp=T.sp*.8;
        if(Math.abs(off)<2&&Math.abs(s)<.2){sp=0;n.st='idle'}
      }else{ // advance toward flank approach point
        const a=n.flank*.8,c=Math.cos(a),s=Math.sin(a);mx=gx*c-gz*s;mz=gx*s+gz*c}
      const peeking=n.mode!=='cover'||n.peekOut;
      if(peeking&&seen&&d<T.range&&n.react<=0){
        if(n.type===2){n.aim+=dt;n.st='aim';sp=0;if(n.aim>=.9&&n.cd<=0){n.aim=0;n.cd=T.cd;enemyShoot(n,t,d,T)}}
        else if(n.cd<=0){n.cd=T.cd*rnd(.85,1.2);if(n.type===4)throwDyn(n,t);else{enemyShoot(n,t,d,T);if(n.type===7){n.bc=(n.bc||0)+1;n.cd=n.bc>=14?(n.bc=0,2.2):T.cd}}}
      }else if(n.type===2)n.aim=0;
    }
    // separation from other NPCs
    for(const o of npcs.values()){if(o===n||o.dead)continue;const ox=n.x-o.x,oz=n.z-o.z,od=Math.hypot(ox,oz);if(od<2.6&&od>.01){mx+=ox/od*.8;mz+=oz/od*.8}}
    if(d>70)sp*=1+Math.min(1,(d-70)/90)*.9; // raiders hurry across the island
    const ml=Math.hypot(mx,mz)||1;n.x+=mx/ml*sp*dt;n.z+=mz/ml*sp*dt;
    for(const c of solids){const ox=n.x-c.x,oz=n.z-c.z;if(Math.abs(ox)>c.r+1||Math.abs(oz)>c.r+1)continue;const od=Math.hypot(ox,oz),m=c.r+.45;if(od<m&&od>.001){n.x=c.x+ox/od*m;n.z=c.z+oz/od*m}}
    const lr=Math.hypot(n.x-C.x,n.z-C.z);if(lr>195){n.x=C.x+(n.x-C.x)/lr*195;n.z=C.z+(n.z-C.z)/lr*195}
    if(H(n.x,n.z)<.3){n.x+=(C.x-n.x)/lr*1.5;n.z+=(C.z-n.z)/lr*1.5} // stay on land (the arena is the whole island now)
    n.r=Math.atan2(ux,uz);if(sp===0&&n.st==='run')n.st='idle';
  }
  function hostTick(dt){
    const pl=players();
    for(const n of npcs.values())if(!n.dead)think(n,dt,pl);
    spawnT-=dt;const live=[...npcs.values()].filter(n=>!n.dead).length;
    if(queue.length&&spawnT<=0&&live<8+diff*3){spawnT=1.1;const ty=queue.shift(),[x,z]=spawnPoint(ty);addNpc(ty,x,z)}
    if(!queue.length&&live===0){if(nextWave===0){nextWave=clock+4500;if(wave>0){const c=Math.round((40+wave*12)*DIFF[diff].coin);send({k:'wc',c});earn(c);banner('Wave '+wave+' cleared! +'+c+' 🪙','OUTLAW TOWN');
        if(mode==='defend'){bank.hp=Math.min(bank.max,bank.hp+bank.max*.15);if(wave>=8){const w={k:'win',c:Math.round(400*DIFF[diff].coin)};send(w);onMsg(w);return}}}}
      else if(clock>nextWave){nextWave=0;best=Math.max(best,wave);try{localStorage.setItem('w4ow',best)}catch(e){}startWave()}}
    if(mode==='defend'&&bank.hp<=0){const e={k:'end',msg:'The bank was robbed! You reached wave '+wave};send(e);onMsg(e);return}
    if(!pl.every(p=>p.down))wiped=false;
    else if(!wiped){wiped=true; // everyone down: reset the current wave
      for(const n of npcs.values())n.dead=1;queue=[];wave=Math.max(0,wave-1);nextWave=clock+6000;banner('Wiped out! Retrying…','OUTLAW TOWN');send({k:'wv',n:-1})}
    snapT-=dt;if(snapT<=0){snapT=.1;
      send({k:'n',tr:OutlawArena.trainQ(),w:wave,kl:kills,bk:Math.round(bank.hp),a:[...npcs.values()].map(n=>[n.id,n.type,+n.x.toFixed(2),+n.z.toFixed(2),+n.r.toFixed(2),Math.round(n.hp),Math.round(n.max),n.st,n.dead])})}
  }

  // ---------- CLIENT: snapshot ----------
  function applySnap(p){
    if(p.tr!==undefined)OutlawArena.trainSync(p.tr);
    wave=p.w;kills=p.kl;bank.hp=p.bk;const seen=new Set();
    for(const [id,type,x,z,r,h,mh,st,dead] of p.a){seen.add(id);let n=npcs.get(id);
      if(!n){n={id,type,x,z,r,hp:h,max:mh,st,dead:0,group:null};npcs.set(id,n);spawnVisual(n);n.group.position.set(x,H(x,z),z)}
      n.tx=x;n.tz=z;n.r=r;n.hp=h;n.max=mh;n.st=st;if(dead)n.dead=1}
    for(const n of npcs.values())if(!seen.has(n.id))n.dead=1;
    updateHud()}

  // ---------- per-frame visuals (both sides) ----------
  function visuals(dt){
    for(const n of [...npcs.values()]){
      const g=n.group;if(!g)continue;const p=g.position;
      if(n.dead){n.dt=(n.dt||0)+dt;g.rotation.x=Math.min(1.5,n.dt*3);g.scale.setScalar(Math.max(.01,TYPES[n.type].sc*(1-Math.max(0,n.dt-.5)*1.4)));if(n.laser)n.laser.visible=false;
        if(n.dt>1.2){removeVisual(n);npcs.delete(n.id)}continue}
      if(isHost()){p.x=n.x;p.z=n.z}else{const k=Math.min(1,dt*10);p.x+=(n.tx-p.x)*k;p.z+=(n.tz-p.z)*k;n.x=p.x;n.z=p.z}
      p.y=H(p.x,p.z);let da=n.r-g.rotation.y;da=Math.atan2(Math.sin(da),Math.cos(da));g.rotation.y+=da*Math.min(1,dt*10);
      animate(g,dt,n.st==='aim'?'idle':n.st);
      n.fg.scale.x=Math.max(.001,n.hp/n.max);n.fg.position.x=-(1-n.fg.scale.x)*.6;n.bar.lookAt(camera.position);
      if(n.st==='aim'){const t=[...others.values()].map(o=>o.group.position).concat([{x:S.x,y:S.y,z:S.z}]).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
        const dx=t.x-p.x,dz=t.z-p.z,L=Math.hypot(dx,dz);n.laser.visible=true;n.laser.scale.set(1,1,L);n.laser.position.set(p.x+dx/2,p.y+1.2,p.z+dz/2);n.laser.lookAt(t.x,p.y+1.2,t.z)}
      else if(n.laser)n.laser.visible=false;
    }
    for(let i=fx.length-1;i>=0;i--){const e=fx[i];if(e.sign){e.sign.lookAt(camera.position);continue}e.t-=dt;const o=e.sp||e.l;
      if(e.v){o.position.x+=e.v[0]*dt;o.position.y+=e.v[1]*dt;o.position.z+=e.v[2]*dt;if(e.l)e.v[1]-=9*dt}
      if(e.grow){const k=1-e.t/.4;o.scale.setScalar(1+k*e.grow);o.material.opacity=Math.max(0,.85*(1-k))}
      if(e.sp)e.sp.material.opacity=Math.max(0,Math.min(1,e.t/.5));else if(e.l.isLine)e.l.material.opacity=Math.max(0,e.t/.09);
      if(e.t<=0){scene.remove(o);if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose()}if(o.geometry)o.geometry.dispose();fx.splice(i,1)}}
  }

  // ---------- UI ----------
  function updateHud(){
    if(!hudEl)return;hudEl.style.display=(wi>=0||active)?'block':'none';
    const pc=Math.max(0,hp/maxHp()*100);hpEl.style.width=pc+'%';hpEl.style.background=pc>50?'#5be37d':pc>25?'#ffcc4d':'#ff5050';
    $('owtxt').textContent=(wi>=0?WEAPONS[wi].n+' '+(reloading?'⏳ reloading':am(wi)+'/'+magOf(wi)):'Unarmed')+'  ·  🪙'+SAVE.coins+(active?'  ·  Wave '+wave+'  ·  ☠ '+kills+(mode==='defend'?'  ·  🏦 '+Math.round(bank.hp)+'/'+bank.max:''):'');
    xh.style.display=wi>=0?'block':'none';fireBtn.style.display=wi>=0?'block':'none';reloadBtn.style.display=wi>=0?'block':'none';$('owview').style.display=wi>=0?'block':'none';
  }
  function panel(html){
    if(!shopEl){shopEl=document.createElement('div');shopEl.className='veil';
      shopEl.innerHTML='<div id="owp" class="card"></div>';document.body.appendChild(shopEl);
      shopEl.onclick=e=>{const b=e.target.closest('[data-a]');if(b)panelAct(b.dataset.a,b.dataset.v)}}
    $('owp').innerHTML=html;shopEl.style.display='flex'}
  const closePanel=()=>{if(shopEl)shopEl.style.display='none'};
  const B=(a,v,t,col)=>'<button class="btn'+(col==='#ff6b3d'?' sel':col==='#2ecc71'?' go':'')+'" data-a="'+a+'" data-v="'+v+'">'+t+'</button>';
  function missionPanel(){
    panel('<h3 style="margin:0 0 8px">🤠 Showdown</h3><b>Mission</b><br>'+B('m','survive','Survive Waves',pick.m==='survive'?'#ff6b3d':'#ffffff22')+B('m','defend','Defend the Bank',pick.m==='defend'?'#ff6b3d':'#ffffff22')
      +'<div style="opacity:.75;margin:4px 0 10px">'+(pick.m==='defend'?'Raiders go for the vault. Hold 8 waves. If the bank falls, you lose.':'Endless waves. A boss every 3rd wave.')+'</div><b>Difficulty</b> <small style="opacity:.7">(coin bonus)</small><br>'
      +DIFF.map((D,i)=>B('d',i,D.n+' ×'+D.coin,pick.d===i?'#ff6b3d':'#ffffff22')).join('')+'<div style="margin-top:14px">'+B('go','','▶ START','#2ecc71')+B('x','','Cancel','#555')+'</div>')}
  function shopPanel(){
    const pips=(L,mx)=>'<span class="pips">'+Array.from({length:mx},(_,n)=>'<i'+(n<L?' class="on"':'')+'></i>').join('')+'</span>';
    const bt=(a,v,c,l)=>'<button class="btn gold'+(SAVE.coins>=c?'':' off')+'" data-a="'+a+'" data-v="'+v+'">'+l+' <b>'+c+'</b> \u{1FA99}</button>';
    const row=(t,sub,btn,locked)=>'<div class="gs-row'+(locked?' locked':'')+'"><div><div class="gs-name">'+t+'</div><div class="gs-sub">'+sub+'</div></div>'+btn+'</div>';
    let h='<div class="gs-head"><h3>\u{1F52B} Gunsmith</h3><div class="coins">\u{1FA99} <b>'+SAVE.coins+'</b></div></div><div class="gs-hint">Switch guns with the \u{1F52B} button, or keys 1\u20139 / E</div>';
    WEAPONS.forEach((W,i)=>{if(!SAVE.own[i])h+=row('\u{1F512} '+W.n,W.mag+' rounds \u00B7 '+W.d+' dmg',bt('buyw',i,W.price,'Buy'),true);
      else{const L=SAVE.lv[i],c=Math.round(100*(L+1)*(1+i*.25));h+=row(W.n+' '+pips(L,5),Math.round(dmgOf(i))+' dmg \u00B7 '+magOf(i)+' mag',L>=5?'<span class="max">MAX</span>':bt('upw',i,c,'\u2B06'))}});
    h+='<div class="gs-sec">Upgrades</div>';
    for(const [k,t,sub,mx,base] of [['hp','❤️ Max Health','+20 HP',5,130],['mag','📦 Mag Size','+20% rounds',4,120],['rl','⚡ Fast Reload','−12% time',4,110],['crit','🎯 Crit Chance','+5%',5,140]]){const L=SAVE[k];h+=row(t+' '+pips(L,mx),sub,L>=mx?'<span class="max">MAX</span>':bt('ug',k,base*(L+1),'\u2B06'))}
    panel(h+'<div class="gs-foot"><button class="btn" data-a="x" data-v="">Close</button></div>')}
  function panelAct(a,v){
    if(a==='x'){closePanel();return}
    if(a==='m'){pick.m=v;missionPanel();return}if(a==='d'){pick.d=+v;missionPanel();return}
    if(a==='go'){closePanel();const m={k:'start',host:myId,mode:pick.m,diff:pick.d};send(m);onMsg(m);return}
    const spend=c=>SAVE.coins>=c?(SAVE.coins-=c,sfx('coin'),true):(banner('Not enough coins','GUNSMITH'),false);
    if(a==='buyw'){const i=+v;if(!SAVE.own[i]&&spend(WEAPONS[i].price))SAVE.own[i]=1}
    else if(a==='upw'){const i=+v,L=SAVE.lv[i];if(L<5&&spend(Math.round(100*(L+1)*(1+i*.25))))SAVE.lv[i]++}
    else if(a==='ug'){const mx={hp:5,mag:4,rl:4,crit:5}[v],base={hp:130,mag:120,rl:110,crit:140}[v],L=SAVE[v];if(L<mx&&spend(base*(L+1))){SAVE[v]++;if(v==='hp')hp=maxHp()}}
    save();shopPanel();updateHud()}
  function ui(){
    if(hudEl)return;
    const st=document.createElement('style');st.textContent='#owhud{position:fixed;z-index:6;left:12px;top:calc(env(safe-area-inset-top,0px) + 88px);color:#fff;font-size:13px;text-shadow:0 1px 4px #000;pointer-events:none;display:none}#owhud .bar{width:150px;height:10px;background:#0008;border-radius:6px;overflow:hidden;margin-bottom:4px}#owhp{height:100%}'
      +'#owxh{position:fixed;z-index:6;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;pointer-events:none;display:none}#owxh:before,#owxh:after{content:"";position:absolute;background:#fff;box-shadow:0 0 3px #000}#owxh:before{left:10px;top:0;width:2px;height:22px}#owxh:after{top:10px;left:0;height:2px;width:22px}'
      +'.owb{position:fixed;z-index:5;border-radius:50%;border:0;color:#fff;font-size:26px}#owfire{right:18px;bottom:calc(env(safe-area-inset-bottom,0px) + 232px);width:78px;height:78px;background:#e0443ecc;display:none;touch-action:none}#owview{right:264px;bottom:calc(env(safe-area-inset-bottom,0px) + 208px);width:56px;height:56px;background:#bfe3ffcc}#owshop{right:200px;bottom:calc(env(safe-area-inset-bottom,0px) + 208px);width:56px;height:56px;background:#ffd24acc}#owrl{right:136px;bottom:calc(env(safe-area-inset-bottom,0px) + 208px);width:56px;height:56px;background:#ffffffcc}#owgun{right:200px;bottom:calc(env(safe-area-inset-bottom,0px) + 144px);width:56px;height:56px;background:#ffffffcc}';
    document.head.appendChild(st);
    hudEl=document.createElement('div');hudEl.id='owhud';hudEl.innerHTML='<div class="bar"><div id="owhp" style="width:100%"></div></div><div id="owtxt"></div>';document.body.appendChild(hudEl);hpEl=$('owhp');
    xh=document.createElement('div');xh.id='owxh';document.body.appendChild(xh);
    fireBtn=document.createElement('button');fireBtn.id='owfire';fireBtn.className='owb';fireBtn.textContent='🔥';document.body.appendChild(fireBtn);
    reloadBtn=document.createElement('button');reloadBtn.id='owrl';reloadBtn.className='owb';reloadBtn.textContent='🔄';document.body.appendChild(reloadBtn);reloadBtn.addEventListener('pointerdown',e=>{reload();e.preventDefault()});
    const viewBtn=document.createElement('button');viewBtn.id='owview';viewBtn.className='owb';viewBtn.textContent='👁';document.body.appendChild(viewBtn);
    viewBtn.addEventListener('pointerdown',e=>{const v=CameraRig.toggleView();banner(v==='fps'?'First-person view':'Third-person view','CAMERA');e.preventDefault()});
    const shopBtn=document.createElement('button');shopBtn.id='owshop';shopBtn.className='owb';shopBtn.textContent='🛒';document.body.appendChild(shopBtn);shopBtn.addEventListener('pointerdown',e=>{shopPanel();e.preventDefault()});
    gunBtn=document.createElement('button');gunBtn.id='owgun';gunBtn.className='owb';gunBtn.textContent='🔫';document.body.appendChild(gunBtn);
    fireBtn.addEventListener('pointerdown',e=>{firing=true;e.preventDefault()});['pointerup','pointercancel','pointerleave'].forEach(ev=>fireBtn.addEventListener(ev,()=>firing=false));
    gunBtn.addEventListener('pointerdown',e=>{equip(nextW());e.preventDefault()});
    addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;
      if(e.code.startsWith('Digit')){const k=+e.code.slice(5);if(k===0){if(wi>=0)equip(wi)}else if(k<=WEAPONS.length)equip(k-1)}
      if(e.code==='KeyF'&&wi>=0){firing=true}if(e.code==='KeyR')reload();if(e.code==='KeyE')equip(nextW());});
    addEventListener('keyup',e=>{if(e.code==='KeyF')firing=false});
    updateHud();
  }

  // ---------- messages ----------
  function stopGame(){active=false;OutlawArena.reset();for(const n of npcs.values())removeVisual(n);npcs.clear();for(const d of drops)scene.remove(d.m);drops=[];for(const e of dyn){scene.remove(e.m);scene.remove(e.r)}dyn=[];updateHud()}
  function onMsg(p){
    if(!p)return;
    if(p.k==='cv'||p.k==='cb'||p.k==='fr'||p.k==='rs'){OutlawArena.onMsg(p);return}
    switch(p.k){
      case 'start':stopGame();active=true;host=p.host;mode=p.mode||'survive';diff=p.diff===undefined?1:p.diff;wave=0;kills=0;queue=[];nextWave=0;hp=maxHp();down=false;ammo=[];reloading=false;bank.max=bank.hp=1500;
        banner((mode==='defend'?'Defend the bank! ':'')+DIFF[diff].n+' · '+(isHost()?'you are hosting':'get ready'),'SHOWDOWN');if(isHost())nextWave=clock+3000;updateHud();break;
      case 'end':stopGame();if(p.msg)banner(p.msg,'SHOWDOWN');break;
      case 'win':earn(p.c);stopGame();banner('BANK DEFENDED! +'+p.c+' 🪙','VICTORY');sfx('horn');break;
      case 'n':if(!isHost())applySnap(p);break;
      case 'h':if(isHost())damageNpc(p.id,p.d);break;
      case 'hurt':if(p.to===myId)hurt(p.d,p.x,p.z);break;
      case 'dn':pdown=!!p.v;break;
      case 'wv':if(p.n>0){banner('Wave '+p.n+(p.n%3===0?' · BOSS!':''),'OUTLAW TOWN');sfx('horn')}else if(p.n===-1&&!isHost())banner('Wiped out! Retrying…','OUTLAW TOWN');break;
      case 'bn':banner(p.t,'OUTLAW TOWN');break;
      case 'wg':pw=p.i;break;
      case 'kill':earn(p.c);break;
      case 'wc':earn(p.c);banner('Wave cleared! +'+p.c+' 🪙','OUTLAW TOWN');break;
      case 'dr':addDrop(p.id,p.x,p.z);break;
      case 'pk':{const i=drops.findIndex(d=>d.id===p.id);if(i>=0){scene.remove(drops[i].m);drops.splice(i,1)}break}
      case 'dy':addDyn(p);break;
      case 'hl':{const a=npcs.get(p.a),b=npcs.get(p.b);if(a&&b)healBeam(a,b);break}
      case 'f':{const e=p.e||[0,0,0];if(!p.ai&&WEAPONS[p.w]&&WEAPONS[p.w].rocket)boom(e[0],e[2],5);if(!p.ai){const pr=partner();if(pr)pr[1].group.userData.recoil=1}tracer(p.m[0],p.m[1],p.m[2],e[0],e[1],e[2],p.ai?'#ff9a7a':'#ffe9a0');sfx(p.ai?'enemy':(WEAPONS[p.w]||WEAPONS[0]).snd);break}
    }
  }

  function tick(dt,t){
    if(!C||!me)return;ui();clock+=dt*1000;OutlawArena.tick(dt);
    prev.vx=(S.x-prev.x)/Math.max(dt,.001);prev.vz=(S.z-prev.z)/Math.max(dt,.001);prev.x=S.x;prev.z=S.z;
    const p=partner();if(p){const g=p[1].group.position;pprev.vx=(g.x-pprev.x)/Math.max(dt,.001);pprev.vz=(g.z-pprev.z)/Math.max(dt,.001);pprev.x=g.x;pprev.z=g.z;if(p[1].group.userData.gunI!==pw)setGun(p[1].group,pw)}
    if(clock-lastH>100){lastH=clock;for(const id in hitBuf){send({k:'h',id:+id,d:hitBuf[id]});delete hitBuf[id]}}
    cdT-=dt;hitT=Math.max(0,hitT-dt);if(xh)xh.style.filter=hitT>0?'hue-rotate(160deg) saturate(8)':'none';
    if(firing)fire();
    lockMarker();
    // a weapon is out (and you're not swimming): CameraRig picks first-person or shoulder view; Viewmodel draws the arms + gun
    const swimming=!S.flying&&H(S.x,S.z)<-.5,armed=wi>=0&&!down&&!swimming;CameraRig.setShooter(armed);   // flying over water is fine; swimming isn't
    if(wi>=0&&!down){
      camera.getWorldDirection(camDir);const tp=camera.position.clone().addScaledVector(camDir,30);
      let ap=Math.atan2(tp.y-(S.y+1.3),Math.hypot(tp.x-S.x,tp.z-S.z)),face=Math.atan2(camDir.x,camDir.z);
      if(lockN&&(firing||cdT>-.35)){const lp=lockN.group.position,dx=lp.x-S.x,dz=lp.z-S.z;ap=Math.atan2(lp.y+TYPES[lockN.type].sc-(S.y+1.3),Math.hypot(dx,dz));face=Math.atan2(dx,dz);
        if(armed&&!CameraRig.isFPS()){let dy=Math.atan2(-dx,-dz)-S.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));S.yaw+=dy*Math.min(1,dt*3)}} // third-person view drifts toward your target; first person never steals your aim
      if(armed){S.rot=lerpAngle(S.rot,face,1-Math.exp(-18*dt));me.rotation.y=S.rot}  // the body always faces the crosshair
      me.userData.aimP=Math.max(-.7,Math.min(.7,ap))}
    Viewmodel.update(dt,{vis:CameraRig.isFPS()&&wi>=0&&!down,wi,len:wi>=0?WEAPONS[wi].len:.5,reload:reloading&&wi>=0?1-reloadT/(WEAPONS[wi].rl*(1-.12*SAVE.rl)):-1});
    if(reloading){reloadT-=dt;if(reloadT<=0){reloading=false;if(wi>=0)ammo[wi]=magOf(wi);updateHud()}}
    dropTick(dt,t);dynTick(dt);
    if(down){downT-=dt;if(downT<=0)respawn()}
    if(active){if(isHost())hostTick(dt)}
    visuals(dt);
  }

  Interaction.register('ow-start','Start Showdown',()=>C&&!active&&Math.hypot(S.x-C.x,S.z-(C.z+1))<5,()=>missionPanel());
  Interaction.register('ow-end','End Showdown',()=>C&&active&&Math.hypot(S.x-C.x,S.z-(C.z+1))<5,()=>{send({k:'end'});onMsg({k:'end'})});
  return {build,tick,onMsg,equip,fire,lockTarget,poseGun,loadGun,_t:()=>({addNpc,panelAct,SAVE,get ammo(){return ammo},get bank(){return bank},get npcs(){return npcs}})};
})();
