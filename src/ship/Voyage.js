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
  const v={st:ST.IDLE,lvl:1,site:null,prog:0,t:0,cargo:0,kills:0,bossKills:0,raids:0,raidT:0,sq:0,sqT:0,rwT:0,krak:0,flag:0,end:0,res:0,warnT:0,slowWarn:0,tooFar:0,hullFrac:1,heat:0,mode:'plunder',wave:0,wst:'break',wt:0,bank:0,eye:0,bossOn:0,ph:0,pingT:0,ping:null,gate:null,lev:0,bx:0,bz:0,bf:1,ba:0,bt:0,ambT:3,blkTotal:0};
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
      else if(q.e==='done'){const c=q.pay;send({k:'pay',c,l:v.lvl,m:q.m});finish(c,q.m)}
      else if(q.e==='fail'){const bank=v.mode==='armada'?v.bank:0;send({k:'fl',w:v.wave,b:bank});failed(v.wave,bank)}
      else if(q.e==='fleet'){const sp=ship();let made=0;for(const it of q.list){const base=q.around==='ship'?(Math.random()*6.2832):sp.h+(Math.random()-.5)*1.2;if(Fleet.spawnNear(it.cls,base+it.ang,it.dist))made++}if(made&&q.msg)say(q.msg,'☠ PIRATES')}
      else if(q.e==='wave'){const sp=ship();let made=0;for(const it of q.list){if(Fleet.spawnNear(it.cls,it.ang,it.dist))made++}
        say((q.boss?'FLAGSHIP WAVE ':'WAVE ')+q.n+'! '+made+' sails inbound'+(q.boss?' — the Admiral leads them!':'')+'.','🏴‍☠️ ARMADA');if(!made)v.wst='break',v.wt=3}
      else if(q.e==='clear'){say('Wave '+q.n+' beaten! +'+q.pay+' 🪙 banked. Patch up!','🏴‍☠️ ARMADA');send({k:'fx',n:q.fix});patch(q.fix)}
      else if(q.e==='leviathan'){try{if(typeof Leviathan!=='undefined')Leviathan.spawn()}catch(e){}}
      else if(q.e==='lightning'){const p=strikeSpot();if(p){send({k:'lt',x:p.x,z:p.z});strike(p.x,p.z)}}
      else if(q.e==='blockade'){blockadeMake(q.plan)}
      else if(q.e==='landing'){if(v.land)LandWar.begin({beach:v.land.beach,camp:v.land.camp,lvl:v.lvl,nm:v.land.n})}
      else if(q.e==='boss'){const sp=ship(),e=Fleet.spawnNear('kraken',q.ang,q.dist);if(e){e.keep=1;e.flee=1;e.hunt=1;say(q.msg,'🎯 FLAGSHIP HUNT')}else v.bossOn=0}
      else if(q.e==='ping'){const b=huntBoss();if(b){v.ping={x:Math.round(b.sh.x+(Math.random()-.5)*SeaModes.HUNT.fuzz),z:Math.round(b.sh.z+(Math.random()-.5)*SeaModes.HUNT.fuzz)};send(pack());markSite();banner('A fisherman saw the flagship! Marked on your map.','🎯 FLAGSHIP HUNT')}}
      else if(q.e==='phase'){const sp=ship();for(const it of q.list)Fleet.spawnNear(it.cls,sp.h+it.ang,it.dist);say(q.n===1?'The Admiral calls his escort!':'The Admiral\'s last stand! More sails!','🎯 FLAGSHIP HUNT')}
      else if(q.e==='warn'&&q.m==='cornered')say('CORNERED! The Admiral turns to fight!','🎯 FLAGSHIP HUNT')
      else if(q.e==='warn'&&q.m==='eye')say('THE EYE! Hold the ring while the storm weakens!','🌩 STORM')}}
  const huntBoss=()=>{for(const e of Fleet.ships.values())if(e.hunt)return e;return null};
  function patch(f){try{Ship.repair(C.hull*f)}catch(e){}}
  // blockade: the fleet sits across the strait (guarded positions), a flagship in the middle
  function blockadeMake(plan){
    const D=v.dir,P=[-D[1],D[0]];let n=0;v.blkTotal=0;
    const put=(cls,x,z)=>{for(let i=0;i<6;i++){const jx=x+(Math.random()-.5)*14*i,jz=z+(Math.random()-.5)*14*i;const e=Fleet.spawnAt(cls,jx,jz,{guard:{x:jx,z:jz},keep:1,blk:1});if(e){v.blkTotal++;return}}};
    for(const it of plan.list)put(it.cls,v.site.x+P[0]*it.off*70+D[0]*(it.dist-60)*.4,v.site.z+P[1]*it.off*70+D[1]*(it.dist-60)*.4);
    put('kraken',v.site.x+D[0]*55,v.site.z+D[1]*55);
    say('BLOCKADE AHEAD! '+v.blkTotal+' ships hold the strait. Break through to the far marker — or sink them all!','⚓ BLOCKADE')}
  // lightning: a red ring on the deck (ship-local), 1.7 s later it strikes
  const strikes=[];let ringGeo=null,ringMat=null;
  function strikeSpot(){
    const vv=Ship.vessel();if(!vv||!vv.deck)return null;const d=vv.deck,M=C.cls[C.player].deckM;
    for(let i=0;i<40;i++){const x=(Math.random()*2-1)*vv.hb*.8,z=(Math.random()*2-1)*vv.hl*.8;if(Math.abs(Decks.floor(d,x,z)-M)>.12)continue;return {x:+x.toFixed(2),z:+z.toFixed(2)}}return null}
  function strike(lx,lz){
    const o={lx,lz,t:1.7,m:null};
    try{if(!ringGeo){ringGeo=new THREE.RingGeometry(1.6,2.2,28);ringMat=new THREE.MeshBasicMaterial({color:'#ff3030',transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide})}
      o.m=new THREE.Mesh(ringGeo,ringMat);o.m.rotation.x=-Math.PI/2;scene.add(o.m)}catch(e){}
    strikes.push(o);try{banner('LIGHTNING! Get off the red mark!','🌩 STORM')}catch(e){}}
  const _sw={x:0,y:0,z:0};
  function strikesStep(dt){
    if(!strikes.length)return;const vv=Ship.vessel();
    for(let i=strikes.length-1;i>=0;i--){const o=strikes[i];o.t-=dt;
      if(vv&&vv.deck){Decks.toWorld(vv.deck,o.lx,C.cls[C.player].deckM+.05,o.lz,_sw);if(o.m){o.m.position.set(_sw.x,_sw.y,_sw.z);o.m.scale.setScalar(1+.15*Math.sin(Date.now()/60))}}
      if(o.t<=0){
        try{if(typeof Env!=='undefined')Env.flash=1}catch(e){}
        try{Fx.burst(_sw.x,_sw.y+1,_sw.z,'#fff6a0',14)}catch(e){}
        try{if(Ship.onDeck()&&Math.hypot(S.x-_sw.x,S.z-_sw.z)<3.4&&Math.abs(S.y-_sw.y)<3){Fleet.hurtMe(30,_sw.x,_sw.z);S.hurt=Math.max(S.hurt||0,.4);try{CameraRig.shake(1.2)}catch(e){}}}catch(e){}
        try{if(Ship._s&&Ship._s.host===myId){Ship.damage(16,true);if(typeof Fires!=='undefined')Fires.ignite(0,true)}}catch(e){}
        if(o.m)scene.remove(o.m);strikes.splice(i,1)}}}
  function setSquall(on,bc){
    if(bc)send({k:'sq',on:on?1:0});
    try{if(typeof Env!=='undefined'){if(on&&!squallOn)envPrev=Env.ovW;Env.ovW=on?'storm':(envPrev===undefined?null:envPrev)}}catch(e){}
    if(on&&!squallOn)banner('A squall is rolling in!','⛈ STORM');squallOn=on}
  function rogue(){
    try{const vv=Ship.vessel();if(vv&&typeof Vessel!=='undefined'){Vessel.kick(vv,(Math.random()<.5?-1:1)*.4,.2,-.9);
        if(Ship.onDeck()||Ship.seated())try{CameraRig.shake(1.1)}catch(e){}
        if(Ship.onDeck()&&!Ship.seated()){S.kx=(S.kx||0)+(Math.random()-.5)*9;S.kz=(S.kz||0)+(Math.random()-.5)*9}
        banner('ROGUE WAVE! Hold on!','🌊')}}catch(e){}}
  function finish(c,m){
    try{if(typeof Outlaw!=='undefined'&&Outlaw.earn)Outlaw.earn(c)}catch(e){}
    banner((m||'VOYAGE COMPLETE!')+' +'+c+' 🪙 · next run is Level '+(v.lvl+1),'🏆 MISSION');
    v.st=ST.DONE;v.end=12;v.res=c;setSquall(false,false);restoreTuning();cleanup();
    if(isHost()){v.lvl++;try{localStorage.setItem('voy_lvl',String(v.lvl))}catch(e){}}
    markSite()}
  function failed(w,bank){
    const arm=v.mode==='armada';
    banner(arm?'Your ship went down on wave '+(w||v.wave)+'. You keep '+(bank||0)+' 🪙.':'Your ship went down. The mission is lost.','💀 MISSION FAILED');
    if(arm&&bank){try{if(typeof Outlaw!=='undefined'&&Outlaw.earn)Outlaw.earn(bank)}catch(e){}}
    if(arm){try{const b=Math.max(+localStorage.getItem('voy_arm')||0,w||v.wave);localStorage.setItem('voy_arm',String(b))}catch(e){}}
    v.res=bank||0;v.st=ST.FAIL;v.end=V.failShow;setSquall(false,false);restoreTuning();cleanup();markSite()}

  // ---------- starting ----------
  function start(mode){
    mode=typeof mode==='string'&&SeaModes.MODES[mode]?mode:'plunder';closeMenu();
    if(distDock()>140){banner('Bring your ship back to the harbour first.','💰 PLUNDER');return}
    if(!isHost()){send({k:'go',m:mode});return}
    if(v.st!==ST.IDLE&&v.st!==ST.DONE&&v.st!==ST.FAIL)return;
    const M=SeaModes.MODES[mode],P=mode==='storm'?{site:[800,1000]}:mode==='blockade'?{site:[520,720]}:null;
    let site=null;if(mode==='assault'){const pl=LandWar.plan(dock(),H,ISL,Math.random);if(!pl){banner('No island with a landing beach in range.',M.e+' '+M.n.toUpperCase());return}site=pl.anchor;v.land={beach:pl.beach,camp:pl.camp,n:pl.n}}
    else if(mode!=='armada'&&mode!=='hunt'){site=pickSite(H,dock(),Math.random,P);if(!site){banner('No safe waters found for a voyage.',M.e+' '+M.n.toUpperCase());return}}
    Object.assign(v,{mode,st:ST.OUT,site,prog:0,t:0,cargo:0,kills:0,bossKills:0,raids:0,raidT:V.firstRaid,sq:0,sqT:0,krak:0,flag:0,end:0,res:0,warnT:0,hullFrac:1,wave:0,wst:'break',wt:8,bank:0,eye:0,bossOn:0,ph:0,pingT:0,ping:null,gate:null,lev:0,ambT:3,blkTotal:0,ltT:6,rwT:10});v.heat=heatOf(v);
    if(mode==='blockade'){const dx=site.x-DOCK.ship.x,dz=site.z-DOCK.ship.z,L=Math.hypot(dx,dz)||1;v.dir=[dx/L,dz/L];v.raidT=30;
      for(const da of [0,.35,-.35,.7,-.7,1.05,-1.05]){const a=Math.atan2(v.dir[0],v.dir[1])+da,g={x:Math.round(site.x+Math.sin(a)*SeaModes.BLK.gate),z:Math.round(site.z+Math.cos(a)*SeaModes.BLK.gate)};if(H(g.x,g.z)<-6){v.gate=g;break}}
      if(!v.gate)v.gate={x:Math.round(site.x+v.dir[0]*SeaModes.BLK.gate),z:Math.round(site.z+v.dir[1]*SeaModes.BLK.gate)}}
    if(mode==='armada'){v.st=ST.SIEGE;v.site=null;v.bank=0}
    saveTuning(mode);
    say(M.e+' '+M.n.toUpperCase()+(mode==='armada'?'! Hold the line!':', Level '+v.lvl+'!')+' '+({plunder:'Sail to the wreck. The seas are not empty…',blockade:'A fleet blocks the strait ahead. Break through!',armada:'Wave 1 in 8 seconds. Gunners, to your posts!',hunt:'Find the Admiral\'s flagship!',storm:'Sail for the eye of the storm!',assault:'Anchor off the island. Then go ashore and take the camp!'})[mode],M.e+' '+M.n.toUpperCase());
    if(mode==='storm'){v.sq=1;setSquall(true,true)}
    sendState(true);markSite()}
  function saveTuning(mode){const E=C.enemy;if(!saved)saved={cap:E.cap,spawnEvery:E.spawnEvery,minDock:E.minDock};E.spawnEvery=mode&&mode!=='plunder'?1e9:24;E.minDock=80}
  function restoreTuning(){if(saved){Object.assign(C.enemy,saved);saved=null}}
  function abort(){if(!isHost()){send({k:'ab'});return}if(v.st===ST.OUT||v.st===ST.SIEGE||v.st===ST.BACK){const bank=v.mode==='armada'?v.bank:0;cleanup();v.st=ST.IDLE;v.site=null;setSquall(false,true);restoreTuning();say('Voyage abandoned.'+(bank?' You keep '+bank+' 🪙 banked.':''),'💰 VOYAGE');if(bank){send({k:'pay',c:bank,l:v.lvl,arm:1});try{if(typeof Outlaw!=='undefined'&&Outlaw.earn)Outlaw.earn(bank)}catch(e){}}sendState(true);markSite()}}
  // the mission's leftovers (guarding fleets, the hunted flagship) are cut loose when it ends
  function cleanup(){try{LandWar.end(v.st===ST.DONE)}catch(e){}try{for(const e of Fleet.ships.values()){e.keep=0;e.guard=null;e.flee=0}}catch(e){}}
  function kill(boss){if(isHost()&&(v.st===ST.OUT||v.st===ST.SIEGE||v.st===ST.BACK)){v.kills++;if(boss)v.bossKills++}}

  // ---------- network ----------
  const pack=()=>({k:'p',s:v.st,l:v.lvl,x:v.site&&v.site.x,z:v.site&&v.site.z,pr:+v.prog.toFixed(3),t:Math.round(v.t),c:v.cargo,kl:v.kills,bk:v.bossKills,rd:v.raids,sq:v.sq,hf:+v.hullFrac.toFixed(2),e:Math.round(v.end*10)/10,r:v.res,m:v.mode,w:v.wave,bn:v.bank,ey:+v.eye.toFixed(3),ph:v.ph,lbx:v.land&&v.land.beach.x,lbz:v.land&&v.land.beach.z,lcx:v.land&&v.land.camp.x,lcz:v.land&&v.land.camp.z,ln:v.land&&v.land.n,px:v.ping&&v.ping.x,pz:v.ping&&v.ping.z,gx:v.gate&&v.gate.x,gz:v.gate&&v.gate.z,bx:Math.round(v.bx),bz:Math.round(v.bz),bf:+v.bf.toFixed(2),ba:v.ba,bt:v.blkTotal,wt:Math.round(v.wt),ws:v.wst});
  function sendState(force){if(force||isHost())send(pack())}
  function onNet(d,from){
    if(!d)return;
    switch(d.k){
      case 'p':{if(isHost())break;
        const was=v.st;Object.assign(v,{st:d.s,lvl:d.l,prog:d.pr,t:d.t,cargo:d.c,kills:d.kl,bossKills:d.bk,raids:d.rd,hullFrac:d.hf,end:d.e,res:d.r,mode:d.m||'plunder',wave:d.w||0,bank:d.bn||0,eye:d.ey||0,ph:d.ph||0,bx:d.bx||0,bz:d.bz||0,bf:d.bf===undefined?1:d.bf,ba:d.ba||0,blkTotal:d.bt||0,wt:d.wt||0,wst:d.ws||'break'});v.site=d.x==null?null:{x:d.x,z:d.z};v.ping=d.px==null?null:{x:d.px,z:d.pz};v.land=d.lbx==null?null:{beach:{x:d.lbx,z:d.lbz},camp:{x:d.lcx,z:d.lcz},n:d.ln};v.gate=d.gx==null?null:{x:d.gx,z:d.gz};
        if(!!d.sq!==squallOn&&d.sq!==undefined)setSquall(!!d.sq,false);v.sq=d.sq;if(was!==v.st)markSite();break}
      case 'go':{if(isHost())start(d.m);break}
      case 'ab':{if(isHost())abort();break}
      case 'b':{banner(d.t,d.l);break}
      case 'sq':{setSquall(!!d.on,false);break}
      case 'rw':{rogue();break}
      case 'pay':{if(d.arm){if(!isHost()||d.silent){try{if(typeof Outlaw!=='undefined'&&Outlaw.earn)Outlaw.earn(d.c)}catch(e){}}break}if(!isHost())finish(d.c,d.m);break}
      case 'lt':{if(!isHost())strike(d.x,d.z);break}
      case 'fx':{patch(d.n);break}
      case 'fl':{if(!isHost())failed(d.w,d.b);break}
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
    try{const D=DOCK,c=document.createElement('canvas');c.width=256;c.height=96;const g=c.getContext('2d');g.fillStyle='#3a2410';g.fillRect(0,0,256,96);g.strokeStyle='#ffcf4a';g.lineWidth=5;g.strokeRect(4,4,248,88);g.fillStyle='#ffcf4a';g.font='bold 30px sans-serif';g.textAlign='center';g.fillText('⚓ MISSION BOARD',128,42);g.fillStyle='#fff';g.font='20px sans-serif';g.fillText('6 sea missions',128,74);
      const bm=new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.28),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide})),post=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,2.6,6),new THREE.MeshStandardMaterial({color:'#5a3a1a'}));
      bm.position.set(board.x,D.top+2.6,board.z);post.position.set(board.x,D.top+1.3,board.z);scene.add(bm,post)}catch(e){}
    Net.on('voy',onNet);Systems.add('voyage',step)}
  function markSite(){if(!beacon)return;const g=beacon.userData.grp,t=target();g.visible=!!t;if(t){g.position.set(t.x,SEA,t.z);ring.visible=true;ring.scale.setScalar(radius()/V.r)}}
  const target=()=>{
    if(v.mode==='plunder')return v.st===ST.OUT||v.st===ST.SIEGE?v.site:v.st===ST.BACK?dock():null;
    if(v.st!==ST.OUT&&v.st!==ST.SIEGE)return null;
    if(v.mode==='blockade')return v.st===ST.OUT?v.site:v.gate;
    if(v.mode==='hunt')return v.ping||null;
    if(v.mode==='storm')return v.site;
    if(v.mode==='assault')return v.st===ST.OUT||!v.land?v.site:v.land.camp;return null};
  const radius=()=>v.mode==='plunder'?(v.st===ST.BACK?V.rDock:V.r):v.mode==='blockade'?(v.st===ST.OUT?60:SeaModes.BLK.r):v.mode==='hunt'?SeaModes.HUNT.fuzz:v.mode==='assault'?(v.st===ST.OUT?SeaModes.AS.arrive:30):SeaModes.STORM.r;
  function hud(){
    const sp=ship(),t=target(),flames='🔥'.repeat(Math.max(1,Math.ceil(v.heat||0)));let txt='';
    const arrow=q=>{const b=Math.atan2(q.x-sp.x,q.z-sp.z),rel=Math.atan2(Math.sin(b-sp.h),Math.cos(b-sp.h));return '<span style="display:inline-block;transform:rotate('+(rel*57.3).toFixed(0)+'deg)">▲</span>'};
    const arrowM=q=>q?arrow(q):'',dist=q=>q?Math.round(Math.hypot(q.x-sp.x,q.z-sp.z)):0,bar=f=>'<div class="vb"><i style="width:'+Math.round(clamp(f,0,1)*100)+'%"></i></div>';
    if(v.mode!=='plunder'&&(v.st===ST.OUT||v.st===ST.SIEGE)){
      if(v.mode==='blockade')txt=v.st===ST.OUT?'⚓ BLOCKADE BREAKER · Lv '+v.lvl+'<br>⛵ Sail to the strait · '+dist(t)+' m '+arrowM(t):'⚓ BREAK THROUGH · '+Math.max(0,v.ba)+'/'+v.blkTotal+' ships left<br>🏁 Far side '+dist(t)+' m '+arrowM(t)+bar(v.blkTotal?1-v.ba/v.blkTotal:0);
      else if(v.mode==='armada')txt='🏴‍☠️ ARMADA · '+(v.wst==='break'?'WAVE '+(v.wave+1)+' in '+Math.max(0,v.wt)+'s — patch up!':'WAVE '+v.wave+(v.wave%3===0?' · FLAGSHIP':'')+' · '+v.ba+' sails')+'<br>🪙 Banked '+v.bank+' · Best '+(function(){try{return localStorage.getItem('voy_arm')||0}catch(e){return 0}})();
      else if(v.mode==='hunt')txt=v.st===ST.OUT?'🎯 FLAGSHIP HUNT<br>'+(v.ping?'Last sighting '+dist(v.ping)+' m '+arrowM(v.ping):'Searching…'):'🎯 CORNERED · Admiral '+Math.round(v.bf*100)+'%'+(v.ping?' · '+dist(v.ping)+' m '+arrowM(v.ping):'')+bar(v.bf);
      else if(v.mode==='assault')txt=v.st===ST.OUT?'🏝 ISLAND ASSAULT · '+(v.land?v.land.n:'')+' · Lv '+v.lvl+'<br>⚓ Anchor at the beach · '+dist(t)+' m '+arrowM(t):'🏝 TAKE THE CAMP · '+Math.max(0,v.ba)+' pirates left<br>'+(Ship.onDeck()?'Tap 🏝 Go ashore!':'Camp '+dist(t)+' m '+arrowM(t));
      else if(v.mode==='storm')txt=v.st===ST.OUT?'🌩 STORM OF THE CENTURY · Lv '+v.lvl+'<br>Reach the eye · '+dist(t)+' m '+arrowM(t)+' · watch the red marks!':'🌩 HOLD THE EYE '+Math.round(v.eye*100)+'%'+(dist(t)>SeaModes.STORM.r*1.3?' <span style="color:#ff8a8a">BACK INSIDE '+arrowM(t)+'</span>':'')+bar(v.eye)}
    else if(v.st===ST.OUT&&t){const d=Math.round(Math.hypot(t.x-sp.x,t.z-sp.z));txt='💰 PLUNDER RUN · Lv '+v.lvl+' · '+flames+'<br>⛵ Sail to the wreck · '+d+' m '+arrow(t)}
    else if(v.st===ST.SIEGE&&t){const d=Math.hypot(t.x-sp.x,t.z-sp.z),inside=d<V.r*1.25,spd=Math.abs(sp.v||0),ok=inside&&spd<V.slow;
      txt='⚓ '+(ok?'SALVAGING '+Math.round(v.prog*100)+'%':inside?'<span style="color:#ff8a8a">SLOW DOWN to salvage</span>':'<span style="color:#ff8a8a">BACK TO THE RING '+Math.round(d)+' m '+arrow(t)+'</span>')+' · '+flames+'<div class="vb"><i style="width:'+Math.round(v.prog*100)+'%"></i></div>'}
    else if(v.st===ST.BACK&&t){const d=Math.round(Math.hypot(t.x-sp.x,t.z-sp.z));txt='💰 CARGO ABOARD · '+flames+'<br>🏁 Run for the harbour · '+d+' m '+arrow(t)}
    else if(v.st===ST.DONE&&v.end>0)txt='✅ MISSION COMPLETE · +'+v.res+' 🪙';
    else if(v.st===ST.FAIL&&v.end>0)txt='💀 MISSION FAILED'+(v.mode==='armada'?' · wave '+v.wave+' · kept '+v.res+' 🪙':'');
    if(txt!==hudKey){hudKey=txt;if(hudEl){hudEl.innerHTML=txt;hudEl.style.display=txt?'block':'none'}}}

  // ---------- per frame ----------
  function step(dt){
    if(!built)return;
    const sp=ship(),host=isHost(),act=v.st===ST.OUT||v.st===ST.SIEGE||v.st===ST.BACK;
    if(host&&act){
      const t=target(),x={sx:sp.x,sz:sp.z,speed:Math.abs(sp.v||0),hull:sp.hull/C.hull,sunk:sp.sunk||0,live:Fleet.live().length,distSite:v.site?Math.hypot(v.site.x-sp.x,v.site.z-sp.z):1e9,distDock:Math.hypot(DOCK.ship.x-sp.x,DOCK.ship.z-sp.z)};
      if(v.st===ST.BACK)x.distSite=1e9;
      let was=v.st,ev;
      if(v.mode==='plunder'){ev=core(v,dt,x);C.enemy.cap=capOf(v.heat)}
      else{
        x.distGate=v.gate?Math.hypot(v.gate.x-sp.x,v.gate.z-sp.z):undefined;
        const live=Fleet.live();x.live=live.length;v.ba=live.filter(e=>v.mode==='armada'?true:e.blk).length;
        x.blk=v.mode==='blockade'&&v.blkTotal?{alive:v.ba,total:v.blkTotal}:null;
        if(v.mode==='hunt'&&v.bossOn){const b=huntBoss();x.boss=b&&!b.sinking?{alive:true,frac:b.hp/b.K.hp,dist:Math.hypot(b.sh.x-sp.x,b.sh.z-sp.z),x:b.sh.x,z:b.sh.z}:{alive:false,frac:0,dist:1e9};
          if(b&&!b.sinking){v.bx=b.sh.x;v.bz=b.sh.z;v.bf=x.boss.frac;b.flee=v.st===ST.OUT?1:0;if(v.st===ST.SIEGE)v.ping={x:Math.round(b.sh.x),z:Math.round(b.sh.z)}}}
        if(v.mode==='assault'&&v.st===ST.SIEGE){x.land={alive:LandWar.alive()+LandWar.W.queue.length,total:LandWar.W.total};v.ba=x.land.alive}
        C.enemy.cap=v.mode==='armada'?9:v.mode==='assault'?4:6;
        ev=SeaModes.core(v.mode,v,dt,x)}
      apply(ev);
      if(ev.length||was!==v.st)sendState(true);
      sendT-=dt;if(sendT<=0){sendT=.5;sendState(true)}
      if(was!==v.st)markSite()}
    else if(host){sendT-=dt;if(sendT<=0){sendT=1;if(v.st!==ST.IDLE)sendState(true)}}
    if((v.st===ST.DONE||v.st===ST.FAIL)&&v.end>0){v.end=Math.max(0,v.end-dt);if(v.end===0&&host){v.st=ST.IDLE;sendState(true);markSite()}}
    strikesStep(dt);
    if(v.mode==='storm'&&(v.st===ST.OUT)){const d=SeaModes.drift(v,Date.now()/1000);try{if(d&&Ship._s&&Ship._s.host===myId&&sp&&!(sp.sunk>0)){sp.x+=d.x*dt;sp.z+=d.z*dt}}catch(e){}}
    // beacon pulse
    if(beaM&&target()){const k=.28+.1*Math.sin(Date.now()/380);beaM.opacity=k;if(v.st===ST.SIEGE&&ring)ring.material.opacity=.35+.3*Math.abs(Math.sin(Date.now()/260))}
    hud()}

  // ---------- mission menu ----------
  let menuEl=null;
  function closeMenu(){if(menuEl)menuEl.style.display='none'}
  function openMenu(){
    if(!built)return;try{
      if(!menuEl){const css=document.createElement('style');css.textContent='#voymenu{position:fixed;z-index:30;inset:0;background:#000b;display:none;align-items:center;justify-content:center}#voymenu .box{width:min(92vw,420px);max-height:88vh;overflow:auto;background:#2a1a0c;border:2px solid #ffcf4a;border-radius:16px;padding:12px;color:#fff;font:600 13px sans-serif}#voymenu h3{margin:0 0 8px;text-align:center;color:#ffcf4a;font-size:17px}#voymenu button.m{display:block;width:100%;text-align:left;margin:6px 0;padding:10px 12px;border-radius:12px;border:1px solid #ffcf4a88;background:#4a2f16;color:#fff;font:700 14px sans-serif}#voymenu button.m small{display:block;font:500 12px sans-serif;opacity:.8;margin-top:2px}#voymenu button.x{width:100%;padding:9px;border-radius:12px;border:0;background:#fff2;color:#fff;font:700 13px sans-serif}';
        (document.head||document.body).appendChild(css);menuEl=document.createElement('div');menuEl.id='voymenu';document.body.appendChild(menuEl)}
      let h='<div class="box"><h3>⚓ MISSION BOARD · Level '+v.lvl+'</h3>';
      for(const k of SeaModes.ORDER){const M=SeaModes.MODES[k];h+='<button class="m" data-m="'+k+'">'+M.e+' '+M.n+'<small>'+M.d+'</small></button>'}
      menuEl.innerHTML=h+'<button class="x">Close</button></div>';
      menuEl.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.m)start(b.dataset.m);else closeMenu()};
      menuEl.style.display='flex'}catch(e){}}
  const board={x:DOCK.x+2.6,z:DOCK.z0+3};
  const nearBoard=()=>Math.hypot(S.x-board.x,S.z-board.z)<4.2&&Math.abs(S.y-DOCK.top)<3;
  // ---------- interactions ----------
  const distDock=()=>{const sp=ship();return Math.hypot(DOCK.ship.x-sp.x,DOCK.ship.z-sp.z)};
  Interaction.register('voy-board','⚓ Mission board',()=>built&&(v.st===ST.IDLE||v.st===ST.DONE||v.st===ST.FAIL)&&nearBoard(),openMenu);
  Interaction.register('voy-start','⚓ Choose a mission',()=>built&&(v.st===ST.IDLE||v.st===ST.DONE||v.st===ST.FAIL)&&Ship.onDeck()&&distDock()<90,openMenu);
  Interaction.register('voy-abort','Abandon the voyage',()=>built&&(v.st===ST.OUT||v.st===ST.SIEGE||v.st===ST.BACK)&&Ship.onDeck()&&distDock()<70,abort);

  return {build,start,abort,kill,onNet,marks:()=>{const t=target();if(!built||!t)return [];const m=v.mode,ic=m==='plunder'?(v.st===ST.BACK?'🏁':'💰'):m==='blockade'?(v.st===ST.OUT?'⚓':'🏁'):m==='hunt'?'🎯':m==='assault'?(v.st===ST.OUT?'⚓':'🏴‍☠️'):'🌩',n=m==='plunder'?(v.st===ST.BACK?'Harbour':'Wreck site'):m==='blockade'?(v.st===ST.OUT?'The blockade':'Far side'):m==='hunt'?'Flagship sighting':m==='assault'?(v.st===ST.OUT?'Anchorage':'Pirate camp'):'Eye of the storm';return [{n,x:t.x,z:t.z,r:radius(),icon:ic,dyn:true}]},
    SeaModes,strikes:()=>strikes,_strike:strike,_strikesStep:strikesStep,menu:()=>openMenu(),
    ST,state:()=>v,pickSite,heatOf,capOf,intervalOf,raidSize,payout,pickClass,raidAngles,core,_step:step,_v:v,_pack:pack,_hud:hud};
})();
if(typeof module!=='undefined')module.exports=Voyage;
