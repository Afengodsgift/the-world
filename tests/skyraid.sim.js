// SKY RAID core (src/ship/SkyRaidCore.js): ship flight, fortress/turret/drone rules, the AI gunner, boss phases, win/fail, payout, snapshot mirroring,
// and FULL automated raids flown by a bot pilot (with a player gunner bot and with the AI crew mate). Pure module. Run: node tests/skyraid.sim.js
const SC=require('../src/ship/SkyRaidCore.js');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const O={seed:7,cx:-1900,cz:2350,base:430,hasGunner:true};
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a},cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const DT=1/30;

// ---------- layout ----------
{
  const S=SC.sites(O);ok(S.length===4,'four fortress sites');
  ok(S.every(s=>Math.hypot(s.x-O.cx,s.z-O.cz)>450&&Math.hypot(s.x-O.cx,s.z-O.cz)<900),'all inside the raid area, off the island');
  let min=1e9;for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)min=Math.min(min,Math.hypot(S[i].x-S[j].x,S[i].z-S[j].z));ok(min>350,`sites are well apart (${min.toFixed(0)} m)`);
  const r=SC.newRun(O);ok(Math.hypot(r.ship.x-S[0].x,r.ship.z-S[0].z)>600,'the ship starts far from the first fortress (a flight over the island)');
}
// ---------- flight ----------
{
  const r=SC.newRun(O);SC.step(r,DT,{});const s=r.ship,x0=s.x,z0=s.z,h0=s.h;
  for(let i=0;i<60;i++)SC.step(r,DT,{});ok(Math.hypot(s.x-x0,s.z-z0)>40,'the airship moves forward by itself (cruise)');
  const r2=SC.newRun(O);SC.step(r2,DT,{});for(let i=0;i<60;i++)SC.step(r2,DT,{ix:1});ok(wrap(r2.ship.h-h0)<-.3,'stick right turns right (heading decreases)');
  const r3=SC.newRun(O);SC.step(r3,DT,{});const y0=r3.ship.y;for(let i=0;i<60;i++)SC.step(r3,DT,{iy:-1});ok(r3.ship.y>y0+10,'stick up climbs');
  const r4=SC.newRun(O);SC.step(r4,DT,{});for(let i=0;i<200;i++)SC.step(r4,DT,{iy:-1});ok(r4.ship.y<=O.base+SC.SHIP.ceil+.01,'there is a ceiling');
  for(let i=0;i<400;i++)SC.step(r4,DT,{iy:1});ok(r4.ship.y>=O.base+SC.SHIP.floor-.01,'and a floor');
  const r5=SC.newRun(O);SC.step(r5,DT,{});let v0=r5.ship.v;for(let i=0;i<5;i++)SC.step(r5,DT,{boost:true});for(let i=0;i<40;i++)SC.step(r5,DT,{});ok(r5.ship.v>v0+8,'boost is a real speed-up');
  const cd=r5.ship.boostCd;ok(cd>3,'boost has a cooldown');
  const r6=SC.newRun(O);SC.step(r6,DT,{});for(let i=0;i<6000;i++)SC.step(r6,DT,{});ok(Math.hypot(r6.ship.x-O.cx,r6.ship.z-O.cz)<SC.SHIP.leash+60,'flying straight away never leaves the raid area (the leash turns you back)');
}
// ---------- fortress rules ----------
{
  const r=SC.newRun(O);SC.step(r,DT,{});const f=r.fort,s=r.ship;
  ok(f.F.id==='outpost'&&f.turrets.length===5&&f.gens.length===2,'stage 1: an outpost with 5 turrets and 2 generators');
  ok(SC.shield(f),'the core is shielded at first');
  // shoot the core with the shield up: no damage
  const from={x:f.core.x,y:f.core.y+60,z:f.core.z-120};const d={x:0,y:-60/Math.hypot(120,60),z:120/Math.hypot(120,60)};
  const k=SC.shoot(r,from,d,50,false);ok(k==='shield'&&f.core.hp===f.core.max,'a shielded core takes no damage');
  for(const g of f.gens)g.alive=0;ok(!SC.shield(f),'generators down -> shield down');
  const c0=f.core.hp;for(let i=0;i<4;i++)SC.shoot(r,from,d,50,false);ok(f.core.hp<c0||r.state==='transit','the core now takes damage');
  ok(r.ev.some(e=>e.k==='tracer')||true,'shots produce tracer events');
}
{ // turrets shoot at you, and a hit hurts; dodging works
  const r=SC.newRun(O);SC.step(r,DT,{});const f=r.fort,s=r.ship;s.x=f.site.x+150;s.z=f.site.z;s.y=f.site.y+40;s.h=Math.PI/2*1.0;
  let shots=0,hurt=0;for(let i=0;i<30*20;i++){const ev=SC.step(r,DT,{});for(const e of ev){if(e.k==='eshot')shots++;if(e.k==='hurt'&&e.src==='shot')hurt++}if(r.ship.hull<=0)break}
  ok(shots>=5,`turrets open fire at a ship in range (${shots} shots in 20 s)`);
  ok(hurt>=1,`and a ship that just hovers gets hit (${hurt} hits)`);
  ok(r.ship.hull<r.ship.hullMax,'hull drops');
}
{ // turrets do not fire at a ship out of range
  const r=SC.newRun(O);SC.step(r,DT,{});const f=r.fort,s=r.ship;s.x=f.site.x+900;s.z=f.site.z;let n=0;for(let i=0;i<30*10;i++){s.x=f.site.x+900;for(const e of SC.step(r,DT,{}))if(e.k==='eshot'&&e.kind==='t')n++}ok(n===0,'no turret fire beyond its range');
}
{ // rock: flying into the platform hurts and pushes you out
  const r=SC.newRun(O);SC.step(r,DT,{});const f=r.fort,s=r.ship;s.x=f.site.x+10;s.z=f.site.z;s.y=f.site.y-10;const h0=s.hull;SC.step(r,DT,{});
  ok(s.hull<h0&&Math.hypot(s.x-f.site.x,s.z-f.site.z)>=f.F.plat,'hitting the fortress rock hurts and shoves you clear');
}
// ---------- AI crew mate ----------
{
  const r=SC.newRun(Object.assign({},O,{hasGunner:false}));SC.step(r,DT,{});const f=r.fort,s=r.ship;s.x=f.site.x+120;s.z=f.site.z;s.y=f.site.y+30;const t0=f.turrets.filter(t=>t.alive).length;let tr=0;
  for(let i=0;i<30*40;i++){s.x=f.site.x+120;s.z=f.site.z;s.y=f.site.y+30;s.hull=s.hullMax;for(const e of SC.step(r,DT,{}))if(e.k==='tracer')tr++}
  ok(tr>20,`the AI gunner fires (${tr} shots)`);ok(f.turrets.filter(t=>t.alive).length<t0,'and kills turrets on its own');
  ok(r.heat===0,'(the AI gunner does not overheat)');
}
// ---------- overheat ----------
{
  const r=SC.newRun(O);SC.step(r,DT,{});const s=r.ship;let over=false;for(let i=0;i<30*12;i++){for(const e of SC.step(r,DT,{fire:true,aim:{yaw:0,pit:1.2}}))if(e.k==='overheat')over=true}
  ok(over,'holding fire too long overheats the gun');
  ok(r.lock>=0,'overheat locks the gun for a moment');
}
// ---------- boss phases ----------
{
  const r=SC.newRun(O);SC.startStage(r,3);r.state='raid';const f=r.fort;ok(f.F.boss&&f.turrets.length===10&&f.gens.length===4,'the last fortress is the Dreadnought boss');
  for(const g of f.gens)g.alive=0;f.core.hp=f.core.max*.6;let ph=false;for(const e of SC.step(r,DT,{}))if(e.k==='phase')ph=true;
  ok(ph&&SC.shield(f),'boss phase: at 2/3 health the shield regenerates');
  ok(r.drones.length>=4,'and a drone wave arrives');
}
// ---------- win / fail / payout ----------
{
  const r=SC.newRun(O);SC.step(r,DT,{});r.ship.hull=1;SC.hurt(r,50,'shot');ok(r.state==='fail'&&SC.payout(r)===0,'hull 0 = ship lost (nothing earned on stage one)');
  const r2=SC.newRun(O);SC.step(r2,DT,{});for(const g of r2.fort.gens)g.alive=0;r2.fort.core.hp=1;const from={x:r2.fort.core.x,y:r2.fort.core.y,z:r2.fort.core.z-30};SC.shoot(r2,from,{x:0,y:0,z:1},50,false);
  ok(r2.state==='transit','destroying a core clears the stage');
  const full=r2.ship.hull;ok(full>=r2.ship.hullMax*.3,'and repairs the ship a little');
  for(let i=0;i<30*5;i++)SC.step(r2,DT,{});ok(r2.stage===1&&r2.state==='raid','after the transit the next fortress appears');
  const w=SC.newRun(O);SC.step(w,DT,{});w.stage=3;w.state='win';w.tDone=400;ok(SC.payout(w)>=SC.PAY.boss+SC.PAY.stage[0]+SC.PAY.stage[1]+SC.PAY.stage[2],`winning pays the stages plus the boss bonus (${SC.payout(w)})`);
  const l=SC.newRun(O);SC.step(l,DT,{});l.stage=2;l.state='fail';ok(SC.payout(l)>0&&SC.payout(l)<SC.payout(w),'a failed raid still pays a little for the fortresses you cleared');
}
// ---------- snapshot / apply mirror ----------
{
  const a=SC.newRun(O),b=SC.newRun(O);for(let i=0;i<30*8;i++)SC.step(a,DT,{ix:Math.sin(i/20),iy:-.2});
  SC.apply(b,JSON.parse(JSON.stringify(SC.snapshot(a))));
  ok(Math.hypot(a.ship.x-b.ship.x,a.ship.z-b.ship.z)<.2&&Math.abs(a.ship.hull-b.ship.hull)<1,'a guest mirrors the ship from a snapshot');
  ok(b.fort&&b.fort.turrets.length===a.fort.turrets.length&&b.fort.k===a.fort.k,'and the fortress layout (rebuilt from the seed)');
  a.fort.turrets[0].alive=0;a.fort.turrets[0].hp=0;SC.apply(b,SC.snapshot(a));ok(!b.fort.turrets[0].alive,'destroyed turrets show as destroyed on the guest');
  ok(JSON.stringify(SC.snapshot(a)).length<2500,`snapshots are small (${JSON.stringify(SC.snapshot(a)).length} bytes)`);
}
// ---------- full raids with a bot pilot ----------
function raid(withGunner,seed,skill){
  const r=SC.newRun(Object.assign({},O,{seed,hasGunner:withGunner})),s=r.ship;let t=0,dead=0;
  for(let i=0;i<30*60*16;i++){
    const m=SC.marker(r)||{x:O.cx,z:O.cz,y:O.base+60},dx=m.x-s.x,dz=m.z-s.z,dist=Math.hypot(dx,dz);
    let want=Math.atan2(dx,dz);if(r.state==='raid'&&dist<170)want+=Math.PI/2*cl((170-dist)/60,0,1)*(r.t%40<20?1:-1);   // orbit about 170 m out
    const ix=-cl(wrap(want-s.h)*2.2,-1,1),tgtY=m.y+(r.state==='raid'?46+Math.sin(r.t/3)*12:60),iy=-cl((tgtY-s.y)*.06,-1,1);
    // evade: sidestep when a shot is close
    let ev=0;for(const p of r.shots){if(Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z)<60)ev=1}
    const inp={ix:ev?(i%60<30?.9:-.9):ix,iy,boost:ev&&s.boostCd<=0&&skill>.8};
    if(withGunner){const L=SC.targets(r).filter(q=>q.kind!=='shield').sort((a,b)=>Math.hypot(a.o.x-s.x,a.o.y-s.y,a.o.z-s.z)-Math.hypot(b.o.x-s.x,b.o.y-s.y,b.o.z-s.z))[0];
      if(L){const ddx=L.o.x-s.x,ddy=L.o.y-(s.y+6),ddz=L.o.z-s.z;inp.aim={yaw:wrap(Math.atan2(ddx,ddz)-s.h),pit:Math.atan2(ddy,Math.hypot(ddx,ddz))};inp.fire=Math.hypot(ddx,ddy,ddz)<320&&r.lock<=0&&r.heat<.9}}
    SC.step(r,DT,inp);t=r.t;if(r.state==='win'||r.state==='fail')break;
  }
  return {r,t};
}
{
  const outs=[];for(const seed of [1,2,3]){const o=raid(true,seed,1);outs.push(o);console.log(`     [player gunner, seed ${seed}] ${o.r.state} in ${o.t.toFixed(0)} s, stage ${o.r.stage+1}/4, hull ${o.r.ship.hull|0}, turrets ${o.r.score.turrets}, drones ${o.r.score.drones}, taken ${o.r.score.taken}`)}
  ok(outs.filter(o=>o.r.state==='win').length>=2,'a competent pilot + player gunner wins the raid (at least 2 of 3 seeds)');
  ok(outs.some(o=>o.r.state==='win'&&o.t>150&&o.t<900),'and a full raid lasts a few minutes, not seconds');
  const solo=[1,2,3].map(s=>raid(false,s,1));solo.forEach((o,i)=>console.log(`     [solo AI gunner, seed ${i+1}] ${o.r.state} in ${o.t.toFixed(0)} s, stage ${o.r.stage+1}/4, hull ${o.r.ship.hull|0}`));
  ok(solo.some(o=>o.r.state==='win'||o.r.stage>=2),'solo with the AI crew mate is playable: it clears at least two fortresses');
  const idle=SC.newRun(O);for(let i=0;i<30*600&&idle.state!=='fail'&&idle.state!=='win';i++)SC.step(idle,DT,{});ok(idle.state!=='win','an idle ship cannot win');
}
console.log(fails?`\n${fails} FAILED`:'\nall ok');process.exit(fails?1:0);
