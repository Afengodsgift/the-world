// Voyage: the PLUNDER RUN, the reason to sail. A co-op run with a goal and rising danger instead of aimless sailing:
//   1. OUT   sail from the harbour to a glowing wreck out at sea (a beacon + a marker on the map). Pirate raids come at you from ahead and the sides, squalls and rogue waves hit the ship.
//   2. SIEGE reach the ring and HOLD it (sail slowly inside it) while the crew salvages the wreck: the helmsman keeps the ship in place while the gunners fight off wave after wave, and something huge stirs below.
//   3. BACK  the cargo is aboard: run it home with Admiral Calloway's flagship hunting you in a storm. Reach the harbour ring and you are paid (more for a healthy hull and for every pirate sunk); each success makes the next run harder and richer.
// HEAT (0..5) drives everything: how often raids hit, how many pirates may be alive at once, how big a raid is. It rises with your level, the stage and the raids you have survived.
//  - The FLEET HOST (lowest player id, the one who simulates the pirates) runs the state machine and the director; everybody else mirrors a small 2 Hz packet on Net 'voy' (+ one-off banners / squalls / rogue waves).
//    If the host leaves, the next host continues from the mirrored state.
//  - Pure helpers for the tests (no THREE): pickSite, heatOf, capOf, intervalOf, raidSize, payout, core (the state machine: returns a list of events, mutates the state).
// Globals at runtime: THREE, scene, SHIP, DOCK, H, Net, Systems, Interaction, Ship, Fleet, Monster, Vessel, Sailing, banner, myId, others, Env/CameraRig/Outlaw (optional).
const Voyage=(()=>{
  const C=SHIP,V=C.voyage,SEA=C.sea,ST={IDLE:0,OUT:1,SIEGE:2,BACK:3,DONE:4,FAIL:5};
  const R=Math.random,clamp=(a,lo,hi)=>Math.max(lo,Math.min(hi,a));
  const v={st:ST.IDLE,lvl:1,site:null,prog:0,t:0,cargo:0,kills:0,bossKills:0,raids:0,raidT:0,sq:0,sqT:0,rwT:0,krak:0,flag:0,end:0,res:0,warnT:0,slowWarn:0,tooFar:0,hullFrac:1,heat:0};
  let built=false,hudEl=null,hudKey='',beacon=null,ring=null,beaM=null,sendT=0,saved=null,squallOn=false,envPrev=null;
  const isHost=()=>typeof Fleet!=='undefined'&&Fleet.isHost();
  const send=p=>{try{Net.emit('voy',p)}catch(e){}};
  const ship=()=>Ship._ship,dock=()=>({x:DOCK.ship.x,z:DOCK.ship.z});

  // ---------- pure helpers ----------
  // a treasure site in open, deep water that you can sail to in a straight-ish line: all candidates are checked on a ring around the spot and along the way from `from`
  function pickSite(Hf,from,rnd,P){
    P=P||V;const lo=P.site[0],hi=P.site[1];
    const clearRing=(x,z,deep)=>{for(const r of [0,28,56,84])for(let k=0;k<6;k++){const a=k*1.0472;if(Hf(x+Math.cos(a)*r,z+Math.sin(a)*r)>deep)return false}return true};
    const pathOk=(x,z,deep,allow)=>{const L=Math.hypot(x-from.x,z-from.z),n=Math.ceil(L/30);let bad=0;for(let i=1;i<n;i++){const u=i/n;if(Hf(from.x+(x-from.x)*u,from.z+(z-from.z)*u)>deep&&++bad>allow)return false}return true};
    for(const pass of [{deep:-7,pdeep:-4,allow:0,lo},{deep:-6,pdeep:-3,allow:2,lo},{deep:-5,pdeep:-2.5,allow:4,lo:lo*.6}])
      for(let i=0;i<260;i++){const a=rnd()*6.2832,d=pass.lo+rnd()*(hi-pass.lo),x=from.x+Math.sin(a)*d,z=from.z+Math.cos(a)*d;
        if(clearRing(x,z,pass.deep)&&pathOk(x,z,pass.pdeep,pass.allow))return {x:Math.round(x),z:Math.round(z)}}
    return null}
  function heatOf(s){let h=.5+.4*(s.lvl-1);if(s.st===ST.SIEGE)h+=.8;else if(s.st===ST.BACK)h+=1.3;h+=.25*Math.min(4,Math.floor(s.raids/2));return clamp(h,0,5)}
  const capOf=h=>Math.min(5,2+(h>=2?1:0)+(h>=3.5?1:0)+(h>=5?1:0));
  const intervalOf=h=>clamp(36-7*h,11,36);
  const raidSize=h=>1+(h>=2?1:0)+(h>=4?1:0);
  function payout(s){return Math.round(V.pay*(1+.5*(s.lvl-1))+V.perKill*s.kills+150*s.bossKills+V.hullBonus*clamp(s.hullFrac,0,1))}
  function pickClass(s,rnd){const w={skiff:3,barnacle:3,maiden:1+s.lvl*.5,whisper:1+s.lvl*.5};let tot=0;for(const k in w)tot+=w[k];let r=rnd()*tot;for(const k in w){r-=w[k];if(r<=0)return k}return 'skiff'}
  // bearing(s) the raid ships come from, relative to the ship's heading h: ahead on the way out, all round during the siege, behind (and the beam) on the way home
  function raidAngles(s,n,h,rnd){
    const base=s.st===ST.OUT?h+(rnd()-.5)*1.1:s.st===ST.BACK?h+Math.PI+(rnd()-.5)*1.1:rnd()*6.2832,out=[];
    if(n>=2){out.push(h+1.35+rnd()*.3,h-1.35-rnd()*.3);for(let i=2;i<n;i++)out.push(base+(rnd()-.5)*.8)}else out.push(base);return out}

  // the state machine. x = {sx,sz,speed,hull,sunk,live,distSite,distDock}. Returns events (e: raid arrive warn kraken loaded flagship squall rogue done fail)
  function core(s,dt,x){
    const ev=[];if(s.st===ST.IDLE||s.st===ST.DONE||s.st===ST.FAIL)return ev;
    s.t+=dt;s.hullFrac=clamp(x.hull,0,1);s.heat=heatOf(s);
    if(x.sunk>0){s.st=ST.FAIL;s.end=V.failShow;ev.push({e:'fail'});return ev}
    // raids: the clock only runs once you are out of the harbour's shelter
    const out=s.st===ST.OUT?x.distDock>100:true;if(out)s.raidT-=dt;
    if(s.raidT<=0&&out){s.raidT=intervalOf(s.heat)*(s.st===ST.SIEGE?.7:1)*(.8+.4*Math.random());
      if(x.live<capOf(s.heat)){s.raids++;ev.push({e:'raid',n:raidSize(s.heat)})}}
    // squalls (rough weather + rogue waves): random on the way out, always on the way home
    if(s.sq){s.sqT-=dt;s.rwT-=dt;if(s.rwT<=0){s.rwT=18+Math.random()*22;ev.push({e:'rogue'})}if(s.sqT<=0&&s.st!==ST.BACK){s.sq=0;ev.push({e:'squall',on:0})}}
    else if((s.st===ST.OUT&&s.t>40&&Math.random()<dt/55)||(s.st===ST.BACK&&s.t>0)){s.sq=1;s.sqT=s.st===ST.BACK?1e9:36+Math.random()*20;s.rwT=10+Math.random()*10;ev.push({e:'squall',on:1})}
    if(s.st===ST.OUT){if(x.distSite<V.r){s.st=ST.SIEGE;s.t=0;s.prog=0;s.raidT=Math.min(s.raidT,5);ev.push({e:'arrive'})}}
    else if(s.st===ST.SIEGE){
      const inside=x.distSite<V.r*1.25,anchored=inside&&x.speed<V.slow;
      if(anchored){s.prog=Math.min(1,s.prog+dt/V.salvage);s.slowWarn=0;s.tooFar=0}
      else{s.warnT-=dt;if(s.warnT<=0){s.warnT=6;ev.push({e:'warn',m:inside?'slow':'ring'})}}
      if(s.prog>=.45&&!s.krak){s.krak=1;ev.push({e:'kraken'})}
      if(s.prog>=1){s.st=ST.BACK;s.t=0;s.cargo=1;s.site=dock();s.raidT=5;ev.push({e:'loaded'})}}
    else if(s.st===ST.BACK){
      if(!s.flag&&s.t>7){s.flag=1;ev.push({e:'flagship'})}
      if(x.distDock<V.rDock){s.st=ST.DONE;s.end=12;s.res=payout(s);ev.push({e:'done',pay:s.res})}}
    return ev}

  // ---------- host: carry out the events ----------
  const say=(t,l)=>{send({k:'b',t,l});banner(t,l)};
  function doRaid(n){
    const sp=ship(),angs=raidAngles(v,n,sp.h,Math.random);let made=0;
    for(const a of angs){const e=Fleet.spawnNear(pickClass(v,Math.random),a,125+Math.random()*50);if(e)made++}
    if(made){const rel=Math.round(((Math.atan2(Math.sin(angs[0]-sp.h),Math.cos(angs[0]-sp.h)))*57.3));
      say(made>1?'RAID! '+made+' sails closing in from both sides!':rel>-50&&rel<50?'Sails dead ahead!':rel>0?'Sails off the port bow!':'Sails off the starboard bow!','☠ RAID')}}
  function apply(ev){
    for(const q of ev){
      if(q.e==='raid')doRaid(q.n);
      else if(q.e==='arrive')say('WRECK SITE! Slow down and hold the ring to salvage! Gunners, defend the ship!','⚓ SALVAGE');
      else if(q.e==='warn')say(q.m==='slow'?'Too fast! Slow down to salvage!':'Get back inside the ring!','⚓ SALVAGE');
      else if(q.e==='kraken'){try{if(typeof Monster!=='undefined')Monster.spawn()}catch(e){}}
      else if(q.e==='loaded'){say('Cargo aboard! Run for the harbour!','💰 PLUNDER');markSite()}
      else if(q.e==='flagship'){const e=Fleet.spawnNear('kraken',ship().h+Math.PI+(Math.random()-.5)*.6,185);say(e?'The Admiral\'s flagship is hunting you!':'Sails behind you!','☠ FLAGSHIP')}
      else if(q.e==='squall')setSquall(!!q.on,true);
      else if(q.e==='rogue'){send({k:'rw'});rogue()}
      else if(q.e==='done'){const c=q.pay;send({k:'pay',c,l:v.lvl});finish(c)}
      else if(q.e==='fail'){send({k:'fl'});failed()}}}
  function setSquall(on,bc){
    if(bc)send({k:'sq',on:on?1:0});
    try{if(typeof Env!=='undefined'){if(on&&!squallOn)envPrev=Env.ovW;Env.ovW=on?'storm':(envPrev===undefined?null:envPrev)}}catch(e){}
    if(on&&!squallOn)banner('A squall is rolling in!','⛈ STORM');squallOn=on}
  function rogue(){
    try{const vv=Ship.vessel();if(vv&&typeof Vessel!=='undefined'){Vessel.kick(vv,(Math.random()<.5?-1:1)*.4,.2,-.9);
        if(Ship.onDeck()||Ship.seated())try{CameraRig.shake(1.1)}catch(e){}
        if(Ship.onDeck()&&!Ship.seated()){S.kx=(S.kx||0)+(Math.random()-.5)*9;S.kz=(S.kz||0)+(Math.random()-.5)*9}
        banner('ROGUE WAVE! Hold on!','🌊')}}catch(e){}}
  function finish(c){
    try{if(typeof Outlaw!=='undefined'&&Outlaw.earn)Outlaw.earn(c)}catch(e){}
    banner('VOYAGE COMPLETE! +'+c+' 🪙 · next run is Level '+(v.lvl+1),'💰 PLUNDER');
    v.st=ST.DONE;v.end=12;v.res=c;setSquall(false,false);restoreTuning();
    if(isHost()){v.lvl++;try{localStorage.setItem('voy_lvl',String(v.lvl))}catch(e){}}
    markSite()}
  function failed(){banner('Your ship went down. The plunder is lost.','💀 VOYAGE FAILED');v.st=ST.FAIL;v.end=V.failShow;setSquall(false,false);restoreTuning();markSite()}

  // ---------- starting ----------
  function start(){
    if(distDock()>140){banner('Bring your ship back to the harbour first.','💰 PLUNDER');return}
    if(!isHost()){send({k:'go'});return}
    if(v.st!==ST.IDLE&&v.st!==ST.DONE&&v.st!==ST.FAIL)return;
    const site=pickSite(H,dock(),Math.random);if(!site){banner('No safe waters found for a voyage.','💰 PLUNDER');return}
    Object.assign(v,{st:ST.OUT,site,prog:0,t:0,cargo:0,kills:0,bossKills:0,raids:0,raidT:V.firstRaid,sq:0,sqT:0,krak:0,flag:0,end:0,res:0,warnT:0,hullFrac:1});v.heat=heatOf(v);
    saveTuning();say('PLUNDER RUN, Level '+v.lvl+'! Sail to the wreck. The seas are not empty…','💰 PLUNDER');sendState(true);markSite()}
  function saveTuning(){const E=C.enemy;if(!saved)saved={cap:E.cap,spawnEvery:E.spawnEvery,minDock:E.minDock};E.spawnEvery=24;E.minDock=80}
  function restoreTuning(){if(saved){Object.assign(C.enemy,saved);saved=null}}
  function abort(){if(!isHost()){send({k:'ab'});return}if(v.st===ST.OUT||v.st===ST.SIEGE||v.st===ST.BACK){v.st=ST.IDLE;v.site=null;setSquall(false,true);restoreTuning();say('Voyage abandoned.','💰 PLUNDER');sendState(true);markSite()}}
  function kill(boss){if(isHost()&&(v.st===ST.OUT||v.st===ST.SIEGE||v.st===ST.BACK)){v.kills++;if(boss)v.bossKills++}}

  // ---------- network ----------
  const pack=()=>({k:'p',s:v.st,l:v.lvl,x:v.site&&v.site.x,z:v.site&&v.site.z,pr:+v.prog.toFixed(3),t:Math.round(v.t),c:v.cargo,kl:v.kills,bk:v.bossKills,rd:v.raids,sq:v.sq,hf:+v.hullFrac.toFixed(2),e:Math.round(v.end*10)/10,r:v.res});
  function sendState(force){if(force||isHost())send(pack())}
  function onNet(d,from){
    if(!d)return;
    switch(d.k){
      case 'p':{if(isHost())break;
        const was=v.st;Object.assign(v,{st:d.s,lvl:d.l,prog:d.pr,t:d.t,cargo:d.c,kills:d.kl,bossKills:d.bk,raids:d.rd,hullFrac:d.hf,end:d.e,res:d.r});v.site=d.x==null?null:{x:d.x,z:d.z};
        if(!!d.sq!==squallOn&&d.sq!==undefined)setSquall(!!d.sq,false);v.sq=d.sq;if(was!==v.st)markSite();break}
      case 'go':{if(isHost())start();break}
      case 'ab':{if(isHost())abort();break}
      case 'b':{banner(d.t,d.l);break}
      case 'sq':{setSquall(!!d.on,false);break}
      case 'rw':{rogue();break}
      case 'pay':{if(!isHost())finish(d.c);break}
      case 'fl':{if(!isHost())failed();break}
    }}

  // ---------- visuals: a beacon at the wreck (or at home on the way back), HUD ----------
  function build(){
    if(built)return;built=true;
    try{v.lvl=Math.max(1,+localStorage.getItem('voy_lvl')||1)}catch(e){}
    try{const g=new THREE.Group();
      beaM=new THREE.MeshBasicMaterial({color:'#ffcf4a',transparent:true,opacity:.32,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
      beacon=new THREE.Mesh(new THREE.CylinderGeometry(4,7,170,16,1,true),beaM);beacon.position.y=85;g.add(beacon);
      ring=new THREE.Mesh(new THREE.RingGeometry(V.r-3,V.r,64),new THREE.MeshBasicMaterial({color:'#ffcf4a',transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.3;g.add(ring);
      g.visible=false;scene.add(g);beacon.userData.grp=g}catch(e){beacon=null}
    try{const css=document.createElement('style');css.textContent='#voyhud{position:fixed;z-index:6;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 8px);max-width:92vw;padding:6px 14px;border-radius:14px;background:#000a;color:#fff;font:700 13px sans-serif;text-align:center;display:none;pointer-events:none;text-shadow:0 1px 2px #000}#voyhud .vb{height:7px;border-radius:4px;background:#fff3;margin-top:4px;overflow:hidden}#voyhud .vb i{display:block;height:100%;background:linear-gradient(90deg,#ffcf4a,#ff8a3d)}';
      (document.head||document.body).appendChild(css);hudEl=document.createElement('div');hudEl.id='voyhud';document.body.appendChild(hudEl)}catch(e){}
    // the MISSION BOARD on the pier (walk up to it): the clear, unmissable way to start a run (the ship-side prompt is shadowed by the helm / cannon prompts)
    try{const D=DOCK,c=document.createElement('canvas');c.width=256;c.height=96;const g=c.getContext('2d');g.fillStyle='#3a2410';g.fillRect(0,0,256,96);g.strokeStyle='#ffcf4a';g.lineWidth=5;g.strokeRect(4,4,248,88);g.fillStyle='#ffcf4a';g.font='bold 30px sans-serif';g.textAlign='center';g.fillText('💰 PLUNDER RUN',128,42);g.fillStyle='#fff';g.font='20px sans-serif';g.fillText('Wreck · siege · haul it home',128,74);
      const bm=new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.28),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide})),post=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,2.6,6),new THREE.MeshStandardMaterial({color:'#5a3a1a'}));
      bm.position.set(board.x,D.top+2.6,board.z);post.position.set(board.x,D.top+1.3,board.z);scene.add(bm,post)}catch(e){}
    Net.on('voy',onNet);Systems.add('voyage',step)}
  function markSite(){if(!beacon)return;const g=beacon.userData.grp,t=target();g.visible=!!t;if(t){g.position.set(t.x,SEA,t.z);ring.visible=true;ring.scale.setScalar(v.st===ST.BACK?V.rDock/V.r:1)}}
  const target=()=>v.st===ST.OUT||v.st===ST.SIEGE?v.site:v.st===ST.BACK?dock():null;
  function hud(){
    const sp=ship(),t=target(),flames='🔥'.repeat(Math.max(1,Math.ceil(v.heat||0)));let txt='';
    const arrow=q=>{const b=Math.atan2(q.x-sp.x,q.z-sp.z),rel=Math.atan2(Math.sin(b-sp.h),Math.cos(b-sp.h));return '<span style="display:inline-block;transform:rotate('+(rel*57.3).toFixed(0)+'deg)">▲</span>'};
    if(v.st===ST.OUT&&t){const d=Math.round(Math.hypot(t.x-sp.x,t.z-sp.z));txt='💰 PLUNDER RUN · Lv '+v.lvl+' · '+flames+'<br>⛵ Sail to the wreck · '+d+' m '+arrow(t)}
    else if(v.st===ST.SIEGE&&t){const d=Math.hypot(t.x-sp.x,t.z-sp.z),inside=d<V.r*1.25,spd=Math.abs(sp.v||0),ok=inside&&spd<V.slow;
      txt='⚓ '+(ok?'SALVAGING '+Math.round(v.prog*100)+'%':inside?'<span style="color:#ff8a8a">SLOW DOWN to salvage</span>':'<span style="color:#ff8a8a">BACK TO THE RING '+Math.round(d)+' m '+arrow(t)+'</span>')+' · '+flames+'<div class="vb"><i style="width:'+Math.round(v.prog*100)+'%"></i></div>'}
    else if(v.st===ST.BACK&&t){const d=Math.round(Math.hypot(t.x-sp.x,t.z-sp.z));txt='💰 CARGO ABOARD · '+flames+'<br>🏁 Run for the harbour · '+d+' m '+arrow(t)}
    else if(v.st===ST.DONE&&v.end>0)txt='✅ VOYAGE COMPLETE · +'+v.res+' 🪙';
    else if(v.st===ST.FAIL&&v.end>0)txt='💀 VOYAGE FAILED';
    if(txt!==hudKey){hudKey=txt;if(hudEl){hudEl.innerHTML=txt;hudEl.style.display=txt?'block':'none'}}}

  // ---------- per frame ----------
  function step(dt){
    if(!built)return;
    const sp=ship(),host=isHost(),act=v.st===ST.OUT||v.st===ST.SIEGE||v.st===ST.BACK;
    if(host&&act){
      const t=target(),x={sx:sp.x,sz:sp.z,speed:Math.abs(sp.v||0),hull:sp.hull/C.hull,sunk:sp.sunk||0,live:Fleet.live().length,distSite:v.site?Math.hypot(v.site.x-sp.x,v.site.z-sp.z):1e9,distDock:Math.hypot(DOCK.ship.x-sp.x,DOCK.ship.z-sp.z)};
      if(v.st===ST.BACK)x.distSite=1e9;
      const was=v.st,ev=core(v,dt,x);C.enemy.cap=capOf(v.heat);apply(ev);
      if(ev.length||was!==v.st)sendState(true);
      sendT-=dt;if(sendT<=0){sendT=.5;sendState(true)}
      if(was!==v.st)markSite()}
    else if(host){sendT-=dt;if(sendT<=0){sendT=1;if(v.st!==ST.IDLE)sendState(true)}}
    if((v.st===ST.DONE||v.st===ST.FAIL)&&v.end>0){v.end=Math.max(0,v.end-dt);if(v.end===0&&host){v.st=ST.IDLE;sendState(true);markSite()}}
    // beacon pulse
    if(beaM&&target()){const k=.28+.1*Math.sin(Date.now()/380);beaM.opacity=k;if(v.st===ST.SIEGE&&ring)ring.material.opacity=.35+.3*Math.abs(Math.sin(Date.now()/260))}
    hud()}

  const board={x:DOCK.x+2.6,z:DOCK.z0+3};
  const nearBoard=()=>Math.hypot(S.x-board.x,S.z-board.z)<4.2&&Math.abs(S.y-DOCK.top)<3;
  // ---------- interactions ----------
  const distDock=()=>{const sp=ship();return Math.hypot(DOCK.ship.x-sp.x,DOCK.ship.z-sp.z)};
  Interaction.register('voy-board','💰 Start a Plunder Run',()=>built&&(v.st===ST.IDLE||v.st===ST.DONE||v.st===ST.FAIL)&&nearBoard(),start);
  Interaction.register('voy-start','⚓ Set sail: Plunder Run',()=>built&&(v.st===ST.IDLE||v.st===ST.DONE||v.st===ST.FAIL)&&Ship.onDeck()&&distDock()<90,start);
  Interaction.register('voy-abort','Abandon the voyage',()=>built&&(v.st===ST.OUT||v.st===ST.SIEGE||v.st===ST.BACK)&&Ship.onDeck()&&distDock()<70,abort);

  return {build,start,abort,kill,onNet,marks:()=>{const t=target();return built&&t?[{n:v.st===ST.BACK?'Harbour':'Wreck site',x:t.x,z:t.z,r:v.st===ST.BACK?V.rDock:V.r,icon:v.st===ST.BACK?'🏁':'💰',dyn:true}]:[]},
    ST,state:()=>v,pickSite,heatOf,capOf,intervalOf,raidSize,payout,pickClass,raidAngles,core,_step:step,_v:v,_pack:pack,_hud:hud};
})();
if(typeof module!=='undefined')module.exports=Voyage;
