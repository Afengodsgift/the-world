// ISLAND ASSAULT (src/ship/LandWar.js + the assault mission in Voyage/SeaModes): landing plan on the real terrain, fighters that charge / shoot / slam, marines, hit routing, win condition, co-op sync.
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','A','LW-1'),B=client('b','B','LW-1');A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;
for(const P of [A,B]){P.Ship.build();P.Fleet.build();P.LandWar.build();P.Voyage.build()}
const LW=A.LandWar,Vy=A.Voyage,ST=Vy.ST,H=A.H,DK=A.DOCK,SM=Vy.SeaModes;
// ---- plan
const pl=LW.plan({x:DK.ship.x,z:DK.ship.z},H,A.ISL,Math.random);
ok(!!pl,'a landing is found on the real islands ('+(pl&&pl.n)+')');
if(pl){ok(H(pl.anchor.x,pl.anchor.z)<-2.9,'the anchorage is navigable water');ok(H(pl.beach.x,pl.beach.z)>.3,'the beach is land');ok(H(pl.camp.x,pl.camp.z)>=1,'the camp is on land');
  ok(Math.hypot(pl.camp.x-pl.beach.x,pl.camp.z-pl.beach.z)>40,'the camp is inland of the beach')}
ok(LW.sizeOf(1).total<LW.sizeOf(4).total&&LW.sizeOf(99).total<=26,'garrison grows with level, capped');
ok(LW.stats('cut',3).hp>LW.stats('cut',1).hp&&LW.stats('mar',3).hp===LW.stats('mar',1).hp,'pirates scale with level, marines do not');
// ---- fighters
const land={x:pl.beach.x,z:pl.beach.z};
{const f=LW.addFighter('cut','e',land.x,land.z-12);LW.F.clear();const g=LW.addFighter('cut','e',land.x,land.z-12),tg={x:land.x,z:land.z,id:'a'};
  let acts=[],d0=Math.hypot(g.x-tg.x,g.z-tg.z);for(let i=0;i<60;i++){const a=LW.stepFighter(g,{dt:.1,foes:[tg],mates:[g]});if(a)acts.push(a)}
  ok(Math.hypot(g.x-tg.x,g.z-tg.z)<d0-6,'a cutlass man runs at you');ok(acts.some(a=>a.a==='swing'&&a.d>0),'and cuts when in reach');
  LW.F.clear();const m=LW.addFighter('mus','e',land.x,land.z-30);acts=[];for(let i=0;i<120;i++){const a=LW.stepFighter(m,{dt:.1,foes:[tg],mates:[m]});if(a)acts.push(a)}
  const dm=Math.hypot(m.x-tg.x,m.z-tg.z);ok(dm>8&&dm<32,'a musketeer holds a firing distance ('+Math.round(dm)+' m)');ok(acts.some(a=>a.a==='shoot'),'and shoots');
  LW.F.clear();const c=LW.addFighter('cap','e',land.x,land.z-8);acts=[];for(let i=0;i<100;i++){const a=LW.stepFighter(c,{dt:.1,foes:[tg],mates:[c]});if(a)acts.push(a)}
  ok(acts.some(a=>a.a==='slam'),'the Captain slams the ground');
  LW.F.clear();const idle=LW.addFighter('cut','e',land.x,land.z-100),x0=idle.x,z0=idle.z;for(let i=0;i<30;i++)LW.stepFighter(idle,{dt:.1,foes:[tg],mates:[idle]});ok(Math.hypot(idle.x-x0,idle.z-z0)<8&&!idle.alert,'a far-off pirate stays at his post until you come near');
  LW.F.clear();const wat=LW.addFighter('cut','e',pl.shore.x,pl.shore.z),dirx=pl.anchor.x-pl.shore.x,dirz=pl.anchor.z-pl.shore.z;for(let i=0;i<80;i++)LW.stepFighter(wat,{dt:.1,foes:[{x:pl.anchor.x,z:pl.anchor.z,id:'a'}],mates:[wat]});ok(H(wat.x,wat.z)>.2,'fighters never walk into the sea')}
// ---- the mission, two players
{const SA=A.Ship,sh=SA._ship;sh.x=DK.ship.x;sh.z=DK.ship.z;sh.v=0;SA._s.host=A.ctx.myId;
  const tick=(n,dt)=>{for(let i=0;i<n;i++){A.Ship._step(dt||.05);A.Voyage._step(dt||.05);A.Fleet._step(dt||.05);A.LandWar._step(dt||.05);B.Voyage._step(dt||.05);B.LandWar._step(dt||.05)}};
  B.Voyage.start('assault');tick(2);const v=Vy.state();ok(v.mode==='assault'&&v.land&&v.site,'the GUEST starts an Island Assault; island: '+(v.land&&v.land.n));ok(B.Voyage.state().land&&B.Voyage.state().land.camp.x===v.land.camp.x,'the partner sees the same island');
  ok(Vy.marks().length===1,'the anchorage shows on the map');
  sh.x=v.site.x;sh.z=v.site.z;tick(3);ok(v.st===ST.SIEGE&&LW.W.on&&LW.alive()>=5,'anchoring starts the landing: '+LW.alive()+' pirates in camp');
  ok(LW.allies()>=3,'your marines are on the beach ('+LW.allies()+')');ok(B.LandWar.W.on,'the partner joins the battle');
  tick(20);ok(B.LandWar.F.size>=5,'the partner sees the fighters ('+B.LandWar.F.size+')');
  // go ashore
  A.S.x=0;A.S.z=0;LW.ashore();ok(Math.hypot(A.S.x-LW.W.beach.x,A.S.z-LW.W.beach.z)<3&&A.H(A.S.x,A.S.z)>0,'"Go ashore" puts you on the beach');
  // pirates come for you / your marines fight
  const hp0=[...LW.F.values()].filter(f=>f.team==='e').reduce((a,f)=>a+f.hp,0);
  for(const f of LW.F.values())if(f.team==='e'){f.alert=true;f.x=LW.W.beach.x+(Math.random()-.5)*20;f.z=LW.W.beach.z-25+(Math.random()-.5)*10;f.y=A.H(f.x,f.z)}
  let hurt=0;const hm=A.Fleet.hurtMe;A.Fleet.hurtMe=(n)=>{hurt+=n};for(let k=0;k<40&&!hurt;k++){tick(20);for(const f of LW.F.values())if(f.team==='e'&&!f.dead){f.alert=true}}A.Fleet.hurtMe=hm;
  ok(hurt>0,'pirates hurt you ashore ('+Math.round(hurt)+' damage taken)');
  ok([...LW.F.values()].filter(f=>f.team==='e').reduce((a,f)=>a+f.hp,0)<hp0||[...LW.F.values()].some(f=>f.team==='e'&&f.dead),'the marines cut into them');
  // hit routing: Crew.hit / targets
  const e0=[...LW.F.values()].find(f=>f.team==='e'&&!f.dead);const hp1=e0.hp;A.Crew.hit(e0.id,10,'torso');ok(e0.hp===hp1-10,'your shots reach land fighters through Crew.hit');
  ok(A.Crew.targets!==undefined&&LW.owns(e0.id)&&!LW.owns(5),'ids are routed by prefix');
  const mt=LW.meleeTarget(e0.x-1,e0.y,e0.z,0,5);ok(mt&&LW.owns(mt.id),'your cutlass finds the nearest pirate');
  // win: kill everyone
  LW.W.queue.length=0;for(const f of LW.F.values())if(f.team==='e'){LW.hit(f.id,99999,'torso')}
  tick(20*8);ok(v.st===ST.DONE&&v.res>0,'taking the camp completes the mission (+'+v.res+')');ok(!LW.W.on&&LW.F.size===0,'the battlefield is cleaned up');
  // fail path
  Vy._v.st=ST.IDLE;sh.x=DK.ship.x;sh.z=DK.ship.z;tick(2);B.Voyage.start('assault');tick(2);sh.x=Vy.state().site.x;sh.z=Vy.state().site.z;tick(3);ok(LW.W.on,'second assault starts');sh.sunk=.2;tick(3);ok(Vy.state().st===ST.FAIL&&!LW.W.on,'losing the ship ends the assault');
}
console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
