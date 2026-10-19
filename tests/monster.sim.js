// The kraken: spawning, tentacle attack cycle (windup -> slam -> stuck -> back), damage to you and the ship, cannon + cutlass damage, severing + regrowth, death + loot, guest mirroring.
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','A','KRK-1'),B=client('b','B','KRK-1');A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;
A.Ship.build();A.Fleet.build();A.Monster.build();B.Ship.build();B.Fleet.build();B.Monster.build();
const M=A.Monster,v=A.Ship.vessel(),d=v.deck,D=A.Decks,S=A.S,C=A.SHIP;
const hostA=A.Fleet.isHost();console.log('  (A is host:',hostA,')');
const [H,G]=hostA?[A,B]:[B,A],MH=H.Monster;
// put the player on the deck, ship afloat in open water
H.Ship._ship.x=0;H.Ship._ship.z=-300;H.Ship._ship.v=0;H.Ship._ship.sail=0;H.Ship._step(.05);const sp=H.Ship.vessel().pose;
const HS=H.S;D.pin&&H.Decks.pin(HS,H.Ship.vessel().deck,0,2);HS.grounded=true;
H.Ship._s.host=H.ctx.myId;const k=MH.spawn(sp.x+24,sp.z);ok(!!k&&MH.get()===k,'the kraken spawns');
const tick=(secs,dt)=>{dt=dt||.05;for(let i=0;i<secs/dt;i++){H.Ship._step(dt);MH.step(dt);G.Ship._step(dt);G.Monster.step(dt)}};
tick(1);ok(k.rise>0,'it rises out of the water');
// the attack cycle
const seen=new Set();let slams=0;const hp0=H.Fleet._me.hp,hull0=H.Ship._ship.hull;
for(let i=0;i<700;i++){H.Ship._step(.05);MH.step(.05);for(const t of k.ten)seen.add(t.st);if(H.Fleet._me.hp<hp0&&!slams)slams=1;
  if(i%20===0){H.Decks.pin(HS,H.Ship.vessel().deck,0,2)}}                    // keep standing still on the same spot
ok(seen.has(MH.ST.WIND)&&seen.has(MH.ST.SLAM)&&seen.has(MH.ST.STUCK)&&seen.has(MH.ST.BACK),'tentacles wind up, slam, hold on and let go again');
ok(H.Fleet._me.hp<hp0,'a slam hurts the player standing under it ('+hp0+' -> '+H.Fleet._me.hp+')');
ok(H.Ship._ship.hull<hull0,'a tentacle that lands on the deck damages the ship ('+hull0+' -> '+H.Ship._ship.hull+')');
ok(k.ten.filter(t=>t.st===MH.ST.WIND||t.st===MH.ST.SLAM||t.st===MH.ST.STUCK).length<=3,'at most three tentacles attack at once');
// cannon balls
const hp=MH.get(),hx=hp.x,hz=hp.z;let hy=0;{const a=MH.curve(hp,hp.ten[0]);hy=1.2}
const h0=hp.hp;const r=MH.shellHit({x:hx,y:C.sea+1.4,z:hz,dmg:24,f:0});ok(r&&r.id==='m'&&hp.hp<h0,'a ball in the head hurts it a lot ('+h0+' -> '+hp.hp+')');
const t0=hp.ten[2];const pts=MH.curve(hp,t0);const q=pts[5];const th=t0.hp;const r2=MH.shellHit({x:q.x,y:q.y,z:q.z,dmg:24,f:0});ok(r2&&t0.hp<th,'a ball through a tentacle hurts that tentacle ('+th+' -> '+t0.hp+')');
ok(MH.shellHit({x:500,y:5,z:500,dmg:24})===null,'balls that miss do nothing');
// sever + regrow
MH.damage(2,999);ok(t0.st===MH.ST.SEV,'enough damage severs a tentacle');
for(let i=0;i<20*30;i++)MH.step(.05);ok(t0.st!==MH.ST.SEV&&t0.hp>0,'...and it regrows while the head lives');
// melee target: a stuck tentacle on the deck can be hit
const t1=hp.ten[1];t1.st=MH.ST.STUCK;t1.px=HS.x+1;t1.py=HS.y;t1.pz=HS.z;const mt=MH.meleeTarget(HS.x,HS.y,HS.z,3.8);ok(mt&&mt.part===1,'a tentacle stuck beside you is in sword reach');
t1.st=MH.ST.IDLE;ok(MH.meleeTarget(HS.x,HS.y,HS.z,3.8)===null,'a waving tentacle is not (you cannot slash air)');
// guest mirror
const snap=MH.snapshot();G.Monster.onNet({k:'mb',id:hp.id,x:hp.x,z:hp.z});G.Monster.onNet({k:'mo',a:snap});for(let i=0;i<40;i++)G.Monster.step(.05);
const gm=G.Monster.get();ok(gm&&Math.abs(gm.x-hp.x)<2&&gm.hp===Math.round(hp.hp),'a guest mirrors the monster from the snapshot');
// kill
MH.damage('h',99999);ok(hp.dead,'head down = the kraken dies');
for(let i=0;i<20*9;i++)MH.step(.05);ok(MH.get()===null,'the carcass sinks and is removed');
process.exit(fails?1:0);
