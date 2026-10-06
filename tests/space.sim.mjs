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
const keys=['above','thin','dark','stars','space','quiet'];let mono=true,range=true;let prev=Space.profile(0,{});
for(let y=0;y<=95000;y+=50){const p=Space.profile(y,{});for(const k of keys){if(p[k]<prev[k]-1e-12)mono=false;if(p[k]<0||p[k]>1)range=false}if(p.weather>prev.weather+1e-12)mono=false;prev=p}
ok(mono&&range,'profile factors are monotonic and within 0..1 at every altitude');
{const p0=Space.profile(0,{}),p1=Space.profile(500,{});ok(keys.every(k=>p0[k]===0)&&p0.weather===1&&keys.every(k=>p1[k]===0)&&p1.weather===1,'ground and low flight: no space effects at all')}
{const a=Space.profile(1000,{}),b=Space.profile(3000,{}),c=Space.profile(10000,{}),d=Space.profile(25000,{});
 ok(a.weather<.7&&Space.profile(1300,{}).weather===0&&b.weather===0,'rain/storm fade out by 1.3 km (you are above the weather)');
 ok(b.above===1&&b.dark<.05&&b.stars===0,'at 3 km you are over the clouds but the sky is still blue, no stars');
 ok(c.dark>.3&&c.dark<.6&&c.stars>.1&&c.stars<.4&&c.space<.2,'at 10 km: deep blue, first stars, not space yet');
 ok(d.dark===1&&d.stars>.9&&d.space>.9,'at 25 km: black sky, stars, space');
 ok(c.stars<c.dark,'stars fade in after the sky starts darkening')}

// 3) the climb takes about a minute with boost, and the fall back is a fall
{const climb=(vy,target)=>{let y=900,t=0;const dt=.02;while(y<target&&t<2000){y+=SF.dy(vy,y,true,dt);t+=dt}return t};
 const tb=climb(33.6,20000),tn=climb(14,20000);
 ok(tb>30&&tb<90,'boosted climb 900 m -> 20 km takes '+tb.toFixed(0)+' s (30-90 s)');
 ok(tn>tb&&tn<240,'normal climb 900 m -> 20 km takes '+tn.toFixed(0)+' s');
 let y=30000,v=0,t=0,vmax=0;const dt=.02;while(y>0&&t<1000){v=SF.fall(v,y,dt);y+=v*dt;vmax=Math.max(vmax,-v);t+=dt}
 ok(t>40&&t<120,'falling from 30 km takes '+t.toFixed(0)+' s');
 ok(vmax>300&&vmax<=900,'peak fall speed '+vmax.toFixed(0)+' m/s (a real re-entry, capped)');
 ok(-v<=60,'speed at the ground is '+(-v).toFixed(0)+' m/s (air has slowed it)');
 ok(SF.landImpact(900)===60&&SF.landImpact(10)===10,'landing effects are capped (no fall damage)');
 ok(Math.abs(SF.dy(-48,30000,true,1))<=SF.terminal(30000)*1.3+1e-9,'a flying dive from orbit is capped by air density')}
ok(SF.dy(14,200000,true,1)>0&&SF.moveMul(1e9)===120,'multiplier is capped');
ok(SF.bound(0)===3300&&SF.bound(1500)===3300&&SF.bound(30000)>40000&&SF.bound(90000)<150000,'world edge: 3.3 km on the ground, opens up with altitude');
ok(SF.moveMulH(900)===1&&SF.moveMulH(20000)<SF.moveMul(20000)/3&&SF.moveMulH(20000)>4,'sideways speed scales as sqrt of the climb multiplier');

// 4) depth slicing: every altitude is covered, nothing important is clipped, precision stays sane
{let cover=true,skyOk=true,prec=true;for(let y=900;y<=90000;y+=100){const s=Space.slices(y);
   if(!(s.farNear<s.nearFar))cover=false;                                                      // slices overlap: no gap
   if(!(s.farNear<2800&&s.nearFar<2800))skyOk=false;                                             // sky dome (r=2800) is inside the far slice, clipped from the near slice
   const dist=y-0,far=dist*dist/(s.farNear*16777216),near=s.nearFar*s.nearFar/(.1*16777216);   // depth resolution (m) of the ground / of the far edge of the near slice
   if(far>.5||near>4)prec=false}
 ok(cover,'near and far depth slices overlap at every altitude');ok(skyOk,'sky dome stays inside the far slice and out of the near slice');ok(prec,'depth resolution stays under 0.5 m for the world and 4 m at the near slice edge, 0.9-90 km')}

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
console.log(bad?bad+' failed':'space ok');process.exit(bad?1:0);
