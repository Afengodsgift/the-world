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
  // ---------- co-op (see WardenNet.js): host runs the foes, each player is authoritative for themselves, the partner is a puppet fighter 'Q' in the local sim ----------
  const NET=WardenNet.S;let Q=null,spectate=false,netSendT=0,helloAt=0,netStarts=[];
  const netOn=()=>NET.mode!=='solo'&&!!Q;
  function netAddQ(){if(!C||Q&&C.F.Q===Q)return;Q=C.add('Q',{x:S.x+1,z:S.z,face:S.rot,hp:100,team:'p'})}
  function netDropQ(){if(C&&C.F.Q){delete C.F.Q;C.order=C.order.filter(i=>i!=='Q')}Q=null}
  function netHost(){helloAt=0;NET.mode='host';NET.site=site.id;NET.t0=Date.now();NET.left=false}
  function netJoin(){NET.mode='guest';NET.site=site.id;NET.left=false;netAddQ();WardenNet.send({k:'j',s:site.id});NET.gotSnap=performance.now()}
  function netLeave(){if(NET.mode!=='solo')WardenNet.send({k:'l',s:NET.site});WardenNet.reset();netDropQ();spectate=false}
  function netMsg(p){
    if(!on||!site)return;
    if(p.k==='j'&&NET.mode==='host'&&p.s===site.id){netAddQ();msg('Your partner joins the fight',1.6)}
    else if(p.k==='l'&&p.s===NET.site){if(NET.mode==='host'){netDropQ();NET.joined=false;msg('Your partner left the fight',1.6)}else if(NET.mode==='guest'){netDropQ();netHost();msg('The host left: you lead the fight',1.8)}}
    else if(p.k==='h'&&NET.mode==='host'&&p.s===site.id&&(p.t0<NET.t0||p.t0===NET.t0&&p.from<(typeof myId!=='undefined'?myId:''))){netJoin()}}   // two hosts at once: the earlier fight wins, the other becomes its guest
  const aiTarget=q=>{if(!Q||Q.act==='dead')return P;if(P.act==='dead')return Q;const dp=Math.hypot(P.x-q.x,P.z-q.z),dq=Math.hypot(Q.x-q.x,Q.z-q.z),cur=q._tg==='Q'?Q:P;const o=cur===P?Q:P,dc=cur===P?dp:dq,dO=cur===P?dq:dp;const pick=dO<dc-2?o:cur;q._tg=pick.id;return pick};
  function netApply(){   // consume the newest partner message (once)
    if(NET.mode==='host'&&NET.rep&&Q){const r=NET.rep;NET.rep=null;WardenNet.apply(Q,r.p,Moves,1)}
    else if(NET.mode==='guest'&&NET.snap){const sn=NET.snap;NET.snap=null;NET.gotSnap=performance.now();
      for(const st of sn.st||[]){const F=byId[st.id];if(F&&F.f.act!=='dead')C.start(st.id,st.m,st.h)}
      for(const o of sn.f||[]){const F=byId[o.id];if(!F)continue;const f=F.f;
        if(o.act==='dead'){if(f.act!=='dead'){f.hp=0;f.act='dead';f.ph=null;f.mv=null;events([{t:'dead',a:'P',d:o.id}])}continue}
        const keep=F.lh&&performance.now()-F.lh<500&&o.hp>f.hp?f.hp:o.hp;WardenNet.apply(f,o,Moves,.5);f.hp=keep;F.nin={mx:o.mx||0,mz:o.mz||0};
        if(o.aw&&!F.awake)rouse(F,F.dorm!=='wake');F.ai.ph2=!!o.p2}
      if(Q&&sn.p)WardenNet.apply(Q,sn.p,Moves,1)}}
  function netSend(dt){
    if(NET.mode==='solo'||!on)return;const nw=performance.now();
    if(NET.mode==='host'&&nw-helloAt>=1000){helloAt=nw;WardenNet.send({k:'h',s:site.id,t0:NET.t0})}
    if(nw-netSendT<66)return;netSendT=nw;
    if(NET.mode==='host'&&Q){const f=foes.map(F=>Object.assign(WardenNet.pack(F.f),{id:F.id,mx:F.nin?F.nin.mx:0,mz:F.nin?F.nin.mz:0,aw:F.awake?1:0,p2:F.ai.ph2?1:0}));WardenNet.send({k:'s',f,p:WardenNet.pack(P),st:netStarts});netStarts=[]}
    else if(NET.mode==='guest')WardenNet.send({k:'g',p:WardenNet.pack(P)});
    if(NET.mode==='guest'&&performance.now()-NET.gotSnap>3500){netDropQ();netHost();msg('Lost the host: you lead the fight',1.8)}}
  // the partner's avatar (the world's normal remote avatar) plays a roll / block / swing while the puppet does
  let qAct='';
  function netVis(){if(!Q||!NET.partner||typeof others==='undefined')return;const o=others.get(NET.partner);if(!o)return;const k=Q.act==='attack'?'atk':Q.act;if(k===qAct)return;qAct=k;
    const e=k==='dodge'?'roll':k==='atk'?(Q.mv&&Q.mv.id==='heavy'?'cross':'jab'):Q.guard?'block':null;if(e&&typeof loadEmotes==='function')loadEmotes().then(()=>{o.group.userData.emoteReq=e}).catch(()=>{})}
  // ---------- Flow: the meter fills from dodges / deflects / hits / posture breaks. Not full: the Flow button is a stamina skill (Cinder Arc; with the stick held it is the Ginga Step: a sidestep with i-frames into an evasive slash).
  // Full: it starts Flow (the meter drains for ~9 s) and the button becomes a finisher (Armada, then Meia Lua), each paid for out of the meter.
  let flow=0,flowOn=false,flowN=0,fq=null,skillCD=0;
  const FLOW_COST=32,FIN=['armada','meia'];
  function flowAdd(n){if(!on)return;const was=flow;flow=Math.min(100,flow+n);if(flow>=100&&was<100&&!flowOn){msg('FLOW READY',1.2);tone(660,990,.18,'sine',.1)}}
  function flowPress(t){
    if(flowOn){fq={m:FIN[flowN%2],t:now()};return}
    if(flow>=100){flowOn=true;flowN=0;msg('FLOW',1.2);sfx('heavy',.5,1.5,()=>tone(300,800,.3,'sine',.12));return}
    if(skillCD>0||P.st<24){reject();return}
    const d=stickDir();
    if(d){skillCD=3;const c={t:'dodge',e:C.tick,dx:d[0],dz:d[1]};ST.input('P',c,t);ST.input('P',{t:'light',e:C.tick,adv:false},t+330);msg('GINGA',.7)}      // Ginga Step: dodge in the stick direction, then the evasive slash
    else{skillCD=3;fq={m:'cinder',t:now()}}}
  function flowEv(e,T){
    if(e.t==='hit'&&e.a==='P')flowAdd(e.dmg>=20?9:5);
    else if(e.t==='dodged'&&e.d==='P'){flowAdd(22);msg('ESQUIVA',.6)}
    else if(e.t==='deflect'&&!T)flowAdd(28);
    else if(e.t==='posturebreak'&&T)flowAdd(30);
    else if(e.t==='start'&&e.a==='P'&&e.move==='cinder'){WardenVfx.slash(P.x,H(P.x,P.z)+1.2,P.z,P.face,true,3);setTimeout(()=>{if(on)WardenVfx.slash(P.x,H(P.x,P.z)+1.2,P.z,P.face,true,3)},180)}
    else if(e.t==='start'&&e.a==='P'&&FIN.indexOf(e.move)>=0){setTimeout(()=>{if(on)WardenVfx.burst(P.x,H(P.x,P.z)+1.1,P.z,3)},330);flow=Math.max(0,flow-FLOW_COST);flowN++;if(flow<=0)flowOff()}}
  function flowOff(){if(flowOn){flowOn=false;msg('FLOW ENDS',.8)}}
  function flowTick(dt){
    if(skillCD>0)skillCD-=dt;
    if(flowOn){flow-=dt*11;if(flow<=0){flow=0;flowOff()}}
    if(fq){if(now()-fq.t>320)fq=null;else if(P.act==='free'&&(fq.m==='cinder'?P.st>=22:flow>=8)){ST.input('P',{t:'atk',m:fq.m},now());assist();fq=null}}
    const f=Math.round(flow/100*60),full=flow>=100&&!flowOn;if(bars.fl!==f||bars.fon!==flowOn||bars.ffull!==full||bars.fn!==flowN){bars.fl=f;bars.fon=flowOn;bars.ffull=full;bars.fn=flowN;
      const b=el.querySelector('#wFlow');b.style.setProperty('--fl',(flow/100*360)+'deg');b.classList.toggle('full',full);b.classList.toggle('on',flowOn);b.textContent=flowOn?(flowN%2?'Meia':'Armada'):'Flow';
      setBar('.p .fl',flow/100);const fb=el.querySelector('.p .fl');fb.classList.toggle('full',full);fb.classList.toggle('on',flowOn)}}
  function press(name,tms){
    if(!on||P.act==='dead'||CineCam.busy()&&CineCam.isActive())return false;const t=tms===undefined?now():tms;
    switch(name){
      case'light':{assist();reject();const c={t:'light',e:C.tick},d=stickDir(),fa=pendFace!==null?pendFace:S.rot;if(d&&d[0]*Math.sin(fa)+d[1]*Math.cos(fa)>.6)c.adv=true;ST.input('P',c,t);break}
      case'heavy':if(down.heavy)return true;assist();reject();down.heavy=true;ST.input('P',{t:'heavyDown',e:C.tick},t);break;
      case'guard':if(down.guard)return true;down.guard=true;ST.input('P',{t:'guardDown',e:C.tick},t);break;
      case'dodge':{const d=stickDir();const c={t:'dodge',e:C.tick};if(d){c.dx=d[0];c.dz=d[1]}ST.input('P',c,t);break}
      case'flow':flowPress(t);break;
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
  const KEY={KeyE:'flow',KeyF:'light',KeyG:'heavy',KeyQ:'guard',Space:'dodge',Tab:'lock'};
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
  function build(){WardenNet.setHandler(netMsg);
    el=document.createElement('div');el.id='wroot';
    el.innerHTML='<div id="wh"><div class="wb p"><i class="hp"><b></b></i><i class="st"><b></b></i><i class="fl"><b></b></i></div><div class="wb d"><span>The Duelist</span><i class="hp"><b></b></i><i class="po"><b></b></i></div></div><div id="wmsg"></div><div id="whd" style="position:fixed;left:50%;top:46%;width:0;height:0;pointer-events:none;z-index:50;opacity:0;transition:opacity .5s"><div style="position:absolute;left:-26px;top:-150px;width:0;height:0;border-left:26px solid transparent;border-right:26px solid transparent;border-bottom:54px solid #ff2a1a;filter:drop-shadow(0 0 8px #ff6a2a)"></div></div><div id="whn" style="position:fixed;left:0;right:0;top:34%;text-align:center;pointer-events:none;z-index:50;color:#ffb27a;font:700 15px sans-serif;letter-spacing:.14em;text-shadow:0 0 6px #000,0 0 3px #000;opacity:0;transition:opacity .5s"></div>'+
      '<div id="wc"><button id="wLight">Light</button><button id="wHeavy">Heavy</button><button id="wGuard">Guard</button><button id="wDodge">Dodge</button><button id="wFlow">Flow</button><button id="wLock">Lock</button></div>'+
      '<div id="whint">F light · G heavy (hold) · Q guard · Space dodge · E flow (skill / finisher) · Tab lock</div>';
    document.body.appendChild(el);
    bind(el.querySelector('#wLight'),'light');bind(el.querySelector('#wHeavy'),'heavy');bind(el.querySelector('#wGuard'),'guard');bind(el.querySelector('#wDodge'),'dodge');bind(el.querySelector('#wFlow'),'flow');bind(el.querySelector('#wLock'),'lock');
    addEventListener('keydown',onKey,true);addEventListener('keyup',onKey,true);
    addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',releaseAll);addEventListener('orientationchange',releaseAll)}
  const bars={};
  function setBar(sel,v){const k=Math.round(Math.max(0,Math.min(1,v))*100);if(bars[sel]===k)return;bars[sel]=k;el.querySelector(sel+' b').style.transform='scaleX('+k/100+')'}
  let nameKey='';
  function hud(){setBar('.p .hp',P.hp/P.hpMax);setBar('.p .st',P.st/P.stMax);
    const F=target(),n=alive().length,nk=F?F.T.name+(n>1?' ×'+n:''):'';if(nk!==nameKey){nameKey=nk;el.querySelector('.wb.d span').textContent=nk}
    if(F){setBar('.d .hp',F.f.hp/F.f.hpMax);setBar('.d .po',F.f.po/F.f.poMax);const brk=F.f.act==='stun'&&F.f.sk==='stagger';if(bars.brk!==brk){bars.brk=brk;el.querySelector('.wb.d').classList.toggle('brk',brk)}}
    const c=P.act==='charge'?Math.min(1,P.c/Moves.heavy.chargeMax)*360:0,r=Math.round(c/6);if(bars.chg!==r){bars.chg=r;el.querySelector('#wHeavy').style.setProperty('--chg',r*6+'deg')}}
  let hdT=0;
  const MV={light:'slash',heavy:'heavy blow',thrust:'thrust',bash:'shield bash',quake:'ground slam',orb:'fire orb',bolt:'lightning bolt',leap:'leaping strike',fall:'falling blow',dash:'charge',riposte:'riposte',twin:'twin slash',sweep:'sweep',slam:'slam',triple:'triple strike',spin:'storm spin',hammer:'axe kick',lowsweep:'low sweep'};
  function hitFrom(A,mv){   // which enemy / move hurt you and from where (screen arrow)
    const d=el.querySelector('#whd'),n=el.querySelector('#whn');if(!A||!d)return;
    const dx=A.f.x-S.x,dz=A.f.z-S.z,y=S.yaw,fw=-Math.sin(y)*dx-Math.cos(y)*dz,rt=Math.cos(y)*dx-Math.sin(y)*dz;
    d.style.transition='none';d.style.transform='rotate('+(Math.atan2(rt,fw)*57.3)+'deg)';d.style.opacity=1;void d.offsetWidth;d.style.transition='opacity .7s';d.style.opacity=0;
    n.textContent=(A.T.name+' · '+(A.T.ai==='archer'&&(mv==='bolt'||mv==='orb')?(mv==='orb'?'heavy arrow':'arrow'):(MV[mv]||mv||''))).toUpperCase();n.style.transition='none';n.style.opacity=1;void n.offsetWidth;n.style.transition='opacity 1.2s .5s';n.style.opacity=0}
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
    fetch('assets/warden/'+(b.file||T.file)+'.glb').then(r=>r.arrayBuffer()).then(buf=>new Promise((res,rej)=>new THREE.GLTFLoader().parse(buf,'assets/warden/',res,rej))).then(gl=>{
      const m=new THREE.Group();m.scale.setScalar(.01);m.add(gl.scene);b.g.add(m);const bones={},seen=new Set();
      gl.scene.traverse(o=>{if(o.isBone)bones[o.name.replace('mixamorig','')]=o;if(o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=true;for(const mt of [].concat(o.material))if(!seen.has(mt)){seen.add(mt);if(T.bright)mt.color.multiplyScalar(T.bright)}}});
      b.u.mixer=new THREE.AnimationMixer(gl.scene);b.u.bones=bones;b.u.model=gl.scene;b.ready=true}).catch(e=>{b.err=String(e&&e.message||e)})}
  function body(T,v){
    const key=T.id+(T.files?':'+(v%T.files.length):''),L=pool[key]||(pool[key]=[]),f=L.find(b=>!b.used);if(f){f.used=true;f.g.visible=true;return f}
    const b={T,used:true,anims:{},sword:null,shield:null,styled:false,ready:false,flashOn:false,file:T.files?T.files[v%T.files.length]:T.file};
    if(T.body==='avatar'){const g=makeAvatar(T.name,'#3a2a2a');for(const c of g.children.slice())if(c.isSprite)g.remove(c);scene.add(g);dress(g,T.dress||0);b.g=g;b.u=g.userData;b.ready=true}
    else{const g=new THREE.Group();g.name=T.name;scene.add(g);b.g=g;b.u=g.userData;b.u.mixer=null;b.u.bones={};glbLoad(b,T)}
    L.push(b);return b}
  function freeBody(b){b.used=false;b.g.visible=false;if(b.anims)for(const k in b.anims)b.anims[k].off();for(const k of['sword','shield'])if(b[k]){const o=b[k].grip||b[k];if(o)o.visible=false}}
  // ---------- fight lifecycle ----------
  function spawnFoes(){
    for(const F of foes)freeBody(F.body);foes=[];byId={};
    const ids=Foes.ids(site.foes.length);
    site.foes.forEach((def,i)=>{
      const T=Foes.TYPES[def.t],id=ids[i],f=C.F[id]=CombatCore.mkFighter(id,{x:WRD.x+site.x+def.dx,z:WRD.z+site.z+def.dz,face:Math.PI,hp:T.hp,team:'e',dm:T.dm||1,rm:T.rm||1});
      if(!C.order.includes(id))C.order.push(id);f.r=T.r;f.spd=T.spd||1.3;
      const b=body(T,i);b.g.scale.setScalar(T.scale);b.g.position.set(f.x,H(f.x,f.z),f.z);b.g.rotation.y=f.face;
      if(b.u.mixer&&typeof emoStop==='function'&&T.body==='avatar')emoStop(b.u);
      const F={i,id,T,f,body:b,ai:DuelistAI.create(fightN*7919+i*131+1,{foe:T.ai,intro:T.pack?25:75}),loco:{x:0,z:0,vf:0,vs:0,sp:0,init:false},flash:0,awake:!T.aggro,dorm:T.aggro?'sleep':null,dormSync:null,wakeT:0,ph2:false,home:{x:f.x,z:f.z}};
      foes.push(F);byId[id]=F});
    rt(site).foes=foes}
  function startFight(){
    fightN++;hurt=false;fightVo=false;try{WardenSfx.load()}catch(e){}const R=site.wall?site.R-.5:site.R+10,sol=WardenSolids().filter(s=>Math.hypot(s.x-WRD.x-site.x,s.z-WRD.z-site.z)<site.R+14);
    C=CombatCore.create({arena:{x:WRD.x+site.x,z:WRD.z+site.z,R},solids:sol});ST=CombatCore.stepper(C,6);t0=performance.now();
    P=C.add('P',{x:S.x,z:S.z,face:S.rot,hp:100,team:'p'});spawnFoes();WardenFx.clear();WardenVfx.clear();Q=null;spectate=false;netStarts=[];if(NET.mode==='guest'||NET.mode==='host'&&NET.joined)netAddQ();
    flow=0;flowOn=false;flowN=0;fq=null;skillCD=0;bars.fl=-1;state='fight';stateT=0;lock=site.fog||foes.some(F=>F.T.boss);lockI=0;lastEv=[];pv.init=false;down.guard=down.heavy=false;stW=0;gT=0;
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
    try{if(typeof loadEmotes==='function')loadEmotes().catch(()=>{})}catch(e){}   // the 'playdead' fall clip lives in the emote library: without it corpses (and you) just stand there
    if(on)return;if(!el)build();if(typeof loadEmotes==='function')loadEmotes().catch(()=>{});WardenFx.build();WardenVfx.build();WardenMX.fetch('player').catch(()=>{});
    site=s;fightN=0;const hh=WardenNet.hostFor(s.id);NET.joined=false;startFight();if(hh)netJoin();else netHost();for(const F of foes)WardenMX.fetch(F.T.role).catch(()=>{});
    lx=S.x;lz=S.z;on=true;document.body.classList.add('warden-fight');ensureAvatars();if(sword&&sword.grip)sword.grip.visible=true;
    for(const F of foes)for(const k of['sword','shield'])if(F.body[k]){const o=F.body[k].grip||F.body[k];if(o)o.visible=true}
    arenaRes(true);msg(s.n,2.2);try{if(s.fog)WardenIsles.fog(s.id,'sealed')}catch(e){}}
  function leave(hold){   // hold: keep the corpses of a cleared site in the world
    if(!on)return;netLeave();releaseAll();on=false;lock=false;document.body.classList.remove('warden-fight');if(sword&&sword.grip)sword.grip.visible=false;pendFace=null;
    if(pAnim)pAnim.off();for(const F of foes)if(F.anim)F.anim.off();arenaRes(false);try{CameraRig.setBias(0)}catch(e){}WardenFx.clear();WardenVfx.clear();
    if(!hold){for(const F of foes)freeBody(F.body);foes=[];if(site)rt(site).foes=[]}
    try{if(site&&site.fog)WardenIsles.fog(site.id,rt(site).cleared?'gone':'idle')}catch(e){}}
  // ---------- per frame ----------
  function speedMul(sprint){
    if(!on||!P)return 1;const base=sprint?12:6;if(P.act==='dead')return 0;
    if(state==='fight'&&!foes.some(F=>F.awake&&F.f.act!=='dead'))return 1;      // nobody is after you: explore at normal speed
    if(P.act==='free')return(P.guard?GSPD:SPD)/base;if(P.act==='charge')return CSPD/base;return 0}
  const sfx=(n,v,r,fb)=>{if(!WardenSfx.play(n,v,r)&&fb)fb()};let hurt=false,fightVo=false;
  function vfxAt(e,f){const y=H(f.x,f.z)+1.3;if(e.t==='hit')WardenVfx.hit(f.x,y,f.z,e.crit,e.dmg>=20);else if(e.t==='block')WardenVfx.clash(f.x,y,f.z);else if(e.t==='deflect')WardenVfx.clash(f.x,y,f.z,true);else WardenVfx.burst(f.x,y,f.z,e.t==='posturebreak'?0:3)}
  function events(evs){
    if(PC._log)for(const e of evs)if(e.t!=='hitstop')PC._log.push(e);
    for(const e of evs){
      const A=byId[e.a],T=byId[e.d];flowEv(e,T);
      if(e.t==='fx'||e.t==='fxburst'||e.t==='fxend')WardenFx.event(e);
      {const fp=e.t==='hit'||e.t==='block'||e.t==='deflect'||e.t==='posturebreak'||e.t==='guardbreak'?(T?T.f:(e.d==='P'?P:null)):null;if(fp)vfxAt(e,fp)}
      if(e.t==='start'){if(e.a==='P'||A&&e.move&&A.f){const q=e.a==='P'?P:A.f;if(q&&(e.a==='P'||/atk|cut|slam|sweep|swipe|heavy|light/.test(e.move)))WardenVfx.slash(q.x,H(q.x,q.z)+1.2,q.z,q.face,/heavy|slam/.test(e.move),e.a==='P'?0:1)}if(e.a==='P'){if(e.move==='light'&&pAnim)pAnim.nextLight(performance.now()/1000);sfx('whoosh',.4,e.move==='heavy'?.75:1.1,()=>tone(e.move==='heavy'?220:380,e.move==='heavy'?90:150,e.move==='heavy'?.18:.1,'triangle',.1))}else{if(A&&A.anim&&A.anim.pickAlt)A.anim.pickAlt(e.move,Math.random());sfx('whoosh',.35,.8,()=>tone(160,70,.16,'sawtooth',.07))}}
      else if(e.t==='dodge'&&e.a==='P')tone(200,80,.14,'sine',.08);
      else if(e.t==='hit'){if(T){T.flash=1;T.lh=performance.now();wake(T,true);sfx(e.dmg>=20||e.crit?'heavy':'strike',.8,e.crit?.85:1,()=>tone(140,50,.14,'square',.14));if(e.crit)msg('CRITICAL');if(T.body.T.body==='avatar')T.body.u.hitReq=1}else{sfx(e.dmg>=20?'heavy':'strike',.9,.9,()=>tone(110,40,.18,'square',.16));if(e.d==='P'&&P.hp>0){hurt=true;msg('',0);hitFrom(A,e.move)}}}
      else if(e.t==='block')sfx('clash',.6,.9,()=>tone(420,260,.1,'square',.1));
      else if(e.t==='deflect'){sfx('clash',.85,1.4,()=>tone(1500,900,.18,'sine',.14));msg(T?'':'DEFLECTED',.5)}
      else if(e.t==='posturebreak'&&T){if(T.T.boss)msg('POSTURE BROKEN');sfx('heavy',.8,1.1,()=>tone(500,120,.3,'sawtooth',.12))}
      else if(e.t==='posturebreak'&&e.d==='P'){msg('POSTURE BROKEN',.8);sfx('heavy',.9,.8,()=>tone(300,90,.3,'sawtooth',.12))}
      else if(e.t==='guardbreak'){sfx('heavy',.9,.85,()=>tone(250,70,.3,'sawtooth',.14));if(e.d==='P')msg('GUARD BROKEN',.8)}
      else if(e.t==='dead'&&T){sfx('heavy',.7,.7,()=>tone(200,40,.5,'sawtooth',.14));if(T.body.T.body==='avatar')T.body.u.emoteReq='playdead';if(T.T.boss){CineCam.play('death',{x:T.f.x,z:T.f.z,h:1.2*T.T.scale,sc:Math.max(1,T.T.scale*.9)},{id:T.T.id});msg(T.T.name.toUpperCase()+' IS FELLED',3);setTimeout(()=>WardenSfx.play(hurt?'vo_winner':'vo_flawless_victory',.8,1,{nojit:1}),700)}
        if(lock&&lockI===T.i){const n=nearest();if(n&&n!==T)lockI=n.i;else{lock=false;el.querySelector('#wLock').classList.remove('on')}}
        if(!alive().length){state='won';stateT=performance.now();lock=false;el.querySelector('#wLock').classList.remove('on')}}
      else if(e.t==='dead'&&e.d==='P'&&NET.mode==='host'&&Q&&Q.act!=='dead'){msg('YOU DIED · your partner fights on',3);sfx('heavy',.8,.6,()=>tone(180,35,.6,'sawtooth',.16));spectate=true}
      else if(e.t==='dead'&&e.d==='P'){msg('YOU DIED',3);sfx('heavy',.8,.6,()=>tone(180,35,.6,'sawtooth',.16));setTimeout(()=>WardenSfx.play('vo_game_over',.8,1,{nojit:1}),600);state='lost';stateT=performance.now()}}}
  // dormant foes sit / stand sheathed until you come near: rouse() starts the draw / roar / power-up clip, rise() hands them to the AI once it ends; a hit skips the show
  function rouse(F,skip){if(F.awake||F.dorm==='wake'&&!skip)return;if(skip||!F.anim){rise(F);return}F.dorm='wake';F.wakeT=0;if(F.T.boss){CineCam.play('intro',{x:()=>F.f.x,z:()=>F.f.z,h:1.75*F.T.scale,sc:Math.max(1,F.T.scale*.9)},{id:F.T.id});msg(F.T.name,2.4);sfx('heavy',.6,.55,()=>tone(90,45,.6,'sawtooth',.14));WardenSfx.play('vo_prepare_yourself',.8,1,{nojit:1})}else if(!fightVo){fightVo=true;WardenSfx.play('vo_fight',.8,1,{nojit:1})}}
  function rise(F){F.dorm=null;F.awake=true;F.dormSync=null;if(F.anim&&F.anim.setMode)F.anim.setMode(null)}
  function wake(F,skip){rouse(F,skip);if(F.T.pack)for(const o of foes)if(o.T.pack&&!o.awake&&Math.hypot(o.f.x-F.f.x,o.f.z-F.f.z)<14)rouse(o,skip)}
  function locoOf(v,x,z,face,dt){   // smoothed world velocity -> speed + components along / to the left of the facing
    if(!v.init||dt<=0){v.x=x;v.z=z;v.init=true;v.vf=v.vs=v.sp=0;return}
    const k=Math.min(1,dt*10),vx=(x-v.x)/dt,vz=(z-v.z)/dt;v.x=x;v.z=z;const fx=Math.sin(face),fz=Math.cos(face),f=vx*fx+vz*fz,l=vx*fz-vz*fx;   // left = (cos, -sin)
    v.vf+=(f-v.vf)*k;v.vs+=(l-v.vs)*k;v.sp=Math.hypot(v.vf,v.vs)}
  // a cleared site keeps its corpses until you are well away, then it re-arms (fight it again whenever you like)
  function rearm(wx,wz){for(const s of SITES()){const r=RT[s.id];if(!r||!r.cleared)continue;if(Math.hypot(wx-s.x,wz-s.z)>s.R+45){r.cleared=false;for(const F of r.foes)freeBody(F.body);r.foes=[];try{if(s.fog)WardenIsles.fog(s.id,'idle')}catch(e){}}}}
  function tick(dt,t){
    const wx=S.x-WRD.x,wz=S.z-WRD.z;
    if(!on){rearm(wx,wz);
      for(const k in RT)for(const F of RT[k].foes||[])if(F.f.act==='dead'&&Math.hypot(F.f.x-S.x,F.f.z-S.z)<70)foeTick(F,dt,0);   // corpses of cleared sites keep animating until they have finished falling
      if(S.flying||S.state==='swim'||!S.grounded||!me||!me.userData.nact)return;
      const s=SITES().find(q=>!rt(q).cleared&&Math.hypot(wx-q.x,wz-q.z)<q.R-(q.wall?1.5:1));if(s)engage(s);if(!on)return}
    const d=Math.hypot(wx-site.x,wz-site.z);
    if(S.flying||S.state==='swim'){leave(false);return}
    if(site.fog){if(state!=='won'&&d>site.R-.8){const k=(site.R-.8)/d;S.x=WRD.x+site.x+(wx-site.x)*k;S.z=WRD.z+site.z+(wz-site.z)*k}}      // the fog gate holds you in until the foe is felled
    else if(d>site.R+(site.wall?1.5:4)){leave(false);return}
    ensureAvatars();
    // end-of-fight handling
    if(spectate&&(!Q||Q.act==='dead')){spectate=false;state='lost';stateT=performance.now()}
    if(state==='lost'&&performance.now()-stateT>3200){startFight();msg('Again.',1.4)}
    else if(state==='won'&&performance.now()-stateT>(PC.loop?5000:4500)){
      if(PC.loop){startFight();msg('Again.',1.4)}else{rt(site).cleared=true;felled++;msg(site.n+' · cleared ('+felled+' felled)',2.4);leave(true);return}}
    // one-time status toast so a missing animation set is visible instead of silent
    {const F0=foes[0],ka=(pAnim?pAnim.st:'none')+'/'+(F0&&F0.anim?F0.anim.st:'none');if(ka!==mxSaid&&pAnim&&F0&&F0.anim&&pAnim.st!=='none'&&F0.anim.st!=='none'){mxSaid=ka;msg(pAnim.st==='ready'&&F0.anim.st==='ready'?'Animations '+WardenMX.BUILD+' loaded':'Animation load FAILED ('+(pAnim.err||F0.anim.err||ka)+')',2.2)}}
    const TF=target();D=TF.f;
    // camera: pull back for a big foe, when he is far, and when there are several
    try{let sc=1;for(const F of foes)if(F.f.act!=='dead'&&F.awake)sc=Math.max(sc,F.T.scale);const fd=Math.hypot(S.x-D.x,S.z-D.z);CameraRig.setBias(-2.4+(sc-1)*3.4+Math.min(3.5,Math.max(0,fd-5))*.45+(alive().length>1?1:0))}catch(e){}
    for(const F of foes)if(F.ai.ph2&&!F.ph2&&state==='fight'){F.ph2=true;if(F.T.boss){msg(F.T.ph2,2);sfx('heavy',.7,.6,()=>tone(120,60,.4,'sawtooth',.12));WardenSfx.play('vo_sudden_death',.8,1,{nojit:1})}if(F.body.shield)F.body.shield.visible=false}
    // 1) hand the sim the player's current position, run the due ticks, apply the forced motion back to S
    P.x=S.x;P.z=S.z;lx=S.x;lz=S.z;netApply();
    const held=nt=>{const f=lock&&D.act!=='dead'?heading():pendT>0&&pendFace!==null?pendFace:S.rot;if(pendT>0)pendT--;
      const h={P:{face:f,mx:0,mz:0}};if(Q)h.Q={face:Q.face,mx:0,mz:0};let atk=0;for(const F of foes)if(F.f.act==='attack')atk++;
      for(const F of foes){const q=F.f;
        if(F.f.act==='dead'){h[F.id]={face:q.face,mx:0,mz:0};continue}
        if(!F.awake&&F.dorm!=='wake'&&Math.hypot(S.x-q.x,S.z-q.z)<F.T.aggro)wake(F);
        if(NET.mode==='guest'){const n=F.nin||{mx:0,mz:0};h[F.id]={face:q.face,mx:n.mx,mz:n.mz,list:[]};continue}
        if(F.awake&&PC.ai&&state==='fight'){F.ai.noAtk=!!F.T.pack&&atk>=Foes.PACK_ATK&&q.act!=='attack';const a=DuelistAI.think(F.ai,aiTarget(q),q,lastEv,nt);F.nin={mx:a.mx,mz:a.mz};h[F.id]={face:a.face,mx:a.mx,mz:a.mz,list:a.list}}
        else h[F.id]={face:F.awake||F.dorm==='wake'?Math.atan2(S.x-q.x,S.z-q.z):q.face,mx:0,mz:0}}
      return h};
    const evs=CineCam.frozen()?[]:ST.advance(now(),held,()=>{S.x+=P.x-lx;S.z+=P.z-lz;lx=P.x;lz=P.z;lastEv=C.ev});
    for(const e of evs)if(e.t==='start'&&NET.mode==='host'&&byId[e.a]){const F=byId[e.a];netStarts.push({id:e.a,m:e.move,h:F.f.hold|0})}
    events(evs);flowTick(dt);netSend(dt);netVis();
    // 2) facing: the sim owns it while attacking / dodging / stunned; lock-on owns it otherwise
    if(P.act==='attack'||P.act==='dodge'||P.act==='stun')S.rot=P.face;
    else if(lock&&D.act!=='dead'){const a=heading();S.rot=a;S.yaw+=Math.atan2(Math.sin(a+Math.PI-S.yaw),Math.cos(a+Math.PI-S.yaw))*Math.min(1,dt*7)}
    me.position.x=S.x;me.position.z=S.z;me.rotation.y=S.rot;
    // dodge visual = the existing roll clip, played once per dodge; getting hit = the game's own hit reaction
    if(P.act==='dodge'&&!P._rolled){P._rolled=true;const dd=P.dir||[Math.sin(P.face),Math.cos(P.face)];P._back=dd[0]*Math.sin(P.face)+dd[1]*Math.cos(P.face)<-.5;P._dirA=Math.atan2(dd[0],dd[1]);me.userData.emote=P._back?'flipb':'roll'}else if(P.act!=='dodge')P._rolled=false;
    if(P.act==='dodge'&&!P._back&&P._dirA!==undefined)me.rotation.y=P._dirA;      // roll / sidestep TOWARD the stick; a backward dodge flips away while still facing the foe
    if(P.act==='stun'&&!P._hit){P._hit=true;me.userData.hitReq=1}else if(P.act!=='stun')P._hit=false;
    if(P.act==='dead'&&!P._dead){P._dead=true;me.userData.emoteReq='playdead'}else if(P.act!=='dead'&&P._dead){P._dead=false;if(typeof emoStop==='function')emoStop(me.userData)}
    // 3) animation: real sword clips scrubbed by the sim (player + every foe); procedural arm pose only while the clips are still downloading
    const fr=C.hs>0?0:Math.max(0,Math.min(1,now()/16.6667-ST.skew-C.tick));
    locoOf(pv,S.x,S.z,S.rot,dt);const ploco={moving:pv.sp>.8&&P.act==='free',vf:pv.vf,vs:pv.vs};
    gT=P.guard?gT+1:0;const o=PC._pose?{a:WardenAnim.POSES[PC._pose[0]],b:WardenAnim.POSES[PC._pose[1]],u:PC._pose[2],w:1}:WardenAnim.target(P,gT);WardenAnim.mix(o.a,o.b,o.u,tg);stW+=((o.w)-stW)*Math.min(1,dt*10);
    {const k=Math.min(1,dt*40);for(const kk of['ru','rf','lu','lf'])cur[kk].lerp(tg[kk],k).normalize();cur.tw+=(tg.tw-cur.tw)*k;cur.ln+=(tg.ln-cur.ln)*k}
    const used=pAnim?pAnim.update(P,fr,ploco,dt,true):false;if(!used&&!PC._skip)WardenAnim.apply(me.userData,cur,stW);
    for(const F of foes)foeTick(F,dt,fr);
    WardenFx.update(dt);WardenVfx.update(dt);
    hud();if(msgT>0){msgT-=dt;if(msgT<=0)el.querySelector('#wmsg').classList.remove('on')}}
  function foeTick(F,dt,fr){
    const b=F.body,f=F.f,g=b.g;g.position.set(f.x,H(f.x,f.z),f.z);
    if(f.act==='attack'||f.act==='stun'||f.act==='dead'){g.rotation.y=f.face}else g.rotation.y=lerpAngle(g.rotation.y,f.face,1-Math.exp(-12*dt));
    if(F.dorm){if(F.anim&&F.dormSync!==F.dorm){F.anim.setMode(F.dorm);F.dormSync=F.dorm}
      if(F.dorm==='wake'){F.wakeT+=dt;if((F.anim&&F.anim.wakeDone)||F.wakeT>4)rise(F)}}
    if(b.sword){const sv=!(F.dorm==='sleep'||(F.dorm==='wake'&&F.anim&&F.anim.wakeP<.4)),o=b.sword.grip||b.sword;if(o.visible!==sv&&state!=='won')o.visible=sv}
    locoOf(F.loco,f.x,f.z,g.rotation.y,dt);const moving=F.loco.sp>.6&&f.act==='free',loco={moving,vf:F.loco.vf,vs:F.loco.vs};
    if(b.T.body==='avatar'){if(f.act==='dead'){b.u.pp=null;b.u.v=0;if(!b.u.hold&&!b.u.emoteReq)b.u.emoteReq='playdead'}   // a corpse keeps its fall: no motion-based emote cancel, and re-ask until the emote library has loaded
      if(typeof animate==='function')animate(g,dt,moving?'walk':'idle')}
    if(F.anim)F.anim.update(f,fr,loco,dt,true);
    if(b.T.body==='glb'&&b.u.mixer)b.u.mixer.update(dt);
    F.flash=Math.max(0,F.flash-dt*5);if((F.flash>0||b.flashOn)&&b.u.model){b.flashOn=F.flash>0;b.u.model.traverse(c=>{if(c.isSkinnedMesh&&c.material&&c.material.emissive)c.material.emissive.setRGB(F.flash*.7,F.flash*.25,F.flash*.1)})}}
  return Object.assign(PC,{setSeq:v=>{if(pAnim)pAnim.variant=v},tick,speedMul,press,release,enter:()=>{},engage:id=>{const s=SITES().find(q=>q.id===id);if(s&&!on)engage(s)},leave:()=>leave(false),on:()=>on,site:()=>site,GRIP,setGrip:()=>{setGrip(sword);for(const F of foes)setGrip(F.body.sword)},newFight:()=>{if(on)startFight()},
    _flow:v=>{if(v!==undefined)flow=v;return[flow,flowOn,flowN]},
    _t:()=>({on,C,P,D,lock,sword,foes,site,AI:foes[0]&&foes[0].ai,state,cur,stW,down,pAnim,dAnim:foes[0]&&foes[0].anim,duel:foes[0]&&foes[0].body.g,dSword:foes[0]&&foes[0].body.sword,RT})})})();
