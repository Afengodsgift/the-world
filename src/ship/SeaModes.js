// SeaModes: the rules of the other sea missions (Voyage.js is the framework: start / sync / HUD / carrying out the events; this file is the PURE rules, no THREE, no network, fully testable).
//   BLOCKADE BREAKER  a pirate fleet seals a strait. Sail to it, fight through (or sink the whole blockade) and reach the far side. Reinforcements keep coming.
//   SURVIVE THE ARMADA  endless waves around your ship, a breather (free patch-up) between rounds, a boss flagship every 3rd wave, monsters from the deep later. Coins are banked every wave; the run ends when you sink.
//   FLAGSHIP HUNT  Admiral Calloway runs from you across the sea. Follow his wake (the marker pings roughly where he is), corner him inside 150 m and sink him; his escort joins as he weakens.
//   STORM OF THE CENTURY  a hurricane: lightning strikes the deck (a red ring says where), rogue waves, a cross current, a leviathan. Reach the eye and hold it until the storm breaks.
// core(mode,s,dt,x) mutates the state s and returns events for Voyage to carry out:
//   {e:'fleet',list:[{cls,ang,dist}],around:'ship'|'site',msg,blk}   {e:'boss',cls,ang,dist,hunt,msg}   {e:'wave',n,...}   {e:'clear',n,pay,fix}   {e:'lightning'}   {e:'rogue'}   {e:'kraken'}   {e:'leviathan'}
//   {e:'phase',n}   {e:'ping'}   {e:'warn',m}   {e:'squall',on}   {e:'done',pay}   {e:'fail'}
// x = {sx,sz,speed,hull(0..1),sunk,live,distSite,distDock,boss:{alive,frac,dist,x,z}|null,blk:{alive,total}|null}
const SeaModes=(()=>{
  const clamp=(a,lo,hi)=>Math.max(lo,Math.min(hi,a));
  const MODES={
    plunder:{n:'Plunder Run',e:'💰',d:'Sail to a wreck, hold the ring while you salvage it under siege, haul the cargo home with the Admiral on your tail.'},
    blockade:{n:'Blockade Breaker',e:'⚓',d:'A pirate fleet seals the strait. Fight through (or sink the lot) and reach the far side. They keep sending ships.'},
    armada:{n:'Survive the Armada',e:'🏴‍☠️',d:'Endless waves from every side. Patch up between rounds. A flagship every 3rd wave. Coins banked each wave.'},
    hunt:{n:'Flagship Hunt',e:'🎯',d:'Admiral Calloway is running. Follow his wake, corner him and sink him before his escort wears you down.'},
    assault:{n:'Island Assault',e:'🏝',d:'Anchor off a pirate island, go ashore with your marines and take the camp. Their ships still hunt yours.'},
    storm:{n:'Storm of the Century',e:'🌩',d:'A hurricane: lightning on deck, rogue waves, a leviathan. Reach the eye and hold it.'}
  };
  const ORDER=['plunder','blockade','armada','hunt','storm','assault'];
  const PAY={plunder:1,blockade:1.6,hunt:2,storm:1.8,assault:1.7,armada:0};
  // ---------- shared ----------
  function pickClass(lvl,rnd,heavy){const w={skiff:3,barnacle:3,maiden:1+lvl*.5,whisper:1+lvl*.5};if(heavy){w.skiff=1;w.maiden+=2;w.whisper+=2}let t=0;for(const k in w)t+=w[k];let r=rnd()*t;for(const k in w){r-=w[k];if(r<=0)return k}return 'skiff'}
  const wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
  // ---------- armada ----------
  const armadaSize=w=>Math.min(6,2+Math.floor(w/2));
  const armadaPay=w=>80+30*w;
  function armadaPlan(w,lvl,rnd){
    const n=armadaSize(w),list=[],boss=w%3===0;let a0=rnd()*6.2832;
    for(let i=0;i<n;i++){const cls=boss&&i===0?'kraken':pickClass(lvl+Math.floor(w/3),rnd,w>=6);list.push({cls,ang:a0+i*6.2832/n+(rnd()-.5)*.5,dist:110+rnd()*55})}
    return list}
  function armada(s,dt,x){
    const ev=[];s.t+=dt;s.hullFrac=clamp(x.hull,0,1);
    if(x.sunk>0){s.st=5;s.end=8;ev.push({e:'fail',wave:s.wave});return ev}
    if(s.wst==='break'){s.wt-=dt;if(s.wt<=0){s.wave++;s.wst='fight';s.spawned=false;const list=armadaPlan(s.wave,s.lvl,Math.random);ev.push({e:'wave',n:s.wave,list,boss:s.wave%3===0});s.spawned=true;s.grace=3;
        if(s.wave>=5&&s.wave%5===0)ev.push({e:'kraken'});if(s.wave>=7&&s.wave%7===0)ev.push({e:'leviathan'})}}
    else{s.grace=Math.max(0,(s.grace||0)-dt);if(s.spawned&&s.grace<=0&&x.live===0){s.wst='break';s.wt=14;const pay=armadaPay(s.wave);s.bank=(s.bank||0)+pay;ev.push({e:'clear',n:s.wave,pay,fix:.35})}}
    return ev}
  // ---------- blockade ----------
  const BLK={trigger:340,gate:210,r:60,reinforce:24,n:5};
  function blockadePlan(lvl,rnd){const list=[];const n=Math.min(7,BLK.n+Math.floor((lvl-1)/2));
    for(let i=0;i<n;i++)list.push({cls:pickClass(lvl,rnd,true),off:(i/(n-1)-.5)*2.2,dist:55+rnd()*30});return {list,boss:true}}
  function blockade(s,dt,x){
    const ev=[];s.t+=dt;s.hullFrac=clamp(x.hull,0,1);
    if(x.sunk>0){s.st=5;s.end=8;ev.push({e:'fail'});return ev}
    if(s.st===1){                                           // OUT: sail to the strait
      s.raidT-=dt;if(x.distDock>100&&s.raidT<=0){s.raidT=40;if(x.live<2)ev.push({e:'fleet',list:[{cls:pickClass(s.lvl,Math.random),ang:0,dist:130}],around:'ship',msg:'A scout ship spots you!'})}
      if(x.distSite<BLK.trigger){s.st=2;s.t=0;s.blk=1;s.raidT=BLK.reinforce;ev.push({e:'blockade',plan:blockadePlan(s.lvl,Math.random)})}}
    else if(s.st===2){                                      // SIEGE: break through
      s.raidT-=dt;if(s.raidT<=0){s.raidT=BLK.reinforce;if(x.live<5)ev.push({e:'fleet',list:[{cls:pickClass(s.lvl,Math.random,true),ang:0,dist:140}],around:'site',msg:'The blockade calls for reinforcements!'})}
      if(x.distGate!==undefined&&x.distGate<BLK.r){s.st=4;s.end=12;s.res=payout(s,'blockade');ev.push({e:'done',pay:s.res,m:'You broke through the blockade!'})}
      else if(x.blk&&x.blk.total>0&&x.blk.alive===0&&s.t>8){s.st=4;s.end=12;s.res=payout(s,'blockade')+200;ev.push({e:'done',pay:s.res,m:'The blockade is destroyed!'})}}
    return ev}
  // ---------- hunt ----------
  const HUNT={huntAfter:70,engage:150,pingEvery:9,fuzz:110};
  function hunt(s,dt,x){
    const ev=[];s.t+=dt;s.hullFrac=clamp(x.hull,0,1);
    if(x.sunk>0){s.st=5;s.end=8;ev.push({e:'fail'});return ev}
    if(!s.bossOn){s.bossOn=1;ev.push({e:'boss',cls:'kraken',ang:(Math.random()*6.2832),dist:520,hunt:1,msg:'Admiral Calloway has put to sea. Follow his wake!'});s.pingT=2;return ev}
    const b=x.boss;
    if(!b||!b.alive){if(b&&!b.alive&&s.t>3){s.st=4;s.end=12;s.res=payout(s,'hunt')+300;ev.push({e:'done',pay:s.res,m:'The Admiral\'s flagship goes down!'})}return ev}
    if(s.st===1){s.pingT-=dt;if(s.pingT<=0){s.pingT=HUNT.pingEvery;ev.push({e:'ping'})}
      if(!s.hunting&&s.t>HUNT.huntAfter){s.hunting=1;ev.push({e:'warn',m:'hunted'})}                 // he picks up YOUR wake: the target does the hunting
      if(b.dist<HUNT.engage||(s.hunting&&b.dist<260)){s.st=2;s.t=0;s.ph=0;ev.push({e:'warn',m:'cornered'})}}
    else if(s.st===2){
      s.raidT-=dt;
      if(s.ph<1&&b.frac<.66){s.ph=1;ev.push({e:'phase',n:1,list:[{cls:'maiden',ang:0,dist:120},{cls:'whisper',ang:2.2,dist:130}]})}
      if(s.ph<2&&b.frac<.33){s.ph=2;ev.push({e:'phase',n:2,list:[{cls:'barnacle',ang:1,dist:120},{cls:'barnacle',ang:-1.6,dist:130},{cls:'maiden',ang:3,dist:140}]})}
    }                                                                  // once the fight is on he never lets go: sailing away just drags him after you
    return ev}
  // ---------- storm ----------
  const STORM={r:70,hold:18,ltMin:7,ltMax:11,rwMin:9,rwMax:15,drift:3.2,levAt:40};
  function stormMode(s,dt,x){
    const ev=[];s.t+=dt;s.hullFrac=clamp(x.hull,0,1);
    if(x.sunk>0){s.st=5;s.end=8;ev.push({e:'fail'});return ev}
    if(s.st===2){s.ambT=(s.ambT===undefined?3:s.ambT)-dt;if(s.ambT<=0){s.ambT=16;if(x.live<2+Math.floor(s.lvl/2))ev.push({e:'fleet',list:[{cls:pickClass(s.lvl,Math.random),ang:0,dist:120},{cls:pickClass(s.lvl,Math.random),ang:2.4,dist:130}],around:'ship',msg:'Pirates close in on the eye of the storm!'})}}
    if(s.st===1){
      s.ltT=(s.ltT===undefined?6:s.ltT)-dt;if(s.ltT<=0){s.ltT=(STORM.ltMin+Math.random()*(STORM.ltMax-STORM.ltMin))/(1+.12*(s.lvl-1));ev.push({e:'lightning'})}
      s.rwT=(s.rwT===undefined?10:s.rwT)-dt;if(s.rwT<=0){s.rwT=STORM.rwMin+Math.random()*(STORM.rwMax-STORM.rwMin);ev.push({e:'rogue'})}
      if(!s.lev&&s.t>STORM.levAt){s.lev=1;ev.push({e:'leviathan'})}
      s.raidT-=dt;if(s.raidT<=0){s.raidT=45;if(x.live<1+Math.floor(s.lvl/2))ev.push({e:'fleet',list:[{cls:pickClass(s.lvl,Math.random),ang:0,dist:130}],around:'ship',msg:'A pirate rides out the storm to hunt you!'})}}
    if(s.st===1&&x.distSite<STORM.r){s.st=2;s.t=0;s.eye=0;ev.push({e:'squall',on:0},{e:'warn',m:'eye'})}
    else if(s.st===2){
      if(x.distSite<STORM.r*1.3){s.eye=Math.min(1,s.eye+dt/STORM.hold);s.prog=s.eye}else{s.eye=Math.max(0,s.eye-dt/STORM.hold*.5);s.prog=s.eye;s.warnT-=dt;if(s.warnT<=0){s.warnT=6;ev.push({e:'warn',m:'ring'})}}
      if(s.eye>=1){s.st=4;s.end=12;s.res=payout(s,'storm');ev.push({e:'done',pay:s.res,m:'The storm breaks! You made it!'})}}
    return ev}
  // sideways push on the ship (storm: a cross current that you must steer against)
  function drift(s,t){if(s.mode!=='storm'||s.st!==1)return null;const a=.9*Math.sin(t/37)+1.3;return {x:Math.sin(a)*STORM.drift,z:Math.cos(a)*STORM.drift}}
  // ---------- assault ----------
  const AS={arrive:70,reinforce:38};
  function assault(s,dt,x){
    const ev=[];s.t+=dt;s.hullFrac=clamp(x.hull,0,1);
    if(x.sunk>0){s.st=5;s.end=8;ev.push({e:'fail'});return ev}
    if(s.st===1){s.raidT-=dt;if(x.distDock>100&&s.raidT<=0){s.raidT=40;if(x.live<2)ev.push({e:'fleet',list:[{cls:pickClass(s.lvl,Math.random),ang:0,dist:130}],around:'ship',msg:'A scout ship spots you!'})}
      if(x.distSite<AS.arrive){s.st=2;s.t=0;s.raidT=AS.reinforce;ev.push({e:'landing'})}}
    else if(s.st===2){
      s.raidT-=dt;if(s.raidT<=0){s.raidT=AS.reinforce;if(x.live<1+Math.min(2,Math.floor(s.lvl/2)))ev.push({e:'fleet',list:[{cls:pickClass(s.lvl,Math.random,true),ang:0,dist:150}],around:'ship',msg:'A pirate ship comes for your anchored galleon!'})}
      if(x.land&&x.land.total>0&&x.land.alive===0&&s.t>6){s.st=4;s.end=12;s.res=payout(s,'assault')+250;ev.push({e:'done',pay:s.res,m:'The island is yours!'})}}
    return ev}
  // ---------- payout ----------
  function payout(s,mode){
    const V=SHIP.voyage,m=PAY[mode===undefined?s.mode:mode];if(!m&&(mode||s.mode)==='armada')return s.bank||0;
    return Math.round(V.pay*m*(1+.5*(s.lvl-1))+V.perKill*(s.kills||0)+150*(s.bossKills||0)+V.hullBonus*clamp(s.hullFrac===undefined?1:s.hullFrac,0,1))}
  function core(mode,s,dt,x){switch(mode){case 'armada':return armada(s,dt,x);case 'blockade':return blockade(s,dt,x);case 'hunt':return hunt(s,dt,x);case 'storm':return stormMode(s,dt,x);case 'assault':return assault(s,dt,x)}return []}
  return {MODES,ORDER,PAY,core,drift,payout,pickClass,armadaPlan,armadaSize,armadaPay,blockadePlan,BLK,HUNT,STORM,AS,wrapA};
})();
if(typeof module!=='undefined')module.exports=SeaModes;
