// WARDEN M1c/M1d: the player's combat controller + the Duelist fight (flag-gated: nothing here runs unless ?warden=1 and you stand in the arena).
// Wiring: CombatCore (fixed 60 Hz sim) <- stepper <- inputs (keys / touch buttons / lock-on) + DuelistAI. The sim owns only FORCED motion for the player (dodge, lunge, knockback); free walking stays with the
// game's own player controller (tickFrame) and is scaled by speedMul(). The Duelist is fully sim-driven (his AI walks him through the sim) and drawn as a second avatar with the same skeleton.
// Both avatars are animated by WardenAnim.Clips (real full-body sword clips scrubbed by the sim phase) on top of the game's own locomotion.
// Globals used: THREE, S, me, H, WRD, WARDEN, WardenSolids, scene, WAudio, makeAvatar/dress/animate/emoStop/lerpAngle, loadEmotes (index.html), CombatCore, Moves, WardenAnim, DuelistAI.
const PlayerCombat=(()=>{
  const PC={_pose:null,ai:true};   // _pose=[nameA,nameB,u]: test hook that pins the procedural pose layer; ai=false: the Duelist stands still (tests / practice)
  const SPD=5,GSPD=2.5,CSPD=2;                       // m/s: free walk, guarding, charging a heavy
  let on=false,C=null,ST=null,P=null,D=null,t0=0,lx=0,lz=0,lock=false,pendFace=null,pendT=0;
  const down={guard:false,heavy:false};              // logical button state (what the sim was told)
  const ptr={};                                       // touch: button -> pointerId
  let el=null,duel=null,duelBuilt=false,dHome=null,dFlash=0,dFlashOn=false,sword=null,swordTried=false,dSword=null,dSwordTried=false,pAnim=null,dAnim=null,AI=null,fightN=0,state='fight',stateT=0,lastEv=[];
  const pv={x:0,z:0,vf:0,vs:0,sp:0,init:false},dv={x:0,z:0,vf:0,vs:0,sp:0,init:false};
  const cur=WardenAnim.copy(WardenAnim.POSES.ready),tg=WardenAnim.copy(WardenAnim.POSES.ready);let stW=0,gT=0,msgT=0,lastTone=0;
  const GRIP={rx:0,ry:0,rz:0,len:.95,ox:0,oy:0,oz:0};
  // ---------- audio (tiny WebAudio tones; silent if audio is unavailable) ----------
  function tone(f0,f1,dur,type,vol){try{const now=performance.now();if(now-lastTone<25)return;lastTone=now;const a=WAudio.get();if(!a)return;const o=a.createOscillator(),g=a.createGain();o.type=type||'triangle';
    o.frequency.setValueAtTime(f0,a.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),a.currentTime+dur);o.connect(g);g.connect(WAudio.out());
    g.gain.setValueAtTime(vol||.12,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+dur);o.start();o.stop(a.currentTime+dur+.02)}catch(e){}}
  // ---------- input ----------
  const now=()=>performance.now()-t0;
  function heading(){const dx=D.x-S.x,dz=D.z-S.z;return Math.atan2(dx,dz)}
  function stickDir(){   // world-space direction of the current stick/keys input, or null
    let ix=typeof stickV!=='undefined'?stickV.x:0,iy=typeof stickV!=='undefined'?stickV.y:0;
    if(keys.KeyA||keys.ArrowLeft)ix-=1;if(keys.KeyD||keys.ArrowRight)ix+=1;if(keys.KeyW||keys.ArrowUp)iy-=1;if(keys.KeyS||keys.ArrowDown)iy+=1;
    const l=Math.hypot(ix,iy);if(l<.2)return null;ix/=l;iy/=l;const sy=Math.sin(S.yaw),cy=Math.cos(S.yaw);return[cy*ix+sy*iy,-sy*ix+cy*iy]}
  function assist(){   // snap the facing toward the Duelist when he is close and roughly ahead
    if(D.act==='dead')return;const dx=D.x-S.x,dz=D.z-S.z,d=Math.hypot(dx,dz);if(d>4.5)return;const a=Math.atan2(dx,dz);
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
  function toggleLock(){if(D.act==='dead'){lock=false}else lock=!lock;if(el)el.querySelector('#wLock').classList.toggle('on',lock)}
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
      '<div id="whint">F light · G heavy (hold) · Q guard · Space dodge · Tab lock</div>';
    document.body.appendChild(el);
    bind(el.querySelector('#wLight'),'light');bind(el.querySelector('#wHeavy'),'heavy');bind(el.querySelector('#wGuard'),'guard');bind(el.querySelector('#wDodge'),'dodge');bind(el.querySelector('#wLock'),'lock');
    addEventListener('keydown',onKey,true);addEventListener('keyup',onKey,true);
    addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',releaseAll);addEventListener('orientationchange',releaseAll)}
  const bars={};
  function setBar(sel,v){const k=Math.round(Math.max(0,Math.min(1,v))*100);if(bars[sel]===k)return;bars[sel]=k;el.querySelector(sel+' b').style.transform='scaleX('+k/100+')'}
  function hud(){setBar('.p .hp',P.hp/P.hpMax);setBar('.p .st',P.st/P.stMax);setBar('.d .hp',D.hp/D.hpMax);setBar('.d .po',D.po/D.poMax);
    const brk=D.act==='stun'&&D.sk==='stagger';if(bars.brk!==brk){bars.brk=brk;el.querySelector('.wb.d').classList.toggle('brk',brk)}
    const c=P.act==='charge'?Math.min(1,P.c/Moves.heavy.chargeMax)*360:0,r=Math.round(c/6);if(bars.chg!==r){bars.chg=r;el.querySelector('#wHeavy').style.setProperty('--chg',r*6+'deg')}}
  function msg(t,sec){const m=el.querySelector('#wmsg');m.textContent=t;m.classList.add('on');msgT=sec||1.4}
  // ---------- avatars + swords ----------
  // Foes, fought in order: beat one and the next steps in (loop back after the last); die and you face the same one again.
  const FOES=[{id:'duelist',name:'The Duelist',hp:220,r:.5,scale:1,tint:1},{id:'hollow',name:'The Hollow Warden',hp:340,r:.72,scale:1.32,tint:.07}];let foeI=0;
  function applyFoe(){const f=FOES[foeI];if(duel){duel.scale.setScalar(f.scale);
      if(duel.userData.model)duel.userData.model.traverse(c=>{if(c.isSkinnedMesh&&c.material&&c.material.color){if(!c.material.userData._own){c.material=c.material.clone();c.material.userData._own=true;c.material.userData.c0=c.material.color.clone()}c.material.color.copy(c.material.userData.c0).multiply(new THREE.Color(f.tint,f.tint*(f.tint<1?.7:1),f.tint*(f.tint<1?.75:1)))}})}
    if(el){const sp=el.querySelector('.wb.d span');if(sp)sp.textContent=f.name}}
  function buildDuelist(){
    if(duelBuilt)return;duelBuilt=true;duel=makeAvatar('The Duelist','#3a2a2a');for(const c of duel.children.slice())if(c.isSprite)duel.remove(c);   // no floating nameplate: the HUD names him
    scene.add(duel);dress(duel,2)}                                   // dress() fills in the skinned model + mixer asynchronously
  function attachSword(av,file,len,slot){
    const u=av&&av.userData;if(!u||!u.bones||!u.bones.RightHand||!THREE.GLTFLoader)return null;const st={ready:false,grip:null,hand:u.bones.RightHand,len:slot.len,want:len,av};
    new THREE.GLTFLoader().load('assets/warden/'+file,g=>{const grip=new THREE.Group(),m=g.scene;m.traverse(o=>{if(o.isMesh){o.castShadow=false;o.frustumCulled=false}});grip.add(m);st.hand.add(grip);st.grip=grip;st.ready=true;setGrip(st);grip.visible=on},()=>{},()=>{slot.tried=false});
    return st}
  function setGrip(st,g){
    if(!st||!st.grip)return;g=g||GRIP;const hand=st.hand,ws=new THREE.Vector3();st.av.updateMatrixWorld(true);hand.getWorldScale(ws);st.grip.scale.setScalar(st.want/(st.len*ws.x));
    const kid=hand.children.find(c=>c!==st.grip&&c.position.lengthSq()>0);const v=kid?kid.position.clone().normalize():new THREE.Vector3(0,1,0);
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v);q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(g.rx,g.ry,g.rz)));st.grip.quaternion.copy(q);
    st.grip.position.set(g.ox,g.oy,g.oz).divideScalar(ws.x)}
  function ensureAvatars(){
    if(!pAnim&&me.userData.mixer)pAnim=WardenAnim.Clips.make(me.userData);
    if(!sword&&!swordTried&&me.userData.bones){swordTried=true;sword=attachSword(me,'sword_falchion.glb',.95,{len:5.36,set tried(v){swordTried=v}})}
    if(duel&&duel.userData.mixer){if(!dAnim)dAnim=WardenAnim.Clips.make(duel.userData);
      if(!dSword&&!dSwordTried&&duel.userData.bones){dSwordTried=true;dSword=attachSword(duel,'sword_claymore.glb',1.45,{len:6.6,set tried(v){dSwordTried=v}})}}}
  // ---------- fight lifecycle ----------
  function newFight(){
    fightN++;const A=C.arena;P=C.F.P=CombatCore.mkFighter('P',{x:S.x,z:S.z,face:S.rot,hp:100});
    dHome={x:WRD.x,z:WRD.z-9};D=C.F.D=CombatCore.mkFighter('D',{x:dHome.x,z:dHome.z,face:0,hp:FOES[foeI].hp});D.r=FOES[foeI].r;
    AI=DuelistAI.create(fightN*7919+1,{intro:75,foe:FOES[foeI].id});applyFoe();state='fight';stateT=0;lock=lock&&false;dv.init=false;pv.init=false;down.guard=down.heavy=false;
    if(duel&&duel.userData.mixer&&typeof emoStop==='function')emoStop(duel.userData);
    if(el)el.querySelector('#wLock').classList.remove('on')}
  // Inside the walled arena the screen is the cost on a low-end phone: render at 1.25x (not 2x) while you fight, restore on leaving. Skipped when ?dpr= was given.
  let resPrev=null;
  function arenaRes(inn){if(typeof Perf==='undefined'||!Perf.state||!Perf.state.r||Perf.state.fixed)return;const st=Perf.state;
    if(inn&&resPrev===null){resPrev={dpr:st.dpr,min:st.min,locked:st.locked};st.min=1;if(st.dpr>1.25){st.dpr=1.25;st.r.setPixelRatio(1.25)}st.locked=true}
    else if(!inn&&resPrev){st.min=resPrev.min;st.locked=resPrev.locked;if(st.dpr!==resPrev.dpr){st.dpr=resPrev.dpr;st.r.setPixelRatio(resPrev.dpr)}resPrev=null}}
  function enter(){
    if(on)return;if(!el)build();buildDuelist();if(typeof loadEmotes==='function')loadEmotes().catch(()=>{});WardenAnim.Clips.fetch().catch(()=>{});
    const A={x:WRD.x,z:WRD.z,R:WARDEN.arenaR-.5};C=CombatCore.create({arena:A,solids:WardenSolids()});ST=CombatCore.stepper(C,6);t0=performance.now();
    C.add('P',{x:S.x,z:S.z,face:S.rot,hp:100});C.add('D',{x:0,z:0});fightN=0;foeI=0;newFight();
    lx=S.x;lz=S.z;on=true;lock=false;document.body.classList.add('warden-fight');stW=0;gT=0;lastEv=[];ensureAvatars();if(sword&&sword.grip)sword.grip.visible=true;if(dSword&&dSword.grip)dSword.grip.visible=true;if(duel)duel.visible=true;
    arenaRes(true);msg('The Warden Isles · '+FOES[foeI].name,2.2)}
  function leave(){
    if(!on)return;releaseAll();on=false;lock=false;document.body.classList.remove('warden-fight');if(sword&&sword.grip)sword.grip.visible=false;if(dSword&&dSword.grip)dSword.grip.visible=false;if(duel)duel.visible=false;pendFace=null;
    if(pAnim)pAnim.off();if(dAnim)dAnim.off();arenaRes(false)}
  // ---------- per frame ----------
  function speedMul(sprint){
    if(!on||!P)return 1;const base=sprint?12:6;if(P.act==='dead')return 0;
    if(P.act==='free')return(P.guard?GSPD:SPD)/base;if(P.act==='charge')return CSPD/base;return 0}
  function events(evs){
    if(PC._log)for(const e of evs)if(e.t!=='hitstop')PC._log.push(e);
    for(const e of evs){
      if(e.t==='start'){if(e.a==='P'){if(e.move==='light'&&pAnim)pAnim.nextLight(performance.now()/1000);tone(e.move==='heavy'?220:380,e.move==='heavy'?90:150,e.move==='heavy'?.18:.1,'triangle',.1)}else{if(dAnim&&dAnim.pickAlt)dAnim.pickAlt(e.move,Math.random());tone(160,70,.16,'sawtooth',.07)}}
      else if(e.t==='dodge'&&e.a==='P')tone(200,80,.14,'sine',.08);
      else if(e.t==='hit'){if(e.d==='D'){dFlash=1;tone(140,50,.14,'square',.14);if(e.crit)msg('CRITICAL');if(duel)duel.userData.hitReq=1}else{tone(110,40,.18,'square',.16);if(e.d==='P'&&P.hp>0)msg('',0)}}
      else if(e.t==='block')tone(420,260,.1,'square',.1);
      else if(e.t==='deflect'){tone(1500,900,.18,'sine',.14);msg(e.d==='D'?'':'DEFLECTED',.5)}
      else if(e.t==='posturebreak'&&e.d==='D'){msg('POSTURE BROKEN');tone(500,120,.3,'sawtooth',.12)}
      else if(e.t==='posturebreak'&&e.d==='P'){msg('POSTURE BROKEN',.8);tone(300,90,.3,'sawtooth',.12)}
      else if(e.t==='guardbreak'){tone(250,70,.3,'sawtooth',.14)}
      else if(e.t==='dead'&&e.d==='D'){msg(FOES[foeI].name.toUpperCase()+' IS FELLED',3);tone(200,40,.5,'sawtooth',.14);lock=false;el.querySelector('#wLock').classList.remove('on');state='won';stateT=performance.now();foeI=(foeI+1)%FOES.length;if(duel)duel.userData.emoteReq='playdead'}
      else if(e.t==='dead'&&e.d==='P'){msg('YOU DIED',3);tone(180,35,.6,'sawtooth',.16);state='lost';stateT=performance.now()}}}
  function locoOf(v,x,z,face,dt){   // smoothed world velocity -> speed + components along / to the left of the facing
    if(!v.init||dt<=0){v.x=x;v.z=z;v.init=true;v.vf=v.vs=v.sp=0;return}
    const k=Math.min(1,dt*10),vx=(x-v.x)/dt,vz=(z-v.z)/dt;v.x=x;v.z=z;const fx=Math.sin(face),fz=Math.cos(face),f=vx*fx+vz*fz,l=vx*fz-vz*fx;   // left = (cos, -sin)
    v.vf+=(f-v.vf)*k;v.vs+=(l-v.vs)*k;v.sp=Math.hypot(v.vf,v.vs)}
  function tick(dt,t){
    const d=Math.hypot(S.x-WRD.x,S.z-WRD.z);
    if(!on){if(d<WARDEN.arenaR-1.5&&!S.flying&&S.grounded&&me&&me.userData.nact)enter();if(!on)return}
    if(d>WARDEN.arenaR+1.5||S.flying||S.state==='swim'){leave();return}
    ensureAvatars();if(duel)duel.visible=true;
    // end-of-fight handling: 3 s after a result the fight restarts (the player keeps their position)
    if(state!=='fight'&&performance.now()-stateT>(state==='won'?5000:3200)){newFight();msg(state==='fight'&&FOES[foeI].id==='hollow'?'The Hollow Warden stirs.':'Again.',1.4)}
    // 1) hand the sim the player's current position, run the due ticks, apply the forced motion back to S
    P.x=S.x;P.z=S.z;lx=S.x;lz=S.z;
    const held=nt=>{const f=lock&&D.act!=='dead'?heading():pendT>0&&pendFace!==null?pendFace:S.rot;if(pendT>0)pendT--;
      const a=PC.ai&&state==='fight'?DuelistAI.think(AI,P,D,lastEv,nt):null;
      return{P:{face:f,mx:0,mz:0},D:a?{face:a.face,mx:a.mx,mz:a.mz,list:a.list}:{face:Math.atan2(S.x-D.x,S.z-D.z),mx:0,mz:0}}};
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
    // 3) animation: real sword clips scrubbed by the sim (player), the same for the Duelist; procedural arm pose only while the clips are still downloading
    const fr=C.hs>0?0:Math.max(0,Math.min(1,now()/16.6667-ST.skew-C.tick));
    locoOf(pv,S.x,S.z,S.rot,dt);const ploco={moving:pv.sp>.8&&P.act==='free',vf:pv.vf,vs:pv.vs};
    gT=P.guard?gT+1:0;const o=PC._pose?{a:WardenAnim.POSES[PC._pose[0]],b:WardenAnim.POSES[PC._pose[1]],u:PC._pose[2],w:1}:WardenAnim.target(P,gT);WardenAnim.mix(o.a,o.b,o.u,tg);stW+=((o.w)-stW)*Math.min(1,dt*10);
    {const k=Math.min(1,dt*40);for(const kk of['ru','rf','lu','lf'])cur[kk].lerp(tg[kk],k).normalize();cur.tw+=(tg.tw-cur.tw)*k;cur.ln+=(tg.ln-cur.ln)*k}
    const used=pAnim?pAnim.update(P,fr,ploco,dt,true):false;if(!used&&!PC._skip)WardenAnim.apply(me.userData,cur,stW);
    duelistTick(dt,fr);
    hud();if(msgT>0){msgT-=dt;if(msgT<=0)el.querySelector('#wmsg').classList.remove('on')}}
  function duelistTick(dt,fr){
    if(!duel)return;const g=H(D.x,D.z);duel.position.set(D.x,g,D.z);
    if(D.act==='attack'||D.act==='stun'||D.act==='dead'){duel.rotation.y=D.face}else duel.rotation.y=lerpAngle(duel.rotation.y,D.face,1-Math.exp(-12*dt));
    locoOf(dv,D.x,D.z,duel.rotation.y,dt);const dloco={moving:dv.sp>.6&&D.act==='free',vf:dv.vf,vs:dv.vs};
    if(typeof animate==='function')animate(duel,dt,dv.sp>.6&&D.act==='free'?'walk':'idle');   // the game's own locomotion + emote/hit overlays for him
    if(dAnim)dAnim.update(D,fr,dloco,dt,true);
    dFlash=Math.max(0,dFlash-dt*5);if((dFlash>0||dFlashOn)&&duel.userData.model){dFlashOn=dFlash>0;duel.userData.model.traverse(c=>{if(c.isSkinnedMesh&&c.material&&c.material.emissive)c.material.emissive.setRGB(dFlash*.7,dFlash*.25,dFlash*.1)})}}
  return Object.assign(PC,{foe:i=>{foeI=i%FOES.length;if(on)newFight()},setSeq:v=>{if(pAnim)pAnim.variant=v},tick,speedMul,press,release,enter,leave,on:()=>on,GRIP,setGrip:()=>{setGrip(sword);setGrip(dSword)},newFight,_t:()=>({on,C,P,D,lock,sword,dSword,duel,AI,state,cur,stW,down,pAnim,dAnim})})})();
