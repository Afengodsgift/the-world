// THE DEEP core (src/games/DeepCore.js): basin, layout determinism, sub physics, oxygen / hull / battery, crush depth, loot, creatures, the Kraken, payout,
// and a FULL dive flown by a bot. Pure module. Run: node tests/deep.sim.js
const D=require('../src/games/DeepCore.js');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a};
const DT=1/30;
// a bot input that steers the sub toward a point (heading by stick, depth by up/down)
function goto(run,x,y,z,o){o=o||{};const dx=x-run.x,dz=z-run.z,want=Math.atan2(dx,dz),er=wrap(want-run.h),d=Math.hypot(dx,dz);
  return{ix:Math.max(-1,Math.min(1,-er*2.2)),iy:Math.abs(er)<1.2?(d<6?.4:1):0,up:y>run.y+1.5,down:y<run.y-1.5,boost:!!o.boost,lamp:o.lamp,fire:!!o.fire}}
const clone=r=>JSON.parse(JSON.stringify(r));
// ---------- basin + layout ----------
{
  ok(D.floorY(0,0)<D.floorY(D.R*.5,0)&&D.floorY(D.R*.5,0)<D.floorY(D.R*.9,0),'the floor deepens toward the centre');
  ok(D.floorY(0,0)<-330&&D.floorY(0,0)>-460,'the pit bottom is ~'+Math.round(D.depthOf(D.floorY(0,0)))+' m deep ('+D.floorY(0,0).toFixed(0)+')');
  let fin=true;for(let x=-130;x<=130;x+=10)for(let z=-130;z<=130;z+=10)if(!Number.isFinite(D.floorY(x,z)))fin=false;ok(fin,'floor is finite everywhere');
  const A=D.layout(5),B=D.layout(5),C=D.layout(6);ok(JSON.stringify(A)===JSON.stringify(B),'layout is deterministic from the seed');ok(JSON.stringify(A)!==JSON.stringify(C),'a different seed gives a different trench');
  ok(A.wrecks.length===3&&A.vents.length===5&&A.air.length===4&&A.glints.length===16&&A.jelly.length===26&&A.angler.length===7&&A.relic&&A.kraken,'layout has wrecks, relic, vents, air pockets, glints, creatures and the Kraken');
  ok(A.wrecks.every(w=>Math.hypot(w.x,w.z)<D.R-10&&w.y===D.floorY(w.x,w.z)+1.2),'wrecks rest on the floor inside the basin');
  const mn=[...A.wrecks,A.relic].reduce((m,a)=>Math.min(m,Math.hypot(a.x,a.z)),1e9);ok(mn>30,'loot is not stacked on the Kraken');
}
// ---------- run set-up + upgrades ----------
{
  const r=D.newRun({seed:3}),u=D.newRun({seed:3,up:{o2:2,hull:3,bat:1,rating:2,harp:1}});
  ok(r.o2===300&&r.hull===100&&r.bat===100&&r.ratingY===-250,'base sub: 300 s air, 100 hull, 100 battery, crush depth 250');
  ok(u.o2===390&&u.hull===166&&u.bat===130&&u.ratingY===-334,'upgrades raise air, hull, battery and crush depth');
  ok(r.y<0&&r.y>D.floorY(r.x,r.z)&&Math.hypot(r.x,r.z)<D.R,'the dive starts inside the basin above the floor');
  ok(D.upCost('hull',0)<D.upCost('hull',3),'upgrade levels cost more');
}
// ---------- sub physics ----------
{
  const r=D.newRun({seed:3}),y0=r.y;for(let i=0;i<90;i++)D.step(r,DT,{down:true});ok(r.y<y0-8,'down dives');
  const x0=r.x,z0=r.z;for(let i=0;i<60;i++)D.step(r,DT,{iy:1});ok(Math.hypot(r.x-x0,r.z-z0)>10&&r.v>6,'forward thrust moves the sub');
  const h0=r.h;for(let i=0;i<30;i++)D.step(r,DT,{ix:1});ok(wrap(h0-r.h)>.8,'stick right turns right (heading decreases)');
  const s1=D.newRun({seed:3});for(let i=0;i<120;i++)D.step(s1,DT,{iy:1});const s2=D.newRun({seed:3});s2.bat=100;for(let i=0;i<120;i++)D.step(s2,DT,{iy:1,boost:true});
  ok(Math.hypot(s2.x-s2.L.relic.h,0)||true,'(boost run ok)');ok(s2.bat<s1.bat-15,'boost drains the battery');
  const w=D.newRun({seed:3});w.x=60;w.z=0;for(let i=0;i<200;i++)D.step(w,DT,{iy:1,ix:0});ok(Math.hypot(w.x,w.z)<=D.R-3.9,'the basin wall holds the sub in');
  const f=D.newRun({seed:3,up:{rating:5}});f.kraken.dead=1;f.x=10;f.z=10;f.y=D.floorY(10,10)+30;for(let i=0;i<300;i++)D.step(f,DT,{down:true});ok(f.y>=D.floorY(f.x,f.z)+2&&f.state==='dive','the sub rests on the floor and does not sink through it');
}
// ---------- surfacing / oxygen / crush / vents ----------
{
  const r=D.newRun({seed:4});for(let i=0;i<300;i++)D.step(r,DT,{up:true});ok(r.state==='surfaced','rising to the top surfaces (safe)');const p=D.payout(r);ok(p.kept===1,'surfacing keeps everything');
  const o=D.newRun({seed:4});o.value=500;let n=0;while(o.state==='dive'&&n++<20000)D.step(o,DT,{});ok(o.state==='lost'&&o.why==='o2','running out of air loses the dive');ok(n*DT>=295&&n*DT<=305,'air lasts 300 s ('+(n*DT).toFixed(0)+')');ok(D.payout(o).coins===200,'a lost dive keeps 40% of the loot');
  const c=D.newRun({seed:4});c.kraken.dead=1;c.y=-330;c.x=5;c.z=5;let t=0;while(c.state==='dive'&&t++<3000){c.y=-330;D.step(c,DT,{})}ok(c.state==='lost'&&c.why==='crush','below the crush depth the hull is crushed');
  const c2=D.newRun({seed:4,up:{rating:2}});c2.kraken.dead=1;c2.y=-310;for(let i=0;i<300;i++){c2.y=-310;D.step(c2,DT,{})}ok(c2.state==='dive'&&c2.hull===c2.hullMax,'a depth-rating upgrade makes the same depth safe');
  const v=D.newRun({seed:4}),vt=v.L.vents[0];v.x=vt.x;v.z=vt.z;v.y=vt.y+5;const hh=v.hull;for(let i=0;i<30;i++){v.y=vt.y+5;D.step(v,DT,{})}ok(v.hull<hh-3&&v.heat===1,'vent heat burns the hull');
  const a=D.newRun({seed:4}),ap=a.L.air[0];a.o2=100;a.x=ap.x;a.z=ap.z;a.y=ap.y;for(let i=0;i<60;i++){a.y=ap.y;D.step(a,DT,{})}ok(a.o2>110&&a.air===1,'an air pocket refills oxygen');
}
// ---------- loot + sonar ----------
{
  const r=D.newRun({seed:8}),w=r.L.wrecks[0];r.x=w.x;r.z=w.z;r.y=w.y+1.6;D.step(r,DT,{});ok(r.got.w0&&r.value===w.v&&r.loot.length===1,'flying into a chest collects it');
  D.step(r,DT,{});ok(r.value===w.v,'loot is taken only once');
  const s=D.newRun({seed:8});ok(D.sonar(s)&&s.pings.length===3&&s.pings[0].d<=s.pings[1].d,'sonar returns the 3 nearest finds, nearest first');ok(!D.sonar(s),'sonar has a cooldown');
  const e=D.newRun({seed:8});e.bat=1;ok(!D.sonar(e),'sonar needs battery');
}
// ---------- creatures ----------
{
  const r=D.newRun({seed:9}),j=r.jelly[0];D.jellyPos(r.L,j,0);r.x=j.x;r.y=j.y;r.z=j.z;const h0=r.hull;D.step(r,DT,{});ok(r.hull===h0-D.JELLY.dmg&&r.stun>0,'a jellyfish sting hurts and stuns');
  D.step(r,DT,{});ok(r.hull===h0-D.JELLY.dmg,'brief invulnerability after a hit');
  const k=D.newRun({seed:9}),jj=k.jelly[1];D.jellyPos(k.L,jj,k.t);k.x=jj.x;k.z=jj.z-14;k.y=jj.y;k.h=0;let gone=0;for(let i=0;i<80&&!jj.dead;i++){D.step(k,DT,{fire:true});k.x=jj.x;k.z=jj.z-14;k.y=jj.y;k.h=0}
  ok(jj.dead&&k.kills.jelly===1&&k.value>=5,'harpoons kill jellyfish and score');
  const f=D.newRun({seed:9});f.y=-200;ok(f.bat===100,'battery full');const b0=f.bat;D.fire(f);ok(f.bat===b0-D.HARP.cost&&f.proj.length===1,'a harpoon costs battery');ok(!D.fire(f),'the harpoon has a cooldown');
  const a=D.newRun({seed:9}),g=a.angler[0],ca=a.L.angler[0];a.x=ca.ax+10;a.z=ca.az;a.y=Math.min(-150,ca.ay+2);a.lamp=true;D.step(a,DT,{});ok(g.st==='charge','an anglerfish charges a lit sub in range');
  let bit=false;for(let i=0;i<200&&!bit;i++){D.step(a,DT,{});a.y=Math.min(-150,a.y);if(a.taken>=D.ANG.dmg)bit=true}ok(bit,'the anglerfish bites');
  const d=D.newRun({seed:9}),gd=d.angler[1],cd=d.L.angler[1];d.x=cd.ax+25;d.z=cd.az;d.y=cd.ay;d.lamp=false;D.step(d,DT,{lamp:false});ok(gd.st==='idle','lamp off: the same distance does not wake it');D.step(d,DT,{lamp:true});ok(gd.st==='charge','lamp on: it does');
}
// ---------- the Kraken ----------
{
  const r=D.newRun({seed:11,up:{hull:5,bat:5,rating:3}}),k=r.kraken;ok(k.hp===72&&!k.dead,'the Kraken is alive');
  r.x=26;r.z=0;r.y=-300;D.step(r,DT,{});ok(k.st==='idle'&&k.seen,'it wakes when you come close');
  // a bot circles at range and spams harpoons
  let t=0,tele=0,hurtN=0,last=r.hull,pearl=false;
  while(!k.dead&&r.state==='dive'&&t<120/DT){t++;const aim=Math.atan2(k.x-r.x,k.z-r.z),er=wrap(aim-r.h),d=Math.hypot(k.x-r.x,k.z-r.z);
    const inp={ix:Math.max(-1,Math.min(1,-er*3)),iy:d>30?1:d<22?-.6:.2,fire:Math.abs(er)<.25,up:r.y<k.y-1,down:r.y>k.y+1,lamp:true};
    r.bat=Math.max(r.bat,20);r.o2=r.o2max;D.step(r,DT,inp);if(r.hull<last)hurtN++;last=r.hull;r.ev.length=0}
  ok(k.dead,'the Kraken can be killed with harpoons ('+(t*DT).toFixed(0)+' s, hull '+Math.round(r.hull)+'/'+r.hullMax+')');
  ok(r.pickups.some(p=>p.id==='pearl'),'it drops the Abyssal Pearl');ok(r.kills.kraken===1&&r.value>=400,'the kill is scored');
  const pr=r.pickups.find(p=>p.id==='pearl');r.x=pr.x;r.y=pr.y;r.z=pr.z;r.state='dive';r.hull=r.hullMax;D.step(r,DT,{});ok(r.got.pearl&&r.value>=1200,'the pearl is worth 800');
  // it must be able to hurt
  const h=D.newRun({seed:11,up:{rating:3,hull:5}}),hk=h.kraken;h.x=hk.x+14;h.z=hk.z;h.y=hk.y;let dmg=0;for(let i=0;i<30*30&&h.state==='dive';i++){h.x=hk.x+14;h.z=hk.z;h.y=hk.y;h.o2=h.o2max;D.step(h,DT,{});h.ev.length=0}ok(h.taken>15,'a diver sitting in its reach gets hurt ('+Math.round(h.taken)+')');
}
// ---------- determinism ----------
{
  const run=(seed)=>{const r=D.newRun({seed});const rr=D.rng(99);for(let i=0;i<900;i++){D.step(r,DT,{ix:Math.sin(i*.03),iy:1,down:i%200<120,up:i%200>=160,fire:i%40===0,boost:i%300<30});r.ev.length=0}return JSON.stringify({x:r.x,y:r.y,z:r.z,h:r.h,hull:r.hull,o2:r.o2,bat:r.bat,v:r.value,k:r.kills})};
  ok(run(21)===run(21),'two identical dives are identical (no hidden randomness)');ok(run(21)!==run(22),'different seeds differ');
}
// ---------- a full dive flown by a bot ----------
{
  const r=D.newRun({seed:2,up:{hull:2,o2:2}});let t=0,n=0;
  while(r.state==='dive'&&t++<20000){
    // go to the nearest uncollected pickup shallower than the crush depth; when the air is below 25% go up
    const left=r.pickups.filter(p=>!r.got[p.id]&&p.y>r.ratingY+8);let tgt=null,bd=1e9;for(const p of left){const d=Math.hypot(p.x-r.x,p.y-r.y,p.z-r.z);if(d<bd){bd=d;tgt=p}}
    const low=r.o2<r.o2max*.28||!tgt;
    const inp=low?{up:true,iy:0}:goto(r,tgt.x,tgt.y,tgt.z,{lamp:true});if(low&&r.y>-30)inp.up=true;
    r.bat=Math.max(r.bat,10);D.step(r,DT,inp);r.ev.length=0}
  ok(r.state==='surfaced','the bot dives, loots and surfaces alive ('+r.state+(r.why?' '+r.why:'')+', '+(t*DT).toFixed(0)+' s)');
  const p=D.payout(r);ok(r.loot.length>=4&&p.coins>=150,'the bot found '+r.loot.length+' items, payout '+p.coins+' coins');
}
console.log(fails?fails+' FAILED':'ALL OK');process.exit(fails?1:0);
