// Car-to-car collisions (CarPhysics.collide): separation, momentum, mass, remote ghosts, flying, determinism. Pure module. Run: node tests/rally_cars.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const ctx={Math,Object,Number,JSON,Array,isFinite};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(R+'src/data/rally.js','utf8')+fs.readFileSync(R+'src/race/CarPhysics.js','utf8')+';this.RALLY=RALLY;this.CP=CarPhysics;',ctx);
const {RALLY:RL,CP}=ctx;
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const flat={ground:()=>0},DT=1/60;
const car=(x,z,h,v,cls)=>{const c=CP.newCar(x,z,h,cls||'ace',flat);c.vx=Math.sin(h)*v;c.vz=Math.cos(h)*v;c.s=v;return c};
const sep=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
// ---- no contact
{const a=car(0,0,0,30),b=car(0,10,0,30);ok(CP.collide(a,b)===0&&a.z===0&&b.z===10,'cars 10 m apart do not touch');
 const c=car(0,0,0,30),d=car(0,0,0,30);d.y=6;ok(CP.collide(c,d)===0,'a flying car 6 m above passes over');}
// ---- rear-end shunt: the faster car behind
{const a=car(0,0,0,40),b=car(0,3,0,20);const imp=CP.collide(a,b);
 ok(imp>15,'a rear-end shunt reports the closing speed ('+imp.toFixed(1)+' m/s)');
 ok(sep(a,b)>=CP.CR*2-1e-6,'overlap is resolved');
 ok(b.vz>20&&a.vz<40,'the shunted car speeds up, the shunter loses speed');
 ok(b.vz-a.vz>=-1e-6,'they are not still closing afterwards');
 const ek0=.5*(40*40+20*20);const ek1=.5*(a.vx**2+a.vz**2+b.vx**2+b.vz**2);ok(ek1<ek0,'no free energy ('+ek0.toFixed(0)+' -> '+ek1.toFixed(0)+')');}
// ---- mass: bruiser vs comet
{const a=car(0,0,0,30,'bruiser'),b=car(0,3,Math.PI,30,'comet');CP.collide(a,b);
 ok(Math.abs(a.vz-30)<Math.abs(b.vz+30),'the heavy Bruiser is deflected less than the light Comet in a head-on');
 const c=car(0,0,0,30,'bruiser'),d=car(0,3,0,10,'comet'),e=car(0,0,0,30,'comet'),f=car(0,3,0,10,'bruiser');CP.collide(c,d);CP.collide(e,f);
 ok(d.vz>f.vz,'a Bruiser shoves a Comet harder than a Comet shoves a Bruiser');}
// ---- remote ghost: only the local car moves, and applying it on both phones separates exactly once
{const a=car(0,0,0,35),g=car(0,3,0,20);const gz=g.z,gv=g.vz;CP.collide(a,g,{moveB:false});
 ok(g.z===gz&&g.vz===gv,'a remote ghost is untouched by our phone');
 const l=car(0,0,0,35),r=car(0,3,0,20),l2=car(0,0,0,35),r2=car(0,3,0,20);
 CP.collide(l,r);CP.collide(l2,r2,{moveB:false});   // phone 1 moves A only; phone 2 (not simulated here) moves B only
 CP.collide(r2,l2,{moveA:true,moveB:false});
 ok(Math.abs(l2.z-l.z)<1e-6&&sep(l2,r2)>=0,'half-and-half application matches the full resolution for our own car');}
// ---- side swipe keeps both going
{const a=car(-1.5,0,0,35),b=car(1.5,2,0,35);const imp=CP.collide(a,b);
 ok(a.vz>30&&b.vz>30,'a side swipe scrubs a little speed but nobody stops ('+a.vz.toFixed(1)+','+b.vz.toFixed(1)+')');}
// ---- exactly overlapping
{const a=car(5,5,.5,10),b=car(5,5,.5,10);CP.collide(a,b);ok(isFinite(a.x+b.x+a.z+b.z)&&sep(a,b)>1,'two cars on the same spot are pushed apart (no NaN)');}
// ---- stacking: a long drive-in never tunnels or jitters infinitely
{const a=car(0,0,0,45),b=car(0,20,0,10);let hits=0,max=0;
 for(let i=0;i<600;i++){const inp1={thr:1,steer:0},inp2={thr:.3,steer:0};CP.step(a,inp1,DT,flat);CP.step(b,inp2,DT,flat);const imp=CP.collide(a,b);if(imp>2)hits++;max=Math.max(max,imp);if(sep(a,b)<CP.CR*2-1e-3)ok(false,'overlap persisted at step '+i)}
 ok(hits>=1&&hits<30,'a catch-up shunt is a few distinct bumps, not endless jitter ('+hits+' contacts)');ok(b.vz>=a.vz-4,'afterwards they travel together-ish ('+a.vz.toFixed(1)+' / '+b.vz.toFixed(1)+')');}
// ---- fuzz: random pairs stay finite and never end overlapping
{let bad=0,over=0,seed=5;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(let n=0;n<4000;n++){const a=car(0,0,rnd()*6.28,rnd()*50,['ace','comet','bruiser'][n%3]),b=car((rnd()-.5)*6,(rnd()-.5)*6,rnd()*6.28,rnd()*50,['ace','comet','bruiser'][(n+1)%3]);CP.collide(a,b);
  if(![a.x,a.z,a.vx,a.vz,b.x,b.z,b.vx,b.vz].every(isFinite))bad++;if(sep(a,b)<CP.CR*2-1e-3)over++}
 ok(bad===0&&over===0,'4000 random contacts: finite and fully separated');}
console.log(fails?`\n${fails} FAILED`:'\nall ok');process.exit(fails?1:0);
