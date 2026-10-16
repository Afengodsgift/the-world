// Ship: your co-op ship moored at the Harbor (DOCK in data/islands.js, tuning + hull classes in data/ship.js, physics in ship/Sailing.js, body + deck in ship/Vessel.js + ship/Decks.js).
//
//  - HOST/GUEST: whoever first takes the helm becomes the HOST and simulates the ship (Sailing.step); the other player mirrors 12 Hz
//    snapshots. Either player can steer: a guest at the wheel just streams its stick (rudder/trim) to the host.
//  - DECK: the Vessel registers a baked walkable height grid (Decks): the main deck, the raised stern deck with the wheel, stairs, rails, cabin walls. The player controller (index.html tickFrame) calls
//    Decks.step once per frame, which is what carries you with the ship and lets you stand, climb the stairs and hop over the rail. This module only pins the helmsman to the wheel.
//  - Boarding: walk onto the deck from the pier, climb the rail from the water's edge / another ship, or use the "Board the ship" interaction (works from the water).
// Globals used at runtime: THREE, S, scene, H, Net, Systems, Interaction, Fx, DOCK, SHIP, Sailing, Decks, Vessel, myId, others, banner, roomCode.
const Ship=(()=>{
  const C=SHIP,D=DOCK,K=C.cls.sloop;
  const st={host:null,role:null,crew:{helm:null,gun:null},t:0,sendT:0,hudKey:'',aboard:false};
  const ship=Sailing.newShip(D.ship.x,D.ship.z,D.ship.h);                 // authoritative on the host, mirrored on the guest
  let snap=null,snapAt=0,built=false,v=null,hud=null,remote={rud:0,trim:0},raw={x:0,y:0},sendIn=0,wakeT=0;
  const pose={x:ship.x,z:ship.z,h:ship.h,y:C.sea-K.draft,pitch:0,roll:0};   // what is drawn (the vessel's pose; kept here for the tests / HUD)
  const now=()=>(typeof performance!=='undefined'?performance.now():Date.now())/1000;
  const isHost=()=>st.host===myId;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const seed=()=>{try{return typeof hashSeed==='function'&&typeof roomCode==='string'?(hashSeed(roomCode+':wind')%6283)/1000:0}catch(e){return 0}};
  const storm=()=>{try{return typeof Env!=='undefined'&&Env.state&&Env.state.wx?Env.state.wx.storm||0:0}catch(e){return 0}};
  const windNow=()=>Sailing.wind(Date.now()/1000,seed(),storm());
  const send=p=>Net.emit('shp',p);

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
    banner(role==='helm'?'At the helm: stick left/right steers, up/down sets the sails':'At the cannon','⛵ SHIP');
  }
  function release(){
    if(!st.role)return;const r=st.role;st.role=null;
    if(isHost()){st.crew[r]=null;broadcast()}else{st.crew[r]=null;send({k:'claim',role:r,on:0})}
  }
  // put the player on the main deck at the spot nearest to where they are (not teleported to the middle: from the water you come aboard at the rail you swam to)
  function board(){
    const d=v.deck,l=Decks.toLocal(d,S.x,S.y,S.z,{}),M=K.deckM;let best=null,bd=1e9;
    for(let z=-v.hl;z<=v.hl;z+=.6)for(let x=-v.hb;x<=v.hb;x+=.6){const f=Decks.floor(d,x,z);if(Math.abs(f-M)>.1||Decks.wallAt(d,x,z,M,.3))continue;const dd=Math.hypot(x-l.x,z-l.z);if(dd<bd){bd=dd;best=[x,z]}}
    if(!best)best=[0,0];Decks.pin(S,d,best[0],best[1]);S.vy=0;S.grounded=true;S.kx=S.kz=0;banner('Welcome aboard! Climb the stairs at the back (stern) to the wheel.','⛵ SHIP')}

  // ---------- network ----------
  const packet=()=>({k:'s',x:+ship.x.toFixed(2),z:+ship.z.toFixed(2),h:+ship.h.toFixed(3),v:+ship.v.toFixed(2),sl:+ship.sail.toFixed(2),ru:+ship.rud.toFixed(2),hu:Math.round(ship.hull),ro:+ship.roll.toFixed(3),c:[st.crew.helm,st.crew.gun]});
  const broadcast=()=>send(packet());
  function onNet(d,from){
    if(!d)return;
    switch(d.k){
      case 's':{if(isHost())break;st.host=from;snap={x:d.x,z:d.z,h:d.h,v:d.v,sail:d.sl,rud:d.ru,hull:d.hu,roll:d.ro};snapAt=now();
        st.crew.helm=d.c[0];st.crew.gun=d.c[1];
        if(st.role&&st.crew[st.role]!==myId&&now()-(st.claimAt||0)>1.5){st.role=null;banner('You were relieved of your station','⛵ SHIP')}   // host disagreed with our claim
        break}
      case 'claim':{if(!isHost())break;const r=d.role;
        if(d.on){if(st.crew[r]==null||st.crew[r]===from){st.crew[r]=from}}else if(st.crew[r]===from)st.crew[r]=null;broadcast();break}
      case 'inp':{if(isHost()&&st.crew.helm===from){remote.rud=clamp(d.r,-1,1);remote.trim=clamp(d.t,-1,1)}break}
    }
  }

  // ---------- visuals ----------
  function label(txt){
    try{const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.fillStyle='#0d3550';g.fillRect(0,0,256,64);g.fillStyle='#fff';g.font='bold 38px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(txt,128,34);
      return new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide})}catch(e){return new THREE.MeshBasicMaterial({color:'#0d3550'})}}

  function build(){
    if(built)return;built=true;
    v=Vessel.create('ship','sloop',{x:ship.x,z:ship.z,h:ship.h});
    ship.p=Object.assign(ship.p,{probe:Sailing.probes(v.hl*.97,v.hb*.97)});                // hull probe points from the real hull size
    // pier: a ramp of deck circles from the beach up to deck height, tiles from the kit
    const ramp=[.3,.45,.6,.75];let i=0;
    for(let z=D.z0+1.25;z<D.z1;z+=2.5,i++){const h=i<ramp.length?ramp[i]:D.top;solids.push({x:D.x,z,r:1.25,h,pier:1});Vessel.track(Vessel.put('assets/ships/structure-platform.glb',D.x,h-.9,z,1,0))}
    // harbor dressing
    const put=(n,x,y,z,s,r,b)=>Vessel.track(Vessel.put((b||'assets/ships/')+n+'.glb',x,y,z,s,r));
    put('barrel',D.x-1.4,D.top,D.z0+4,.55,.4);put('barrel',D.x-1.6,D.top,D.z0+5.6,.5,1.2);put('crate',D.x+1.4,D.top,D.z0+4.5,.5,.2);put('chest',D.x+1.3,D.top,D.z0+7,.45,-.3);
    const sg=new THREE.Mesh(new THREE.PlaneGeometry(4,1),label('⚓ HARBOR'));sg.position.set(D.x,D.top+3.2,D.z0+1);scene.add(sg);
    // hud + fallback styling (theme.css / index.html layout override the id rules)
    const css=document.createElement('style');css.textContent='#shhud{position:fixed;z-index:6;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 150px);padding:6px 14px;border-radius:14px;background:#000a;color:#fff;font:600 15px sans-serif;text-align:center;display:none;pointer-events:none;white-space:nowrap}@media (orientation:landscape) and (pointer:coarse){#shhud{top:calc(var(--st,0px) + 120px)}}';
    (document.head||document.body).appendChild(css);
    hud=document.createElement('div');hud.id='shhud';document.body.appendChild(hud);
    Net.on('shp',onNet);Systems.add('ship',step);
  }

  // ---------- per-frame ----------
  function step(dt,t){
    if(!built)return;st.t+=dt;
    const wnd=windNow();
    // simulate (host) or mirror (guest)
    if(st.host&&st.host!==myId&&!others.has(st.host)){st.host=null;st.crew.helm=st.crew.gun=null;st.role=null}                 // the host left: nobody drives
    if(isHost()){
      const mine=st.crew.helm===myId,inp=mine?{rud:raw.x,trim:-raw.y}:st.crew.helm?remote:{rud:0,trim:ship.sail>0?-.3:0};     // unmanned: the sails slowly furl
      const bump=Sailing.step(ship,inp,dt,{wind:wnd,H});if(bump>4)banner('Hull scraped the shallows','⛵ SHIP');
      sendIn-=dt;st.sendT-=dt;if(st.sendT<=0){st.sendT=Math.max(st.sendT+1/C.net.ship,-.1);broadcast()}
    }else{
      if(st.role==='helm'){sendIn-=dt;if(sendIn<=0){sendIn=.1;send({k:'inp',r:+raw.x.toFixed(2),t:+(-raw.y).toFixed(2)})}}   // stream the stick to the host
      if(snap){const age=Math.min(.3,now()-snapAt);
        const tx=snap.x+Math.sin(snap.h)*snap.v*age,tz=snap.z+Math.cos(snap.h)*snap.v*age,k=1-Math.exp(-12*dt);
        ship.x+=(tx-ship.x)*k;ship.z+=(tz-ship.z)*k;ship.h=Sailing.wrap(ship.h+Sailing.wrap(snap.h-ship.h)*k);ship.v=snap.v;ship.sail=snap.sail;ship.rud=snap.rud;ship.hull=snap.hull;ship.roll=snap.roll}
    }
    // the body: pose, model, walkable deck, bobbing (Vessel); the controller's Decks.step does the carrying
    const rel=Sailing.wrap(wnd.dir-ship.h);
    v.hp=ship.hull;Vessel.update(v,dt,{x:ship.x,z:ship.z,h:ship.h,roll:ship.roll,v:ship.v,rel,sail:ship.sail});
    Object.assign(pose,v.pose);
    // the helmsman stays at the wheel
    if(st.role==='helm'){const h=helmLocal();Decks.pin(S,v.deck,h.x,h.z);S.rot=pose.h}
    st.aboard=onDeck();
    wakeT-=dt;if(ship.v>2&&wakeT<=0){wakeT=.18;const w=Sailing.toWorld(pose,0,-v.hl);try{Fx.burst(w.x,C.sea+.1,w.z,'#e6f8ff',2)}catch(e){}}
    // hud: only near the ship or when seated
    const near=st.role||distShip()<80;
    let txt='';
    if(near){const kn=Math.abs(ship.v)*1.944;
      txt='⛵ '+kn.toFixed(1)+' kn · sails '+Math.round(ship.sail*100)+'% · hull '+Math.round(ship.hull)+' · wind <span style="display:inline-block;transform:rotate('+(rel*57.3).toFixed(0)+'deg)">▲</span>';
      if(st.role==='helm')txt+='<br><small style="font-weight:400">stick ◀ ▶ steer · ▲ ▼ sails · the wind blows the way the arrow points</small>';
      else if(st.crew.helm)txt+='<br><small style="font-weight:400">'+(st.crew.helm===myId?'you':'your partner')+' is at the helm</small>'}
    if(txt!==st.hudKey){st.hudKey=txt;hud.innerHTML=txt;hud.style.display=txt?'block':'none'}
    try{CameraRig.setBias(st.role||st.aboard?12:0)}catch(e){}
  }

  // ---------- interactions ----------
  const nearHelm=()=>{if(!onDeck())return false;const w=helmPos();return Math.hypot(S.x-w.x,S.z-w.z)<3.2&&Math.abs(S.y-w.y)<1.6};
  Interaction.register('ship-board','Board the ship',()=>built&&!st.role&&!st.aboard&&distShip()<v.hl+10,board);
  Interaction.register('ship-helm','Take the helm',()=>built&&!st.role&&st.aboard&&nearHelm()&&(st.crew.helm==null||st.crew.helm===myId),()=>claim('helm'));
  Interaction.register('ship-leave','Leave the helm',()=>built&&!!st.role,release);

  return {build,whenReady:()=>Vessel.whenReady(),seated:()=>!!st.role,role:()=>st.role,vessel:()=>v,
    setInput(ix,iy){raw.x=ix;raw.y=iy},                           // called by the controller while seated: the stick drives the ship
    marks:()=>built?[{n:'Your ship',x:pose.x,z:pose.z,r:6,icon:'⛵',dyn:true}]:[],
    _s:st,_ship:ship,_pose:pose,_step:step,_net:onNet,_claim:claim,_release:release,_board:board,_wind:windNow,_onDeck:onDeck,_helmPos:helmPos,_raw:raw,_deck:()=>v.deck};
})();
