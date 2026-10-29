// The four extra sea missions (src/ship/SeaModes.js rules + Voyage.js framework): Blockade Breaker, Survive the Armada, Flagship Hunt, Storm of the Century.
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','A','SEA-1'),B=client('b','B','SEA-1');A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;
for(const P of [A,B]){P.Ship.build();P.Fleet.build();P.Voyage.build()}
const Vy=A.Voyage,ST=Vy.ST,SM=Vy.SeaModes,DK=A.DOCK;
const X=o=>Object.assign({sx:0,sz:0,speed:8,hull:1,sunk:0,live:0,distSite:900,distDock:600,boss:null,blk:null},o);
const S0=o=>Object.assign({mode:'x',st:1,lvl:1,t:0,raidT:30,kills:0,bossKills:0,hullFrac:1,wave:0,wst:'break',wt:8,bank:0,eye:0,warnT:0,ambT:3},o);
ok(SM.ORDER.length===6&&SM.ORDER.every(k=>SM.MODES[k]),'six missions are listed');
// ---- armada
{const s=S0({mode:'armada',st:2});let ev=[];for(let i=0;i<20*9;i++)ev.push(...SM.core('armada',s,.05,X()));
  ok(ev.some(e=>e.e==='wave'&&e.n===1&&e.list.length===2),'wave 1 (2 ships) starts after the first breather');
  ev=[];for(let i=0;i<20*5;i++)ev.push(...SM.core('armada',s,.05,X({live:2})));ok(!ev.some(e=>e.e==='clear'),'the wave is not cleared while ships live');
  ev=SM.core('armada',s,.05,X({live:0}));ok(ev.some(e=>e.e==='clear'&&e.pay===SM.armadaPay(1))&&s.bank===SM.armadaPay(1),'clearing the wave banks coins');
  ok(SM.armadaSize(1)<SM.armadaSize(8)&&SM.armadaSize(99)===6,'waves grow to 6 ships max');
  ok(SM.armadaPlan(3,1,Math.random).some(q=>q.cls==='kraken')&&!SM.armadaPlan(2,1,Math.random).some(q=>q.cls==='kraken'),'every 3rd wave brings a flagship');
  ev=SM.core('armada',s,.05,X({sunk:.1}));ok(s.st===5&&ev.some(e=>e.e==='fail'),'sinking ends the armada run (the bank is kept)')}
// ---- blockade
{const s=S0({mode:'blockade',st:1});let ev=SM.core('blockade',s,.05,X({distSite:600}));ok(s.st===1&&!ev.some(e=>e.e==='blockade'),'far from the strait nothing happens');
  ev=SM.core('blockade',s,.05,X({distSite:300}));const b=ev.find(e=>e.e==='blockade');ok(s.st===2&&b&&b.plan.list.length>=5,'nearing the strait the blockade appears ('+(b&&b.plan.list.length)+' ships + flagship)');
  s.raidT=0;ev=SM.core('blockade',s,.05,X({distSite:100,live:2,distGate:300}));ok(ev.some(e=>e.e==='fleet'),'reinforcements keep coming');
  ev=SM.core('blockade',s,.05,X({live:3,distGate:40}));ok(s.st===4&&ev.some(e=>e.e==='done'&&e.pay>0),'reaching the far side wins');
  const t=S0({mode:'blockade',st:2,t:20});ev=SM.core('blockade',t,.05,X({live:0,blk:{alive:0,total:6},distGate:200}));ok(t.st===4&&ev.some(e=>e.e==='done'),'sinking the whole blockade also wins')}
// ---- hunt
{const s=S0({mode:'hunt',st:1});let ev=SM.core('hunt',s,.05,X());ok(ev.some(e=>e.e==='boss'&&e.hunt),'the Admiral is put to sea');
  const far={alive:true,frac:1,dist:500,x:0,z:0};s.pingT=0;ev=SM.core('hunt',s,.05,X({boss:far}));ok(ev.some(e=>e.e==='ping'),'his position is pinged while hunting');
  ev=SM.core('hunt',s,.05,X({boss:{...far,dist:120}}));ok(s.st===2,'within 150 m he is cornered');
  ev=SM.core('hunt',s,.05,X({boss:{...far,dist:120,frac:.6}}));ok(ev.some(e=>e.e==='phase'&&e.n===1),'escort at 66%');
  ev=SM.core('hunt',s,.05,X({boss:{...far,dist:120,frac:.3}}));ok(ev.some(e=>e.e==='phase'&&e.n===2),'last stand at 33%');
  s.t=10;ev=SM.core('hunt',s,.05,X({boss:{alive:false,frac:0,dist:1e9}}));ok(s.st===4&&ev.some(e=>e.e==='done'&&e.pay>=300),'sinking him pays out');
  const g=S0({mode:'hunt',st:2,bossOn:1});SM.core('hunt',g,.05,X({boss:{...far,dist:450}}));ok(g.st===1,'if he slips away you chase again')}
// ---- storm
{const s=S0({mode:'storm',st:1,ltT:.01,rwT:.01});let ev=SM.core('storm',s,.05,X());ok(ev.some(e=>e.e==='lightning')&&ev.some(e=>e.e==='rogue'),'lightning and rogue waves on the way');
  ok(!!SM.drift({mode:'storm',st:1},10)&&SM.drift({mode:'armada',st:1},10)===null,'a cross current pushes the ship in a storm');
  ev=SM.core('storm',s,.05,X({distSite:50}));ok(s.st===2&&ev.some(e=>e.e==='warn'&&e.m==='eye'),'reaching the eye');
  for(let i=0;i<20*10;i++)SM.core('storm',s,.05,X({distSite:30,live:5}));const e1=s.eye;ok(e1>.4&&e1<.7,'holding the eye fills the bar ('+e1.toFixed(2)+')');
  for(let i=0;i<20*4;i++)SM.core('storm',s,.05,X({distSite:300,live:5}));ok(s.eye<e1,'leaving the eye drains it');
  ev=[];for(let i=0;i<20*40;i++)ev.push(...SM.core('storm',s,.05,X({distSite:30,live:5})));ok(s.st===4&&ev.some(e=>e.e==='done'),'the storm breaks, you win')}
// ---- the real thing
{const SA=A.Ship,sh=SA._ship;sh.x=DK.ship.x;sh.z=DK.ship.z;sh.v=0;SA._s.host=A.ctx.myId;
  const tick=(n,dt)=>{for(let i=0;i<n;i++){A.Ship._step(dt||.05);A.Voyage._step(dt||.05);A.Fleet._step(dt||.05);B.Voyage._step(dt||.05)}};
  const reset=()=>{Vy.abort();tick(2);for(const e of [...A.Fleet.ships.values()])A.Fleet.remove(e);Vy._v.st=ST.IDLE;sh.x=DK.ship.x;sh.z=DK.ship.z;sh.hull=A.SHIP.hull;sh.sunk=0};
  // armada
  B.Voyage.start('armada');tick(2);ok(Vy.state().mode==='armada'&&Vy.state().st===ST.SIEGE,'guest starts the Armada');ok(B.Voyage.state().mode==='armada','partner sees the mode');
  tick(20*9);ok(A.Fleet.live().length>=1,'wave 1 ships are really spawned ('+A.Fleet.live().length+')');
  for(const e of A.Fleet.live()){e.hp=0;e.sinking=true}tick(20*5);ok(Vy.state().bank>0,'killing the wave banks coins ('+Vy.state().bank+')');
  reset();
  // blockade
  Vy.start('blockade');tick(2);const v=Vy.state();ok(v.mode==='blockade'&&v.site&&v.gate,'blockade has a strait and a far side');
  sh.x=v.site.x-v.dir[0]*320;sh.z=v.site.z-v.dir[1]*320;tick(3);
  const g=[...A.Fleet.ships.values()].filter(e=>e.blk);ok(g.length>=4&&v.st===ST.SIEGE,'the blockade fleet is in place ('+g.length+' ships)');
  const q=g[0].sh,x0=q.x,z0=q.z;tick(40);ok(Math.hypot(q.x-x0,q.z-z0)<40,'blockade ships hold their station');
  for(const e of g){e.hp=0;e.sinking=true}tick(20*10);ok(Vy.state().st===ST.DONE,'sinking the blockade completes the mission');
  reset();
  // hunt
  Vy.start('hunt');tick(5);const hb=[...A.Fleet.ships.values()].find(e=>e.hunt);ok(!!hb&&hb.flee,'the Admiral flagship is out there and fleeing');
  const d0=Math.hypot(hb.sh.x-sh.x,hb.sh.z-sh.z);tick(20*10);ok(Math.hypot(hb.sh.x-sh.x,hb.sh.z-sh.z)>=d0-80,'he runs from a stationary ship');
  hb.sh.x=sh.x+90;hb.sh.z=sh.z;tick(5);ok(Vy.state().st===ST.SIEGE&&!hb.flee,'cornered: he stops fleeing and fights');
  hb.hp=0;hb.sinking=true;tick(20*5);ok(Vy.state().st===ST.DONE,'the hunt is won');
  reset();
  // storm
  Vy.start('storm');tick(2);ok(Vy.state().mode==='storm'&&Vy.state().sq===1,'storm: squall on, eye is far');
  Vy._v.ltT=0;tick(2);ok(Vy.strikes().length>=1,'a lightning mark appears on deck');
  const h0=sh.hull;tick(20*3);ok(sh.hull<h0&&Vy.strikes().length===0,'the strike lands and damages the hull');
  const px=sh.x;tick(20*10);ok(Math.abs(sh.x-px)+Math.abs(sh.z-px)>2,'the current pushes the ship');
  reset();ok(Vy.state().st===ST.IDLE,'reset');
}
console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
