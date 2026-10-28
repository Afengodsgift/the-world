// The Plunder Run (src/ship/Voyage.js): site picking on the real sea, heat/raid maths, the state machine (out -> siege -> back -> paid / failed),
// raids that really spawn pirates around the ship, co-op sync to the partner, payout and rewards.
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','A','VOY-1'),B=client('b','B','VOY-1');A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;
for(const P of [A,B]){P.Ship.build();P.Fleet.build();P.Voyage.build()}
const Vy=A.Voyage,ST=Vy.ST,C=A.SHIP,V=C.voyage,H=A.H,DK=A.DOCK;
ok(A.Fleet.isHost()&&!B.Fleet.isHost(),'player a (lowest id) is the fleet host who runs the voyage');
// ---------- pure helpers ----------
let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
const site=Vy.pickSite(H,{x:DK.ship.x,z:DK.ship.z},rnd);
ok(!!site,'a treasure site is found on the real sea');
if(site){const d=Math.hypot(site.x-DK.ship.x,site.z-DK.ship.z);ok(d>=V.site[0]*.55&&d<=V.site[1]+1,'the site is '+Math.round(d)+' m from the harbour');
  let deepest=true;for(const r of [0,28,56,84])for(let k=0;k<6;k++)if(H(site.x+Math.cos(k*1.0472)*r,site.z+Math.sin(k*1.0472)*r)>-5)deepest=false;ok(deepest,'the whole salvage ring is open deep water');
  const L=Math.hypot(site.x-DK.ship.x,site.z-DK.ship.z);let bad=0;for(let i=1;i<L/30;i++){const u=i*30/L;if(H(DK.ship.x+(site.x-DK.ship.x)*u,DK.ship.z+(site.z-DK.ship.z)*u)>-2.5)bad++}ok(bad<=4,'the way out is (nearly) a clear straight run ('+bad+' shallow samples)')}
const sites=new Set();for(let i=0;i<8;i++){const s=Vy.pickSite(H,{x:DK.ship.x,z:DK.ship.z},Math.random);if(s)sites.add(s.x+','+s.z)}ok(sites.size>=5,'sites vary between runs ('+sites.size+'/8 different)');
const hs=[1,2,3,4,5].map(l=>Vy.heatOf({lvl:l,st:ST.OUT,raids:0}));ok(hs.every((h,i)=>i===0||h>hs[i-1]),'heat rises with the voyage level ('+hs.map(h=>h.toFixed(1))+')');
ok(Vy.heatOf({lvl:1,st:ST.BACK,raids:0})>Vy.heatOf({lvl:1,st:ST.SIEGE,raids:0})&&Vy.heatOf({lvl:1,st:ST.SIEGE,raids:0})>Vy.heatOf({lvl:1,st:ST.OUT,raids:0}),'the siege is hotter than the sail out, the run home hottest');
ok(Vy.heatOf({lvl:1,st:ST.OUT,raids:8})>Vy.heatOf({lvl:1,st:ST.OUT,raids:0}),'surviving raids raises the heat');
ok(Vy.heatOf({lvl:20,st:ST.BACK,raids:40})<=5,'heat is capped at 5');
ok(Vy.capOf(.5)===2&&Vy.capOf(2)===3&&Vy.capOf(5)===5&&Vy.capOf(5)<=5,'more heat allows more pirates alive at once (2 -> 5, never more)');
ok(Vy.intervalOf(5)<Vy.intervalOf(1)&&Vy.intervalOf(5)>=11,'raids come faster with heat but never faster than every 11 s');
ok(Vy.raidSize(.5)===1&&Vy.raidSize(2)===2&&Vy.raidSize(4)===3,'bigger raids with heat (1 / 2 / 3 ships)');
const base={lvl:1,kills:0,bossKills:0,hullFrac:1};
ok(Vy.payout({...base,hullFrac:1})>Vy.payout({...base,hullFrac:.2}),'a healthy hull pays more');
ok(Vy.payout({...base,kills:5})===Vy.payout(base)+5*V.perKill,'every pirate sunk adds to the payout');
ok(Vy.payout({...base,lvl:3})>Vy.payout(base),'higher levels pay more');
const angs=Vy.raidAngles({st:ST.OUT},1,0,()=>.5)[0];ok(Math.abs(angs)<.7,'on the way out raids come from ahead');
const back=Vy.raidAngles({st:ST.BACK},1,0,()=>.5)[0];ok(Math.abs(Math.abs(back)-Math.PI)<.7,'on the way home raids come from behind');
const two=Vy.raidAngles({st:ST.OUT},2,0,()=>.5);ok(Math.sign(Math.sin(two[0]))!==Math.sign(Math.sin(two[1])),'a two-ship raid is a pincer from both sides');
// ---------- the state machine (pure) ----------
{
  const s={st:ST.OUT,lvl:1,site:{x:0,z:0},prog:0,t:0,cargo:0,kills:0,bossKills:0,raids:0,raidT:V.firstRaid,sq:0,sqT:0,rwT:0,krak:0,flag:0,end:0,res:0,warnT:0,hullFrac:1,heat:0};
  const X=o=>Object.assign({sx:0,sz:0,speed:8,hull:1,sunk:0,live:0,distSite:600,distDock:600},o);
  let ev=[];for(let i=0;i<20*21;i++)ev.push(...Vy.core(s,.05,X({distDock:50})));ok(!ev.some(e=>e.e==='raid'),'no raid while you are still sheltered in the harbour');
  ev=[];for(let i=0;i<20*30;i++)ev.push(...Vy.core(s,.05,X()));ok(ev.some(e=>e.e==='raid'),'the first raid hits once you are out at sea');
  ev=Vy.core(s,.05,X({distSite:40}));ok(s.st===ST.SIEGE&&ev.some(e=>e.e==='arrive'),'entering the ring starts the siege');
  const p0=s.prog;Vy.core(s,1,X({distSite:30,speed:12}));ok(s.prog===p0,'sailing fast inside the ring salvages nothing');
  ev=Vy.core(s,.05,X({distSite:400,speed:2}));ok(s.prog===p0,'being outside the ring salvages nothing');
  s.warnT=0;ev=Vy.core(s,.05,X({distSite:400,speed:2}));ok(ev.some(e=>e.e==='warn'),'you are told to get back to the ring');
  for(let i=0;i<20*21;i++)Vy.core(s,.05,X({distSite:20,speed:2,live:9}));ok(s.prog>.45&&s.prog<.6,'holding the ring salvages it ('+Math.round(s.prog*100)+'% after 21 s)');
  ok(s.krak===1,'something huge stirs at the halfway point (kraken)');
  ev=[];for(let i=0;i<20*30;i++)ev.push(...Vy.core(s,.05,X({distSite:20,speed:2,live:9})));ok(s.st===ST.BACK&&s.cargo===1&&ev.some(e=>e.e==='loaded'),'the cargo comes aboard and the run home starts');
  ok(s.site.x===DK.ship.x&&s.site.z===DK.ship.z,'the new target is the harbour');
  ev=[];for(let i=0;i<20*10;i++)ev.push(...Vy.core(s,.05,X({live:9,distDock:500})));ok(s.flag===1&&s.sq===1,'the Admiral\'s flagship hunts you in a storm on the way home');
  s.kills=3;ev=Vy.core(s,.05,X({distDock:20}));ok(s.st===ST.DONE&&ev.some(e=>e.e==='done'&&e.pay===Vy.payout(s)&&e.pay>V.pay),'reaching the harbour ends the voyage with a payout ('+(ev[0]&&ev[0].pay)+')');
  const f={...s,st:ST.OUT};ev=Vy.core(f,.05,X({sunk:.01}));ok(f.st===ST.FAIL&&ev.some(e=>e.e==='fail'),'a sunk ship fails the voyage');
  const idle={...s,st:ST.IDLE};ok(Vy.core(idle,1,X()).length===0,'nothing happens while idle');
}
// ---------- the real thing, two players ----------
{
  const SA=A.Ship,sh=SA._ship;sh.x=DK.ship.x;sh.z=DK.ship.z;sh.v=0;SA._s.host=A.ctx.myId;
  const tick=(n,dt)=>{for(let i=0;i<n;i++){A.Ship._step(dt||.05);A.Voyage._step(dt||.05);A.Fleet._step(dt||.05);B.Voyage._step(dt||.05)}};
  tick(2);ok(Vy.state().st===ST.IDLE,'idle at the harbour');
  const E0={cap:C.enemy.cap,every:C.enemy.spawnEvery,minDock:C.enemy.minDock};
  B.Voyage.start();tick(2);ok(Vy.state().st===ST.OUT,'the GUEST can start the voyage (request goes to the host)');
  ok(B.Voyage.state().st===ST.OUT&&B.Voyage.state().site&&B.Voyage.state().site.x===Vy.state().site.x,'the partner sees the same wreck site');
  ok(C.enemy.spawnEvery<E0.every+1&&C.enemy.minDock<=80,'pirate spawning is turned up for the run');
  ok(A.Voyage.marks().length===1&&B.Voyage.marks().length===1,'the wreck shows on both maps');
  // sail out: place the ship out at sea, near the site, and force raids
  const S0=Vy.state().site;sh.x=DK.ship.x+(S0.x-DK.ship.x)*.5;sh.z=DK.ship.z+(S0.z-DK.ship.z)*.5;sh.h=Math.atan2(S0.x-sh.x,S0.z-sh.z);sh.v=0;
  Vy._v.raidT=0;const n0=A.Fleet.ships.size;tick(3);
  ok(A.Fleet.ships.size>n0,'a RAID spawns pirate ships around the ship ('+(A.Fleet.ships.size-n0)+')');
  let nearest=1e9;for(const e of A.Fleet.ships.values())nearest=Math.min(nearest,Math.hypot(e.sh.x-sh.x,e.sh.z-sh.z));ok(nearest>60&&nearest<260,'raiders start at a fair distance ('+Math.round(nearest)+' m)');
  ok(A.log.banners.some(b=>/RAID/.test(b)),'the crew is warned');
  tick(2);ok(B.Fleet.ships.size>=1,'the partner sees the raiders too');
  for(const e of [...A.Fleet.ships.values()])A.Fleet.remove(e);
  // arrive, hold the ring
  sh.x=S0.x+10;sh.z=S0.z;sh.v=1;tick(2);ok(Vy.state().st===ST.SIEGE,'arriving starts the siege');ok(B.Voyage.state().st===ST.SIEGE,'...on the partner too');
  Vy._v.raidT=1e9;for(let i=0;i<20*30;i++){sh.x=S0.x+10;sh.z=S0.z;sh.v=1;tick(1)}
  ok(Vy.state().prog>.5,'holding the ring fills the salvage bar ('+Math.round(Vy.state().prog*100)+'%)');ok(Math.abs(B.Voyage.state().prog-Vy.state().prog)<.1,'the partner sees the same progress');
  ok(A.Monster.get()!==null,'the kraken ambushes the ship mid-salvage');
  A.Monster.drop&&A.Monster.drop();for(const e of [...A.Fleet.ships.values()])A.Fleet.remove(e);
  for(let i=0;i<20*30;i++){sh.x=S0.x+10;sh.z=S0.z;sh.v=1;Vy._v.raidT=1e9;tick(1);if(Vy.state().st===ST.BACK)break}
  ok(Vy.state().st===ST.BACK,'salvage completes: heading home with cargo');ok(B.Voyage.state().st===ST.BACK&&B.Voyage.state().cargo===1,'...the partner is told');
  ok(A.Voyage.marks()[0].icon==='🏁','the map now points home');
  // home
  Vy._v.raidT=1e9;Vy._v.kills=4;sh.x=DK.ship.x;sh.z=DK.ship.z+30;sh.v=3;const lvl0=Vy.state().lvl;tick(2);
  ok(Vy.state().st===ST.DONE&&Vy.state().res>V.pay,'arriving home completes the voyage and pays ('+Vy.state().res+')');
  ok(Vy.state().lvl===lvl0+1,'the next voyage is a level harder');
  ok(A.log.banners.some(b=>/VOYAGE COMPLETE/.test(b))&&B.log.banners.some(b=>/VOYAGE COMPLETE/.test(b)),'both players see the result');
  ok(C.enemy.cap===E0.cap&&C.enemy.spawnEvery===E0.every&&C.enemy.minDock===E0.minDock,'normal pirate spawning is restored afterwards');
  tick(20*14);ok(Vy.state().st===ST.IDLE,'the result clears and you can sail again');
  // a failed run
  A.Voyage.start();tick(2);ok(Vy.state().st===ST.OUT,'a new run starts');sh.sunk=.5;tick(2);ok(Vy.state().st===ST.FAIL&&B.Voyage.state().st===ST.FAIL,'sinking the ship fails the voyage for both');sh.sunk=0;
  ok(C.enemy.cap===E0.cap,'spawning is restored after a failure too');
}
console.log(fails?fails+' failure(s)':'all voyage checks passed');process.exit(fails?1:0);
