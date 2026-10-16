// Ship: the co-op sloop moored at the Harbor (DOCK in data/islands.js, tuning in data/ship.js, physics in ship/Sailing.js).
//
//  - HOST/GUEST: whoever first takes the helm becomes the HOST and simulates the ship (Sailing.step); the other player mirrors 12 Hz
//    snapshots. Either player can steer: a guest at the wheel just streams its stick (rudder/trim) to the host.
//  - DECK: three moving circles in `solids` (the same {x,z,r,h} mechanism the rocks and bridges use) make the deck real ground, so you
//    walk around on it. A ship moves the people standing on it by adding its own motion to them (carry), and a seated helmsman is
//    pinned to the wheel. These are the only places this module writes `S` (documented exception to the "never write S" rule: a vehicle
//    has to carry its passengers). The controller needs exactly one hook: while seated, the stick is routed to the ship, not the avatar.
//  - Boarding is an Interaction (works from the water). Leave the wheel with "Leave station".
// Globals used at runtime: THREE, S, scene, H, solids, Net, Systems, Interaction, Fx, DOCK, SHIP, Sailing, myId, others, banner, roomCode.
const Ship=(()=>{
  const C=SHIP,D=DOCK;
  const st={host:null,role:null,crew:{helm:null,gun:null},t:0,sendT:0,hudKey:'',aboard:false};
  const ship=Sailing.newShip(D.ship.x,D.ship.z,D.ship.h);                 // authoritative on the host, mirrored on the guest
  const pose={x:ship.x,z:ship.z,h:ship.h,y:C.sea-C.draft,pitch:0,roll:0,px:ship.x,pz:ship.z,ph:ship.h,py:C.sea-C.draft};  // what is drawn (p* = previous frame)
  let snap=null,snapAt=0,built=false,grp=null,hud=null,remote={rud:0,trim:0},raw={x:0,y:0},sendIn=0,wakeT=0;
  const sails=[],flags=[],deckSolids=[],cache={},pending=[];                 // pending = every model load, so the loading screen can wait (whenReady)
  const now=()=>(typeof performance!=='undefined'?performance.now():Date.now())/1000;
  const isHost=()=>st.host===myId;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const deckY=()=>pose.y+C.deckY*C.scale;                                // world height of the deck surface
  const seed=()=>{try{return typeof hashSeed==='function'&&typeof roomCode==='string'?(hashSeed(roomCode+':wind')%6283)/1000:0}catch(e){return 0}};
  const storm=()=>{try{return typeof Env!=='undefined'&&Env.state&&Env.state.wx?Env.state.wx.storm||0:0}catch(e){return 0}};
  const windNow=()=>Sailing.wind(Date.now()/1000,seed(),storm());
  const send=p=>Net.emit('shp',p);

  // ---------- where things are ----------
  const onDeck=()=>{const l=Sailing.toShip({x:pose.px,z:pose.pz,h:pose.ph},S.x,S.z);                // judged against LAST frame's pose
    return Math.abs(l.x)<3&&l.z>-6.2&&l.z<4.6&&Math.abs(S.y-(pose.py+C.deckY*C.scale))<1.1&&!S.flying};
  const distShip=()=>Math.hypot(S.x-pose.x,S.z-pose.z);
  const helmPos=()=>Sailing.toWorld(pose,C.stations.helm[0],C.stations.helm[1]);

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
  function board(){const w=Sailing.toWorld(pose,0,.3);S.x=w.x;S.z=w.z;S.y=deckY()+.3;S.vy=0;banner('Welcome aboard! Stand at the wheel (stern) to take the helm.','⛵ SHIP')}

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
  const loader=()=>(typeof THREE!=='undefined'&&THREE.GLTFLoader)?new THREE.GLTFLoader():null;
  function model(name,base){
    const k=(base||'assets/ships/')+name;
    return cache[k]||(cache[k]=new Promise(res=>{const L=loader();if(!L){res(null);return}
      try{L.load(k+((base&&base.includes('kay'))?'.gltf':'.glb'),g=>res(g.scene),undefined,()=>res(null))}catch(e){res(null)}}));
  }
  async function put(name,x,y,z,sc,ry,parent,base){
    const m=await model(name,base);if(!m)return null;const o=m.clone(true);o.position.set(x,y,z);o.scale.setScalar(sc||1);o.rotation.y=ry||0;
    o.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true}});(parent||scene).add(o);return o}
  function label(txt){
    try{const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.fillStyle='#0d3550';g.fillRect(0,0,256,64);g.fillStyle='#fff';g.font='bold 38px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(txt,128,34);
      return new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide})}catch(e){return new THREE.MeshBasicMaterial({color:'#0d3550'})}}

  function build(){
    if(built)return;built=true;
    grp=new THREE.Group();grp.rotation.order='YXZ';scene.add(grp);
    // the sloop
    pending.push(model('ship-medium').then(m=>{if(!m)return;const o=m.clone(true);o.scale.setScalar(C.scale);
      o.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true}if(/^sail/.test(c.name))sails.push({n:c,r:c.rotation.y});if(/^flag/.test(c.name))flags.push({n:c,r:c.rotation.y})});grp.add(o)}));
    pending.push(put('compass_base',0,C.deckY*C.scale+1.0,C.stations.helm[1]-.3,2.2,0,grp,'assets/ships/kay/'));   // props at the wheel
    pending.push(put('lantern',1.3,C.deckY*C.scale,C.stations.helm[1]-1.1,2.0,0,grp,'assets/ships/kay/'));
    // deck = three moving walkable circles
    for(const [x,z,r] of C.deck){const c={x:pose.x,z:pose.z,r,h:deckY(),deck:1,cx:x,cz:z};solids.push(c);deckSolids.push(c)}
    // pier: a ramp of deck circles from the beach up to deck height, tiles from the kit
    const ramp=[.3,.45,.6,.75];let i=0;
    for(let z=D.z0+1.25;z<D.z1;z+=2.5,i++){const h=i<ramp.length?ramp[i]:D.top;solids.push({x:D.x,z,r:1.25,h,pier:1});pending.push(put('structure-platform',D.x,h-.9,z,1,0))}
    // harbor dressing
    pending.push(put('barrel',D.x-1.4,D.top,D.z0+4,.55,.4),put('barrel',D.x-1.6,D.top,D.z0+5.6,.5,1.2),put('crate',D.x+1.4,D.top,D.z0+4.5,.5,.2),put('chest',D.x+1.3,D.top,D.z0+7,.45,-.3),
      put('map_rolled',D.x+1.4,D.top+1.55,D.z0+4.5,2.2,0.7,undefined,'assets/ships/kay/'));
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
    // pose: keep last frame's for carrying, then add the sea's motion
    pose.px=pose.x;pose.pz=pose.z;pose.ph=pose.h;pose.py=pose.y;
    const wasOn=onDeck();
    const lp=wasOn?Sailing.toShip({x:pose.px,z:pose.pz,h:pose.ph},S.x,S.z):null;
    pose.x=ship.x;pose.z=ship.z;pose.h=ship.h;
    const sw=1+.5*storm();pose.y=C.sea-C.draft+Math.sin(st.t*1.3)*.07*sw;pose.pitch=Math.sin(st.t*1.05+1)*.025*sw+ship.v*.003;pose.roll=ship.roll+Math.sin(st.t*.9)*.03*sw;
    grp.position.set(pose.x,pose.y,pose.z);grp.rotation.set(pose.pitch,pose.h,pose.roll);
    for(const c of deckSolids){const w=Sailing.toWorld(pose,c.cx,c.cz);c.x=w.x;c.z=w.z;c.h=deckY()}
    // carry whoever stands on the deck; pin the helmsman to the wheel
    if(st.role==='helm'){const w=helmPos();S.x=w.x;S.z=w.z;S.y=deckY();S.vy=0;S.rot=pose.h}
    else if(lp){const w=Sailing.toWorld(pose,lp.x,lp.z);S.x=w.x;S.z=w.z;S.rot+=Sailing.wrap(pose.h-pose.ph)}
    st.aboard=wasOn;
    // life: sails, flags, wake
    const rel=Sailing.wrap(wnd.dir-ship.h);
    for(const s of sails)s.n.rotation.y=s.r+clamp(rel,-1,1)*.35*ship.sail;
    flags.forEach((f,i)=>{f.n.rotation.y=f.r+Math.sin(st.t*3+i*1.3)*.22});
    wakeT-=dt;if(ship.v>2&&wakeT<=0){wakeT=.18;const w=Sailing.toWorld(pose,0,-6.3);try{Fx.burst(w.x,C.sea+.1,w.z,'#e6f8ff',2)}catch(e){}}
    // hud: only near the ship or when seated
    const near=st.role||distShip()<60;
    let txt='';
    if(near){const kn=Math.abs(ship.v)*1.944;
      txt='⛵ '+kn.toFixed(1)+' kn · sails '+Math.round(ship.sail*100)+'% · hull '+Math.round(ship.hull)+' · wind <span style="display:inline-block;transform:rotate('+(rel*57.3).toFixed(0)+'deg)">▲</span>';
      if(st.role==='helm')txt+='<br><small style="font-weight:400">stick ◀ ▶ steer · ▲ ▼ sails · the wind blows the way the arrow points</small>';
      else if(st.crew.helm)txt+='<br><small style="font-weight:400">'+(st.crew.helm===myId?'you':'your partner')+' is at the helm</small>'}
    if(txt!==st.hudKey){st.hudKey=txt;hud.innerHTML=txt;hud.style.display=txt?'block':'none'}
    try{CameraRig.setBias(st.role||st.aboard?6:0)}catch(e){}
  }

  // ---------- interactions ----------
  const nearHelm=()=>{const w=helmPos();return Math.hypot(S.x-w.x,S.z-w.z)<3.4&&Math.abs(S.y-deckY())<1.6};
  Interaction.register('ship-board','Board the ship',()=>built&&!st.role&&!st.aboard&&distShip()<10,board);
  Interaction.register('ship-helm','Take the helm',()=>built&&!st.role&&st.aboard&&nearHelm()&&(st.crew.helm==null||st.crew.helm===myId),()=>claim('helm'));
  Interaction.register('ship-leave','Leave the helm',()=>built&&!!st.role,release);

  return {build,whenReady:()=>Promise.all(pending),seated:()=>!!st.role,role:()=>st.role,
    setInput(ix,iy){raw.x=ix;raw.y=iy},                           // called by the controller while seated: the stick drives the ship
    marks:()=>built?[{n:'Your ship',x:pose.x,z:pose.z,r:6,icon:'⛵',dyn:true}]:[],
    _s:st,_ship:ship,_pose:pose,_step:step,_net:onNet,_claim:claim,_release:release,_board:board,_wind:windNow,_decks:deckSolids,_onDeck:onDeck,_helmPos:helmPos,_raw:raw};
})();
