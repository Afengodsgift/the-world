// WARDEN: the player's combat controller + every fight on the isle (flag-gated: nothing here runs unless the Warden Isles are on and you stand in a fight site).
// Wiring: CombatCore (fixed 60 Hz sim) <- stepper <- inputs (keys / touch buttons / lock-on) + one DuelistAI per foe. The sim owns only FORCED motion for the player (dodge, lunge, knockback); free walking stays with
// the game's own player controller (tickFrame) and is scaled by speedMul(). Foes are fully sim-driven (their AI walks them through the sim).
// SITES (WARDEN.sites, data/warden.js): walk into a site's ring and its foes spawn (Foes.js roster). fog:true = a boss gate (the ring seals until the foe is felled), fog:false = a camp (foes wake when you come near, run away to reset).
// Foe bodies: 'avatar' = the game's own rig + dress (Duelist, soldiers), 'glb' = a natively rigged Mixamo model (Paladin, Parasite, Arissa) with its own mixer. Both are animated by WardenMX (real clips scrubbed by the sim phase).
// Sim ids: 'P' = the player, 'D','E','F',... = the foes of the current site. Teams: player 'p', foes 'e' (no friendly fire).
// Globals used: THREE, S, me, H, WRD, WARDEN, WardenSolids, scene, WAudio, makeAvatar/dress/animate/emoStop/lerpAngle, loadEmotes (index.html), CombatCore, Moves, WardenAnim, WardenMX, DuelistAI, Foes, WardenFx.
const PlayerCombat=(()=>{
  const PC={_pose:null,ai:true,loop:false};   // _pose=[nameA,nameB,u]: test hook that pins the procedural pose layer; ai=false: foes stand still (tests / practice); loop=true: a felled site restarts after 5 s (old single-arena behaviour)
  const SPD=5,GSPD=2.5,CSPD=2;                       // m/s: free walk, guarding, charging a heavy
  let mxSaid='',on=false,C=null,ST=null,P=null,D=null,t0=0,lx=0,lz=0,lock=false,lockI=0,pendFace=null,pendT=0;
  const down={guard:false,heavy:false};              // logical button state (what the sim was told)
  const ptr={};                                       // touch: button -> pointerId
  let el=null,sword=null,swordTried=false,pAnim=null,site=null,foes=[],fightN=0,state='fight',stateT=0,lastEv=[],byId={},dFlashT=0,felled=0;
  const RT={};                                        // site id -> {foes:[], cleared:bool}
  const pv={x:0,z:0,vf:0,vs:0,sp:0,init:false};
  const cur=WardenAnim.copy(WardenAnim.POSES.ready),tg=WardenAnim.copy(WardenAnim.POSES.ready);let stW=0,gT=0,msgT=0,lastTone=0;
  const GRIP={rx:0,ry:0,rz:0,len:.95,ox:0,oy:0,oz:0};
  const rt=s=>RT[s.id]||(RT[s.id]={foes:[],cleared:false});
  const SITES=()=>WARDEN.sites;
  // ---------- audio (tiny WebAudio tones; silent if audio is unavailable) ----------
  function tone(f0,f1,dur,type,vol){try{const now=performance.now();if(now-lastTone<25)return;lastTone=now;const a=WAudio.get();if(!a)return;const o=a.createOscillator(),g=a.createGain();o.type=type||'triangle';
    o.frequency.setValueAtTime(f0,a.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),a.currentTime+dur);o.connect(g);g.connect(WAudio.out());
    g.gain.setValueAtTime(vol||.12,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+dur);o.start();o.stop(a.currentTime+dur+.02)}catch(e){}}
  // ---------- targets ----------
  const alive=()=>foes.filter(F=>F.f.act!=='dead');
  function nearest(){let b=null,bd=1e9;for(const F of foes){if(F.f.act==='dead')continue;const d=Math.hypot(F.f.x-S.x,F.f.z-S.z);if(d<bd){bd=d;b=F}}return b}
  function target(){const L=lock&&foes[lockI];if(L&&L.f.act!=='dead')return L;return nearest()||foes[0]}
  const now=()=>performance.now()-t0;
  function heading(){const dx=D.x-S.x,dz=D.z-S.z;return Math.atan2(dx,dz)}
  function stickDir(){   // world-space direction of the current stick/keys input, or null
    let ix=typeof stickV!=='undefined'?stickV.x:0,iy=typeof stickV!=='undefined'?stickV.y:0;
    if(keys.KeyA||keys.ArrowLeft)ix-=1;if(keys.KeyD||keys.ArrowRight)ix+=1;if(keys.KeyW||keys.ArrowUp)iy-=1;if(keys.KeyS||keys.ArrowDown)iy+=1;
    const l=Math.hypot(ix,iy);if(l<.2)return null;ix/=l;iy/=l;const sy=Math.sin(S.yaw),cy=Math.cos(S.yaw);return[cy*ix+sy*iy,-sy*ix+cy*iy]}
  function assist(){   // snap the facing toward the nearest foe when he is close and roughly ahead
    const F=nearest();if(!F)return;const dx=F.f.x-S.x,dz=F.f.z-S.z,d=Math.hypot(dx,dz);if(d>4.5)return;const a=Math.atan2(dx,dz);
    if(lock||Math.abs(Math.atan2(Math.sin(a-S.rot),Math.cos(a-S.rot)))<1.0){pendFace=a;pendT=8;S.rot=a}}
  function reject(){if(P.st>2||!el)return;const b=el.querySelector('.p .st');b.classList.add('bad');setTimeout(()=>b.classList.remove('bad'),260);tone(110,80,.08,'square',.05)}   // out of stamina: say so instead of silently dropping the tap
  function press(name,tms){
    if(!on||P.act==='dead')return false;const t=tms===undefined?now():tms;
    switch(name){
      case'light':{assist();reject();const c={t:'light',e:C.tick},d=stickDir(),fa=pendFace!==null?pendFace:S.rot;if(d&&d[0]*Math.sin(fa)+d[1]*Math.cos(fa)>.6)c.adv=true;ST.input('P',c,t);break}
      case'heavy':if(down.heavy)return true;assist();reject();down.heavy=true;ST.input('P',{t:'heavyDown',e:C.tick},t);break;
      case'guard':if(down.guard)return true;down.guard=true;ST.input('P',{t:'guardDown',e:C.tick},t);break;
      case'dodge':{const d=stickDir();const c={t:'dodge',e:C.tick};if(d){c.dx=d[0];c.dz=d[1]}ST.input('P',c,t);break}
      case'lock':toggleLock();break;
      default:return false}
    return true}
  function release(name,tms){
    if(!on)return;const t=tms===undefined?now():tms;
    if(name==='heavy'&&down.heavy){down.heavy=false;ST.input('P',{t:'heavyUp'},t)}
    else if(name==='guard'&&down.guard){down.guard=false;ST.input('P',{t:'guardUp'},t)}}
  function releaseAll(){release('heavy');release('guard');for(const k in ptr)delete ptr[k];if(el)for(const b of el.querySelectorAll('button.dn'))b.classList.remove('dn')}
  // lock: tap = lock the nearest foe; tap again = cycle to the next one (clockwise by distance); with only one foe left it unlocks
  function toggleLock(){
    const al=alive();if(!al.length){lock=false}
    else if(!lock){lock=true;lockI=nearest().i}
    else if(al.length>1){const cur=foes[lockI],ord=al.slice().sort((a,b)=>Math.hypot(a.f.x-S.x,a.f.z-S.z)-Math.hypot(b.f.x-S.x,b.f.z-S.z)),k=ord.indexOf(cur);lockI=ord[(k+1)%ord.length].i}
    else lock=false;
    if(el)el.querySelector('#wLock').classList.toggle('on',lock)}
  const KEY={KeyF:'light',KeyG:'heavy',KeyQ:'guard',Space:'dodge',Tab:'lock'};
  function onKey(e){
    if(!on||e.target&&e.target.tagName==='INPUT')return;const n=KEY[e.code];
    if(e.type==='keydown'){if(n){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)press(n,e.timeStamp-t0)}else if(e.code==='KeyB'){e.stopImmediatePropagation()}}
    else if(n){if(n==='heavy'||n==='guard')release(n,e.timeStamp-t0);e.stopImmediatePropagation()}}
  function bind(b,name){
    const holdy=name==='heavy'||name==='guard';
    b.addEventListener('pointerdown',e=>{if(ptr[name]!==undefined)return;e.preventDefault();e.stopPropagation();ptr[name]=e.pointerId;try{b.setPointerCapture(e.pointerId)}catch(_){}b.classList.add('dn');press(name,e.timeStamp-t0)});
    const up=e=>{if(ptr[name]!==e.pointerId)return;delete ptr[name];b.classList.remove('dn');if(holdy)release(name,e.timeStamp-t0);e.stopPropagation()};
    b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('lostpointercapture',up);
    b.addEventListener('contextmenu',e=>e.preventDefault())}
  // ---------- DOM (built once) ----------
  function build(){
    el=document.createElement('div');el.id='wroot';
    el.innerHTML='<div id="wh"><div class="wb p"><i class="hp"><b></b></i><i class="st"><b></b></i></div><div class="wb d"><span>The Duelist</span><i class="hp"><b></b></i><i class="po"><b></b></i></div></div><div id="wmsg"></div>'+
      '<div id="wc"><button id="wLight">Light</button><button id="wHeavy">Heavy</button><button id="wGuard">Guard</button><button id="wDodge">Dodge</button><button id="wLock">Lock</button></div>'+
      '<div id="whint">F light · G heavy (hold) · Q guard · Space dodge · Tab lock / next target</div>';
    document.body.appendChild(el);
    bind(el.querySelector('#wLight'),'light');bind(el.querySelector('#wHeavy'),'heavy');bind(el.querySelector('#wGuard'),'guard');bind(el.querySelector('#wDodge'),'dodge');bind(el.querySelector('#wLock'),'lock');
    addEventListener('keydown',onKey,true);addEventListener('keyup',onKey,true);
    addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',releaseAll);addEventListener('orientationchange',releaseAll)}
  const bars={};
  function setBar(sel,v){const k=Math.round(Math.max(0,Math.min(1,v))*100);if(bars[sel]===k)return;bars[sel]=k;el.querySelector(sel+' b').style.transform='scaleX('+k/100+')'}
  let nameKey='';
  function hud(){setBar('.p .hp',P.hp/P.hpMax);setBar('.p .st',P.st/P.stMax);
    const F=target(),n=alive().length,nk=F?F.T.name+(n>1?' ×'+n:''):'';if(nk!==nameKey){nameKey=nk;el.querySelector('.wb.d span').textContent=nk}
    if(F){setBar('.d .hp',F.f.hp/F.f.hpMax);setBar('.d .po',F.f.po/F.f.poMax);const brk=F.f.act==='stun'&&F.f.sk==='stagger';if(bars.brk!==brk){bars.brk=brk;el.querySelector('.wb.d').classList.toggle('brk',brk)}}
    const c=P.act==='charge'?Math.min(1,P.c/Moves.heavy.chargeMax)*360:0,r=Math.round(c/6);if(bars.chg!==r){bars.chg=r;el.querySelector('#wHeavy').style.setProperty('--chg',r*6+'deg')}}
  function msg(t,sec){const m=el.querySelector('#wmsg');m.textContent=t;m.classList.add('on');msgT=sec||1.4}
  // ---------- bodies (avatars + models) and weapons ----------
  const pool={};     // foe type id -> [body]  (reused between fights; hidden when free)
  function attachSword(av,file,len,slot,fixed){
    const u=av&&av.userData;if(!u||!u.bones||!u.bones.RightHand||!THREE.GLTFLoader)return null;const st={ready:false,grip:null,hand:u.bones.RightHand,len:slot.len,want:len,av,fixed};
    new THREE.GLTFLoader().load('assets/warden/'+file,g=>{const grip=new THREE.Group(),m=g.scene;m.traverse(o=>{if(o.isMesh){o.castShadow=false;o.frustumCulled=false}});grip.add(m);st.hand.add(grip);st.grip=grip;st.ready=true;setGrip(st);grip.visible=on},()=>{},()=>{slot.tried=false});
    return st}
  function setGrip(st,g){
    if(!st||!st.grip)return;g=g||GRIP;const hand=st.hand,ws=new THREE.Vector3();st.av.updateMatrixWorld(true);hand.getWorldScale(ws);st.grip.scale.setScalar(st.want/(st.len*ws.x));
    if(st.fixed){const f=st.fixed;st.grip.quaternion.setFromEuler(new THREE.Euler(f[0],f[1],f[2]));st.grip.position.set(f[3]||0,f[4]||0,f[5]||0).divideScalar(ws.x);return}
    const kid=hand.children.find(c=>c!==st.grip&&c.position.lengthSq()>0);const v=kid?kid.position.clone().normalize():new THREE.Vector3(0,1,0);
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v);q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(g.rx,g.ry,g.rz)));st.grip.quaternion.copy(q);
    st.grip.position.set(g.ox,g.oy,g.oz).divideScalar(ws.x)}
  function makeShield(){   // a plain kite shield (extruded outline, ~0.55 x 0.8 m) - the Knight drops it at half health
    const sh=new THREE.Shape();sh.moveTo(0,.4);sh.lineTo(.28,.32);sh.lineTo(.28,-.05);sh.quadraticCurveTo(.2,-.32,0,-.44);sh.quadraticCurveTo(-.2,-.32,-.28,-.05);sh.lineTo(-.28,.32);sh.closePath();
    const g=new THREE.Group(),m=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:.05,bevelEnabled:true,bevelSize:.015,bevelThickness:.015,bevelSegments:1}),new THREE.MeshStandardMaterial({color:'#6a6f7d',metalness:.4,roughness:.55}));
    const bs=new THREE.Mesh(new THREE.SphereGeometry(.07,10,8),new THREE.MeshStandardMaterial({color:'#b8964a',metalness:.6,roughness:.4}));bs.position.set(0,.05,.09);g.add(m);g.add(bs);return g}
  function attachShield(b){const hand=b.u.bones&&b.u.bones.LeftForeArm;if(!hand)return;const sh=makeShield(),ws=new THREE.Vector3();b.g.updateMatrixWorld(true);hand.getWorldScale(ws);
    const w=new THREE.Group();w.add(sh);w.scale.setScalar(1/ws.x);w.position.set(0,12,-9);hand.add(w);b.shield=w}
  function styleBody(b){   // once the model exists: colour it for its type; weapons
    if(b.styled||!b.u.model)return;b.styled=true;const T=b.T;
    if(T.body==='avatar'&&T.tint!==undefined&&T.tint!==1)b.u.model.traverse(c=>{if(c.isSkinnedMesh&&c.material&&c.material.color){c.material.userData.c0=c.material.color.clone();c.material.color.copy(c.material.userData.c0).multiply(new THREE.Color(T.tint,T.tint*(T.tint<1?.7:1),T.tint*(T.tint<1?.75:1)))}});
    if(T.sword&&!b.sword)b.sword=attachSword(b.g,T.sword.f,T.sword.len,{len:T.sword.l0,set tried(v){}},T.grip);
    if(T.shield&&!b.shield)attachShield(b)}
  function glbLoad(b,T){
    fetch('assets/warden/'+T.file+'.glb').then(r=>r.arrayBuffer()).then(buf=>new Promise((res,rej)=>new THREE.GLTFLoader().parse(buf,'assets/warden/',res,rej))).then(gl=>{
      const m=new THREE.Group();m.scale.setScalar(.01);m.add(gl.scene);b.g.add(m);const bones={},seen=new Set();
      gl.scene.traverse(o=>{if(o.isBone)bones[o.name.replace('mixamorig','')]=o;if(o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=true;for(const mt of [].concat(o.material))if(!seen.has(mt)){seen.add(mt);if(T.bright)mt.color.multiplyScalar(T.bright)}}});
      b.u.mixer=new THREE.AnimationMixer(gl.scene);b.u.bones=bones;b.u.model=gl.scene;b.ready=true}).catch(e=>{b.err=String(e&&e.message||e)})}
  function body(T){
    const L=pool[T.id]||(pool[T.id]=[]),f=L.find(b=>!b.used);if(f){f.used=true;f.g.visible=true;return f}
    const b={T,used:true,anims:{},sword:null,shield:null,styled:false,ready:false,flashOn:false};
    if(T.body==='avatar'){const g=makeAvatar(T.name,'#3a2a2a');for(const c of g.children.slice())if(c.isSprite)g.remove(c);scene.add(g);dress(g,T.dress||0);b.g=g;b.u=g.userData;b.ready=true}
    else{const g=new THREE.Group();g.name=T.name;scene.add(g);b.g=g;b.u={mixer:null,bones:{}};glbLoad(b,T)}
    L.push(b);return b}
  function freeBody(b){b.used=false;b.g.visible=false;if(b.anims)for(const k in b.anims)b.anims[k].off();for(const k of['sword','shield'])if(b[k]){const o=b[k].grip||b[k];if(o)o.visible=false}}
  // ---------- fight lifecycle ----------
  function spawnFoes(){
    for(const F of foes)freeBody(F.body);foes=[];byId={};
    const ids=Foes.ids(site.foes.length);
    site.foes.forEach((def,i)=>{
      const T=Foes.TYPES[def.t],id=ids[i],f=C.F[id]=CombatCore.mkFighter(id,{x:WRD.x+site.x+def.dx,z:WRD.z+site.z+def.dz,face:Math.PI,hp:T.hp,team:'e',dm:T.dm||1});
      if(!C.order.includes(id))C.order.push(id);f.r=T.r;f.spd=T.spd||1.3;
      const b=body(T);b.g.scale.setScalar(T.scale);b.g.position.set(f.x,H(f.x,f.z),f.z);b.g.rotation.y=f.face;
      if(b.u.mixer&&typeof emoStop==='function'&&T.body==='avatar')emoStop(b.u);
      const F={i,id,T,f,body:b,ai:DuelistAI.create(fightN*7919+i*131+1,{foe:T.ai,intro:T.pack?25:75}),loco:{x:0,z:0,vf:0,vs:0,sp:0,init:false},flash:0,awake:!T.aggro,ph2:false,home:{x:f.x,z:f.z}};
      foes.push(F);byId[id]=F});
    rt(site).foes=foes}
  function startFight(){
    fightN++;const R=site.wall?site.R-.5:site.R+10,sol=WardenSolids().filter(s=>Math.hypot(s.x-WRD.x-site.x,s.z-WRD.z-site.z)<site.R+14);
    C=CombatCore.create({arena:{x:WRD.x+site.x,z:WRD.z+site.z,R},solids:sol});ST=CombatCore.stepper(C,6);t0=performance.now();
    P=C.add('P',{x:S.x,z:S.z,face:S.rot,hp:100,team:'p'});spawnFoes();WardenFx.clear();
    state='fight';stateT=0;lock=site.fog||foes.some(F=>F.T.boss);lockI=0;lastEv=[];pv.init=false;down.guard=down.heavy=false;stW=0;gT=0;
    if(el)el.querySelector('#wLock').classList.toggle('on',lock);D=target().f}
  // Inside a walled arena the screen is the cost on a low-end phone: render at 1.25x (not 2x) while you fight, restore on leaving. Skipped when ?dpr= was given.
  let resPrev=null;
  function arenaRes(inn){if(typeof Perf==='undefined'||!Perf.state||!Perf.state.r||Perf.state.fixed)return;const st=Perf.state;
    if(inn&&resPrev===null){resPrev={dpr:st.dpr,min:st.min,locked:st.locked};st.min=1;if(st.dpr>1.25){st.dpr=1.25;st.r.setPixelRatio(1.25)}st.locked=true}
    else if(!inn&&resPrev){st.min=resPrev.min;st.locked=resPrev.locked;if(st.dpr!==resPrev.dpr){st.dpr=resPrev.dpr;st.r.setPixelRatio(resPrev.dpr)}resPrev=null}}
  function ensureAvatars(){
    if(!pAnim&&me.userData.mixer)pAnim=WardenMX.make(me.userData,'player');
    if(!sword&&!swordTried&&me.userData.bones){swordTried=true;sword=attachSword(me,'sword_falchion.glb',.95,{len:5.36,set tried(v){swordTried=v}})}
    for(const F of foes){const b=F.body;if(!b.u.mixer)continue;styleBody(b);if(!b.anims[F.T.role])b.anims[F.T.role]=WardenMX.make(b.u,F.T.role);F.anim=b.anims[F.T.role]}}
  function engage(s){
    if(on)return;if(!el)build();if(typeof loadEmotes==='function')loadEmotes().catch(()=>{});WardenFx.build();WardenMX.fetch('player').catch(()=>{});
    site=s;fightN=0;startFight();for(const F of foes)WardenMX.fetch(F.T.role).catch(()=>{});
    lx=S.x;lz=S.z;on=true;document.body.classList.add('warden-fight');ensureAvatars();if(sword&&sword.grip)sword.grip.visible=true;
    for(const F of foes)for(const k of['sword','shield'])if(F.body[k]){const o=F.body[k].grip||F.body[k];if(o)o.visible=true}
    arenaRes(true);msg(s.n,2.2);try{if(s.fog)WardenIsles.fog(s.id,'sealed')}catch(e){}}
  function leave(hold){   // hold: keep the corpses of a cleared site in the world
    if(!on)return;releaseAll();on=false;lock=false;document.body.classList.remove('warden-fight');if(sword&&sword.grip)sword.grip.visible=false;pendFace=null;
    if(pAnim)pAnim.off();for(const F of foes)if(F.anim)F.anim.off();arenaRes(false);try{CameraRig.setBias(0)}catch(e){}WardenFx.clear();
    if(!hold){for(const F of foes)freeBody(F.body);foes=[];if(site)rt(site).foes=[]}
    try{if(site&&site.fog)WardenIsles.fog(site.id,rt(site).cleared?'gone':'idle')}catch(e){}}
  // ---------- per frame ----------
  function speedMul(sprint){
    if(!on||!P)return 1;const base=sprint?12:6;if(P.act==='dead')return 0;
    if(state==='fight'&&!foes.some(F=>F.awake&&F.f.act!=='dead'))return 1;      // nobody is after you: explore at normal speed
    if(P.act==='free')return(P.guard?GSPD:SPD)/base;if(P.act==='charge')return CSPD/base;return 0}
  function events(evs){
    if(PC._log)for(const e of evs)if(e.t!=='hitstop')PC._log.push(e);
    for(const e of evs){
      const A=byId[e.a],T=byId[e.d];
      if(e.t==='fx'||e.t==='fxburst'||e.t==='fxend')WardenFx.event(e);
      if(e.t==='start'){if(e.a==='P'){if(e.move==='light'&&pAnim)pAnim.nextLight(performance.now()/1000);tone(e.move==='heavy'?220:380,e.move==='heavy'?90:150,e.move==='heavy'?.18:.1,'triangle',.1)}else{if(A&&A.anim&&A.anim.pickAlt)A.anim.pickAlt(e.move,Math.random());tone(160,70,.16,'sawtooth',.07)}}
      else if(e.t==='dodge'&&e.a==='P')tone(200,80,.14,'sine',.08);
      else if(e.t==='hit'){if(T){T.flash=1;T.awake=true;wake(T);tone(140,50,.14,'square',.14);if(e.crit)msg('CRITICAL');if(T.body.T.body==='avatar')T.body.u.hitReq=1}else{tone(110,40,.18,'square',.16);if(e.d==='P'&&P.hp>0)msg('',0)}}
      else if(e.t==='block')tone(420,260,.1,'square',.1);
      else if(e.t==='deflect'){tone(1500,900,.18,'sine',.14);msg(T?'':'DEFLECTED',.5)}
      else if(e.t==='posturebreak'&&T){if(T.T.boss)msg('POSTURE BROKEN');tone(500,120,.3,'sawtooth',.12)}
      else if(e.t==='posturebreak'&&e.d==='P'){msg('POSTURE BROKEN',.8);tone(300,90,.3,'sawtooth',.12)}
      else if(e.t==='guardbreak'){tone(250,70,.3,'sawtooth',.14);if(e.d==='P')msg('GUARD BROKEN',.8)}
      else if(e.t==='dead'&&T){tone(200,40,.5,'sawtooth',.14);if(T.body.T.body==='avatar')T.body.u.emoteReq='playdead';if(T.T.boss)msg(T.T.name.toUpperCase()+' IS FELLED',3);
        if(lock&&lockI===T.i){const n=nearest();if(n&&n!==T)lockI=n.i;else{lock=false;el.querySelector('#wLock').classList.remove('on')}}
        if(!alive().length){state='won';stateT=performance.now();lock=false;el.querySelector('#wLock').classList.remove('on')}}
      else if(e.t==='dead'&&e.d==='P'){msg('YOU DIED',3);tone(180,35,.6,'sawtooth',.16);state='lost';stateT=performance.now()}}}
  function wake(F){F.awake=true;if(F.T.pack)for(const o of foes)if(o.T.pack&&Math.hypot(o.f.x-F.f.x,o.f.z-F.f.z)<14)o.awake=true}
  function locoOf(v,x,z,face,dt){   // smoothed world velocity -> speed + components along / to the left of the facing
    if(!v.init||dt<=0){v.x=x;v.z=z;v.init=true;v.vf=v.vs=v.sp=0;return}
    const k=Math.min(1,dt*10),vx=(x-v.x)/dt,vz=(z-v.z)/dt;v.x=x;v.z=z;const fx=Math.sin(face),fz=Math.cos(face),f=vx*fx+vz*fz,l=vx*fz-vz*fx;   // left = (cos, -sin)
    v.vf+=(f-v.vf)*k;v.vs+=(l-v.vs)*k;v.sp=Math.hypot(v.vf,v.vs)}
  // a cleared site keeps its corpses until you are well away, then it re-arms (fight it again whenever you like)
  function rearm(wx,wz){for(const s of SITES()){const r=RT[s.id];if(!r||!r.cleared)continue;if(Math.hypot(wx-s.x,wz-s.z)>s.R+45){r.cleared=false;for(const F of r.foes)freeBody(F.body);r.foes=[];try{if(s.fog)WardenIsles.fog(s.id,'idle')}catch(e){}}}}
  function tick(dt,t){
    const wx=S.x-WRD.x,wz=S.z-WRD.z;
    if(!on){rearm(wx,wz);
      if(S.flying||S.state==='swim'||!S.grounded||!me||!me.userData.nact)return;
      const s=SITES().find(q=>!rt(q).cleared&&Math.hypot(wx-q.x,wz-q.z)<q.R-(q.wall?1.5:1));if(s)engage(s);if(!on)return}
    const d=Math.hypot(wx-site.x,wz-site.z);
    if(S.flying||S.state==='swim'){leave(false);return}
    if(site.fog){if(state!=='won'&&d>site.R-.8){const k=(site.R-.8)/d;S.x=WRD.x+site.x+(wx-site.x)*k;S.z=WRD.z+site.z+(wz-site.z)*k}}      // the fog gate holds you in until the foe is felled
    else if(d>site.R+(site.wall?1.5:4)){leave(false);return}
    ensureAvatars();
    // end-of-fight handling
    if(state==='lost'&&performance.now()-stateT>3200){startFight();msg('Again.',1.4)}
    else if(state==='won'&&performance.now()-stateT>(PC.loop?5000:4500)){
      if(PC.loop){startFight();msg('Again.',1.4)}else{rt(site).cleared=true;felled++;msg(site.n+' · cleared ('+felled+' felled)',2.4);leave(true);return}}
    // one-time status toast so a missing animation set is visible instead of silent
    {const F0=foes[0],ka=(pAnim?pAnim.st:'none')+'/'+(F0&&F0.anim?F0.anim.st:'none');if(ka!==mxSaid&&pAnim&&F0&&F0.anim&&pAnim.st!=='none'&&F0.anim.st!=='none'){mxSaid=ka;msg(pAnim.st==='ready'&&F0.anim.st==='ready'?'Animations '+WardenMX.BUILD+' loaded':'Animation load FAILED ('+(pAnim.err||F0.anim.err||ka)+')',2.2)}}
    const TF=target();D=TF.f;
    // camera: pull back for a big foe, when he is far, and when there are several
    try{let sc=1;for(const F of foes)if(F.f.act!=='dead'&&F.awake)sc=Math.max(sc,F.T.scale);const fd=Math.hypot(S.x-D.x,S.z-D.z);CameraRig.setBias((sc-1)*5+Math.min(4,Math.max(0,fd-4))*.5+(alive().length>1?1.2:0))}catch(e){}
    for(const F of foes)if(F.ai.ph2&&!F.ph2&&state==='fight'){F.ph2=true;if(F.T.boss){msg(F.T.ph2,2);tone(120,60,.4,'sawtooth',.12)}if(F.body.shield)F.body.shield.visible=false}
    // 1) hand the sim the player's current position, run the due ticks, apply the forced motion back to S
    P.x=S.x;P.z=S.z;lx=S.x;lz=S.z;
    const held=nt=>{const f=lock&&D.act!=='dead'?heading():pendT>0&&pendFace!==null?pendFace:S.rot;if(pendT>0)pendT--;
      const h={P:{face:f,mx:0,mz:0}};let atk=0;for(const F of foes)if(F.f.act==='attack')atk++;
      for(const F of foes){const q=F.f;
        if(F.f.act==='dead'){h[F.id]={face:q.face,mx:0,mz:0};continue}
        if(!F.awake&&Math.hypot(S.x-q.x,S.z-q.z)<F.T.aggro)wake(F);
        if(F.awake&&PC.ai&&state==='fight'){F.ai.noAtk=!!F.T.pack&&atk>=Foes.PACK_ATK&&q.act!=='attack';const a=DuelistAI.think(F.ai,P,q,lastEv,nt);h[F.id]={face:a.face,mx:a.mx,mz:a.mz,list:a.list}}
        else h[F.id]={face:F.awake?Math.atan2(S.x-q.x,S.z-q.z):q.face,mx:0,mz:0}}
      return h};
    const evs=ST.advance(now(),held,()=>{S.x+=P.x-lx;S.z+=P.z-lz;lx=P.x;lz=P.z;lastEv=C.ev});
    events(evs);
    // 2) facing: the sim owns it while attacking / dodging / stunned; lock-on owns it otherwise
    if(P.act==='attack'||P.act==='dodge'||P.act==='stun')S.rot=P.face;
    else if(lock&&D.act!=='dead'){const a=heading();S.rot=a;S.yaw+=Math.atan2(Math.sin(a+Math.PI-S.yaw),Math.cos(a+Math.PI-S.yaw))*Math.min(1,dt*7)}
    me.position.x=S.x;me.position.z=S.z;me.rotation.y=S.rot;
    // dodge visual = the existing roll clip, played once per dodge; getting hit = the game's own hit reaction
    if(P.act==='dodge'&&!P._rolled){P._rolled=true;me.userData.emote='roll'}else if(P.act!=='dodge')P._rolled=false;
    if(P.act==='stun'&&!P._hit){P._hit=true;me.userData.hitReq=1}else if(P.act!=='stun')P._hit=false;
    if(P.act==='dead'&&!P._dead){P._dead=true;me.userData.emoteReq='playdead'}else if(P.act!=='dead'&&P._dead){P._dead=false;if(typeof emoStop==='function')emoStop(me.userData)}
    // 3) animation: real sword clips scrubbed by the sim (player + every foe); procedural arm pose only while the clips are still downloading
    const fr=C.hs>0?0:Math.max(0,Math.min(1,now()/16.6667-ST.skew-C.tick));
    locoOf(pv,S.x,S.z,S.rot,dt);const ploco={moving:pv.sp>.8&&P.act==='free',vf:pv.vf,vs:pv.vs};
    gT=P.guard?gT+1:0;const o=PC._pose?{a:WardenAnim.POSES[PC._pose[0]],b:WardenAnim.POSES[PC._pose[1]],u:PC._pose[2],w:1}:WardenAnim.target(P,gT);WardenAnim.mix(o.a,o.b,o.u,tg);stW+=((o.w)-stW)*Math.min(1,dt*10);
    {const k=Math.min(1,dt*40);for(const kk of['ru','rf','lu','lf'])cur[kk].lerp(tg[kk],k).normalize();cur.tw+=(tg.tw-cur.tw)*k;cur.ln+=(tg.ln-cur.ln)*k}
    const used=pAnim?pAnim.update(P,fr,ploco,dt,true):false;if(!used&&!PC._skip)WardenAnim.apply(me.userData,cur,stW);
    for(const F of foes)foeTick(F,dt,fr);
    WardenFx.update(dt);
    hud();if(msgT>0){msgT-=dt;if(msgT<=0)el.querySelector('#wmsg').classList.remove('on')}}
  function foeTick(F,dt,fr){
    const b=F.body,f=F.f,g=b.g;g.position.set(f.x,H(f.x,f.z),f.z);
    if(f.act==='attack'||f.act==='stun'||f.act==='dead'){g.rotation.y=f.face}else g.rotation.y=lerpAngle(g.rotation.y,f.face,1-Math.exp(-12*dt));
    locoOf(F.loco,f.x,f.z,g.rotation.y,dt);const moving=F.loco.sp>.6&&f.act==='free',loco={moving,vf:F.loco.vf,vs:F.loco.vs};
    if(b.T.body==='avatar'){if(typeof animate==='function')animate(g,dt,moving?'walk':'idle')}
    if(F.anim)F.anim.update(f,fr,loco,dt,true);
    if(b.T.body==='glb'&&b.u.mixer)b.u.mixer.update(dt);
    F.flash=Math.max(0,F.flash-dt*5);if((F.flash>0||b.flashOn)&&b.u.model){b.flashOn=F.flash>0;b.u.model.traverse(c=>{if(c.isSkinnedMesh&&c.material&&c.material.emissive)c.material.emissive.setRGB(F.flash*.7,F.flash*.25,F.flash*.1)})}}
  return Object.assign(PC,{setSeq:v=>{if(pAnim)pAnim.variant=v},tick,speedMul,press,release,enter:()=>{},engage:id=>{const s=SITES().find(q=>q.id===id);if(s&&!on)engage(s)},leave:()=>leave(false),on:()=>on,site:()=>site,GRIP,setGrip:()=>{setGrip(sword);for(const F of foes)setGrip(F.body.sword)},newFight:()=>{if(on)startFight()},
    _t:()=>({on,C,P,D,lock,sword,foes,site,AI:foes[0]&&foes[0].ai,state,cur,stW,down,pAnim,dAnim:foes[0]&&foes[0].anim,duel:foes[0]&&foes[0].body.g,dSword:foes[0]&&foes[0].body.sword,RT})})})();
