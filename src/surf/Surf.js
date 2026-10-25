// SURF: ride the sea. Waves at the named surf spots (data/surf.js, Ocean.setBreaks) are big and rideable; hop on a board from the water, paddle onto a wave, carve along the face,
// pop off the lip and do tricks. Physics + scoring live in SurfCore.js (pure, tested); this file is the game side: board model, controls, HUD, sessions, co-op and the hooks into index.html.
//   Modes: Chill (free surf, no pressure; bails are soft)  -  Score (2:00 trick session)  -  Reef Run (race through 6 gates across a wave). Tricks work in EVERY mode.
//   Co-op: surfers see each other's boards and tricks; starting a Score session or a Reef Run invites the other player (same clock), results are compared at the end. Solo works the same.
//   Controls: stick = steer / paddle, Jump = pop, Trick button: on the water = pump (speed burst), in the air = trick (stick left/right = 360, up/down = flip, hold with the stick centred = grab).
// Globals used: THREE, scene, S, me, H, camera, LOCS, banner, others, chan, myId, keys, WaterFX, Ocean, SurfData, SurfCore, lerpAngle(optional), CameraRig(optional).
const Surf=(()=>{
  const SEA=-.3,TOP=.12;                       // sea level (the sea mesh sits at y=-.3) and how high the rider stands above the water line
  const LS='wsurf',SESSION=120;
  let built=false,ST=null,B=null,board=null,ui=null,btnT=null,btnS=null,chip=null,toastEl=null,styleEl=null;
  let mode='chill',sess=null,run=null,jumpEdge=false,trickEdge=false,held=false,inX=0,inY=0,inJ=false,spot=null,discovered=new Set(),bests={},last=0,tickN=0,pending=null,partner=null,vs=null,toastT=0;
  const rem=new Map();                          // remote surfers: id -> board mesh
  const tmp={x:0,z:0,w:0,id:''};
  const now=()=>Date.now()/1000;
  function saveS(){try{localStorage.setItem(LS,JSON.stringify({d:[...discovered],b:bests,m:mode}))}catch(e){}}
  function loadS(){try{const v=JSON.parse(localStorage.getItem(LS)||'null');if(!v)return;discovered=new Set(v.d||[]);bests=v.b||{};if(v.m==='game'||v.m==='chill')mode=v.m}catch(e){}}
  // ---- environment handed to the core (one phase table per frame) ----
  let ph=null,tNow=0;
  const env={water:(x,z)=>SEA+Ocean.height(x,z,tNow,undefined,ph),slope:(x,z)=>Ocean.slope(x,z,tNow,undefined,tmpS,ph),wave:(x,z)=>Ocean.waveAt(x,z,tNow,undefined,tmp),ground:(x,z)=>H(x,z)};
  const tmpS={x:0,z:0};
  // ---- board model ----
  const COLS=['#ff5a5a','#ffb347','#ffe066','#6ee7a0','#4cc9f0','#9b8cff','#ff8fd1'];
  function boardGeo(){
    const sh=new THREE.Shape();sh.moveTo(0,-1.0);sh.bezierCurveTo(.3,-1.0,.34,-.4,.3,.1);sh.bezierCurveTo(.26,.7,.1,1.0,0,1.15);sh.bezierCurveTo(-.1,1.0,-.26,.7,-.3,.1);sh.bezierCurveTo(-.34,-.4,-.3,-1.0,0,-1.0);
    const g=new THREE.ExtrudeGeometry(sh,{depth:.06,bevelEnabled:true,bevelSize:.035,bevelThickness:.03,bevelSegments:1,steps:1,curveSegments:8});g.rotateX(Math.PI/2);g.translate(0,.09,0);return g}
  let geo=null;
  function makeBoard(col){
    geo=geo||boardGeo();const g=new THREE.Group(),m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:col,roughness:.45,metalness:.05,flatShading:true}));g.add(m);
    const st=new THREE.Mesh(new THREE.BoxGeometry(.05,.012,1.8),new THREE.MeshStandardMaterial({color:'#fff7e6',roughness:.6}));st.position.set(0,.123,.05);g.add(st);
    const fm=new THREE.MeshStandardMaterial({color:'#222831',roughness:.7});for(const x of[-.12,.12]){const f=new THREE.Mesh(new THREE.BoxGeometry(.02,.16,.2),fm);f.position.set(x,-.02,-.78);g.add(f)}
    g.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false}});g.name='SurfBoard';return g}
  const colFor=id=>{let h=0;for(let i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))>>>0;return COLS[h%COLS.length]};
  // ---- DOM ----
  function css(){if(styleEl)return;styleEl=document.createElement('style');styleEl.textContent=`
#sact{position:fixed;left:50%;bottom:34%;transform:translateX(-50%);z-index:30;width:auto;min-width:0;max-width:60vw;white-space:nowrap;padding:12px 24px;border-radius:14px;border:1px solid #7fd0ff;background:rgba(8,28,44,.88);color:#cfeeff;font:700 15px system-ui,sans-serif;display:none;touch-action:manipulation}
#strick{position:fixed;z-index:6;right:126px;bottom:calc(env(safe-area-inset-bottom,0px) + 58px);width:76px;height:76px;border-radius:50%;padding:0;display:none;background:#ff9a5ae0;color:#3a1500;font:700 13px system-ui,sans-serif;border:0;touch-action:none}
body #strick{right:calc(var(--R0,24px) + var(--J,88px) + var(--g,14px));bottom:var(--B0,52px);width:var(--B,76px);height:var(--B,76px)}
#strick.on{filter:brightness(1.25);transform:scale(.95)}
#surfui{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 44px);z-index:21;display:none;flex-direction:column;align-items:center;gap:5px;font:600 12px system-ui,sans-serif;color:#dff3ff;pointer-events:none}
#surfui .row{display:flex;gap:6px;pointer-events:auto}
#surfui button{width:auto;min-width:0;white-space:nowrap;border:1px solid #ffffff44;background:rgba(8,28,44,.72);color:#dff3ff;border-radius:10px;padding:5px 10px;font:600 12px system-ui,sans-serif;touch-action:manipulation}
#surfui button.sel{background:#2a8fd6;border-color:#9fdcff}
#surfui .info{background:rgba(8,28,44,.62);border-radius:10px;padding:3px 10px;white-space:nowrap}
#surftoast{position:fixed;left:50%;transform:translateX(-50%);bottom:30%;z-index:22;font:800 22px system-ui,sans-serif;color:#fff;text-shadow:0 2px 6px #000a;pointer-events:none;opacity:0;transition:opacity .25s;text-align:center;white-space:nowrap}
#surftoast small{display:block;font:600 13px system-ui,sans-serif;color:#ffd9a0}`;document.head.appendChild(styleEl)}
  function btn(id,txt,fn){const b=document.createElement('button');b.id=id;b.textContent=txt;b.addEventListener('pointerdown',e=>e.stopPropagation());b.addEventListener('click',fn);return b}
  function buildUI(){
    css();
    btnS=btn('sact','Surf',()=>{if(canMount())mount()});document.body.appendChild(btnS);
    btnT=document.createElement('button');btnT.id='strick';btnT.textContent='Trick';document.body.appendChild(btnT);
    const dn=e=>{e.preventDefault();e.stopPropagation();trickEdge=true;held=true;btnT.classList.add('on')},up=e=>{held=false;btnT.classList.remove('on')};
    btnT.addEventListener('pointerdown',dn);btnT.addEventListener('pointerup',up);btnT.addEventListener('pointercancel',up);btnT.addEventListener('pointerleave',up);
    ui=document.createElement('div');ui.id='surfui';
    chip=document.createElement('div');chip.className='info';ui.appendChild(chip);
    const row=document.createElement('div');row.className='row';
    row.appendChild(btn('sm_chill','Chill',()=>setMode('chill')));row.appendChild(btn('sm_score','Score 2:00',()=>startScore(true)));row.appendChild(btn('sm_run','Reef Run',()=>startRun(true)));row.appendChild(btn('sm_leave','Leave',()=>dismount()));
    ui.appendChild(row);document.body.appendChild(ui);
    toastEl=document.createElement('div');toastEl.id='surftoast';document.body.appendChild(toastEl);
    addEventListener('keydown',e=>{if(!B||e.repeat)return;if(e.code==='KeyE'||e.code==='KeyF'){trickEdge=true;held=true}});addEventListener('keyup',e=>{if(e.code==='KeyE'||e.code==='KeyF')held=false})}
  function toast(t,sub,sec){if(!toastEl)return;toastEl.innerHTML=t+(sub?'<small>'+sub+'</small>':'');toastEl.style.opacity=1;toastT=sec||1.5}
  // ---- state helpers ----
  const busy=()=>{try{return (typeof Ship!=='undefined'&&Ship.locked())||(typeof Rally!=='undefined'&&Rally.locked())||(typeof PlayerCombat!=='undefined'&&PlayerCombat.on())||S.flying||S.dv}catch(e){return false}};
  const canMount=()=>built&&!B&&S.state==='swim'&&!busy();
  function mount(){
    if(!built||B)return;const t=now();tNow=t;ph=Ocean.phases(t,ph||undefined);
    B=SurfCore.create(S.x,S.z,S.rot,env.water(S.x,S.z));B.y=env.water(S.x,S.z);
    if(!board){board=makeBoard(colFor(typeof myId!=='undefined'?myId:'me'))}me.add(board);board.position.set(0,-TOP,0);board.visible=true;
    me.rotation.order='YXZ';S.flying=false;S.dv=false;S.vy=0;
    css();ui.style.display='flex';btnS.style.display='none';refreshModeBtns();toast('Surf!','Paddle onto a wave · Jump pops · Trick = pump / trick',2.4);
    if(typeof Boost!=='undefined'&&Boost.cancel)try{Boost.cancel()}catch(e){}}
  function dismount(toLand){
    if(!B)return;const x=B.x,z=B.z;B=null;sess=null;run=null;held=false;
    if(board&&board.parent)board.parent.remove(board);me.rotation.x=0;me.rotation.z=0;
    S.x=x;S.z=z;S.state=toLand?'idle':'swim';S.vy=0;S.y=toLand?Math.max(H(x,z),S.y):S.y;
    if(ui)ui.style.display='none';if(btnT)btnT.style.display='none';try{toast('',null,0);if(toastEl)toastEl.style.opacity=0}catch(e){}}
  function setMode(m){mode=m==='game'?'game':'chill';sess=null;run=null;refreshModeBtns();saveS();if(m==='chill')toast('Chill','No pressure. Tricks still count for fun.',1.6)}
  function refreshModeBtns(){if(!ui)return;const set=(id,on)=>{const b=document.getElementById(id);if(b)b.classList.toggle('sel',!!on)};set('sm_chill',!sess&&!run);set('sm_score',!!sess);set('sm_run',!!run)}
  // ---- sessions ----
  function startScore(local,t0){
    if(!B)return;const sp=spot;if(!sp&&local){toast('Find a surf spot','Paddle out to a marked break',2)}
    mode='game';run=null;sess={t0:t0||now(),dur:SESSION,base:B.score,ride:B.ridePts,spot:sp?sp.id:'open',left:SESSION,local};B.combo=0;refreshModeBtns();
    if(local)net({t:'start',m:'score',t0:sess.t0,sp:sess.spot});toast('Score session','2:00 · land tricks, link combos, ride the face',2.2)}
  function startRun(local,t0,spId){
    if(!B)return;const sp=spId?SurfData.byId(spId):spot;if(!sp){toast('Reef Run needs a surf spot','Paddle out to a marked break',2.2);return}
    mode='game';sess=null;run=SurfCore.newRun(sp);run.t00=t0||now();run.local=local;run.t=0;refreshModeBtns();
    if(local)net({t:'start',m:'run',t0:run.t00,sp:sp.id});toast('Reef Run','Hit the gates across the wave · '+run.gates.length+' gates',2.4)}
  function endScore(){
    const pts=Math.round(B.score-sess.base+(B.ridePts-sess.ride));const key=sess.spot;const bs=bests[key]=bests[key]||{};const nb=pts>(bs.score||0);if(nb)bs.score=pts;saveS();
    const pa=partner&&partner.score!==undefined?partner:null;let sub=nb?'New best!':'Best '+(bs.score||0);
    if(pa)sub+=' · '+(pa.name||'Partner')+' '+pa.score+(pts>pa.score?' — you win':pts<pa.score?' — they win':' — tie');
    toast(pts+' pts',sub,4);net({t:'res',m:'score',v:pts,sp:key});sess=null;refreshModeBtns()}
  function endRun(){
    const time=run.time,key=run.spot,bs=bests[key]=bests[key]||{};const nb=!bs.run||time<bs.run;if(nb)bs.run=time;saveS();
    let sub=nb?'New best!':'Best '+bs.run.toFixed(1)+'s';if(partner&&partner.run)sub+=' · '+(partner.name||'Partner')+' '+partner.run.toFixed(1)+'s'+(time<partner.run?' — you win':' — they win');
    toast(time.toFixed(1)+'s',sub,4);net({t:'res',m:'run',v:+time.toFixed(2),sp:key});run=null;refreshModeBtns()}
  // ---- network (event 'sv' on the world channel; the per-frame board pose rides on the normal state packet as p.sf) ----
  function net(p){try{if(typeof chan!=='undefined'&&chan&&typeof myId!=='undefined'){p.id=myId;p.n=typeof myName!=='undefined'?myName:'';chan.send({type:'broadcast',event:'sv',payload:p})}}catch(e){}}
  function onNet(p){
    if(!p||p.id===myId)return;
    if(p.t==='start'){partner={id:p.id,name:p.n};pending=p;
      if(B&&Math.hypot(S.x-(SurfData.byId(p.sp)||{x:S.x}).x,S.z-(SurfData.byId(p.sp)||{z:S.z}).z)<500||(B&&p.sp==='open')){join()}
      else toast((p.n||'Your partner')+' started '+(p.m==='run'?'a Reef Run':'a Score session'),B?'Paddle to '+((SurfData.byId(p.sp)||{}).n||'the spot')+' and tap Join':'Hop on a board to join',3.5)}
    else if(p.t==='res'){partner=partner||{id:p.id,name:p.n};partner.name=p.n||partner.name;if(p.m==='score')partner.score=p.v;else partner.run=p.v}}
  function join(){if(!pending||!B)return;const p=pending;pending=null;if(p.m==='run')startRun(false,p.t0,p.sp);else startScore(false,p.t0);toast('Joined '+(p.n||'partner'),null,1.6)}
  // compact pose for the state packet: [1, pitch, roll, score(int), gate]
  function pack(){if(!B)return undefined;return[1,+(B.vis.pitch+(B.pitch||0)).toFixed(2),+(B.vis.roll+(B.roll||0)).toFixed(2),Math.round(B.score+B.ridePts),run?run.i:-1]}
  // remote surfers: a board under each avatar that reports sf; remote tilt follows the packet
  function remotes(){
    if(typeof others==='undefined')return;
    for(const [id,o] of others){if(!o.group)continue;const sf=o.sf;let r=rem.get(id);
      if(sf&&sf[0]){if(!r){r=makeBoard(colFor(id));rem.set(id,r)}if(r.parent!==o.group){o.group.add(r);r.position.set(0,-TOP,0)}o.group.rotation.order='YXZ';o.group.rotation.x=+sf[1]||0;o.group.rotation.z=+sf[2]||0;r.visible=true;
        if(sess||run){partner=partner||{id,name:(o.name||'')};partner.live=sf[3]}}
      else if(r){if(r.parent)r.parent.remove(r);rem.delete(id);o.group.rotation.x=0;o.group.rotation.z=0}}
    for(const [id,r] of rem)if(!others.has(id)){if(r.parent)r.parent.remove(r);rem.delete(id)}}
  // ---- per-frame hooks ----
  function setInput(ix,iy,jump){inX=ix;inY=iy;if(jump)jumpEdge=true}
  function frame(dt,t){
    if(!B)return;tNow=now();ph=Ocean.phases(tNow,ph||undefined);
    const sy=Math.sin(S.yaw),cy=Math.cos(S.yaw);let dx=cy*inX+sy*inY,dz=-sy*inX+cy*inY;const len=Math.hypot(inX,inY),m=Math.min(1,len);if(len>1e-4){dx/=len;dz/=len}
    const chill=mode==='chill'&&!sess&&!run;
    const ev=SurfCore.step(B,{tx:dx,tz:dz,mag:m,ix:inX,iy:inY,jump:jumpEdge,trick:trickEdge,held},dt,env,{chill});jumpEdge=false;trickEdge=false;
    // surface attitude for the board and rider
    {const sl=env.slope(B.x,B.z),f=Math.sin(B.hd),g=Math.cos(B.hd);const along=sl.x*f+sl.z*g,across=sl.x*g-sl.z*f;B.pitch=B.air?0:Math.max(-.5,Math.min(.5,Math.atan(along)));B.roll=B.air?0:Math.max(-.5,Math.min(.5,-Math.atan(across)*.8))}
    S.x=B.x;S.z=B.z;S.y=B.y+TOP;S.vy=0;S.flying=false;S.grounded=true;S.fvx=S.fvz=0;S.gvx=B.vx;S.gvz=B.vz;
    S.rot=B.hd+B.vis.yaw;S.state=B.air?(B.vy>0?'jump':'fall'):'idle';
    me.rotation.x=-(B.vis.pitch+B.pitch);me.rotation.z=B.vis.roll+B.roll;
    // spray and wake
    if(!vs)vs={pose:{x:0,z:0,h:0},hl:1.1,hb:.35,sunk:0};vs.pose.x=B.x;vs.pose.z=B.z;vs.pose.h=B.hd;
    if(!B.air&&B.speed>2.5)try{WaterFX.vessel(vs,dt,B.speed*(1+B.onWave*.4))}catch(e){}
    for(const e of ev){
      if(e.t==='launch'){try{WaterFX.splash(B.x,B.z,.25)}catch(x){}}
      else if(e.t==='trick'){toast(e.n,'+'+e.base,1.1)}
      else if(e.t==='land'){if(e.pts>0){try{WaterFX.splash(B.x,B.z,.35);if(typeof CameraRig!=='undefined'&&CameraRig.land)CameraRig.land(4)}catch(x){}toast(e.pts+' pts',(e.names.length?e.names.join(' + ')+' · ':'')+(e.combo>1?'x'+e.combo+' combo · ':'')+e.h+' m air',1.8)}else if(e.h>1.2)toast('Nice air',e.h+' m',1.2)}
      else if(e.t==='wipe'){try{WaterFX.splash(B.x,B.z,.9)}catch(x){}toast('Wipeout!',mode==='chill'&&!sess&&!run?'No worries':'Combo lost',1.4)}
      else if(e.t==='pump'){try{WaterFX.splash(B.x,B.z,.12)}catch(x){}}
      else if(e.t==='beach'){dismount(true);toast('Back on the beach',null,1.4);return}}
    // spot discovery + chip
    if(++tickN%6===0){const sp=SurfData.near(B.x,B.z,40);if(sp!==spot){spot=sp;if(sp&&!discovered.has(sp.id)){discovered.add(sp.id);saveS();try{banner(sp.n,'SURF SPOT')}catch(e){}}}}
    // sessions
    if(sess){sess.left=Math.max(0,SESSION-(now()-sess.t0));if(sess.left<=0)endScore()}
    if(run){const tt=now();const r=SurfCore.runStep(run,B.x,B.z,tt);if(r&&r.t==='gate'){toast('Gate '+r.i+'/'+run.gates.length,null,.7);net({t:'gate',i:r.i})}else if(r&&r.t==='finish')endRun();
      if(run&&run.i>0&&tt-run.t0>60){run=null;toast('Run timed out',null,1.5);refreshModeBtns()}}
    // chip text
    let c=spot?spot.n:'Open water';if(sess)c+=' · '+Math.ceil(sess.left)+'s · '+Math.round(B.score-sess.base+(B.ridePts-sess.ride))+' pts'+(B.combo>1?' · x'+B.combo:'');
    else if(run)c+=' · gate '+run.i+'/'+run.gates.length+(run.i>0?' · '+(now()-run.t0).toFixed(1)+'s':'');
    else c+=' · '+Math.round(B.speed*3.6)+' km/h';
    if(partner&&(sess||run)&&partner.live!==undefined)c+=' · '+(partner.name||'Partner')+' '+partner.live;
    if(chip.textContent!==c)chip.textContent=c;
    if(pending&&B&&!sess&&!run){btnS.textContent='Join '+(pending.n||'partner');btnS.style.display='block';btnS.onclick=join}
    // camera: when cruising with the stick released the chase camera swings behind the board
    if(m<.25&&B.speed>4&&typeof lerpAngle==='function'&&!B.air)S.yaw=lerpAngle(S.yaw,B.hd+Math.PI,1-Math.exp(-1.1*dt));
    if(toastT>0){toastT-=dt;if(toastT<=0&&toastEl)toastEl.style.opacity=0}
    btnT.style.display='block';btnT.textContent=B.air?'Trick':'Pump'}
  // runs every frame, also when not surfing: the Surf button and remote boards
  function idle(dt){
    if(!built)return;remotes();
    if(B)return;
    if(toastT>0){toastT-=dt;if(toastT<=0&&toastEl)toastEl.style.opacity=0}
    const can=canMount();if(btnS){btnS.style.display=can?'block':'none';if(can){btnS.textContent='Surf';btnS.onclick=null}}
    if(btnT)btnT.style.display='none'}
  function build(){
    if(built||typeof SurfData==='undefined')return;
    loadS();Ocean.setBreaks(SurfData.SPOTS.map(s=>({id:s.id,x:s.x,z:s.z,dx:s.dx,dz:s.dz,Lh:s.Lh,Wh:s.Wh,A:s.A,L:s.L,peel:s.peel,seed:s.seed})));
    try{for(const s of SurfData.SPOTS)LOCS.push({n:s.n,x:s.x,z:s.z,r:s.r})}catch(e){}
    buildUI();built=true}
  return{build,on:()=>!!B,setInput,frame,idle,pack,onNet,mount,dismount,canMount,mode:()=>mode,body:()=>B,spot:()=>spot,
    _t:()=>({B,sess,run,rem,pending,partner,bests,discovered:[...discovered]})}})();
