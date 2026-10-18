// Living ocean: shared wave function, sea-state easing, bounded wave-driven hull pose, geometry. Pure logic + the Vessel integration.
// Run: NODE_PATH=<dir with three@0.147.0>/node_modules node tests/ocean.sim.js
const fs=require('fs'),vm=require('vm'),path=require('path');
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','Alex','OCEAN-TEST-1');
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/world/Ocean.js'),'utf8'),A.ctx);
const O=vm.runInContext('Ocean',A.ctx),TAU=Math.PI*2;
const ampMax=O.WAVES.reduce((s,w)=>s+w.a,0);
// ---------- phases + height ----------
{
  const p1=O.phases(1.7e9+12.345),p2=O.phases(1.7e9+12.345);
  ok(p1.every((v,i)=>v===p2[i]&&v>=0&&v<TAU+1e-6),'phases are deterministic for a clock value and inside 0..2PI (same sea on every client)');
  const t=1.7e9+3;let mn=9,mx=-9,sum=0,n=0;
  for(let x=-400;x<=400;x+=13)for(let z=-400;z<=400;z+=13){const h=O.height(x,z,t,1);mn=Math.min(mn,h);mx=Math.max(mx,h);sum+=h;n++}
  ok(mx<=ampMax+1e-6&&mn>=-ampMax-1e-6,`wave height is bounded by the amplitude sum (${mn.toFixed(2)}..${mx.toFixed(2)} of +-${ampMax.toFixed(2)})`);
  ok(Math.abs(sum/n)<.25,`mean sea level stays at zero (${(sum/n).toFixed(3)} m)`);
  ok(O.height(5,7,100,0)===0,'sea state 0 is a mirror');
  ok(Math.abs(O.height(30,-20,t,.5)*2-O.height(30,-20,t,1))<1e-9,'height scales linearly with sea state');
  // waves travel: the long wave's crest moves with phase speed w/k along its direction
  const w=O.WAVES[0],c=w.w/w.k;
  ok(Math.abs(c-Math.sqrt(9.8/w.k))<1e-9,`deep-water dispersion: crest speed ${c.toFixed(1)} m/s for a ${w.L} m wave`);
  // slope matches a numerical derivative
  const sl=O.slope(40,-30,t,.8),e=.01,nx=(O.height(40+e,-30,t,.8)-O.height(40-e,-30,t,.8))/(2*e),nz=(O.height(40,-30+e,t,.8)-O.height(40,-30-e,t,.8))/(2*e);
  ok(Math.abs(sl.x-nx)<1e-3&&Math.abs(sl.z-nz)<1e-3,'analytic slope (shader normal) equals the numerical derivative of the height');
  // continuity in time (no pops between frames)
  let jump=0;for(let i=0;i<200;i++){jump=Math.max(jump,Math.abs(O.height(10,10,t+i*.05,1)-O.height(10,10,t+(i+1)*.05,1)))}
  ok(jump<.35,`surface moves smoothly frame to frame (max step ${jump.toFixed(3)} m at 20 fps)`);
}
// ---------- sea state follows the weather ----------
{
  const calm=O.target({cloud:0,rain:0,storm:0}),cloudy=O.target({cloud:1,rain:0,storm:0}),rain=O.target({cloud:1,rain:1,storm:0}),storm=O.target({cloud:1,rain:1,storm:1});
  ok(calm<cloudy&&cloudy<rain&&rain<storm&&storm<=1&&calm>0,`sea state rises with cloud/rain/storm (${calm.toFixed(2)} < ${cloudy.toFixed(2)} < ${rain.toFixed(2)} < ${storm.toFixed(2)})`);
  ok(O.target(null)===calm,'missing weather = calm');
  let s=calm;for(let i=0;i<20*10;i++)s=O.ease(s,storm,.05);const up10=s;
  s=storm;for(let i=0;i<20*10;i++)s=O.ease(s,calm,.05);const down10=s;
  ok((up10-calm)/(storm-calm)>.6&&(storm-down10)/(storm-calm)<.35,`a storm builds quickly (${Math.round((up10-calm)/(storm-calm)*100)}% in 10 s) but calms slowly (${Math.round((storm-down10)/(storm-calm)*100)}% in 10 s)`);
  s=storm;for(let i=0;i<20*180;i++)s=O.ease(s,calm,.05);ok(s-calm<.05,'and the swell is gone ~3 minutes after the storm');
  ok(O.ease(.5,.5,1)===.5&&O.ease(.5,.9,0)===.5,'easing is stable at the target and with dt=0');
}
// ---------- hull pose ----------
{
  const t=1.7e9;let mp=0,mr=0,my=0,cp=0,cr=0;const o={};
  for(let i=0;i<4000;i++){const x=(i*37)%900-450,z=(i*91)%900-450,h=i*.37;O.pose(x,z,h,11.7,5.3,t+i*.7,1,o,1);mp=Math.max(mp,Math.abs(o.pitch));mr=Math.max(mr,Math.abs(o.roll));my=Math.max(my,Math.abs(o.y));
    O.pose(x,z,h,11.7,5.3,t+i*.7,.07,o,1);cp=Math.max(cp,Math.abs(o.pitch));cr=Math.max(cr,Math.abs(o.roll))}
  ok(mp<=.13+1e-9&&mr<=.17+1e-9&&my<=ampMax,`storm pose is bounded (pitch ${mp.toFixed(3)}, roll ${mr.toFixed(3)} rad, heave ${my.toFixed(2)} m)`);
  ok(mp>.05&&mr>.04,'a storm sea visibly pitches and rolls the ship');
  ok(cp<.03&&cr<.03,`a calm sea only rocks it gently (pitch ${cp.toFixed(3)}, roll ${cr.toFixed(3)} rad)`);
  // sign check: put the bow on a crest and the stern in a trough -> the bow rises (pitch negative in three.js = bow UP)
  let found=false;for(let d=0;d<200&&!found;d+=.5){O.pose(d,0,Math.PI/2,11.7,5.3,t,1,o,1);if(o.pitch<-.05){const hb=O.height(d+11.7,0,t,1),hs=O.height(d-11.7,0,t,1);found=hb>hs}}
  ok(found,'negative pitch means the bow is on the higher water');
  const r0=O.pose(0,0,0,11.7,5.3,t,1,{},0);ok(r0.pitch===0&&r0.roll===0&&r0.y===0,'k=0 turns wave following off (hull stays level)');
}
// ---------- Vessel rides the waves ----------
{
  const V=A.Vessel,O2=O;O2.state.sea=.9;
  const v=V.create('oc1','galleon',{x:0,z:0,h:0});ok(!!v,'galleon created');
  let lo=9,hi=-9,mp=0,maxStep=0,prev=null;const base=A.SHIP.sea-v.K.draft;
  for(let i=0;i<20*60;i++){V.update(v,.05,{x:i*.2,z:0,h:.3+i*.001,roll:0,v:8});const y=v.pose.y-base;lo=Math.min(lo,y);hi=Math.max(hi,y);mp=Math.max(mp,Math.abs(v.pose.pitch),Math.abs(v.pose.roll));if(prev!==null)maxStep=Math.max(maxStep,Math.abs(v.pose.y-prev));prev=v.pose.y}
  ok(hi-lo>.5&&hi-lo<2*ampMax,`the galleon heaves with the sea (range ${(hi-lo).toFixed(2)} m)`);
  ok(mp<.35,`pitch/roll stay bounded (${mp.toFixed(3)} rad)`);
  ok(maxStep<.25,`no frame-to-frame pops (max step ${maxStep.toFixed(3)} m)`);
  const w=A.Decks.toWorld(v.deck,0,5,0,{});ok(isFinite(w.x)&&isFinite(w.y)&&isFinite(w.z),'the walkable deck follows the pose');
  O2.state.sea=.07;const v2=V.create('oc2','galleon',{x:0,z:0,h:0});let r=0;for(let i=0;i<400;i++){V.update(v2,.05,{x:i*.2,z:0,h:0,roll:0,v:8});r=Math.max(r,Math.abs(v2.pose.roll))}
  ok(r<.04,`calm sea: the ship barely rocks (roll ${r.toFixed(3)} rad)`);
  V.dispose(v);V.dispose(v2);
}
// ---------- geometry ----------
{
  const n=vm.runInContext('(()=>{const g=Ocean.makeGeometry(6000,.01);const p=g.attributes.position;let r=0,z=0;for(let i=0;i<p.count;i++){r=Math.max(r,Math.hypot(p.getX(i),p.getY(i)));z=Math.max(z,Math.abs(p.getZ(i)))}return [p.count,g.index.count/3,r,z,g.attributes.uv.count]})()',A.ctx);
  ok(n[0]<14000&&n[0]>3000&&n[2]>5999&&n[3]===0&&n[4]===n[0],`one radial mesh, ${n[0]} vertices / ${n[1]} triangles, reaches ${n[2]|0} m (mobile friendly)`);
  const src=fs.readFileSync(path.join(__dirname,'../src/world/Ocean.js'),'utf8');
  ok(['uPh','uSea','uFol','uC','beginnormal_vertex','begin_vertex','uv_vertex','color_fragment'].every(k=>src.includes(k)),'shader patch hooks the standard material chunks (no second ocean mesh)');
}
console.log(fails?`\n${fails} FAILED`:'\nall ocean tests passed');process.exit(fails?1:0);
