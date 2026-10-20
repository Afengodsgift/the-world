// Ship: your co-op ship moored at the Harbor (DOCK in data/islands.js, tuning + hull classes in data/ship.js, physics in ship/Sailing.js, body + deck in ship/Vessel.js + ship/Decks.js).
//
//  - HOST/GUEST: whoever first takes the helm becomes the HOST and simulates the ship (Sailing.step); the other player mirrors 12 Hz
//    snapshots. Either player can steer: a guest at the wheel just streams its stick (rudder/trim) to the host.
//  - DECK: the Vessel registers a baked walkable height grid (Decks): the main deck, the raised stern deck with the wheel, stairs, rails, cabin walls. The player controller (index.html tickFrame) calls
//    Decks.step once per frame, which is what carries you with the ship and lets you stand, climb the stairs and hop over the rail. This module only pins the helmsman to the wheel.
//  - Boarding: walk onto the deck from the pier, climb the rail from the water's edge / another ship, or use the "Board the ship" interaction (works from the water).
// Globals used at runtime: THREE, S, scene, H, Net, Systems, Interaction, Fx, DOCK, SHIP, Sailing, Decks, Vessel, myId, others, banner, roomCode.
const Ship=(()=>{
  const C=SHIP,D=DOCK,K=C.cls[C.player];
  const st={boostCd:0,host:null,role:null,crew:{helm:null,gun:null},t:0,sendT:0,hudKey:'',aboard:false,cam:'third',prevCam:'third',gun:null};
  const ship=Sailing.newShip(D.ship.x,D.ship.z,D.ship.h);ship.boost=0;                 // authoritative on the host, mirrored on the guest
  let ctrPrev=null,camH=null,snap=null,snapAt=0,built=false,v=null,hud=null,remote={rud:0,trim:0},raw={x:0,y:0},sendIn=0,wakeT=0;
  const pose={x:ship.x,z:ship.z,h:ship.h,y:C.sea-K.draft,pitch:0,roll:0};   // what is drawn (the vessel's pose; kept here for the tests / HUD)
  const now=()=>(typeof performance!=='undefined'?performance.now():Date.now())/1000;
  const isHost=()=>st.host===myId;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const seed=()=>{try{return typeof hashSeed==='function'&&typeof roomCode==='string'?(hashSeed(roomCode+':wind')%6283)/1000:0}catch(e){return 0}};
  const storm=()=>{try{return typeof Env!=='undefined'&&Env.state&&Env.state.wx?Env.state.wx.storm||0:0}catch(e){return 0}};
  const windNow=()=>Sailing.wind(Date.now()/1000,seed(),storm());
  const send=p=>Net.emit('shp',p);
  const _m={},_o={};let holdFire=false,sailM=null,sailHid=false,sailA=1,sailApplied=1,hudLk=false,hudHc=false,btnX=null,btnC=null,btnB=null,ret=null;
  // the camera yaw rides the ship's turns (ctr = the centre direction this frame) and is held within +-lim of it (lim >= 3: free look all the way round)
  function follow(ctr,lim){if(ctrPrev!==null)S.yaw+=wrapA(ctr-ctrPrev);ctrPrev=ctr;if(lim<3){const o=wrapA(S.yaw-ctr);S.yaw+=clamp(o,-lim,lim)-o}}

  // ---------- where things are ----------
  const onDeck=()=>!!(S._dk&&S._dk.id==='ship'&&!S.flying);
  const distShip=()=>Math.hypot(S.x-pose.x,S.z-pose.z);
  const helmLocal=()=>({x:C.stations.helm[0],z:C.stations.helm[1]});
  const helmPos=()=>{const h=helmLocal();return Decks.toWorld(v.deck,h.x,Decks.floor(v.deck,h.x,h.z),h.z,{})};

  // ---------- seats ----------
  function claim(role){
    if(st.role)return;
    if(st.host==null||st.host===myId){st.host=myId;st.crew[role]=myId;st.role=role;broadcast()}
    else if(st.crew[role]==null||st.crew[role]===myId){st.role=role;st.crew[role]=myId;st.claimAt=now();send({k:'claim',role,on:1})}
    else{banner('Someone is already there','⛵ SHIP');return}
    if(role==='helm'){st.gun=null;setCam('third')}
    banner(role==='helm'?'At the helm: stick left/right steers, up/down sets the sails':'At the cannon','⛵ SHIP');
  }
  // camera modes: 'third' (the boom around the whole ship), 'captain' (an eye anchor above the wheel), 'cannon' (an anchor behind the gun you man; st.gun)
  function setCam(m){st.cam=m;ctrPrev=null;if(m==='third'){S.yaw=wrapA(pose.h+Math.PI);S.pitch=.42}else if(m==='captain'){S.yaw=wrapA(pose.h+Math.PI);S.pitch=.04}}
  function toggleCam(){if(st.role!=='helm')return st.cam;setCam(st.cam==='captain'?'third':'captain');return st.cam}
  function aimGun(g){if(!g||st.gun||st.role||!st.aboard||ship.sunk>0)return false;st.gun=g;st.prevCam=st.cam;st.cam='cannon';ctrPrev=null;const o=Vessel.outward(v,g,{});S.yaw=wrapA(Math.atan2(o.x,o.z)+Math.PI);S.pitch=.02;banner('Drag to aim · Fire! · Jump to leave the cannon','💣 CANNON');return true}
  function leave(){if(st.gun){st.gun=null;st.cam=st.prevCam||'third';ctrPrev=null;if(st.cam==='third'&&st.role!=='helm'){}else if(st.cam==='captain'){S.pitch=.04}return true}release();return false}
  // hands on the wheel: both arms reach for the grips (called from animate() for your own avatar while you are at the helm)
  const _g={},_sh=new THREE.Vector3(),_dr=new THREE.Vector3();
  function poseHelm(g,q){
    const B=q.bones;if(!B||!B.LeftArm||!B.RightArm||!B.LeftForeArm||!B.RightForeArm||!B.LeftHand||!B.RightHand)return;const W=C.stations.wheel;
    for(const s of [1,-1]){const n=s===1?'Left':'Right',w=Decks.toWorld(v.deck,s*W.dx,W.y,W.z,_g);B[n+'Arm'].updateWorldMatrix(true,false);B[n+'Arm'].getWorldPosition(_sh);
      _dr.set(w.x-_sh.x,w.y-_sh.y,w.z-_sh.z).normalize();aim(B[n+'Arm'],B[n+'ForeArm'],_dr);aim(B[n+'ForeArm'],B[n+'Hand'],_dr)}}
  function aimDir(out){camera.getWorldDirection(out);return out}
  function release(){
    if(!st.role)return;st.cam='third';ctrPrev=null;const r=st.role;st.role=null;
    if(isHost()){st.crew[r]=null;broadcast()}else{st.crew[r]=null;send({k:'claim',role:r,on:0})}
  }
  // put the player on the main deck at the spot nearest to where they are (not teleported to the middle: from the water you come aboard at the rail you swam to)
  function board(){
    const d=v.deck,l=Decks.toLocal(d,S.x,S.y,S.z,{}),M=K.deckM;let best=null,bd=1e9;
    for(let z=-v.hl;z<=v.hl;z+=.6)for(let x=-v.hb;x<=v.hb;x+=.6){const f=Decks.floor(d,x,z);if(Math.abs(f-M)>.1||Decks.wallAt(d,x,z,M,.3))continue;const dd=Math.hypot(x-l.x,z-l.z);if(dd<bd){bd=dd;best=[x,z]}}
    if(!best)best=[0,0];Decks.pin(S,d,best[0],best[1]);S.vy=0;S.grounded=true;S.kx=S.kz=0;banner('Welcome aboard! Climb the stairs at the back (stern) to the wheel.','⛵ SHIP')}

  // ---------- damage: cannon balls from the fleet (Fleet.js); only the ship's host applies it, everybody sees it in the snapshots ----------
  function damage(n){
    if(!isHost()||ship.sunk>0||!built)return;ship.hull=Math.max(0,ship.hull-n);
    if(ship.hull<=0){ship.sunk=.001;ship.sail=0;broadcast();banner('Your ship is going down! Swim for it!','⛵ SHIP')}}
  function repair(n){if(!isHost()||ship.sunk>0||!built)return;ship.hull=Math.min(C.hull,ship.hull+n)}
  // the wreck is gone: a fresh hull at the harbour; everybody who was near it washes up on the pier
  function reset(host){
    const wasNear=distShip()<60||onDeck();
    if(host){ship.x=D.ship.x;ship.z=D.ship.z;ship.h=D.ship.h;ship.v=0;ship.sail=.6;ship.hull=C.hull;ship.roll=0}
    ship.sunk=0;if(wasNear){S.x=D.x;S.z=D.z0+3;S.y=D.top;S.vy=0;S._dk=null;S.kx=S.kz=0;banner('You washed up at the harbour. A new ship is waiting.','⛵ SHIP')}}
  // ---------- boost: a few seconds flat out, whatever the wind does (the galleon is heavy), then a cooldown ----------
  function boost(){
    if(!isHost()){send({k:'boost'});return}
    if(ship.sunk>0||ship.boost>0)return;if(st.boostCd>0){banner('Boost recharging…','🚀 BOOST');return}
    ship.boost=C.sailing.boostT;st.boostCd=C.sailing.boostCd;banner('BOOST! Hold on!','🚀 BOOST');broadcast()}
  // ---------- network ----------
  const packet=()=>({k:'s',x:+ship.x.toFixed(2),z:+ship.z.toFixed(2),h:+ship.h.toFixed(3),v:+ship.v.toFixed(2),sl:+ship.sail.toFixed(2),ru:+ship.rud.toFixed(2),hu:Math.round(ship.hull),sk:+ship.sunk.toFixed(3),bo:+(ship.boost||0).toFixed(1),ro:+ship.roll.toFixed(3),c:[st.crew.helm,st.crew.gun]});
  const broadcast=()=>send(packet());
  function onNet(d,from){
    if(!d)return;
    switch(d.k){
      case 's':{if(isHost())break;st.host=from;snap={x:d.x,z:d.z,h:d.h,v:d.v,sail:d.sl,rud:d.ru,hull:d.hu,sunk:d.sk||0,boost:d.bo||0,roll:d.ro};snapAt=now();
        st.crew.helm=d.c[0];st.crew.gun=d.c[1];
        if(st.role&&st.crew[st.role]!==myId&&now()-(st.claimAt||0)>1.5){st.role=null;banner('You were relieved of your station','⛵ SHIP')}   // host disagreed with our claim
        break}
      case 'claim':{if(!isHost())break;const r=d.role;
        if(d.on){if(st.crew[r]==null||st.crew[r]===from){st.crew[r]=from}}else if(st.crew[r]===from)st.crew[r]=null;broadcast();break}
      case 'boost':{if(isHost()&&st.crew.helm===from)boost();break}
      case 'inp':{if(isHost()&&st.crew.helm===from){remote.rud=clamp(d.r,-1,1);remote.trim=clamp(d.t,-1,1)}break}
    }
  }

  // ---------- visuals ----------
  function label(txt){
    try{const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.fillStyle='#0d3550';g.fillRect(0,0,256,64);g.fillStyle='#fff';g.font='bold 38px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(txt,128,34);
      return new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide})}catch(e){return new THREE.MeshBasicMaterial({color:'#0d3550'})}}

  function build(){
    if(built)return;built=true;
    v=Vessel.create('ship',C.player,{x:ship.x,z:ship.z,h:ship.h});
    ship.p=Object.assign(ship.p,{probe:Sailing.probes(v.hl*.97,v.hb*.97),vmax:K.v||ship.p.vmax,turn:K.turn||ship.p.turn});                // hull probe points from the real hull size
    // pier: a ramp of deck circles from the beach up to deck height, tiles from the kit
    const ramp=[.3,.45,.6,.75];let i=0;
    for(let z=D.z0+1.25;z<D.z1;z+=2.5,i++){const h=i<ramp.length?ramp[i]:D.top;solids.push({x:D.x,z,r:1.25,h,pier:1});Vessel.track(Vessel.put('assets/ships/structure-platform.glb',D.x,h-.9,z,1,0))}
    // harbor dressing
    const put=(n,x,y,z,s,r,b)=>Vessel.track(Vessel.put((b||'assets/ships/')+n+'.glb',x,y,z,s,r));
    put('barrel',D.x-1.4,D.top,D.z0+4,.55,.4);put('barrel',D.x-1.6,D.top,D.z0+5.6,.5,1.2);put('crate',D.x+1.4,D.top,D.z0+4.5,.5,.2);put('chest',D.x+1.3,D.top,D.z0+7,.45,-.3);
    const sg=new THREE.Mesh(new THREE.PlaneGeometry(4,1),label('⚓ HARBOR'));sg.position.set(D.x,D.top+3.2,D.z0+1);scene.add(sg);
    // hud + fallback styling (theme.css / index.html layout override the id rules)
    const css=document.createElement('style');css.textContent='#shhud{position:fixed;z-index:6;left:8px;transform:none;top:calc(env(safe-area-inset-top,0px) + 62px);padding:3px 9px;border-radius:10px;background:#0008;color:#fff;font:600 11px sans-serif;text-align:left;display:none;pointer-events:none;white-space:nowrap;opacity:.88}@media (orientation:landscape) and (pointer:coarse){#shhud{top:calc(var(--st,0px) + 58px)}}';
    (document.head||document.body).appendChild(css);
    hud=document.createElement('div');hud.id='shhud';document.body.appendChild(hud);
    try{const c2=document.createElement('style');c2.textContent='.shbtn{position:fixed;z-index:7;right:calc(env(safe-area-inset-right,0px) + 96px);display:none;align-items:center;justify-content:center;min-width:48px;height:48px;padding:0 14px;border-radius:24px;background:#0d2a40cc;color:#fff;border:2px solid #fff8;font:700 14px sans-serif;touch-action:none;user-select:none;-webkit-user-select:none}#shcam{top:calc(var(--st,0px) + 120px)}#shexit{top:calc(var(--st,0px) + 176px)}#shbroad{top:calc(var(--st,0px) + 232px)}#shret{position:fixed;z-index:6;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border:2px solid #ffffffcc;border-radius:50%;box-shadow:0 0 0 1px #0008;display:none;pointer-events:none}#shret:after{content:"";position:absolute;left:11px;top:11px;width:4px;height:4px;border-radius:50%;background:#ff5a4a}';(document.head||document.body).appendChild(c2);
      btnC=document.createElement('div');btnC.id='shcam';btnC.className='shbtn';btnC.textContent='📷';document.body.appendChild(btnC);btnC.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();toggleCam()});
      btnX=document.createElement('div');btnX.id='shexit';btnX.className='shbtn';btnX.textContent='✖ Leave helm';document.body.appendChild(btnX);btnX.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();leave()});
      const ub=document.getElementById('use');if(ub){ub.addEventListener('pointerdown',()=>{holdFire=!!st.gun});addEventListener('pointerup',()=>{holdFire=false});addEventListener('pointercancel',()=>{holdFire=false})}   // hold Fire! for rapid fire
      btnB=document.createElement('div');btnB.id='shbroad';btnB.className='shbtn';btnB.textContent='💥 All guns';document.body.appendChild(btnB);btnB.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(st.gun)Fleet.sideSalvo(st.gun.side)});
      ret=document.createElement('div');ret.id='shret';document.body.appendChild(ret);
      if(typeof HudMode!=='undefined')HudMode.extra.push(()=>!!(st.role||st.gun))}catch(e){}
    Net.on('shp',onNet);Systems.add('ship',step);
  }

  // ---------- per-frame ----------
  function step(dt,t){
    if(!built)return;st.t+=dt;
    // a hit on the hull (everybody sees it in the synced hull value): the ship lurches, the camera shudders, splinters fly
    if(st.hullPrev===undefined)st.hullPrev=ship.hull;
    if(ship.hull<st.hullPrev-.5){const d=st.hullPrev-ship.hull,k=Math.min(1,d/30);try{Vessel.kick(v,(Math.random()<.5?-1:1)*.12*(.5+k),.05+.06*k,-.25*k);if(st.aboard||st.role)CameraRig.shake(.35+.7*k);Fx.burst(pose.x,C.sea+3.5,pose.z,'#8b5a2b',6+Math.round(10*k))}catch(e){}}
    st.hullPrev=ship.hull;
    const wnd=windNow();
    // simulate (host) or mirror (guest)
    if(st.host&&st.host!==myId&&!others.has(st.host)){st.host=null;st.crew.helm=st.crew.gun=null;st.role=null}                 // the host left: nobody drives
    if(isHost()){
      const mine=st.crew.helm===myId,inp=mine?{rud:raw.x,trim:-raw.y}:st.crew.helm?remote:{rud:0,trim:ship.sail>0?-.3:0};     // unmanned: the sails slowly furl
      if(ship.sunk>0){ship.v*=.98;ship.sunk+=dt/6;if(ship.sunk>=1){reset(true);broadcast()}}
      if(ship.boost>0){ship.boost=Math.max(0,ship.boost-dt);ship.sail=1}
      st.boostCd=Math.max(0,st.boostCd-dt);
      const bw=ship.boost>0?{dir:ship.h+1.5708,s:C.sailing.boostMul}:{dir:wnd.dir,s:Math.max(wnd.s,C.sailing.minWind)};   // a boost drives her flat out whichever way the wind blows; there is always a breath of wind
      const bump=Sailing.step(ship,inp,dt,{wind:bw,H});if(bump>4)banner('Hull scraped the shallows','⛵ SHIP');
      sendIn-=dt;st.sendT-=dt;if(st.sendT<=0){st.sendT=Math.max(st.sendT+1/C.net.ship,-.1);broadcast()}
    }else{
      if(st.role==='helm'){sendIn-=dt;if(sendIn<=0){sendIn=.1;send({k:'inp',r:+raw.x.toFixed(2),t:+(-raw.y).toFixed(2)})}}   // stream the stick to the host
      if(snap){const age=Math.min(.3,now()-snapAt);
        const tx=snap.x+Math.sin(snap.h)*snap.v*age,tz=snap.z+Math.cos(snap.h)*snap.v*age,k=1-Math.exp(-12*dt);
        ship.x+=(tx-ship.x)*k;ship.z+=(tz-ship.z)*k;ship.h=Sailing.wrap(ship.h+Sailing.wrap(snap.h-ship.h)*k);ship.v=snap.v;ship.sail=snap.sail;ship.rud=snap.rud;ship.hull=snap.hull;ship.roll=snap.roll;if(ship.sunk>0&&snap.sunk===0)reset(false);ship.sunk=snap.sunk;ship.boost=snap.boost}
    }
    // the body: pose, model, walkable deck, bobbing (Vessel); the controller's Decks.step does the carrying
    const rel=Sailing.wrap(wnd.dir-ship.h);
    v.hp=ship.hull;v.sunk=ship.sunk;Decks.disable(v.deck,ship.sunk>.3);if(ship.sunk>.3&&st.role)release();
    Vessel.update(v,dt,{x:ship.x,z:ship.z,h:ship.h,roll:ship.roll,v:ship.v,rel,sail:ship.sail});
    Object.assign(pose,v.pose);
    // the helmsman stays at the wheel
    if(st.role==='helm'){const h=helmLocal();Decks.pin(S,v.deck,h.x,h.z);S.rot=pose.h}
    st.aboard=onDeck();
    wakeT-=dt;if(ship.v>2&&wakeT<=0){wakeT=ship.boost>0?.06:.18;const w=Sailing.toWorld(pose,0,-v.hl);try{Fx.burst(w.x,C.sea+.1,w.z,ship.boost>0?'#ffd27a':'#e6f8ff',ship.boost>0?5:2)}catch(e){}}
    // hud: only near the ship or when seated
    const near=st.role||distShip()<80;
    let txt='';
    if(near){const kn=Math.abs(ship.v)*1.944;
      txt='⛵ '+kn.toFixed(0)+' kn · ❤ '+Math.round(ship.hull)+' · <span style="display:inline-block;transform:rotate('+(rel*57.3).toFixed(0)+'deg)">▲</span>'+(st.role==='helm'?(ship.boost>0?' · 🚀 '+ship.boost.toFixed(0)+'s':st.boostCd>0?' · 🚀 '+Math.ceil(st.boostCd)+'s':' · 🚀 ready'):'')}
    if(txt!==st.hudKey){st.hudKey=txt;hud.innerHTML=txt;hud.style.display=txt?'block':'none'}
    // the ship's own camera (one rig: CameraRig.setShip): third = a boom around the whole ship, captain = an eye anchor above the wheel, cannon = an anchor behind the gun you man
    try{const seated=st.role==='helm',gun=st.gun,ab=seated||!!gun||st.aboard;let cfg=null;
      if(gun&&(ship.sunk>.3||!st.aboard)){leave()}
      const GN=st.gun;
      if(GN){const m=Vessel.muzzle(v,GN,_m),o=Vessel.outward(v,GN,_o);follow(wrapA(Math.atan2(o.x,o.z)+Math.PI),C.cannon.aimYaw);
        cfg={x:pose.x,y:pose.y+K.deckM+3,z:pose.z,d:16,pk:1,eye:{x:m.x-o.x*3.2,y:m.y+2.7,z:m.z-o.z*3.2},pr:[-C.cannon.aimUp,C.cannon.aimDown]}}
      else if(seated&&st.cam==='captain'){const h=helmLocal(),e=Decks.toWorld(v.deck,0,Decks.floor(v.deck,h.x,h.z)+C.stations.eyeUp,h.z+C.stations.eyeFwd,_m);follow(wrapA(pose.h+Math.PI),9);
        cfg={x:pose.x,y:pose.y+K.deckM+3,z:pose.z,d:10,pk:1,eye:{x:e.x,y:e.y,z:e.z},pr:[-.5,.55]}}
      else{if(seated)follow(wrapA(pose.h+Math.PI),9);else ctrPrev=null;
        // third person, Black Flag style: a long boom well behind and ABOVE the ship (the sails fade out locally so they never block the view)
        cfg=(!seated&&typeof Bowsprit!=='undefined'&&Bowsprit.onSprit())?{x:S.x,y:S.y+1.5,z:S.z,d:7.5,pk:1,lift:1.2}   // on the bowsprit: a close orbit around YOU (photo spot)
          :ab?{x:pose.x,y:pose.y+K.deckM+4.5,z:pose.z,d:seated?20+v.hl*1.2:16+v.hl*.8,pk:seated?1:.3,lift:seated?7:5}
          :(S._dk&&!S.flying&&!st.aboard&&typeof Decks!=='undefined'?{x:S.x,y:S.y+1.8,z:S.z,d:11,pk:1,lift:3,block:1}:null)}   // fighting on another ship: close boom, a bit higher, cabins and castles never sit between you and the camera
      CameraRig.setShip(cfg);
      // captain's view: only on YOUR screen the sails (two merged meshes) are hidden so the horizon is clear; everybody else still sees them
      if(v.loaded&&!sailM){sailM=[];v.grp.traverse(c=>{if(c.isMesh&&c.material&&/^Sail/.test(c.material.name||''))sailM.push(c)})}
      {const tg=(cfg&&!cfg.eye&&ab)?.22:1;sailA+=(tg-sailA)*Math.min(1,dt*4);                         // third-person: the sails turn see-through (only on your screen)
        if(sailM&&Math.abs(sailA-sailApplied)>.01){sailApplied=sailA;for(const m of sailM){const mt=m.material;if(!mt)continue;mt.transparent=sailA<.99;mt.opacity=sailA;mt.depthWrite=sailA>.99;mt.needsUpdate=true}}}
      const hs=!!(cfg&&cfg.eye&&!GN&&typeof CameraRig.eyeK==='function'&&CameraRig.eyeK()>.55);if(sailM&&hs!==sailHid){sailHid=hs;for(const m of sailM)m.visible=!hs}}catch(e){}
    try{me.userData.steer=st.role==='helm'?poseHelm:null}catch(e){}
    if(holdFire&&st.gun&&typeof Fleet!=='undefined')Fleet.playerFire(st.gun,true,true);
    const lk=!!(st.role||st.gun);if(lk!==hudLk){hudLk=lk;if(btnX)btnX.style.display=lk?'flex':'none'}
    const hc=st.role==='helm';if(btnC&&hc!==hudHc){hudHc=hc;btnC.style.display=hc?'flex':'none'}
    if(btnX){const t=st.gun?'✖ Leave cannon':'✖ Leave helm';if(btnX._t!==t){btnX._t=t;btnX.textContent=t}}
    if(btnB){const bs=!!st.gun;if(bs!==btnB._v){btnB._v=bs;btnB.style.display=bs?'flex':'none'}}
    if(ret){const sw=!!st.gun;if(sw!==ret._v){ret._v=sw;ret.style.display=sw?'block':'none'}}
  }

  // ---------- interactions ----------
  const nearHelm=()=>{if(!onDeck())return false;const w=helmPos();return Math.hypot(S.x-w.x,S.z-w.z)<3.2&&Math.abs(S.y-w.y)<1.6};
  Interaction.register('ship-board','Board the ship',()=>built&&!st.role&&!st.aboard&&distShip()<v.hl+10,board);
  Interaction.register('ship-helm','Take the helm',()=>built&&!st.role&&st.aboard&&nearHelm()&&!st.gun&&(st.crew.helm==null||st.crew.helm===myId),()=>claim('helm'));
  Interaction.register('ship-boost','Boost! 🚀',()=>built&&st.role==='helm'&&ship.sunk===0,boost);
  Interaction.register('ship-leave','Leave the helm',()=>built&&!!st.role,release);

  return {build,damage,repair,boost,whenReady:()=>Vessel.whenReady(),seated:()=>!!st.role,role:()=>st.role,vessel:()=>v,onDeck:()=>!!st.aboard,speed:()=>Math.abs(ship.v||0),
    setInput(ix,iy){if(st.role==='helm'){raw.x=ix;raw.y=iy}},locked:()=>!!(st.role||st.gun),gunning:()=>!!st.gun,gun:()=>st.gun,aimGun,aimDir,leave,toggleCam,setCam,cam:()=>st.cam,                           // called by the controller while seated: the stick drives the ship
    marks:()=>built?[{n:'Your ship',x:pose.x,z:pose.z,r:6,icon:'⛵',dyn:true}]:[],
    _s:st,_ship:ship,_pose:pose,_step:step,_net:onNet,_claim:claim,_release:release,_board:board,_wind:windNow,_onDeck:onDeck,_helmPos:helmPos,_raw:raw,_deck:()=>v.deck};
})();
