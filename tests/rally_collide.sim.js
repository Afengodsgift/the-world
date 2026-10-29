// Skybreak Rally collisions: solid scenery (the game's own `solids` circles) and terrain barriers (steep mountain flanks, the sea edge) against the real
// CarPhysics + Track.block. Pure modules. Run: node tests/rally_collide.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const ctx={Math,Object,Number,JSON,Array,isFinite,Map,Float32Array};vm.createContext(ctx);
vm.runInContext(['src/data/rally.js','src/race/CarPhysics.js','src/race/Track.js'].map(f=>fs.readFileSync(R+f,'utf8')).join('\n')+';this.RL=RALLY;this.CP=CarPhysics;this.Tk=Track',ctx);
const {RL,CP,Tk}=ctx;
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const DT=1/60;
// a minimal track 300 m from the scenarios (solids further than 420 m from any road are ignored), so there is never a road deck under them
const DEF={id:'t',name:'t',roads:[{id:'r',o:[-60,-300],w:16,pts:[[0,0],[100,0]]}],gates:[{road:'r',p:0},{road:'r',p:1,finish:true}]};
function world(Hf,solids){const T=Tk.build(DEF,{H:Hf});T.setSolids(solids||[]);return {T,env:{ground:T.ground,surf:T.surf,landOK:T.landOK,block:T.block}}}
function drive(w,c,inp,secs,each){const n=Math.round(secs*60);for(let i=0;i<n;i++){const ev=CP.step(c,typeof inp==='function'?inp(i*DT,c):inp,DT,w.env);if(each)each(c,i,ev)}return c}
const flat=()=>0;

// ---------- solid scenery ----------
{
  const w=world(flat,[{x:0,z:60,r:2}]),c=CP.newCar(0,0,0,'ace',w.env);let zmax=0,bumped=0;
  drive(w,c,{thr:1},6,(c,i,ev)=>{zmax=Math.max(zmax,c.z);bumped=Math.max(bumped,ev.bump)});
  ok(zmax<60-2-1.6+.4,`a boulder (r 2) stops the car head-on: front of the car never passes it (max z ${zmax.toFixed(2)}, boulder face at ${(60-2-1.6).toFixed(1)})`);
  ok(bumped>20,`the impact is reported for effects / sound (${bumped.toFixed(0)} m/s)`);
  // persistent shaking / jitter while pressing into it
  let jit=0,prev=null,pv=null;const d=CP.newCar(0,0,0,'ace',w.env);drive(w,d,{thr:1},7,(c,i)=>{if(i>360&&prev&&pv){const ax=(c.x-prev.x)-(prev.x-pv.x),az=(c.z-prev.z)-(prev.z-pv.z);jit=Math.max(jit,Math.hypot(ax,az))}pv=prev;prev={x:c.x,z:c.z}});
  ok(jit<.06,`pressing into the boulder for 1+ s after impact does not jitter (largest frame-to-frame jerk ${jit.toFixed(3)} m)`);
  // not stuck forever: reverse out, steer around
  const e=CP.newCar(0,0,0,'ace',w.env);drive(w,e,{thr:1},4,null);const zc=e.z;drive(w,e,{thr:-1},2,null);ok(e.z<zc-4,'reversing away from the obstacle works');
  const f=CP.newCar(0,0,0,'ace',w.env);drive(w,f,(t,c)=>{const hT=c.z<68?Math.max(-.5,Math.min(.5,(6-c.x)*.15)):Math.max(-.5,Math.min(.5,-c.x*.1));return {thr:1,steer:Math.max(-1,Math.min(1,(hT-c.h)*3))}},9,null);ok(f.z>85,`a car that steers round it carries on past (z ${f.z.toFixed(0)})`);
  // a trapped car is rescued by the existing recovery rule
  const g=CP.newCar(0,0,0,'ace',w.env),r=Tk.racer();r.lostT=-1e9;let why=null;   // (lostT parked so the 5 s "far from any road" timer cannot fire first on this dummy track)
  drive(w,g,{thr:1},9,(c)=>{if(!why)why=Tk.needsRecovery(w.T,r,c,DT)});ok(why==='stuck','a car pinned against a boulder is flagged "stuck" for recovery (no permanent trap)');
}
{ // a thin trunk at the highest speed: no tunnelling
  const w=world(flat,[{x:0,z:50,r:.3}]);let passed=0;
  for(const cls of ['ace','comet','bruiser']){const c=CP.newCar(0,0,0,cls,w.env);c.vz=RL.cls[cls].vmax;let zm=0;drive(w,c,{thr:1,boost:true},3,(c)=>{zm=Math.max(zm,c.z)});if(zm>50)passed++}
  ok(passed===0,'a 0.3 m palm trunk stops every class even boosting at full speed (no tunnelling)');
}
{ // low platform: blocked from the ground, driven over from above; moving platforms never block
  const w=world(flat,[{x:0,z:40,r:3,h:2.5}]),c=CP.newCar(0,0,0,'ace',w.env);let zm=0;drive(w,c,{thr:1},5,(c)=>{zm=Math.max(zm,c.z)});ok(zm<40,'a solid with a top height blocks a car on the ground');
  const w2=world(()=>6,[{x:0,z:40,r:3,h:2.5}]),d=CP.newCar(0,0,0,'ace',w2.env);let zm2=0;drive(w2,d,{thr:1},5,(c)=>{zm2=Math.max(zm2,c.z)});ok(zm2>45,'a car whose wheels are above its top drives over it (same rule as the avatar)');
  const w3=world(flat,[{x:0,z:40,r:3,noSide:true}]);ok(w3.T.solidCount()===0,'moving platforms (noSide) are not collision solids');
  // reloading an island rebuilds, never duplicates
  const w4=world(flat,[{x:0,z:40,r:2}]);w4.T.setSolids([{x:0,z:40,r:2}]);w4.T.setSolids([{x:0,z:40,r:2}]);ok(w4.T.solidCount()===1,'setSolids rebuilds from scratch: reloading never duplicates collision objects');
}
// ---------- mountain flanks ----------
{
  const Hm=(x,z)=>z>100?(z-100)*.8:0;                              // a 38 degree wall of rock starting at z=100
  const w=world(Hm),c=CP.newCar(0,0,0,'ace',w.env);let zm=0,bumped=0;drive(w,c,{thr:1,boost:true},8,(c,i,ev)=>{zm=Math.max(zm,c.z);bumped=Math.max(bumped,ev.bump)});
  ok(zm<102.5,`driving straight at a steep mountain stops at its foot (max z ${zm.toFixed(1)}; the flank starts at 100)`);
  ok(Math.abs(c.y-Hm(c.x,c.z))<.6,'and the car stays on the ground at the foot (no climbing into or through the rock)');
  // alongside: glances off and keeps going
  const d=CP.newCar(0,0,.9,'ace',w.env);drive(w,d,{thr:1},3,null);const side=Math.hypot(d.vx,d.vz);ok(d.x>25&&side>10&&d.z<104,`hitting the slope at an angle slides along it (speed ${side.toFixed(0)} m/s, z ${d.z.toFixed(0)})`);
  // a car that finds itself on the steep flank (landed there) can slide DOWN and is never pushed up
  const e=CP.newCar(0,130,0,'ace',w.env);e.vz=-10;e.vx=0;let up=false,prevz=e.z;drive(w,e,{thr:0},2,(c)=>{if(c.z>prevz+.02)up=true;prevz=c.z});ok(!up&&e.z<125,'a car on the steep flank is free to roll downhill (never pushed uphill)');
  // sitting on the flank facing uphill: no vibration
  const f=CP.newCar(0,130,0,'ace',w.env);let jit=0,pr=null,pp=null,zmax2=130;drive(w,f,{thr:1},4,(c,i)=>{zmax2=Math.max(zmax2,c.z);if(i>100&&pr&&pp)jit=Math.max(jit,Math.hypot((c.x-pr.x)-(pr.x-pp.x),(c.z-pr.z)-(pr.z-pp.z)));pp=pr;pr={x:c.x,z:c.z}});ok(jit<.08&&zmax2<137,`driving up a too-steep flank neither tunnels nor vibrates (jerk ${jit.toFixed(3)} m, climbed ${(zmax2-130).toFixed(1)} m)`);
  // a gentle hill is still drivable
  const Hg=(x,z)=>z>100?(z-100)*.3:0,wg=world(Hg),g=CP.newCar(0,0,0,'ace',wg.env);drive(wg,g,{thr:1},8,null);ok(g.z>150,`a gentle slope (17 deg) is still climbable (z ${g.z.toFixed(0)})`);
}
// ---------- the island edge / sea ----------
{
  const Hs=(x)=>x<190?2:Math.max(-12,2-(x-190)*.25);               // beach sloping into the sea from x=190 (below -0.25 from x=199)
  const w=world(Hs),c=CP.newCar(0,0,Math.PI/2,'ace',w.env);let xm=0;drive(w,c,{thr:1},9,(c)=>{xm=Math.max(xm,c.x)});
  ok(xm<199,`a car driving at the sea stops on dry sand at the water's edge (max x ${xm.toFixed(1)}; the terrain drops below 0.1 m from x=197.6)`);
  ok(c.y>-.5,'it never gets wet (no instant "splash" recovery from simply driving up to the shore)');
  const d=CP.newCar(0,0,Math.PI/2,'ace',w.env);drive(w,d,{thr:1},6,null);drive(w,d,{thr:-1},3,null);ok(d.x<195,'and it can reverse back inland');
  const e=CP.newCar(0,0,Math.PI/2,'ace',w.env);drive(w,e,(t,c)=>{const hT=c.x>120?0:Math.PI/2;return {thr:1,steer:Math.max(-1,Math.min(1,(hT-c.h)*3))}},9,null);ok(e.x<199&&e.z>80,`or turn along the shore and carry on (x ${e.x.toFixed(0)}, z ${e.z.toFixed(0)})`);
  // flying off a ramp over the sea is NOT blocked (the block applies only to a grounded car)
  const f=CP.newCar(180,0,Math.PI/2,'ace',w.env);f.y=40;f.vx=50;f.vz=0;f.vy=0;f.grounded=false;drive(w,f,{thr:1},2,null);ok(f.x>220,'an airborne car flies out over the water untouched (launches are intentional)');
}
// ---------- roads, ramps and flight are untouched ----------
{
  const T=Tk.build({id:'t',name:'t',roads:[{id:'r',o:[0,0],w:16,pts:[[0,0],[0,60],[0,120]]}],gates:[{road:'r',p:0},{road:'r',p:2,finish:true}]},{H:()=>-1});   // the whole world is "sea" except the road
  T.setSolids([{x:12,z:60,r:3}]);const env={ground:T.ground,surf:T.surf,block:T.block},c=CP.newCar(0,5,0,'ace',env);
  for(let i=0;i<60*4;i++)CP.step(c,{thr:1},DT,env);
  ok(c.z>100&&Math.abs(c.x)<2,`a road over "sea" terrain is fully drivable: terrain barriers never apply on a deck (z ${c.z.toFixed(0)})`);
  const rolls=Tk.build({id:'t',name:'t',roads:[{id:'r',o:[0,0],w:16,pts:[[0,0],[0,40],[0,52,6],[0,64,12]]}],gates:[{road:'r',p:0},{road:'r',p:3,finish:true}]},{H:()=>0});
  const e2={ground:rolls.ground,surf:rolls.surf,block:rolls.block},d=CP.newCar(0,5,0,'ace',e2);d.vz=40;let air=false;for(let i=0;i<60*4;i++){CP.step(d,{thr:1},DT,e2);if(!d.grounded)air=true}
  ok(air,'a ramp still launches the car with collisions switched on');
}
// ---------- cost ----------
{
  const sol=[];for(let i=0;i<2200;i++)sol.push({x:(i*37)%900-300,z:(i*53)%900-300,r:.35});
  const w=world(()=>0,sol);const c=CP.newCar(0,0,0,'ace',w.env);const t0=Date.now();for(let i=0;i<60*60;i++)CP.step(c,{thr:1,steer:Math.sin(i/50)},DT,w.env);const ms=Date.now()-t0;
  ok(ms<1200,`a minute of driving among ${w.T.solidCount()} solids costs ${ms} ms of CPU (spatial hash, no per-frame scans)`);
}
console.log(fails?`\n${fails} FAILED`:'\nall ok');process.exit(fails?1:0);
