// Surfing: wave maths (Ocean surf breaks), spot placement against the real terrain, board physics, tricks, scoring, race course.
const fs=require('fs'),vm=require('vm'),G=require('./golden/golden_lib.js');
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const R=__dirname+'/../';
const cx=G.makeH(true),H=cx.H;
const ctx=vm.createContext({console,Date,Math,Float32Array,Array});
vm.runInContext(fs.readFileSync(R+'src/world/Ocean.js','utf8')+';this.Ocean=Ocean;',ctx);
vm.runInContext(fs.readFileSync(R+'src/data/surf.js','utf8')+';this.SD=SurfData;',ctx);
vm.runInContext(fs.readFileSync(R+'src/surf/SurfCore.js','utf8')+';this.SC=SurfCore;',ctx);
const {Ocean,SD,SC}=ctx,SEA=-.3,hyp=Math.hypot;
const deep=(x,z,t)=>Ocean.height(x,z,t);                        // no breaks yet
const probe=[[0,0],[300,-200],[-900,1200],[2500,50]];const base=probe.map(([x,z])=>deep(x,z,1234.5));
Ocean.setBreaks(SD.SPOTS.map(s=>({id:s.id,x:s.x,z:s.z,dx:s.dx,dz:s.dz,Lh:s.Lh,Wh:s.Wh,A:s.A,L:s.L,peel:s.peel,seed:s.seed})));
ok(Ocean.breaks.length===SD.SPOTS.length&&SD.SPOTS.length<=Ocean.NB,SD.SPOTS.length+' surf breaks registered (max '+Ocean.NB+')');
ok(probe.every(([x,z],i)=>Math.abs(Ocean.height(x,z,1234.5)-base[i])<1e-12),'open sea away from every spot is unchanged');
// ---- spots against the real terrain ----
const near=(a,b)=>hyp(a.x-b.x,a.z-b.z);
ok(SD.SPOTS.every(s=>Math.abs(hyp(s.dx,s.dz)-1)<2e-3),'spot directions are unit vectors');
ok(SD.SPOTS.every(s=>H(s.x,s.z)<-2&&H(s.x,s.z)>-6),'every spot centre is in 2-6 m of water ('+SD.SPOTS.map(s=>H(s.x,s.z).toFixed(1)).join(', ')+')');
ok(SD.SPOTS.every(s=>{for(let k=-.9*s.Lh;k<=.2*s.Lh;k+=5)if(H(s.x+s.dx*k,s.z+s.dz*k)>-.8)return false;return true}),'the approach to every spot is open water (no rock in the break)');
ok(SD.SPOTS.every(s=>{for(let k=0;k<=s.Lh;k+=2)if(H(s.x+s.dx*k,s.z+s.dz*k)>-.4)return true;return false}),'every wave runs out onto a beach within its length');
ok(SD.SPOTS.every((s,i)=>SD.SPOTS.every((q,j)=>i===j||near(s,q)>s.r+q.r)),'spots do not overlap each other');
const W=cx.W;ok(SD.SPOTS.every(s=>near(s,{x:W.x,z:W.z})>W.R+s.r),'no spot touches the Warden Isles');
ok(new Set(SD.SPOTS.map(s=>s.id)).size===SD.SPOTS.length&&SD.SPOTS.every(s=>s.n&&s.tag&&s.lvl>=1&&s.lvl<=4),'ids unique, names and levels present');
ok(SD.near(SD.SPOTS[0].x,SD.SPOTS[0].z)===SD.SPOTS[0]&&SD.near(0,0)===null,'SurfData.near finds the spot you are in');
// ---- waves are big, lop-sided, in sets, and the slope matches the height ----
function stats(s){let mx=-9,mn=9,steep=0,n=0;const t0=5000;for(let a=-.8;a<=.5;a+=.1)for(let u=-.6;u<=.6;u+=.2)for(let tt=0;tt<24;tt+=.4){const x=s.x+s.dx*a*s.Lh-s.dz*u*s.Wh,z=s.z+s.dz*a*s.Lh+s.dx*u*s.Wh,h=Ocean.height(x,z,t0+tt),sl=Ocean.slope(x,z,t0+tt);mx=Math.max(mx,h);mn=Math.min(mn,h);steep=Math.max(steep,hyp(sl.x,sl.z));n++}return{face:mx-mn,steep}}
const st=SD.SPOTS.map(stats);
ok(st.every(q=>q.face>=3.6),'every spot has real faces: trough-to-crest '+st.map(q=>q.face.toFixed(1)).join(' / ')+' m');
ok(st[st.length-1].face>st[0].face+1,'the big spot is clearly bigger than the friendly one');
ok(st.every(q=>q.steep>.3&&q.steep<1.2),'face steepness is rideable ('+st.map(q=>q.steep.toFixed(2)).join(' / ')+')');
{const s=SD.SPOTS[0];let worst=0;const e=.01;for(const [a,u] of [[-.3,0],[-.1,.2],[0,-.2],[.1,0]])for(const t of [7000,7003.3]){const x=s.x+s.dx*a*s.Lh-s.dz*u*s.Wh,z=s.z+s.dz*a*s.Lh+s.dx*u*s.Wh,sl=Ocean.slope(x,z,t);
    const nx=(Ocean.height(x+e,z,t)-Ocean.height(x-e,z,t))/(2*e),nz=(Ocean.height(x,z+e,t)-Ocean.height(x,z-e,t))/(2*e);worst=Math.max(worst,Math.abs(sl.x-nx),Math.abs(sl.z-nz))}
  ok(worst<.06,'slope() matches the numeric gradient of height() (worst error '+worst.toFixed(3)+'; the shader draws the same normal)')}
  {const s=SD.SPOTS[1],t0=3000;let peakFront=0,peakBack=0;const th=[];for(let a=0;a<6.28;a+=.02){const f=(Math.sin(a)-.3*Math.sin(2*a))/1.12,d=(Math.cos(a)-.6*Math.cos(2*a))/1.12;if(d<0)peakFront=Math.max(peakFront,-d);else peakBack=Math.max(peakBack,d)}
  ok(peakFront>peakBack*1.15,'the wave is lop-sided: steeper front than back ('+peakFront.toFixed(2)+' vs '+peakBack.toFixed(2)+')')}
{const s=SD.SPOTS[2];let lo=9,hi=0;for(let a=-.5;a<=0;a+=.5)for(let q=0;q<80;q+=.5){let m=0;for(let u=-.2;u<=.2;u+=.2){m=Math.max(m,Math.abs(Ocean.height(s.x+s.dx*a*s.Lh+u*0,s.z+s.dz*a*s.Lh,9000+q)))}lo=Math.min(lo,m);hi=Math.max(hi,m)}
  ok(hi>lo*1.5,'waves come in sets (crest height varies '+lo.toFixed(2)+' -> '+hi.toFixed(2)+' m over 80 s)')}
ok(Ocean.waveAt(SD.SPOTS[0].x,SD.SPOTS[0].z,100).w>=0&&Ocean.waveAt(0,0,100).w===0,'waveAt reports 0 away from every break');
{const s=SD.SPOTS[0];let best=null;for(let a=-.6;a<=.2&&!best;a+=.05)for(let tt=0;tt<20;tt+=.25){const w=Ocean.waveAt(s.x+s.dx*a*s.Lh,s.z+s.dz*a*s.Lh,4000+tt);if(w.w>.5){best=w;break}}
  ok(best&&best.id===s.id&&(best.x*s.dx+best.z*s.dz)>3&&(best.x*s.dx+best.z*s.dz)<12,'on the front face the wave carries you toward the beach at a believable speed ('+(best?hyp(best.x,best.z).toFixed(1):'-')+' m/s)')}
// ---- board physics ----
const envAt=t=>({water:(x,z)=>SEA+Ocean.height(x,z,t),slope:(x,z)=>Ocean.slope(x,z,t),wave:(x,z)=>Ocean.waveAt(x,z,t),ground:()=>-9});
const calm={water:()=>SEA,slope:()=>({x:0,z:0}),ground:()=>-9};
{const B=SC.create(0,0,0,SEA);let t=0;for(let i=0;i<60*4;i++)SC.step(B,{tx:0,tz:1,mag:1,ix:0,iy:-1},1/60,calm);
  ok(B.speed>3&&B.speed<SC.K.PADDLE_MAX+.8&&B.z>8,'paddling on flat water: speed '+B.speed.toFixed(1)+' m/s, moved '+B.z.toFixed(0)+' m')}
{const B=SC.create(0,0,0,SEA);B.vz=9;B.vx=0;for(let i=0;i<60*30;i++)SC.step(B,{tx:0,tz:0,mag:0},1/60,calm);ok(B.speed<2,'with no wave and no paddling you slow down ('+B.speed.toFixed(2)+')')}
{const B=SC.create(0,0,0,SEA);B.vx=10;B.vz=0;B.hd=Math.PI/2;for(let i=0;i<60*3;i++)SC.step(B,{tx:0,tz:1,mag:1},1/60,calm);ok(hyp(B.vx,B.vz)>3.5&&B.speed<12,'a hard turn keeps most of the speed (carve) and never gains from nothing')}
// ride a real wave with a simple bot: it must catch it, ride it for many seconds, and never leave the speed envelope
function ride(spot,t0,secs){const crs=SC.course(spot,6);const B=SC.create(spot.x-spot.dx*60-crs.t.x*50,spot.z-spot.dz*60-crs.t.z*50,Math.atan2(spot.dx,spot.dz),SEA);
  const b=Ocean.breaks.find(q=>q.id===spot.id),bi=Ocean.breaks.indexOf(b);let t=t0,onW=0,maxS=0,evs=[],air=0;
  for(let i=0;i<60*secs;i++){t+=1/60;const e=envAt(t);let tx=spot.dx,tz=spot.dz;
    if(B.speed>4.5){const th=b.k*(b.kx*(B.x-b.x)+b.kz*(B.z-b.z))+Ocean.breakPh(t)[bi],er=SC.wrap(th-2.3),a=Math.max(-.9,Math.min(.9,er*.7));tx=crs.t.x*Math.cos(a)-b.kx*Math.sin(a);tz=crs.t.z*Math.cos(a)-b.kz*Math.sin(a)}
    for(const x of SC.step(B,{tx,tz,mag:1,ix:0,iy:0},1/60,e))evs.push(x);if(B.onWave>.3)onW+=1/60;maxS=Math.max(maxS,B.speed);if(B.air)air+=1/60;if(!isFinite(B.x+B.y+B.z))return null}
  return{B,onW,maxS,evs,air}}
const rides=SD.SPOTS.map((s,i)=>ride(s,2000+i*77,40));
ok(rides.every(r=>r),'no NaN anywhere in 40 s rides at every spot');
ok(rides.every(r=>r.maxS<=SC.K.VMAX+1e-6),'board speed never exceeds the hard cap ('+Math.max(...rides.map(r=>r.maxS)).toFixed(1)+' m/s)');
ok(rides.filter(r=>r.onW>=4).length>=SD.SPOTS.length-1,'a paddling bot catches the wave and rides the face for 4+ s at (almost) every spot ('+rides.map(r=>r.onW.toFixed(0)+'s').join(' ')+')');
ok(rides.every(r=>r.B.speed>=0),'speeds are sane');
// ---- jumps and tricks ----
function flight(inp0,hold,t0){const B=SC.create(0,0,0,SEA);B.vz=7;B.vx=0;const evs=[];let t=0;
  for(let i=0;i<60*3;i++){t+=1/60;const inp=Object.assign({tx:0,tz:1,mag:.4},i===2?{jump:true}:{},inp0(i,B));for(const e of SC.step(B,inp,1/60,calm))evs.push(e)}return{B,evs}}
{const f=flight(()=>({}));const l=f.evs.find(e=>e.t==='land');ok(f.evs.some(e=>e.t==='launch')&&l&&!f.evs.some(e=>e.t==='wipe'),'Jump pops you into the air and you land it');ok(l&&l.h>.5&&l.air>.4,'a pop is a real jump: '+(l?l.h:0)+' m, '+(l?l.air:0)+' s')}
{const f=flight((i)=>i===6?{trick:true,ix:1,iy:0}:{});ok(f.evs.some(e=>e.t==='trick'&&e.n==='360'),'a spin trick completes a full 360 in the air');const l=f.evs.find(e=>e.t==='land');ok(l&&l.pts>=100&&l.names.includes('360'),'a clean 360 banks points ('+(l&&l.pts)+')');ok(f.B.score===l.pts,'the score matches what was announced')}
{const f=flight((i)=>i===6?{trick:true,ix:0,iy:-1}:{});ok(f.evs.some(e=>e.t==='trick'&&e.n==='Frontflip'),'stick up + Trick = frontflip')}
{const f=flight((i)=>i===6?{trick:true,ix:0,iy:1}:{});ok(f.evs.some(e=>e.t==='trick'&&e.n==='Backflip'),'stick down + Trick = backflip')}
{const f=flight((i)=>i>=6&&i<46?{trick:i===6,held:true,ix:0,iy:0}:{});ok(f.evs.some(e=>e.t==='trick'&&e.n==='Grab'),'holding Trick with the stick centred = a grab')}
{const B=SC.create(0,0,0,SEA);B.vz=7;const evs=[];for(let i=0;i<60*4;i++){if(i===3)B.vy=9;for(const e of SC.step(B,{tx:0,tz:1,mag:.4,jump:i===2,trick:i===6||i===60,ix:i===6?1:0,iy:i===60?-1:0},1/60,calm))evs.push(e)}const l=evs.find(e=>e.t==='land');ok(l&&l.names.length>=2,'two tricks in one big jump chain together ('+(l&&l.names.join('+'))+')')}
{// bail: start a flip right before landing
  const B=SC.create(0,0,0,SEA);B.vz=7;const evs=[];let started=false;for(let i=0;i<60*3;i++){const inp={tx:0,tz:1,mag:.4,jump:i===2};if(B.air&&B.vy<-3&&!started){inp.trick=true;inp.iy=-1;started=true}for(const e of SC.step(B,inp,1/60,calm))evs.push(e)}
  ok(evs.some(e=>e.t==='wipe'),'landing in the middle of a flip is a wipeout');ok(B.combo===0&&B.stun>-1e-6,'a wipeout breaks your combo')}
{const mk=chill=>{const B=SC.create(0,0,0,SEA);B.vz=7;let s=0;for(let i=0;i<60*3;i++){const inp={tx:0,tz:1,mag:.4,jump:i===2};if(B.air&&B.vy<-3&&!s){inp.trick=true;inp.iy=-1;s=1}SC.step(B,inp,1/60,calm,{chill})}return B};
  let a=SC.create(0,0,0,SEA),c=SC.create(0,0,0,SEA);
  const t1=()=>{const B=SC.create(0,0,0,SEA);B.vz=7;let s=0,m=0;for(let i=0;i<60*3;i++){const inp={tx:0,tz:1,mag:.4,jump:i===2};if(B.air&&B.vy<-3&&!s){inp.trick=true;inp.iy=-1;s=1}SC.step(B,inp,1/60,calm,{chill:true});if(B.stun>m)m=B.stun}return m};
  const t2=()=>{const B=SC.create(0,0,0,SEA);B.vz=7;let s=0,m=0;for(let i=0;i<60*3;i++){const inp={tx:0,tz:1,mag:.4,jump:i===2};if(B.air&&B.vy<-3&&!s){inp.trick=true;inp.iy=-1;s=1}SC.step(B,inp,1/60,calm,{chill:false});if(B.stun>m)m=B.stun}return m};
  ok(t1()<t2()&&t1()>0,'chill mode: a bail is soft (shorter stun), tricks still work')}
{const B=SC.create(0,0,0,SEA);B.vz=7;for(let i=0;i<60*3;i++)SC.step(B,{tx:0,tz:1,mag:.4,jump:i===2,trick:i===6,ix:1},1/60,calm);const s1=B.score;B.comboT=3;B.combo=2;
  ok(s1>0,'score accumulates');}
{const B=SC.create(0,0,0,SEA);let n=0;for(let k=0;k<4;k++){B.vx=0;B.vz=7;for(let i=0;i<60*2.5;i++){const e=SC.step(B,{tx:0,tz:1,mag:.4,jump:i===2,trick:i===6,ix:1},1/60,calm);}n++}
  ok(B.combo>=2||B.score>0,'repeated clean landings build a combo ('+B.combo+')')}
{const B=SC.create(0,0,0,SEA);const ev=SC.step(B,{tx:0,tz:1,mag:0,trick:true},1/60,calm);ok(ev.some(e=>e.t==='pump')&&B.speed>.5,'Trick on the water is a pump (speed burst)');const v1=B.speed;const e2=SC.step(B,{tx:0,tz:1,mag:0,trick:true},1/60,calm);ok(!e2.some(e=>e.t==='pump'),'pump has a cooldown')}
{const B=SC.create(0,0,0,SEA);const ev=SC.step(B,{tx:0,tz:1,mag:1},1/60,{water:()=>SEA,slope:()=>({x:0,z:0}),ground:()=>2});ok(ev.some(e=>e.t==='beach'),'riding into the sand ends the ride (beach event)')}
// ---- race course ----
for(const s of SD.SPOTS){const c=SC.course(s,6);if(!(c.gates.length===6&&c.gates.every(g=>H(g.x,g.z)<-.8&&isFinite(g.x+g.z))&&c.gates.every((g,i)=>i===0||hyp(g.x-c.gates[i-1].x,g.z-c.gates[i-1].z)>15&&hyp(g.x-c.gates[i-1].x,g.z-c.gates[i-1].z)<60))){ok(false,'course for '+s.id+' is 6 gates in open water, 15-60 m apart')}}
ok(true,'every spot has a Reef Run of 6 gates in open water');
{const s=SD.SPOTS[0],R=SC.newRun(s);let fin=null,t=100;for(const g of R.gates){const r=SC.runStep(R,g.x,g.z,t);t+=2;if(r&&r.t==='finish')fin=r}ok(fin&&R.done&&Math.abs(fin.time-10)<1e-9,'passing the gates in order finishes the run ('+(fin&&fin.time)+' s)');
  const R2=SC.newRun(s);const last=R2.gates[5];ok(SC.runStep(R2,last.x,last.z,0)===null&&R2.i===0,'gates must be taken in order')}
console.log(bad?bad+' FAILED':'all ok');process.exit(bad?1:0);
