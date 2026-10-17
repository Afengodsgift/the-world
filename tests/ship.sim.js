// Simulation of the co-op sloop: sailing physics, harbor geometry, boarding, deck carry, helm control, host/guest sync, seat rules.
// Run: NODE_PATH=<dir with three@0.147.0>/node_modules node tests/ship.sim.js
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','Alex','SHIP-TEST-1'),B=client('b','Bee','SHIP-TEST-1');
A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;
const Sl=A.Sailing,C=A.SHIP,D=A.DOCK,H=A.H;
const W=(dir,s)=>({dir,s:s==null?1:s});
// ---------- 1. sailing physics (pure) ----------
{
  const e0=Sl.eff(0),e90=Sl.eff(Math.PI/2),e180=Sl.eff(Math.PI),e150=Sl.eff(2.6);
  ok(Math.abs(e90-1)<1e-9&&Math.abs(e0-.55)<1e-9&&e180===0,'polar: beam reach best (1.0), wind behind decent (0.55), head-to-wind dead (0)');
  ok(e150>0&&e150<e90&&Sl.eff(2.9)<e150,'polar: efficiency falls smoothly as you point closer to the wind');
  const open=()=>-5;                                                           // open deep water everywhere
  const run=(dir,secs,sail)=>{const s=Sl.newShip(0,0,0);s.sail=sail==null?1:sail;for(let i=0;i<secs*20;i++)Sl.step(s,{},.05,{wind:W(dir),H:open});return s};
  const beam=run(Math.PI/2,30),behind=run(0,30),into=run(Math.PI,30);
  ok(beam.v>11&&beam.v<=C.sailing.vmax+.01,`beam reach reaches ~full speed (${beam.v.toFixed(1)} m/s)`);
  ok(behind.v>6&&behind.v<beam.v,`running before the wind is slower (${behind.v.toFixed(1)} m/s)`);
  ok(into.v<.5,`sailing straight into the wind goes nowhere (${into.v.toFixed(2)} m/s)`);
  ok(run(Math.PI/2,30,0).v<.2,'sails furled = stopped');
  ok(run(Math.PI/2,30,.5).v<beam.v*.6,'half sail is slower than full sail');
  const calm=Sl.newShip(0,0,0);calm.sail=1;for(let i=0;i<600;i++)Sl.step(calm,{},.05,{wind:W(Math.PI/2,1),H:open});
  const gale=Sl.newShip(0,0,0);gale.sail=1;for(let i=0;i<600;i++)Sl.step(gale,{},.05,{wind:W(Math.PI/2,1.6),H:open});
  ok(gale.v>calm.v||calm.v>=C.sailing.vmax*.99,'a stronger wind drives the ship harder (until the speed cap)');
  // steering needs way on
  const turn=(v0)=>{const s=Sl.newShip(0,0,0);s.v=v0;s.sail=0;const w=W(0,0);for(let i=0;i<60;i++)Sl.step(s,{rud:1},.05,{wind:w,H:open});return Math.abs(s.h)};
  ok(turn(8)>turn(0)*2.5&&turn(0)>.05,`a moving ship turns much faster than one at rest (${turn(8).toFixed(2)} vs ${turn(0).toFixed(2)} rad in 3 s)`);
  const trim=Sl.newShip(0,0,0);trim.sail=.2;for(let i=0;i<40;i++)Sl.step(trim,{trim:1},.05,{wind:W(1),H:open});ok(trim.sail>.45&&trim.sail<=1,'trim input opens the sails over time');
  for(let i=0;i<400;i++)Sl.step(trim,{trim:1},.05,{wind:W(1),H:open});ok(trim.sail===1,'trim is clamped at 1');
  // wind is deterministic and slow
  const w1=Sl.wind(1000,1.2,0),w2=Sl.wind(1000,1.2,0),w3=Sl.wind(1000,1.2,1),w4=Sl.wind(1030,1.2,0);
  ok(w1.dir===w2.dir&&w1.s===w2.s,'wind is deterministic for the same time + room seed (both players agree)');
  ok(w3.s>w1.s,'storms strengthen the wind');ok(Math.abs(Sl.wrap(w4.dir-w1.dir))<.5,'wind direction veers slowly (30 s -> less than 0.5 rad)');
  // shore: land beyond z=100
  const land=(x,z)=>z>100?2:-5;
  const s=Sl.newShip(0,60,0);s.sail=1;for(let i=0;i<800;i++)Sl.step(s,{},.05,{wind:W(0),H:land});
  ok(s.z<100-s.p.probe[0][1]+.01&&Sl.clear(s.x,s.z,s.h,land),`the hull never enters the shallows (stopped at z=${s.z.toFixed(1)}, bow probe 11.7 m ahead)`);
  ok(s.hull<C.hull,`a hard grounding damages the hull (${s.hull.toFixed(0)}/${C.hull})`);
  const hit=Sl.newShip(0,60,0);hit.sail=1;hit.v=10;let bump=0;for(let i=0;i<200;i++)bump=Math.max(bump,Sl.step(hit,{},.05,{wind:W(0),H:land}));ok(bump>4,'impact speed is reported');
  // slide along a diagonal-ish shore: heading at 45 degrees to a wall at z=100
  const sl=Sl.newShip(0,70,Math.PI/4);sl.sail=1;sl.v=8;let x0=sl.x;for(let i=0;i<120;i++)Sl.step(sl,{},.05,{wind:W(Math.PI/4),H:land});
  ok(sl.x>x0+5,'hitting the shore at an angle slides along it instead of stopping dead');
  const nearShore=Sl.newShip(0,86,0);for(let i=0;i<100;i++)Sl.step(nearShore,{rud:1},.05,{wind:W(0),H:land});ok(Sl.clear(nearShore.x,nearShore.z,nearShore.h,land),'cannot swing the stern onto the shore');
  const dead=Sl.newShip(0,60,0);dead.hull=3;dead.sail=1;dead.v=12;for(let i=0;i<100;i++)Sl.step(dead,{},.05,{wind:W(0),H:land});ok(dead.hull>=0,'hull never goes below 0');
  const tw=Sl.toWorld({x:10,z:5,h:Math.PI/2},0,3,{}),back=Sl.toShip({x:10,z:5,h:Math.PI/2},tw.x,tw.z,{});
  ok(Math.abs(tw.x-13)<1e-9&&Math.abs(tw.z-5)<1e-9&&Math.abs(back.z-3)<1e-9&&Math.abs(back.x)<1e-9,'ship-space <-> world transforms are inverses (bow points along the heading)');
}
// ---------- 2. harbor geometry on the REAL terrain ----------
A.Ship.build();B.Ship.build();
const SA=A.Ship,SB=B.Ship,SS=A.Ship._s,V=SA.vessel(),Dk=A.Decks;
{
  ok(Sl.clear(D.ship.x,D.ship.z,D.ship.h,H,SA._ship.p.probe),'the big ship floats at its berth (all hull probes over deep enough water)');
  let blocked=0;for(let z=D.ship.z;z<D.ship.z+260;z+=3)if(!Sl.clear(D.ship.x,z,0,H,SA._ship.p.probe))blocked++;
  ok(blocked===0,'a straight run out to sea from the berth is clear');
  ok(H(D.x,D.z0-2)>.15&&H(D.x,D.z0-2)<.9,`the pier starts on the beach (terrain y=${H(D.x,D.z0-2).toFixed(2)} at its landward end)`);
  ok(H(D.x,D.z1)<-1.2,'the pier ends over water');
  let steps=[.3,.45,.6,.75,D.top];ok(steps.every((h,i)=>i===0||h-steps[i-1]<=.15+1e-9),'pier ramp rises in steps small enough to walk up (<= 0.15 m)');
  ok(V.hl>11&&V.hb>4.8,`the ship is big: ${(V.hl*2).toFixed(1)} m long x ${(V.hb*2).toFixed(1)} m wide (it was 13 x 5.5)`);
  const gap=(D.ship.x-V.hb)-(D.x+1.25);ok(gap>-.7&&gap<.4,`the hull sits ${gap.toFixed(2)} m off the pier: touching distance, so you just walk into the rail and climb`);
}
// ---------- 3. build, deck, boarding, carry (the controller's job is done by Decks.step in index.html: reproduced here) ----------
const tick=(n,dt)=>{dt=dt||.02;for(let i=0;i<n;i++){SA._step(dt);SB._step(dt)}};
const deckWorld=()=>SA._pose.y+C.cls[C.player].deckM;
const frame=(P,vx,vz,dt)=>{const px=P.S.x,pz=P.S.z;P.S.x+=vx*dt;P.S.z+=vz*dt;let gY=(Math.abs(P.S.x-D.x)<1.65&&P.S.z>D.z0&&P.S.z<D.z1)?D.top:-1;   // the pier is ground (a solids circle in the game)
  const g=P.Decks.step(P.S,px,pz,{dt,grounded:P.S.grounded,moving:Math.hypot(vx,vz)>.05,flying:false});if(g>gY)gY=g;
  P.S.vy=(P.S.vy||0)-(P.S.vy<0?33:25)*dt;P.S.y+=P.S.vy*dt;if(P.S.y<=gY||(P.S.grounded&&P.S.vy<=0&&P.S.y-gY<.35)){P.S.y=gY;P.S.vy=0;P.S.grounded=true}else P.S.grounded=false};
const walk=(P,vx,vz,secs)=>{for(let i=0;i<secs*50;i++){tick(1);frame(P,vx,vz,.02)}};
{
  ok(A.Decks.get('ship')===V.deck&&!!V.deck,'the ship registers one real walkable deck (not circles)');
  ok(A.solids.filter(s=>s.pier).length>=14,'the pier is registered as walkable solids');
  tick(5);ok(Math.abs(deckWorld()-D.top)<.2,`the main deck sits level with the pier (deck y=${deckWorld().toFixed(2)}, pier ${D.top})`);
  A.S.x=D.x;A.S.z=D.z0+5;A.S.y=D.top;A.S.flying=false;A.S.grounded=true;A.S.vy=0;A.S._dk=null;tick(3);walk(A,0,0,.3);
  ok(SA._onDeck()===false,'standing on the pier is not "on the ship"');
  // walk from the pier straight into the ship's side rail: climb it, drop onto the deck
  A.S.z=D.ship.z+1;A.S.x=D.x;walk(A,0,0,.2);walk(A,4,0,3);
  ok(SA._onDeck()===true&&Math.abs(A.S.y-D.top)<.5,`walking from the pier over the rail puts you on the deck (y=${A.S.y.toFixed(2)})`);
  ok(A.S._dk&&A.S._dk.id==='ship','the ship is carrying you');
  A.S.x=D.ship.x+40;A.S.z=D.ship.z+40;A.S.y=-1;A.S._dk=null;SA._board();tick(2);
  const lb=A.Decks.toLocal(V.deck,A.S.x,A.S.y,A.S.z,{});ok(SA._onDeck()===true&&Math.abs(lb.y-C.cls[C.player].deckM)<.1,'"Board the ship" from the water puts you on the main deck');
}
// ---------- 4. take the helm (raised stern deck), sail, carry ----------
{
  SB._board();tick(2);
  // B stands on the main deck; A walks UP THE STAIRS to the wheel and takes the helm
  const hp=SA._helmPos();ok(hp.y>deckWorld()+.6,`the helm is on the raised stern deck (${(hp.y-deckWorld()).toFixed(1)} m above the main deck)`);
  A.S._dk=null;SA._board();tick(2);
  // the walker follows Decks.route (the same breadth-first walking rules the pirate crews will use) from midships to the wheel
  {const l0=A.Decks.toLocal(V.deck,A.S.x,A.S.y,A.S.z,{}),hl0=SS.role?null:Sl.toShip(SA._pose,SA._helmPos().x,SA._helmPos().z,{}),path=A.Decks.route(V.deck,l0.x,l0.z,A.SHIP.stations.helm[0],A.SHIP.stations.helm[1]);
   ok(!!path&&path.length>5,'Decks.route finds a way on foot from the main deck up the stairs to the wheel ('+(path?path.length:0)+' waypoints)');
   let wi=0;for(let i=0;i<4000&&path&&wi<path.length;i++){tick(1);const l=A.Decks.toLocal(V.deck,A.S.x,A.S.y,A.S.z,{}),tg=path[wi],L=Math.hypot(tg.x-l.x,tg.z-l.z);if(L<.35){wi++;continue}
     const w=Sl.toWorld(SA._pose,tg.x,tg.z,{}),wx=w.x-A.S.x,wz=w.z-A.S.z,wl=Math.hypot(wx,wz);frame(A,wx/wl*4,wz/wl*4,.02)}}
  walk(A,0,0,.5);const hl=A.Decks.toLocal(V.deck,A.S.x,A.S.y,A.S.z,{});
  ok(hl.y>C.cls[C.player].deckM+.9,`walked up the stairs: feet ${(hl.y-C.cls[C.player].deckM).toFixed(1)} m above the main deck, standing on the stern deck (not inside it)`);
  SA._claim('helm');
  ok(SS.role==='helm'&&SS.host==='a'&&SA._s.crew.helm==='a','claiming the helm makes you the host and the helmsman');
  tick(3);ok(SB._s.crew.helm==='a'&&SB._s.host==='a','the other player sees who is at the helm');
  A.Ship._raw.x=0;A.Ship._raw.y=-1;                                      // stick forward = open the sails
  const x0=SA._ship.x,z0=SA._ship.z;tick(500);
  const moved=Math.hypot(SA._ship.x-x0,SA._ship.z-z0);
  ok(SA._ship.sail>.9,`stick forward trims the sails fully open (${SA._ship.sail.toFixed(2)})`);
  const w=SA._wind(),beta=Math.abs(A.Sailing.wrap(w.dir-SA._ship.h));
  ok(moved>0||A.Sailing.eff(beta)<.3,`the ship ${moved>3?'sailed '+moved.toFixed(0)+' m':'is in irons for this wind angle'}`);
  const hp2=SA._helmPos();ok(Math.hypot(A.S.x-hp2.x,A.S.z-hp2.z)<.25,'the helmsman stays pinned to the wheel while the ship moves');
  // B stands on the deck: carried with the ship by the controller hook
  const lB=A.Decks.toLocal(V.deck,B.S.x,B.S.y,B.S.z,{});
  const bx=B.S.x,bz=B.S.z;SA._ship.v=6;SA._ship.sail=1;const pre={x:SA._ship.x,z:SA._ship.z};
  for(let i=0;i<100;i++){SA._ship.v=6;tick(1)}
  const d=Math.hypot(SA._ship.x-pre.x,SA._ship.z-pre.z);ok(d>8,`ship moved ${d.toFixed(1)} m`);
  // guest mirror
  tick(20);const err=Math.hypot(SB._ship.x-SA._ship.x,SB._ship.z-SA._ship.z);
  ok(err<2.5,`guest sees the ship where the host has it (error ${err.toFixed(2)} m while moving)`);
  ok(Math.abs(SB._ship.sail-SA._ship.sail)<.05&&SB._ship.hull===SA._ship.hull,'sail trim and hull are mirrored to the guest');
}
// ---------- 5. seats ----------
{
  SB._claim('helm');ok(SB._s.role===null,'the second player cannot take a helm that is occupied');
  SA._release();tick(3);ok(SA._s.role===null&&SA._s.crew.helm===null&&SB._s.crew.helm===null,'leaving the helm frees it for both');
  const s0=SA._ship.sail;SA._ship.v=8;tick(500);ok(SA._ship.sail<s0,'an unmanned ship furls its sails');
  SB._claim('helm');tick(10);ok(SB._s.role==='helm'&&SA._s.crew.helm==='b','the guest can take the helm when it is free');
  const h0=SA._ship.h;SA._ship.v=8;SA._ship.sail=1;B.Ship._raw.x=1;B.Ship._raw.y=-1;
  for(let i=0;i<150;i++){SA._ship.v=8;tick(1)}
  ok(Math.abs(A.Sailing.wrap(SA._ship.h-h0))>.3,`the guest's stick steers the host's ship (turned ${(A.Sailing.wrap(SA._ship.h-h0)).toFixed(2)} rad)`);
  ok(Math.abs(A.Sailing.wrap(SB._ship.h-SA._ship.h))<.25,'and the guest sees the turn');
  const hb=SB._helmPos();ok(Math.hypot(B.S.x-hb.x,B.S.z-hb.z)<.3,'the guest helmsman is pinned to the wheel');
  SB._release();tick(5);A.others.delete('b');B.others.delete('a');
  tick(3);ok(SB._s.host===null,'if the host leaves, the guest drops the dead host');
  SB._claim('helm');ok(SB._s.host==='b'&&SB._s.role==='helm','the remaining player becomes host by taking the helm');
  tick(20);ok(Number.isFinite(SB._ship.x)&&Number.isFinite(SB._ship.z),'ship state stays finite');
}
console.log(fails?`\n${fails} failure(s)`:'\nall ship checks passed');process.exit(fails?1:0);
