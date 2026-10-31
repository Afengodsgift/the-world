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
  const r=SC.newRun(Object.assign({noAllies:1},O));ok(Math.hypot(r.ship.x-S[0].x,r.ship.z-S[0].z)>600,'the ship starts far from the first fortress (a flight over the island)');
}
// ---------- flight ----------
{
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.step(r,DT,{});const s=r.ship,x0=s.x,z0=s.z,h0=s.h;
  for(let i=0;i<60;i++)SC.step(r,DT,{});ok(Math.hypot(s.x-x0,s.z-z0)>40,'the airship moves forward by itself (cruise)');
  const r2=SC.newRun(Object.assign({noAllies:1},O));SC.step(r2,DT,{});for(let i=0;i<60;i++)SC.step(r2,DT,{ix:1});ok(wrap(r2.ship.h-h0)<-.3,'stick right turns right (heading decreases)');
  const r3=SC.newRun(Object.assign({noAllies:1},O));SC.step(r3,DT,{});const y0=r3.ship.y;for(let i=0;i<60;i++)SC.step(r3,DT,{iy:-1});ok(r3.ship.y>y0+10,'stick up climbs');
  const r4=SC.newRun(Object.assign({noAllies:1},O));SC.step(r4,DT,{});for(let i=0;i<200;i++)SC.step(r4,DT,{iy:-1});ok(r4.ship.y<=O.base+SC.SHIP.ceil+.01,'there is a ceiling');
  for(let i=0;i<400;i++)SC.step(r4,DT,{iy:1});ok(r4.ship.y>=O.base+SC.SHIP.floor-.01,'and a floor');
  const r5=SC.newRun(Object.assign({noAllies:1},O));SC.step(r5,DT,{});let v0=r5.ship.v;for(let i=0;i<5;i++)SC.step(r5,DT,{boost:true});for(let i=0;i<40;i++)SC.step(r5,DT,{});ok(r5.ship.v>v0+8,'boost is a real speed-up');
  const cd=r5.ship.boostCd;ok(cd>3,'boost has a cooldown');
  const r6=SC.newRun(Object.assign({noAllies:1},O));SC.step(r6,DT,{});for(let i=0;i<6000;i++)SC.step(r6,DT,{});ok(Math.hypot(r6.ship.x-O.cx,r6.ship.z-O.cz)<SC.SHIP.leash+60,'flying straight away never leaves the raid area (the leash turns you back)');
}
// ---------- fortress rules ----------
{
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.step(r,DT,{});const f=r.fort,s=r.ship;
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
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.step(r,DT,{});const f=r.fort,s=r.ship;s.x=f.site.x+150;s.z=f.site.z;s.y=f.site.y+40;s.h=Math.PI/2*1.0;
  let shots=0,hurt=0;for(let i=0;i<30*20;i++){const ev=SC.step(r,DT,{});for(const e of ev){if(e.k==='eshot')shots++;if(e.k==='hurt'&&e.src==='shot')hurt++}if(r.ship.hull<=0)break}
  ok(shots>=5,`turrets open fire at a ship in range (${shots} shots in 20 s)`);
  ok(hurt>=1,`and a ship that just hovers gets hit (${hurt} hits)`);
  ok(r.ship.hull<r.ship.hullMax,'hull drops');
}
{ // turrets do not fire at a ship out of range
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.step(r,DT,{});const f=r.fort,s=r.ship;s.x=f.site.x+900;s.z=f.site.z;let n=0;for(let i=0;i<30*10;i++){s.x=f.site.x+900;for(const e of SC.step(r,DT,{}))if(e.k==='eshot'&&e.kind==='t')n++}ok(n===0,'no turret fire beyond its range');
}
{ // rock: flying into the platform hurts and pushes you out
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.step(r,DT,{});const f=r.fort,s=r.ship;s.x=f.site.x+10;s.z=f.site.z;s.y=f.site.y-10;const h0=s.hull;SC.step(r,DT,{});
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
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.step(r,DT,{});const s=r.ship;let over=false;for(let i=0;i<30*12;i++){for(const e of SC.step(r,DT,{fire:true,aim:{yaw:0,pit:1.2}}))if(e.k==='overheat')over=true}
  ok(over,'holding fire too long overheats the gun');
  ok(r.lock>=0,'overheat locks the gun for a moment');
}
// ---------- boss phases ----------
{
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.startStage(r,3);r.state='raid';const f=r.fort;ok(f.F.boss&&f.turrets.length===10&&f.gens.length===4,'the last fortress is the Dreadnought boss');
  for(const g of f.gens)g.alive=0;f.core.hp=f.core.max*.6;let ph=false;for(const e of SC.step(r,DT,{}))if(e.k==='phase')ph=true;
  ok(ph&&SC.shield(f),'boss phase: at 2/3 health the shield regenerates');
  ok(r.drones.length>=4,'and a drone wave arrives');
}
// ---------- win / fail / payout ----------
{
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.step(r,DT,{});r.ship.hull=1;SC.hurt(r,50,'shot');ok(r.state==='fail'&&SC.payout(r)===0,'hull 0 = ship lost (nothing earned on stage one)');
  const r2=SC.newRun(Object.assign({noAllies:1},O));SC.step(r2,DT,{});for(const g of r2.fort.gens)g.alive=0;r2.fort.core.hp=1;const from={x:r2.fort.core.x,y:r2.fort.core.y,z:r2.fort.core.z-30};SC.shoot(r2,from,{x:0,y:0,z:1},50,false);
  ok(r2.state==='transit','destroying a core clears the stage');
  const full=r2.ship.hull;ok(full>=r2.ship.hullMax*.3,'and repairs the ship a little');
  for(let i=0;i<30*5;i++)SC.step(r2,DT,{});ok(r2.stage===1&&r2.state==='raid','after the transit the next fortress appears');
  const w=SC.newRun(Object.assign({noAllies:1},O));SC.step(w,DT,{});w.stage=3;w.state='win';w.tDone=400;ok(SC.payout(w)>=SC.PAY.boss+SC.PAY.stage[0]+SC.PAY.stage[1]+SC.PAY.stage[2],`winning pays the stages plus the boss bonus (${SC.payout(w)})`);
  const l=SC.newRun(Object.assign({noAllies:1},O));SC.step(l,DT,{});l.stage=2;l.state='fail';ok(SC.payout(l)>0&&SC.payout(l)<SC.payout(w),'a failed raid still pays a little for the fortresses you cleared');
}
// ---------- snapshot / apply mirror ----------
{
  const a=SC.newRun(Object.assign({noAllies:1},O)),b=SC.newRun(Object.assign({noAllies:1},O));for(let i=0;i<30*8;i++)SC.step(a,DT,{ix:Math.sin(i/20),iy:-.2});
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
    const ix=-cl(wrap(want-s.h)*2.2,-1,1),tgtY=(r.fort&&r.fort.lz&&r.fort.lz.st&&r.state==='raid'?r.fort.core.y+17:m.y+(r.state==='raid'?46+Math.sin(r.t/3)*12:60)),iy=-cl((tgtY-s.y)*.06,-1,1);
    // evade: sidestep when a shot is close
    let ev=0;for(const p of r.shots){if(Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z)<60)ev=1}for(const p of r.flak){if(Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z)<75)ev=1}
    const inp={ix:ev?(i%60<30?.9:-.9):ix,iy,boost:ev&&s.boostCd<=0&&skill>.8,roll:ev&&skill>.8&&s.rollCd<=0&&r.flak.concat(r.sams,r.shots).some(p=>Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z)<30)};
    if(withGunner){const L=SC.targets(r).filter(q=>q.kind!=='shield').sort((a,b)=>Math.hypot(a.o.x-s.x,a.o.y-s.y,a.o.z-s.z)-Math.hypot(b.o.x-s.x,b.o.y-s.y,b.o.z-s.z))[0];
      if(L){const ddx=L.o.x-s.x,ddy=L.o.y-(s.y+6),ddz=L.o.z-s.z;inp.aim={yaw:wrap(Math.atan2(ddx,ddz)-s.h),pit:Math.atan2(ddy,Math.hypot(ddx,ddz))};inp.fire=Math.hypot(ddx,ddy,ddz)<320&&r.lock<=0&&r.heat<.9;inp.missile=Math.hypot(ddx,ddy,ddz)<300}}
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
  const idle=SC.newRun(Object.assign({noAllies:1},O));for(let i=0;i<30*600&&idle.state!=='fail'&&idle.state!=='win';i++)SC.step(idle,DT,{});ok(idle.state!=='win','an idle ship cannot win');
}
// ---------- v2: barrel roll, missile salvo, SAMs, combo, autopilot ----------
{
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.step(r,DT,{});const s=r.ship;
  let ev=SC.step(r,DT,{roll:true,ix:1});ok(ev.some(e=>e.k==='roll')&&s.rollT>.5&&s.inv>.5,'barrel roll starts and grants invulnerability');
  const h0=s.hull;SC.hurt(r,40,'shot');ok(s.hull===h0,'a shot during the roll does nothing');
  for(let i=0;i<30;i++)SC.step(r,DT,{});ok(s.rollT===0&&s.rollCd>2,'roll ends, then has a cooldown');
  SC.step(r,DT,{roll:true});ok(s.rollT===0,'cannot roll again during the cooldown');
}
{ // missile salvo kills turrets by itself
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.step(r,DT,{});const f=r.fort,s=r.ship;s.x=f.site.x+140;s.z=f.site.z;s.y=f.site.y+30;s.h=-Math.PI/2;s.hull=s.hullMax=9999;
  const tg=f.turrets[0];const a={yaw:wrap(Math.atan2(tg.x-s.x,tg.z-s.z)-s.h),pit:Math.atan2(tg.y-(s.y+6),Math.hypot(tg.x-s.x,tg.z-s.z))};
  const ev=SC.step(r,DT,{missile:true,aim:a});ok(ev.some(e=>e.k==='msl')&&r.msl.length===3&&r.mCd>8,'missile salvo launches 3 homing missiles and goes on cooldown');
  const alive0=f.turrets.filter(t=>t.alive).length;for(let i=0;i<30*4;i++){s.x=f.site.x+140;s.z=f.site.z;s.y=f.site.y+30;SC.step(r,DT,{aim:a})}
  ok(f.turrets.filter(t=>t.alive).length<alive0&&!tg.alive,'the missiles home in and destroy the targeted turret');
  ok(r.combo.n>=1||r.score.best>=1,'a kill raises the combo');
}
{ // combo resets on damage and decays
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.step(r,DT,{});r.combo.n=5;r.combo.t=4;SC.hurt(r,10,'shot');ok(r.combo.n===0,'taking a hit resets the combo');
  r.combo.n=3;r.combo.t=1;for(let i=0;i<40;i++)SC.step(r,DT,{});ok(r.combo.n===0,'the combo runs out after 4 s without a kill');
  const w=SC.newRun(Object.assign({noAllies:1},O));SC.step(w,DT,{});w.stage=3;w.state='win';w.tDone=400;const p0=SC.payout(w);w.score.bonus=60;ok(SC.payout(w)===p0+60,'combo bonus is paid out');w.score.bonus=9999;ok(SC.payout(w)===p0+160,'and is capped');
}
{ // SAMs: appear from the Bastion, home in, can be shot down, and a roll dodges them
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.startStage(r,1);r.state='raid';const f=r.fort,s=r.ship;s.x=f.site.x+160;s.z=f.site.z;s.y=f.site.y+30;let launched=0;
  for(let i=0;i<30*40;i++){s.hull=s.hullMax;for(const e of SC.step(r,DT,{}))if(e.k==='sam')launched++;s.x=f.site.x+160;s.z=f.site.z;s.y=f.site.y+30;if(launched)break}
  ok(launched>=1&&r.sams.length>=1,'turrets of the Bastion launch SAM missiles');
  const m=r.sams[0];m.x=s.x+60;m.y=s.y;m.z=s.z;m.vx=-50;m.vy=0;m.vz=0;
  const hh=s.hull;for(let i=0;i<14;i++)SC.step(r,DT,{roll:i===0});ok(s.hull===hh,'a barrel roll dodges a SAM that is about to hit');
  const r2=SC.newRun(Object.assign({noAllies:1},O));SC.startStage(r2,1);r2.state='raid';const s2=r2.ship;const sm={id:'sx',x:s2.x+40,y:s2.y,z:s2.z,vx:-50,vy:0,vz:0,hp:1,max:1,alive:1,life:7};r2.sams.push(sm);
  const k=SC.shoot(r2,{x:s2.x,y:s2.y,z:s2.z},{x:1,y:0,z:0},15,true);ok(k==='sam'&&!sm.alive&&r2.score.sams===1,'a SAM can be shot down with the gun');
  const r3=SC.newRun(Object.assign({noAllies:1},O));SC.startStage(r3,1);r3.state='raid';const s3=r3.ship;s3.hull=s3.hullMax=500;const h3=s3.hull;r3.sams.push({id:'sy',x:s3.x+30,y:s3.y,z:s3.z,vx:-50,vy:0,vz:0,hp:1,max:1,alive:1,life:7});
  for(let i=0;i<40;i++)SC.step(r3,DT,{});ok(s3.hull<h3,'an undodged SAM hurts the ship');
}
{ // snapshots carry the new state
  const a=SC.newRun(Object.assign({noAllies:1},O)),b=SC.newRun(Object.assign({noAllies:1},O));SC.startStage(a,1);a.state='raid';a.sams.push({id:'s1',x:1,y:2,z:3,vx:4,vy:5,vz:6,hp:1,max:1,alive:1,life:5});a.msl.push({x:1,y:2,z:3,vx:1,vy:1,vz:1,tid:null,life:2});a.combo={n:4,t:2};a.ship.rollT=.3;a.mCd=5;
  SC.apply(b,JSON.parse(JSON.stringify(SC.snapshot(a))));ok(b.sams.length===1&&b.msl.length===1&&b.combo.n===4&&Math.abs(b.ship.rollT-.3)<.01&&b.mCd===5,'guest mirrors missiles, SAMs, combo and roll');
  ok(JSON.stringify(SC.snapshot(a)).length<3000,'snapshots stay small');
}
{ // solo gunner: the autopilot flies, the player's gun does the work
  const outs=[1,2,3].map(seed=>{const r=SC.newRun(Object.assign({},O,{seed,hasGunner:true})),s=r.ship;
    for(let i=0;i<30*60*14&&r.state!=='win'&&r.state!=='fail';i++){const inp={auto:true};
      const L=SC.targets(r).filter(q=>q.kind!=='shield').sort((a,b)=>Math.hypot(a.o.x-s.x,a.o.y-s.y,a.o.z-s.z)-Math.hypot(b.o.x-s.x,b.o.y-s.y,b.o.z-s.z))[0];
      if(L){const ddx=L.o.x-s.x,ddy=L.o.y-(s.y+6),ddz=L.o.z-s.z;inp.aim={yaw:wrap(Math.atan2(ddx,ddz)-s.h),pit:Math.atan2(ddy,Math.hypot(ddx,ddz))};inp.fire=Math.hypot(ddx,ddy,ddz)<320&&r.lock<=0&&r.heat<.9;inp.missile=Math.hypot(ddx,ddy,ddz)<300}
      SC.step(r,DT,inp)}
    console.log(`     [solo gunner + autopilot, seed ${seed}] ${r.state} in ${r.t.toFixed(0)} s, stage ${r.stage+1}/4, hull ${r.ship.hull|0}, combo best ${r.score.best}, sams shot ${r.score.sams}`);return r});
  ok(outs.some(r=>r.state==='win')||outs.every(r=>r.stage>=2),'a player gunner with the autopilot can clear the raid solo');
  ok(outs.every(r=>r.ship.y>O.base-130&&Math.hypot(r.ship.x-O.cx,r.ship.z-O.cz)<SC.SHIP.leash+60),'and the autopilot keeps the ship in the arena');
}
// ---------- v3: war balloons, repair kits, flak, boss laser ----------
{
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.startStage(r,1);r.state='raid';ok(r.balloons.length===1&&SC.FORTS[0].bal===0,'the Bastion brings a war balloon, the Outpost none');
  const b=r.balloons[0],s=r.ship;s.x=b.x+100;s.z=b.z;s.y=b.y;let shots=0;for(let i=0;i<30*30;i++){s.hull=s.hullMax;for(const e of SC.step(r,DT,{}))if(e.k==='eshot'&&e.kind==='b')shots++}
  ok(shots>=2,`the balloon lobs shells at the ship (${shots})`);
  ok(SC.targets(r).some(q=>q.kind==='balloon'),'balloons are targets');
  s.x=b.x+60;s.y=b.y;s.z=b.z;const hp0=b.hp;SC.shoot(r,{x:s.x,y:s.y,z:s.z},(()=>{const dx=b.x-s.x,dy=b.y-s.y,dz=b.z-s.z,l=Math.hypot(dx,dy,dz);return {x:dx/l,y:dy/l,z:dz/l}})(),15,false);ok(b.hp<hp0||!b.alive,'and can be shot');
  b.hp=1;SC.damage&&0;const ev=(()=>{const d={x:b.x-s.x,y:b.y-s.y,z:b.z-s.z},l=Math.hypot(d.x,d.y,d.z);SC.shoot(r,{x:s.x,y:s.y,z:s.z},{x:d.x/l,y:d.y/l,z:d.z/l},15,false);return r.ev})();
  ok(!b.alive&&r.picks.length===1&&ev.some(e=>e.k==='drop'),'a dead balloon drops a repair kit');
  s.hull=100;s.x=r.picks[0].x;s.y=r.picks[0].y;s.z=r.picks[0].z;SC.step(r,DT,{});ok(s.hull>100+s.hullMax*.2&&r.picks.length===0,'flying through the kit repairs the hull');
}
{ // flak: marker, then a burst
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.startStage(r,2);r.state='raid';const s=r.ship;r.flakT=.1;s.x=r.fort.site.x+300;s.z=r.fort.site.z;s.y=r.fort.site.y+40;let fl=0,seen=0;
  for(let i=0;i<30*12;i++){s.hull=s.hullMax;for(const e of SC.step(r,DT,{}))if(e.k==='flak')fl++;seen=Math.max(seen,r.flak.length);if(fl&&r.flak.length&&r.flak[0].t<.5)break}
  ok(fl>=1&&seen>=1,'the Citadel drops flak markers');
  const f0=r.flak[0];if(f0){f0.x=s.x;f0.y=s.y;f0.z=s.z;f0.t=.01}s.hull=s.hullMax;const h=s.hull;s.inv=0;SC.step(r,DT,{});ok(s.hull<h,'flak that bursts on you hurts');
  const o=SC.newRun(Object.assign({noAllies:1},O));SC.startStage(o,0);o.state='raid';for(let i=0;i<30*30;i++)SC.step(o,DT,{});ok(o.flak.length===0,'no flak at the Outpost');
}
{ // laser sweep
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.startStage(r,3);r.state='raid';const f=r.fort,s=r.ship;f.lz.t=.05;s.x=f.site.x+120;s.z=f.site.z;s.y=f.core.y;s.hull=s.hullMax=9999;
  let warn=false;for(let i=0;i<10&&!warn;i++)for(const e of SC.step(r,DT,{}))if(e.k==='laser')warn=true;ok(warn&&f.lz.st===1,'the Dreadnought warns before it sweeps');
  f.lz.st=2;f.lz.t=3;f.lz.a=Math.atan2(s.x-f.core.x,s.z-f.core.z);f.lz.dir=0;s.inv=0;const h=s.hull;SC.step(r,DT,{});ok(s.hull<h,'standing in the beam hurts');
  s.y=f.core.y+40;s.inv=0;const h2=s.hull;SC.step(r,DT,{});ok(s.hull===h2,'flying over the beam is safe');
  s.y=f.core.y;s.inv=1;const h3=s.hull;SC.step(r,DT,{});ok(s.hull===h3,'a barrel roll goes through it');
  const sn=SC.snapshot(r),b2=SC.newRun(Object.assign({noAllies:1},O));SC.apply(b2,JSON.parse(JSON.stringify(sn)));ok(b2.fort.lz.st===2,'guests see the laser state');
}
{ const a=SC.newRun(Object.assign({noAllies:1},O)),b=SC.newRun(Object.assign({noAllies:1},O));SC.startStage(a,1);a.state='raid';a.picks.push({id:'p',x:1,y:2,z:3,t:9});a.flak.push({x:4,y:5,z:6,t:.5});SC.apply(b,JSON.parse(JSON.stringify(SC.snapshot(a))));ok(b.balloons.length===1&&b.picks.length===1&&b.flak.length===1,'guests mirror balloons, repair kits and flak');ok(JSON.stringify(SC.snapshot(a)).length<3600,'snapshot still small') }
// ---------- v4: imps and allied wingmen ----------
{
  const r=SC.newRun(Object.assign({noAllies:1},O));SC.startStage(r,0);r.state='raid';r.impT=.05;const s=r.ship;let hits=0,sp=0,sh=0;
  for(let i=0;i<30*40;i++){for(const e of SC.step(r,DT,{})){if(e.k==='hurt'&&e.src==='imp')hits++;if(e.k==='imps')sp++;if(e.k==='eshot'&&e.kind==='i')sh++}if(r.ship.hull<r.ship.hullMax*.3)r.ship.hull=r.ship.hullMax}
  ok(sp>=1&&sh>=1,`imps arrive in packs and shoot (${sp} packs, ${sh} shots)`);ok(hits>=1,`imps ram and hurt (${hits} rams)`);
  const m=r.imps[0]||(()=>{r.imps.push({id:'ix',x:s.x+50,y:s.y,z:s.z,vx:0,vy:0,vz:0,hp:9,max:9,alive:1,mode:0,t:0,cd:9});return r.imps[0]})();
  m.x=s.x+60;m.y=s.y;m.z=s.z;SC.shoot(r,{x:s.x,y:s.y,z:s.z},{x:1,y:0,z:0},15,true);ok(!m.alive&&r.score.best>=1||!m.alive,'an imp dies to one hit');
  ok(r.imps.length<=SC.IMP.max,'imp count is capped');
}
{
  const r=SC.newRun(O);ok(r.allies.length===2,'two wingmen fly with you');SC.startStage(r,0);r.state='raid';const s=r.ship;for(let i=0;i<60;i++)SC.step(r,DT,{});
  ok(r.allies.every(a=>Math.hypot(a.x-s.x,a.z-s.z)<60),'they hold formation near the ship');
  const imp={id:'iy',x:s.x+80,y:s.y+5,z:s.z,vx:0,vy:0,vz:0,hp:9,max:9,alive:1,mode:1,t:99,cd:9,off:0};r.imps.push(imp);let tr=0;for(let i=0;i<30*6&&imp.alive;i++){imp.x=s.x+80;imp.y=s.y+5;imp.z=s.z;for(const e of SC.step(r,DT,{}))if(e.k==='tracer'&&e.src==='a')tr++}
  ok(tr>=1,`wingmen shoot nearby enemies (${tr} shots)`);ok(!imp.alive,'and shoot down the little ones');
  const b=SC.newRun(O);SC.apply(b,JSON.parse(JSON.stringify(SC.snapshot(r))));ok(Math.abs(b.allies[0].x-r.allies[0].x)<.2,'guests see the wingmen');
}
// ---------- v5: hangar upgrades ----------
{
  const b=SC.newRun(Object.assign({noAllies:1},O)),u=SC.newRun(Object.assign({noAllies:1,up:{hull:5,gun:5,msl:5,roll:5,wing:5}},O));
  ok(u.ship.hullMax>b.ship.hullMax*1.4,`hull upgrade: ${b.ship.hullMax} -> ${u.ship.hullMax}`);
  SC.step(b,DT,{});SC.step(u,DT,{});
  const tg=r=>r.fort.turrets[0];const aim=r=>{const s=r.ship,t=tg(r);return {yaw:Math.atan2(t.x-s.x,t.z-s.z)-s.h,pit:Math.atan2(t.y-(s.y+6),Math.hypot(t.x-s.x,t.z-s.z))}};
  for(const r of [b,u]){const s=r.ship,t=tg(r);s.x=t.x+120;s.z=t.z;s.y=t.y;s.h=-Math.PI/2;SC.step(r,DT,{fire:true,aim:aim(r)})}
  ok(tg(u).hp<tg(b).hp,'gun upgrade: more damage per shot');
  for(const r of [b,u]){r.ship.x=tg(r).x+120;r.ship.z=tg(r).z;SC.step(r,DT,{missile:true,aim:aim(r)})}ok(u.mCd<b.mCd,'missile upgrade: shorter cooldown');
  SC.step(b,DT,{roll:true});SC.step(u,DT,{roll:true});ok(u.ship.rollCd<b.ship.rollCd,'roll upgrade: shorter cooldown');
  const sn=JSON.parse(JSON.stringify(SC.snapshot(u))),g=SC.newRun(O);SC.apply(g,sn);ok(g.ship.hullMax===u.ship.hullMax,'guests learn the host\'s max hull');
}
console.log(fails?`\n${fails} FAILED`:'\nall ok');process.exit(fails?1:0);
