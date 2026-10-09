// Space: altitude profile, flight scaling, depth slicing, render sequence and partner smoothing at orbital speeds.
import fs from 'fs';
let bad=0;const ok=(c,m)=>{if(c)console.log('ok',m);else{console.log('FAIL',m);bad++}};
const load=(p,name,g={})=>{const k=Object.keys(g);return new Function(...k,fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')+`;return ${name}`)(...k.map(x=>g[x]))};
const SF=load('src/space/SpaceFlight.js','SpaceFlight');
const S={y:0};const Space=load('src/space/SpaceManager.js','Space',{S});
const RS=load('src/core/RemoteSmooth.js','RemoteSmooth',{SpaceFlight:SF});

// 1) the original game is untouched below 900 m
ok(SF.moveMul(0)===1&&SF.moveMul(450)===1&&SF.moveMul(900)===1,'movement multiplier is exactly 1 up to 900 m');
ok(SF.terminal(0)===48&&SF.terminal(900)===48,'terminal velocity is exactly 48 m/s up to 900 m');
{let a=0,b=0,va=0,vb=0,same=true;const r=(()=>{let s=7;return()=>(s=s*16807%2147483647)/2147483647})();
 for(let i=0;i<4000;i++){const dt=.016;vb=SF.fall(vb,300,dt);va-=(va<0?33:25)*dt;if(va<-48)va=-48;if(Math.abs(va-vb)>1e-9)same=false;if(r()<.01){va=vb=9}}
 ok(same,'ground fall integration is bit-identical to the original code');}
ok(SF.dy(10,300,true,.1)===1&&SF.dy(-10,300,false,.1)===-1,'vertical step below the clouds is plain vy*dt');

// 2) smooth, monotonic profile
const keys=['above','thin','deep','dark','stars','space','quiet'];let mono=true,range=true;let prev=Space.profile(0,{});
for(let y=0;y<=145000;y+=50){const p=Space.profile(y,{});for(const k of keys){if(p[k]<prev[k]-1e-12)mono=false;if(p[k]<0||p[k]>1)range=false}if(p.weather>prev.weather+1e-12)mono=false;prev=p}
ok(mono&&range,'profile factors are monotonic and within 0..1 at every altitude');
{const p0=Space.profile(0,{}),p1=Space.profile(500,{});ok(keys.every(k=>p0[k]===0)&&p0.weather===1&&keys.every(k=>p1[k]===0)&&p1.weather===1,'ground and low flight: no space effects at all')}
{const P=y=>Space.profile(y,{}),a=P(1000),b=P(3000),c=P(12000),d=P(40000),e=P(70000),g=P(110000);
 ok(a.weather<.7&&P(1300).weather===0&&b.weather===0,'rain/storm fade out by 1.3 km (you are above the weather)');
 ok(b.above===1&&b.dark===0&&b.stars===0&&b.deep<.1,'3 km: over the clouds, sky still blue, no stars');
 ok(c.deep>.3&&c.dark===0&&c.stars===0,'12 km: blue is deepening, no stars yet');
 ok(d.stars>.01&&d.stars<.3&&d.dark<.15,'40 km: first faint stars, still atmosphere (not thousands at once)');
 ok(e.dark>.3&&e.dark<.8&&e.stars>.3&&e.stars<.9,'70 km: haze fading to black, stars building');
 ok(g.dark>.97&&g.stars>.97&&g.space>.9,'110 km: black sky, full stars, space');
 ok(d.stars<d.deep,'stars arrive long after the sky starts deepening')}

// 3) the climb takes about a minute with boost, and the fall back is a fall
{const climb=(vy,target)=>{let y=900,t=0;const dt=.02;while(y<target&&t<2000){y+=SF.dy(vy,y,true,dt);t+=dt}return t};
 const tb=climb(33.6,20000),tn=climb(14,20000);
 ok(tb>30&&tb<90,'boosted climb 900 m -> 20 km takes '+tb.toFixed(0)+' s (30-90 s)');
 ok(tn>tb&&tn<240,'normal climb 900 m -> 20 km takes '+tn.toFixed(0)+' s');
 let y=30000,v=0,t=0,vmax=0;const dt=.02;while(y>0&&t<1000){v=SF.fall(v,y,dt);y+=v*dt;vmax=Math.max(vmax,-v);t+=dt}
 ok(t>40&&t<120,'falling from 30 km takes '+t.toFixed(0)+' s');
 ok(vmax>300&&vmax<=2700,'peak fall speed '+vmax.toFixed(0)+' m/s (a real re-entry, capped)');
 ok(-v<=60,'speed at the ground is '+(-v).toFixed(0)+' m/s (air has slowed it)');
 ok(SF.landImpact(900)===60&&SF.landImpact(10)===10,'landing effects are capped (no fall damage)');
 ok(Math.abs(SF.dy(-48,30000,true,1))<=SF.terminal(30000)*1.3+1e-9,'a flying dive from orbit is capped by air density')}
ok(SF.dy(14,200000,true,1)>0&&SF.moveMul(1e12)===3000,'multiplier is capped (3,000x)');
ok(SF.bound(0)===3300&&SF.bound(1500)===3300&&SF.bound(30000)>40000&&SF.bound(30000)<50000,'world edge: 3.3 km on the ground, a cone that opens with altitude');
ok(SF.bound(59999)<95000&&SF.bound(60000)===Infinity&&SF.bound(140000)===Infinity,'above 60 km there is no edge at all: space is open');
ok(SF.moveMulH(900)===1&&SF.moveMulH(20000)<SF.moveMul(20000)/3&&SF.moveMulH(20000)>4,'sideways speed scales as sqrt of the climb multiplier');

// 3b) looking up flies up; inside the old look range nothing changes
{let same=true,hOne=true;for(const bm of [1,2.4])for(let e=-.8;e<=.35;e+=.01){const o=Math.max(-20*bm,Math.min(14*bm,e*40*bm)),r=SF.vertical(e,bm,bm>1?70:34);if(Math.abs(r.v-o)>1e-9)same=false;if(r.h!==1)hOne=false}
 ok(same&&hOne,'inside the original look range the flight command is bit-identical (and full horizontal speed)');
 const up=SF.vertical(1.5,2.4,70),dn=SF.vertical(-1.4,2.4,70),mid=SF.vertical(.8,2.4,70);
 ok(up.h<1e-6&&Math.abs(up.v-70)<1e-9,'looking straight up: no horizontal motion, climbing at full forward speed');
 ok(dn.h<1e-6&&Math.abs(dn.v+70)<1e-9,'looking straight down: dives at full speed');
 ok(mid.h>0&&mid.h<1&&mid.v>33.6&&mid.v<70,'in between it blends (diagonal climb)');
 let mono=true,pv=SF.vertical(.35,1,34);for(let e=.36;e<=1.6;e+=.01){const r=SF.vertical(e,1,34);if(r.h>pv.h+1e-12||r.v<pv.v-1e-12)mono=false;pv=r}
 ok(mono,'the blend is monotonic (steeper look = more vertical, less horizontal)');
 const climb=(vy,target)=>{let y=900,t=0;const dt=.02;while(y<target&&t<2000){y+=SF.dy(vy,y,true,dt);t+=dt}return t};
 const ts=climb(70,100000);ok(ts>20&&ts<70,'straight up at boost: 900 m -> 100 km in '+ts.toFixed(0)+' s');
 let y=100000,v=0,t=0,vmax=0;const dt=.02;while(y>0&&t<1000){v=SF.fall(v,y,dt);y+=v*dt;vmax=Math.max(vmax,-v);t+=dt}
 ok(t>60&&t<200,'falling from 100 km takes '+t.toFixed(0)+' s');ok(-v<=60,'and you hit the ground at '+(-v).toFixed(0)+' m/s')}

// 3c) space is big: speed scales with distance from home, the wall is gone, and falling always leads home
{const Y=112000;
 const inCone=[[0,0],[500,2000],[5000,8000],[30000,40000],[59000,88000]];
 ok(inCone.every(([y,rr])=>SF.moveMulRaw(y,rr)===SF.moveMulRaw(y,0)),'inside the atmosphere funnel, horizontal distance changes nothing (flight is exactly as before)');
 ok(SF.moveMulRaw(Y,1e6)>900&&SF.moveMulRaw(Y,1.2e6)<=3000,'far out, speed grows with distance ('+SF.moveMulRaw(Y,1e6).toFixed(0)+'x at 1,000 km)');
 ok(SF.moveMulH(Y,1e6)>SF.moveMulH(Y,0)*3,'sideways speed in open space keeps growing too');
 // flying outwards at full boost: how long to cross space?
 const out=(target)=>{let rr=100000,t=0;const dt=.02;while(rr<target&&t<3000){rr+=70*SF.moveMulH(Y,rr)*dt;t+=dt}return t};
 const t1=out(1e6),t2=out(1.19e6);
 ok(t1<60,'flying out to 1,000 km takes '+t1.toFixed(0)+' s boosted');ok(t2<60,'to the 1,200 km limit takes '+t2.toFixed(0)+' s: big, and still reachable');
 // coming home: while far out the same scaling slows you as you approach, so you never overshoot
 {let rr=1e6,t=0,maxStep=0;const dt=.02;while(rr>3e5&&t<3000){const step=70*SF.moveMulH(Y,rr)*dt;maxStep=Math.max(maxStep,step/rr);rr-=step;t+=dt}
  ok(t<60&&maxStep<.003,'flying home from 1,000 km out to 300 km: '+t.toFixed(0)+' s, never more than '+(maxStep*100).toFixed(2)+'% of the remaining distance per frame (no overshoot)')}
 // containment
 {const mk=(x,y,z)=>({x,y,z,_dy:0});
  const g=mk(4000,500,0);SF.contain(g,.016);ok(Math.abs(Math.hypot(g.x,g.z)-3300)<1e-6,'on the ground the 3.3 km edge is the original hard clamp');
  const a=mk(30000,40000,40000);SF.contain(a,.016);ok(a.x===30000&&a.z===40000,'inside the cone: untouched');
  const o=mk(8e5,Y,-6e5);SF.contain(o,.016);ok(o.x===8e5&&o.z===-6e5,'in open space: no wall at 1,000 km out');
  const w=mk(3e6,Y,0);SF.contain(w,.016);ok(Math.abs(Math.hypot(w.x,w.z)-1.2e6)<1,'the limit is 1,200 km from home (float precision), not a bubble over the world');
  // falling home from far away: slide in proportion to the descent, never a jump, arrive inside the edge
  const f=mk(8e5,100000,5e5);let y=f.y,v=0,maxJump=0,t=0;const dt=1/60;
  while(f.y>2&&t<600){const px=f.x,pz=f.z;v=SF.fall(v,f.y,dt);f._dy=v*dt;f.y+=f._dy;SF.contain(f,dt);maxJump=Math.max(maxJump,Math.hypot(f.x-px,f.z-pz));t+=dt;if(f.y<0)f.y=0}
  ok(Math.hypot(f.x,f.z)<=3300+1e-6,'falling from 100 km while 940 km out: you land inside the world ('+Math.hypot(f.x,f.z).toFixed(0)+' m from the centre)');
  ok(maxJump<2000,'and the slide home is continuous (largest single-frame move '+maxJump.toFixed(0)+' m, at ~'+(maxJump*60/1000).toFixed(0)+' km/s)')}}

// 4) depth slicing: every altitude is covered, nothing important is clipped, precision stays sane
{let cover=true,skyOk=true,prec=true;for(let y=900;y<=150000;y+=100){const s=Space.slices(y);
   if(!(s.farNear<s.nearFar))cover=false;                                                      // slices overlap: no gap
   if(!(s.farNear<2800&&s.nearFar<2800))skyOk=false;                                             // sky dome (r=2800) is inside the far slice, clipped from the near slice
   const dist=y-0,far=dist*dist/(s.farNear*16777216),near=s.nearFar*s.nearFar/(.1*16777216);   // depth resolution (m) of the ground / of the far edge of the near slice
   if(far>1||near>4)prec=false}
 ok(cover,'near and far depth slices overlap at every altitude');ok(skyOk,'sky dome stays inside the far slice and out of the near slice');ok(prec,'depth resolution stays under 1 m for the world and 4 m at the near slice edge, 0.9-140 km')}

// 5) render sequence
{const calls=[];const cam={near:.1,far:4200,position:{y:0},updateProjectionMatrix(){calls.push(['proj',cam.near,cam.far])}};
 const r={autoClear:true,shadowMap:{autoUpdate:true},render(){calls.push(['render',r.autoClear,r.shadowMap.autoUpdate])},clearDepth(){calls.push(['clearDepth'])}};
 cam.position.y=300;Space.render(r,{},cam);ok(calls.filter(c=>c[0]==='render').length===1,'below 900 m: a single normal render pass');
 calls.length=0;cam.position.y=20000;Space.render(r,{},cam);const rn=calls.filter(c=>c[0]==='render');
 ok(rn.length===2&&rn[0][1]===true&&rn[1][1]===false,'in the sky: far pass (clears) then near pass (keeps colour)');
 ok(rn[1][2]===false&&r.shadowMap.autoUpdate===true&&r.autoClear===true,'shadow map is not rendered twice and renderer state is restored');
 ok(calls.some(c=>c[0]==='clearDepth')&&calls.findIndex(c=>c[0]==='clearDepth')>calls.findIndex(c=>c[0]==='render'),'depth is cleared between the two passes');
 ok(cam.near===.1&&cam.far===4200,'camera planes are restored for the rest of the frame')
 {const seen=[];const sc={background:'COLOR'};r.render=()=>seen.push(sc.background);cam.position.y=20000;Space.render(r,sc,cam);
  ok(seen[0]==='COLOR'&&seen[1]===null&&sc.background==='COLOR','far pass keeps the background, near pass has none (it would clear the far pass), then it is restored')}}

// 6) partner smoothing at orbital speed
{const o={};const sp=1300;let t=0,y=20000;RS.snap(o,{x:0,y,z:0,r:0},t);let snapped=0,vmax=0;
 for(let i=1;i<=50;i++){t+=100;y+=sp*.1;const before={...o};RS.snap(o,{x:i*130,y,z:0,r:0},t);if(o.vx===0&&o.vy===0&&i>2)snapped++;vmax=Math.max(vmax,Math.hypot(o.vx||0,o.vy||0))}
 ok(snapped===0,'partner at 1.3 km/s is smoothed, not teleported every packet');ok(vmax>500,'partner velocity estimate follows (>500 m/s, was clamped to 100)');
 const o2={};RS.snap(o2,{x:0,y:100,z:0},0);RS.snap(o2,{x:200,y:100,z:0},100);ok(o2.vx===0,'on the ground a 200 m jump is still treated as a teleport (unchanged)')}
// 7) regression: Jump switches flying on AFTER the look-direction command (fp) is computed, so fp is null on the take-off frame. It must never be
// dereferenced directly (it threw 'Cannot read properties of null (reading v)' every time you took off while moving).
{const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 ok(!/\bfp\.v\b/.test(html),'index.html never reads fp.v directly (null on the frame flying starts)');
 ok(/\(fp\|\|SpaceFlight\.vertical\(/.test(html),'the vertical command falls back to computing it when fp is null')}
console.log(bad?bad+' failed':'space ok');process.exit(bad?1:0);
