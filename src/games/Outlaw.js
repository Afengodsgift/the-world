// Outlaw Town: co-op wave shooter. Weapons from Max_Wp-Pack (assets/weapons/*.glb).
// Net: ONE broadcast event 'og'. The player who pressed Start is HOST and runs all NPC AI;
// the other client renders host snapshots (10Hz) and reports its hits to the host.
// Globals used from index.html: S, chan, others, myId, scene, camera, H, solids, LOCS, TOWN, WP,
// makeAvatar, dress, animate, banner, chime, togglePan, panOn, Interaction, THREE.
const Outlaw=(()=>{
  const WEAPONS=[
    {n:'Revolver',f:'Revolver-A',len:.45,cd:.42,d:34,sp:.004,pel:1,rng:75,auto:false},
    {n:'C96 Pistol',f:'MS-C96',len:.5,cd:.18,d:14,sp:.02,pel:1,rng:60,auto:true},
    {n:'SMG',f:'R2014-2806',len:.7,cd:.075,d:8,sp:.04,pel:1,rng:55,auto:true},
    {n:'Assault Rifle',f:'AHKN-LV',len:1.0,cd:.11,d:12,sp:.025,pel:1,rng:95,auto:true},
    {n:'Shotgun',f:'PMPSG',len:1.0,cd:.8,d:13,sp:.09,pel:7,rng:32,auto:false},
    {n:'Sniper',f:'TMS-1909',len:1.2,cd:1.1,d:100,sp:0,pel:1,rng:200,auto:false}];
  // NPC archetypes. skin: index into the world's skins.
  const TYPES=[
    {n:'Bandit',skin:2,hp:60,sp:5,range:28,dmg:8,cd:1.15,acc:.5,react:.55,sc:1},
    {n:'Brute',skin:2,hp:120,sp:7.4,range:2.2,dmg:14,cd:.9,acc:1,react:0,sc:1.15},
    {n:'Sniper',skin:3,hp:40,sp:3.6,range:60,dmg:24,cd:2.6,acc:.7,react:.9,sc:1},
    {n:'Boss',skin:3,hp:520,sp:4.6,range:34,dmg:11,cd:.5,acc:.55,react:.3,sc:1.6}];
  const cover=[],npcs=new Map(),cache={};
  let wiped=false,clock=0,C=null,active=false,host=null,wave=0,kills=0,best=0,nextWave=0,queue=[],spawnT=0,nid=1,snapT=0;
  let wi=-1,hp=100,down=false,downT=0,cdT=0,firing=false,pdown=false,pw=-1,hudEl,hpEl,xh,fireBtn,gunBtn,hitT=0,fx=[];
  const prev={x:0,z:0,vx:0,vz:0},pprev={x:0,z:0,vx:0,vz:0};
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
  function rayCover(o,d,max){ // nearest cover hit distance along 3D ray (horizontal test), or max
    let best=max;const a=d.x*d.x+d.z*d.z;if(a<1e-8)return best;
    for(const c of cover){const fx=o.x-c.x,fz=o.z-c.z,b=2*(fx*d.x+fz*d.z),k=fx*fx+fz*fz-c.r*c.r,D=b*b-4*a*k;if(D<0)continue;
      const t=(-b-Math.sqrt(D))/(2*a);if(t>0&&t<best)best=t}
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
    const ground=new THREE.Mesh(new THREE.CircleGeometry(24,32),new THREE.MeshStandardMaterial({color:'#b79a68',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(C.x,C.y+.04,C.z);ground.receiveShadow=true;scene.add(ground);
    building(C.x-14,C.z-8,11,7,6,'#8a5a30','SALOON',0);building(C.x+14,C.z-8,11,7,5.4,'#7d6a52','BANK',0);
    building(C.x-14,C.z+10,10,6,5,'#9a7440','HOTEL',Math.PI);building(C.x+14,C.z+10,9,6,4.6,'#6e5a46','JAIL',Math.PI);
    [[-5,-2],[4,3],[-2,6],[7,-3],[-8,2],[0,-5],[10,2],[-10,-3]].forEach(([dx,dz],i)=>prop(C.x+dx,C.z+dz,i%2?'barrel':'crate'));
    const pad=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.4,.3,24),new THREE.MeshStandardMaterial({color:'#c0392b',emissive:'#7a1a10',emissiveIntensity:.6}));pad.position.set(C.x,C.y+.15,C.z+1);scene.add(pad);
    const sg=label('OUTLAW TOWN',6,1.5);sg.position.set(C.x,5,C.z+1);sg.userData.bb=1;scene.add(sg);fx.push({sign:sg});
    portals();
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
    const a=5.7,T={x:TOWN.x+Math.cos(a)*19,z:TOWN.z+Math.sin(a)*19},I={x:C.x,z:C.z+20};
    portalPad(T.x,T.z,'#c0392b','🤠 OUTLAW ISLE');portalPad(I.x,I.z,'#2e86de','🏠 BACK TO TOWN');
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
    piv.add(m);piv.position.set(-.3,1.12,.35+WEAPONS[i].len*.25);group.add(piv);u.gun=piv;
  }
  function equip(i){
    if(i===wi)i=-1;wi=i;if(i>=0&&panOn)togglePan();
    setGun(me,i);send({k:'wg',i});updateHud();
  }

  // ---------- effects ----------
  function bang(f,len){try{const a=new(window.AudioContext||webkitAudioContext)(),n=a.createBuffer(1,a.sampleRate*len,a.sampleRate),d=n.getChannelData(0);
    for(let k=0;k<d.length;k++)d[k]=(Math.random()*2-1)*Math.pow(1-k/d.length,3);const s=a.createBufferSource(),g=a.createGain(),fl=a.createBiquadFilter();fl.frequency.value=f;s.buffer=n;s.connect(fl);fl.connect(g);g.connect(a.destination);g.gain.value=.25;s.start()}catch(e){}}
  function tracer(ax,ay,az,bx,by,bz,col){
    const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax,ay,az),new THREE.Vector3(bx,by,bz)]);
    const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:col||'#ffe9a0',transparent:true}));scene.add(l);fx.push({l,t:.09});
    const f=new THREE.Mesh(new THREE.SphereGeometry(.16,6,6),new THREE.MeshBasicMaterial({color:'#fff2b0'}));f.position.set(ax,ay,az);scene.add(f);fx.push({l:f,t:.05})}
  const muzzle=(group,i)=>{const L=WEAPONS[i>=0?i:0].len,r=group.rotation.y;return {x:group.position.x+Math.sin(r)*(.35+L*.75)-Math.cos(r)*.3,y:group.position.y+1.15,z:group.position.z+Math.cos(r)*(.35+L*.75)+Math.sin(r)*.3}};

  // ---------- player shooting ----------
  const camDir=new THREE.Vector3();
  // Aim assist: lock the best live NPC near the crosshair (cone ~34 deg, must be visible, not behind cover).
  let lockM=null;
  function lockTarget(range){
    camera.getWorldDirection(camDir);const o=camera.position;let best=null,bs=1e9;
    for(const n of npcs.values()){if(n.dead||!n.group)continue;const p=n.group.position,sc=TYPES[n.type].sc,
      vx=p.x-o.x,vy=p.y+sc-o.y,vz=p.z-o.z,L=Math.hypot(vx,vy,vz);if(L>range||L<1)continue;
      const ang=Math.acos(Math.max(-1,Math.min(1,(vx*camDir.x+vy*camDir.y+vz*camDir.z)/L)));
      if(ang>.6||!los(S.x,S.z,p.x,p.z))continue;const sc2=ang+L*.004;if(sc2<bs){bs=sc2;best=n}}
    return best}
  function fire(){
    if(wi<0||down||!camera)return;const W=WEAPONS[wi];if(cdT>0)return;cdT=W.cd;
    const lk=lockTarget(W.rng),o=camera.position.clone(),base=camDir.clone();
    let lp=null,lsc=1;if(lk){lp=lk.group.position;lsc=TYPES[lk.type].sc;S.rot=Math.atan2(lp.x-S.x,lp.z-S.z)}else S.rot=Math.atan2(camDir.x,camDir.z);
    me.rotation.y=S.rot;const M=muzzle(me,wi);
    if(lk){o.set(M.x,M.y,M.z);base.set(lp.x-M.x,lp.y+lsc-M.y,lp.z-M.z).normalize()}
    let anyHit=false,endp=null;
    for(let p=0;p<W.pel;p++){
      const d=base.clone();if(W.sp){d.x+=rnd(-W.sp,W.sp);d.y+=rnd(-W.sp,W.sp);d.z+=rnd(-W.sp,W.sp);d.normalize()}
      const wall=rayCover(o,d,W.rng);let tn=wall,hit=null;
      for(const n of npcs.values()){if(n.dead)continue;const p3=n.group.position,sc=TYPES[n.type].sc,
        t=raySphere(o,d,p3.x,p3.y+1*sc,p3.z,.95*sc+Math.min(1.6,(Math.hypot(p3.x-o.x,p3.z-o.z))*.025));
        if(t!==null&&t<tn){tn=t;hit=n}}
      if(hit){anyHit=true;reportHit(hit.id,W.d)}
      endp=[o.x+d.x*tn,o.y+d.y*tn,o.z+d.z*tn];
      if(p<3)tracer(M.x,M.y,M.z,endp[0],endp[1],endp[2]);
    }
    bang(wi===5?500:wi===4?400:1800,wi===4||wi===5?.22:.09);
    if(anyHit)hitT=.18;
    send({k:'f',w:wi,m:[M.x,M.y,M.z],e:endp});
  }
  function lockMarker(){
    const lk=wi>=0&&!down?lockTarget(WEAPONS[wi].rng):null;
    if(!lockM){lockM=new THREE.Mesh(new THREE.RingGeometry(.55,.7,28),new THREE.MeshBasicMaterial({color:'#ff3030',depthTest:false,transparent:true,opacity:.9,side:THREE.DoubleSide}));lockM.renderOrder=10;lockM.visible=false;scene.add(lockM)}
    if(!lk){lockM.visible=false;return}
    const p=lk.group.position,sc=TYPES[lk.type].sc;lockM.visible=true;lockM.position.set(p.x,p.y+sc,p.z);lockM.scale.setScalar(sc);lockM.lookAt(camera.position)}
  function reportHit(id,d){if(isHost())damageNpc(id,d);else send({k:'h',id,d})}
  function damageNpc(id,d){const n=npcs.get(id);if(!n||n.dead)return;n.hp-=d;n.flash=.12;if(n.hp<=0)killNpc(n)}
  function killNpc(n){n.dead=1;kills++;chime()}

  // ---------- player health ----------
  function hurt(d,fx_,fz_){
    if(down)return;hp-=d;S.hurt=.35;if(fx_!==undefined){const l=Math.hypot(S.x-fx_,S.z-fz_)||1;S.kx+=(S.x-fx_)/l*4;S.kz+=(S.z-fz_)/l*4}
    if(navigator.vibrate)navigator.vibrate(30);
    if(hp<=0){hp=0;down=true;downT=6;send({k:'dn',v:1});banner('You are down! Respawning…','OUTLAW TOWN')}
    updateHud();
  }
  function respawn(){hp=100;down=false;S.x=C.x+(Math.random()-.5)*4;S.z=C.z+14;S.y=H(S.x,S.z)+.1;S.vy=0;send({k:'dn',v:0});updateHud()}

  // ---------- NPC visuals ----------
  function spawnVisual(n){
    const T=TYPES[n.type],g=makeAvatar(T.n,n.type===3?'#ff3030':'#c05030');g.userData.nm=T.n;g.scale.setScalar(T.sc);scene.add(g);dress(g,T.skin);
    const bar=new THREE.Group(),bg=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.14),new THREE.MeshBasicMaterial({color:'#000',depthTest:false,transparent:true,opacity:.6})),
      fg=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.14),new THREE.MeshBasicMaterial({color:'#ff4040',depthTest:false}));
    fg.position.z=.01;bar.add(bg,fg);bar.position.y=2.5;bar.renderOrder=9;g.add(bar);
    const laser=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,1,6).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:'#ff2020'}));laser.visible=false;scene.add(laser);
    n.group=g;n.bar=bar;n.fg=fg;n.laser=laser;
    setGun(g,[0,-1,5,3][n.type]); // bandit revolver, brute bare-handed, sniper rifle, boss assault rifle
  }
  function removeVisual(n){if(n.group){scene.remove(n.group)}if(n.laser)scene.remove(n.laser)}

  // ---------- HOST: AI ----------
  function players(){
    const l=[{id:myId,x:S.x,z:S.z,vx:prev.vx,vz:prev.vz,down}],p=partner();
    if(p){const g=p[1].group.position;l.push({id:p[0],x:g.x,z:g.z,vx:pprev.vx,vz:pprev.vz,down:pdown})}
    return l}
  function addNpc(type,x,z){
    const T=TYPES[type],n={id:nid++,type,x,z,hp:T.hp*(1+wave*.04),max:T.hp*(1+wave*.04),r:0,st:'idle',cd:rnd(.5,1.5),react:T.react,t:0,ph:rnd(0,6),flank:Math.random()<.5?1:-1,mode:'advance',dec:0,pt:0,peek:0,tid:null,aim:0,seen:false,dead:0};
    n.group=null;npcs.set(n.id,n);spawnVisual(n);n.group.position.set(x,H(x,z),z)}
  function spawnPoint(){for(let i=0;i<20;i++){const a=Math.random()*6.283,x=C.x+Math.cos(a)*42,z=C.z+Math.sin(a)*42;if(H(x,z)>1)return [x,z]}return [C.x+30,C.z]}
  function startWave(){
    wave++;const q=[];if(wave%3===0)q.push(3);
    const n=Math.min(2+wave*2,16);for(let i=0;i<n;i++)q.push(wave<2?0:wave<4?(i%3===2?1:0):(i%4===3?2:i%3===2?1:0));
    queue=q;banner('Wave '+wave+(wave%3===0?' · BOSS!':''),'OUTLAW TOWN');send({k:'wv',n:wave});
  }
  function pickCover(n,t){
    let b=null,bs=1e9;
    for(const c of cover){const dn=Math.hypot(c.x-n.x,c.z-n.z);if(dn>32)continue;
      const ux=c.x-t.x,uz=c.z-t.z,l=Math.hypot(ux,uz)||1,px=c.x+ux/l*(c.r+1.1),pz=c.z+uz/l*(c.r+1.1);
      if(los(px,pz,t.x,t.z))continue;const dt=Math.hypot(px-t.x,pz-t.z),s=dn+Math.abs(dt-(n.type===2?35:16))*.6;if(s<bs){bs=s;b={x:px,z:pz,c}}}
    return b}
  function enemyShoot(n,t,d,T){
    const mv=Math.hypot(t.vx,t.vz),p=Math.max(.08,Math.min(.85,T.acc+wave*.012-d*.006-(mv>2?.18:0)));
    const M=muzzle(n.group,-1);M.y=n.group.position.y+1.2;const hitIt=Math.random()<p;
    const lx=t.x+t.vx*d/60,lz=t.z+t.vz*d/60,j=hitIt?0:rnd(-2,2);
    tracer(M.x,M.y,M.z,lx+j,(t.id===myId?S.y:n.group.position.y)+1.1,lz+j,'#ff9a7a');bang(900,.07);
    send({k:'f',m:[M.x,M.y,M.z],e:[lx+j,n.group.position.y+1.1,lz+j],ai:1});
    if(hitIt){if(t.id===myId)hurt(T.dmg,n.x,n.z);else send({k:'hurt',to:t.id,d:T.dmg,x:n.x,z:n.z})}}
  function think(n,dt,pl){
    const T=TYPES[n.type],alive=pl.filter(p=>!p.down);if(!alive.length){n.st='idle';return}
    let t=null,bs=1e9;for(const p of alive){let load=0;for(const o of npcs.values())if(o!==n&&o.tid===p.id&&!o.dead)load++;
      const s=Math.hypot(p.x-n.x,p.z-n.z)+load*7-(n.tid===p.id?6:0);if(s<bs){bs=s;t=p}}
    n.tid=t.id;n.cd-=dt;n.t+=dt;n.dec-=dt;
    let dx=t.x-n.x,dz=t.z-n.z;const d=Math.hypot(dx,dz)||1,ux=dx/d,uz=dz/d,seen=los(n.x,n.z,t.x,t.z);
    if(seen&&!n.seen)n.react=T.react*Math.max(.35,1-wave*.06);n.seen=seen;if(n.react>0)n.react-=dt;
    let mx=0,mz=0,sp=T.sp;n.st='run';
    if(n.type===1){ // BRUTE: flanking weaving charge
      const a=n.flank*Math.min(.9,d/22),c=Math.cos(a),s=Math.sin(a),w=Math.sin(n.t*4+n.ph)*.45;
      mx=ux*c-uz*s-uz*w;mz=ux*s+uz*c+ux*w;if(d<2.2){sp=0;n.st='idle';if(n.cd<=0){n.cd=T.cd;if(t.id===myId)hurt(T.dmg,n.x,n.z);else send({k:'hurt',to:t.id,d:T.dmg,x:n.x,z:n.z})}}
    }else{
      const want=n.type===2?34:n.type===3?16:15,hurtMode=n.hp<n.max*.35&&n.type!==3;
      if(n.dec<=0){n.dec=rnd(.5,.9);
        if(hurtMode){n.mode='cover';n.cp=pickCover(n,t)}
        else if(n.mode==='cover'&&n.cp&&n.pt>0){/* stay */}
        else if(n.type===2||(n.type!==3&&Math.random()<.3&&seen)){n.cp=pickCover(n,t);n.mode=n.cp?'cover':'fight';n.pt=rnd(2,4)}
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
        const a=n.flank*.8,c=Math.cos(a),s=Math.sin(a);mx=ux*c-uz*s;mz=ux*s+uz*c}
      const peeking=n.mode!=='cover'||n.peekOut;
      if(peeking&&seen&&d<T.range&&n.react<=0){
        if(n.type===2){n.aim+=dt;n.st='aim';sp=0;if(n.aim>=.9&&n.cd<=0){n.aim=0;n.cd=T.cd;enemyShoot(n,t,d,T)}}
        else if(n.cd<=0){n.cd=T.cd*rnd(.85,1.2);enemyShoot(n,t,d,T)}
      }else if(n.type===2)n.aim=0;
    }
    // separation from other NPCs
    for(const o of npcs.values()){if(o===n||o.dead)continue;const ox=n.x-o.x,oz=n.z-o.z,od=Math.hypot(ox,oz);if(od<2.6&&od>.01){mx+=ox/od*.8;mz+=oz/od*.8}}
    const ml=Math.hypot(mx,mz)||1;n.x+=mx/ml*sp*dt;n.z+=mz/ml*sp*dt;
    for(const c of solids){const ox=n.x-c.x,oz=n.z-c.z;if(Math.abs(ox)>c.r+1||Math.abs(oz)>c.r+1)continue;const od=Math.hypot(ox,oz),m=c.r+.45;if(od<m&&od>.001){n.x=c.x+ox/od*m;n.z=c.z+oz/od*m}}
    const lr=Math.hypot(n.x-C.x,n.z-C.z);if(lr>70){n.x=C.x+(n.x-C.x)/lr*70;n.z=C.z+(n.z-C.z)/lr*70}
    n.r=Math.atan2(ux,uz);if(sp===0&&n.st==='run')n.st='idle';
  }
  function hostTick(dt){
    const pl=players();
    for(const n of npcs.values())if(!n.dead)think(n,dt,pl);
    spawnT-=dt;const live=[...npcs.values()].filter(n=>!n.dead).length;
    if(queue.length&&spawnT<=0&&live<8){spawnT=1.1;const [x,z]=spawnPoint();addNpc(queue.shift(),x,z)}
    if(!queue.length&&live===0){if(nextWave===0)nextWave=clock+4500;else if(clock>nextWave){nextWave=0;best=Math.max(best,wave);try{localStorage.setItem('w4ow',best)}catch(e){}startWave()}}
    if(!pl.every(p=>p.down))wiped=false;
    else if(!wiped){wiped=true; // everyone down: reset the current wave
      for(const n of npcs.values())n.dead=1;queue=[];wave=Math.max(0,wave-1);nextWave=clock+6000;banner('Wiped out! Retrying…','OUTLAW TOWN');send({k:'wv',n:-1})}
    snapT-=dt;if(snapT<=0){snapT=.1;
      send({k:'n',w:wave,kl:kills,a:[...npcs.values()].map(n=>[n.id,n.type,+n.x.toFixed(2),+n.z.toFixed(2),+n.r.toFixed(2),Math.round(n.hp),Math.round(n.max),n.st,n.dead])})}
  }

  // ---------- CLIENT: snapshot ----------
  function applySnap(p){
    wave=p.w;kills=p.kl;const seen=new Set();
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
    for(let i=fx.length-1;i>=0;i--){const e=fx[i];if(e.sign){e.sign.lookAt(camera.position);continue}e.t-=dt;if(e.l.material&&e.l.material.opacity!==undefined&&e.l.isLine)e.l.material.opacity=Math.max(0,e.t/.09);if(e.t<=0){scene.remove(e.l);e.l.geometry.dispose();fx.splice(i,1)}}
  }

  // ---------- UI ----------
  function updateHud(){
    if(!hudEl)return;hudEl.style.display=(wi>=0||active)?'block':'none';
    hpEl.style.width=hp+'%';hpEl.style.background=hp>50?'#5be37d':hp>25?'#ffcc4d':'#ff5050';
    $('owtxt').textContent=(wi>=0?WEAPONS[wi].n:'Unarmed')+(active?'  ·  Wave '+wave+'  ·  ☠ '+kills+'  ·  best '+best:'');
    xh.style.display=wi>=0?'block':'none';fireBtn.style.display=wi>=0?'block':'none';
  }
  function ui(){
    if(hudEl)return;
    const st=document.createElement('style');st.textContent='#owhud{position:fixed;z-index:6;left:12px;top:calc(env(safe-area-inset-top,0px) + 88px);color:#fff;font-size:13px;text-shadow:0 1px 4px #000;pointer-events:none;display:none}#owhud .bar{width:150px;height:10px;background:#0008;border-radius:6px;overflow:hidden;margin-bottom:4px}#owhp{height:100%}'
      +'#owxh{position:fixed;z-index:6;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;pointer-events:none;display:none}#owxh:before,#owxh:after{content:"";position:absolute;background:#fff;box-shadow:0 0 3px #000}#owxh:before{left:10px;top:0;width:2px;height:22px}#owxh:after{top:10px;left:0;height:2px;width:22px}'
      +'.owb{position:fixed;z-index:5;border-radius:50%;border:0;color:#fff;font-size:26px}#owfire{right:18px;bottom:calc(env(safe-area-inset-bottom,0px) + 232px);width:78px;height:78px;background:#e0443ecc;display:none;touch-action:none}#owgun{right:200px;bottom:calc(env(safe-area-inset-bottom,0px) + 144px);width:56px;height:56px;background:#ffffffcc}';
    document.head.appendChild(st);
    hudEl=document.createElement('div');hudEl.id='owhud';hudEl.innerHTML='<div class="bar"><div id="owhp" style="width:100%"></div></div><div id="owtxt"></div>';document.body.appendChild(hudEl);hpEl=$('owhp');
    xh=document.createElement('div');xh.id='owxh';document.body.appendChild(xh);
    fireBtn=document.createElement('button');fireBtn.id='owfire';fireBtn.className='owb';fireBtn.textContent='🔥';document.body.appendChild(fireBtn);
    gunBtn=document.createElement('button');gunBtn.id='owgun';gunBtn.className='owb';gunBtn.textContent='🔫';document.body.appendChild(gunBtn);
    fireBtn.addEventListener('pointerdown',e=>{firing=true;e.preventDefault()});['pointerup','pointercancel','pointerleave'].forEach(ev=>fireBtn.addEventListener(ev,()=>firing=false));
    gunBtn.addEventListener('pointerdown',e=>{equip(wi>=5?-1:wi+1);e.preventDefault()});
    addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;
      if(e.code.startsWith('Digit')){const k=+e.code.slice(5);if(k===0){if(wi>=0)equip(wi)}else if(k<=WEAPONS.length)equip(k-1)}
      if(e.code==='KeyF'&&wi>=0){firing=true}});
    addEventListener('keyup',e=>{if(e.code==='KeyF')firing=false});
    updateHud();
  }

  // ---------- messages ----------
  function onMsg(p){
    if(!p)return;
    switch(p.k){
      case 'start':active=true;host=p.host;wave=0;kills=0;queue=[];nextWave=0;for(const n of npcs.values())removeVisual(n);npcs.clear();hp=100;down=false;
        banner(isHost()?'You are hosting. Get ready!':'Get ready!','SHOWDOWN');if(isHost())nextWave=clock+3000;updateHud();break;
      case 'end':active=false;for(const n of npcs.values())removeVisual(n);npcs.clear();updateHud();break;
      case 'n':if(!isHost())applySnap(p);break;
      case 'h':if(isHost())damageNpc(p.id,p.d);break;
      case 'hurt':if(p.to===myId)hurt(p.d,p.x,p.z);break;
      case 'dn':pdown=!!p.v;break;
      case 'wv':if(p.n>0)banner('Wave '+p.n+(p.n%3===0?' · BOSS!':''),'OUTLAW TOWN');else if(!isHost())banner('Wiped out! Retrying…','OUTLAW TOWN');break;
      case 'wg':pw=p.i;break;
      case 'f':{const q=partner();const e=p.e||[0,0,0];tracer(p.m[0],p.m[1],p.m[2],e[0],e[1],e[2],p.ai?'#ff9a7a':'#ffe9a0');if(!p.ai)bang(p.w===5?500:p.w===4?400:1800,.09);break}
    }
  }

  function tick(dt,t){
    if(!C||!me)return;ui();clock+=dt*1000;
    prev.vx=(S.x-prev.x)/Math.max(dt,.001);prev.vz=(S.z-prev.z)/Math.max(dt,.001);prev.x=S.x;prev.z=S.z;
    const p=partner();if(p){const g=p[1].group.position;pprev.vx=(g.x-pprev.x)/Math.max(dt,.001);pprev.vz=(g.z-pprev.z)/Math.max(dt,.001);pprev.x=g.x;pprev.z=g.z;if(p[1].group.userData.gunI!==pw)setGun(p[1].group,pw)}
    cdT-=dt;hitT=Math.max(0,hitT-dt);if(xh)xh.style.filter=hitT>0?'hue-rotate(160deg) saturate(8)':'none';
    if(firing)fire();
    lockMarker();
    if(down){downT-=dt;if(downT<=0)respawn()}
    if(active){if(isHost())hostTick(dt)}
    visuals(dt);
  }

  Interaction.register('ow-start','Start Showdown',()=>C&&!active&&Math.hypot(S.x-C.x,S.z-(C.z+1))<5,()=>{send({k:'start',host:myId});onMsg({k:'start',host:myId})});
  Interaction.register('ow-end','End Showdown',()=>C&&active&&Math.hypot(S.x-C.x,S.z-(C.z+1))<5,()=>{send({k:'end'});onMsg({k:'end'})});
  return {build,tick,onMsg,equip,fire,lockTarget};
})();
