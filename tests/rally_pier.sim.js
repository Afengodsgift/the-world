// SPLASH PIER (reef-run): a road on the sea with three jump ramps. Checks the geometry, that a car really launches off each hop and lands back on the pier, and that AI finish by it.
// Run: node tests/rally_pier.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const ctx={Math,Object,Number,JSON,Array,isFinite,Map,Float32Array};vm.createContext(ctx);
vm.runInContext(['src/data/rally.js','src/race/CarPhysics.js','src/data/tracks.js','src/race/Track.js','src/race/Pilot.js'].map(f=>fs.readFileSync(R+f,'utf8')).join('\n')+';this.TR=TRACKS;this.Tk=Track;this.CP=CarPhysics;this.Pilot=Pilot',ctx);
const {TR,Tk,CP,Pilot}=ctx;let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const ISL=[{x:760,z:1400,R:230,pk:0},{x:0,z:1750,R:180,pk:10},{x:-980,z:1450,R:300,pk:60}];
const H=(x,z)=>{let h=-12;for(const I of ISL){const dx=x-I.x,dz=z-I.z,dd=Math.hypot(dx,dz),v=Math.max(-12,(1-(dd/I.R)**2)*4-.6)+Math.sin(x*.09)*Math.cos(z*.11)*.7+I.pk*Math.exp(-dd*dd/(2*(I.R*.35)**2));if(v>h)h=v}return h};

const T=Tk.build(TR['reef-run'],{H}),pr=T.roads.find(r=>r.id==='splash-pier'),pi=T.roadIndex['splash-pier'];
ok(pr&&pr.alt&&!pr.sub,'the pier is an alternate surface road');
let hi=0,hops=0;for(let i=1;i<pr.m;i++){const sea=H(pr.X[i],pr.Z[i])<-.5;if(!sea&&i>3&&i<pr.m-3)hi++}
for(let i=3;i<pr.m-3;i++){let mx=true;for(let k=-3;k<=3;k++)if(pr.Y[i+k]>pr.Y[i]+1e-6)mx=false;if(mx&&pr.Y[i]-pr.Y[Math.max(0,i-12)]>1.5)hops++;}
ok(hi<pr.m*.15,'the pier is over open water ('+hi+' of '+pr.m+' points on land)');
ok(hops>=3,'three hop ramps in the deck ('+hops+')');
ok(T.forks.length===2&&T.forks[1].alt===pi,'a second fork leads to the pier');
ok(pr.len>600&&pr.len<1100,'pier length '+pr.len.toFixed(0)+' m');
function race(skill,cls,seed){
  const s=T.gridSlots(12)[seed%12],env={ground:T.ground,surf:T.surf,landOK:T.landOK,block:T.block};
  const car=CP.newCar(s.x,s.z,s.h,cls,env),r=Tk.racer(),p=Pilot.make(T,skill,seed+1),inp={},DT=1/60;let t=0,onPier=0,air=0,airMax=0,rec=0,water=0,airT=0,hopsDone=0;
  for(let i=0;i<60*300;i++){
    Pilot.drive(p,car,r,t,DT,inp);CP.step(car,inp,DT,env);
    if(car.mode==='car'&&car.grounded&&T.padAt(car.x,car.y,car.z)>=0)CP.pad(car,1.4);
    const e=Tk.advance(T,r,car.x,car.y,car.z,t);
    if(e.gate>=0&&e.mode==='fly'&&car.mode==='car')CP.toFly(car);if(e.gate>=0&&e.perfect&&T.gates[e.gate].type==='air'&&T.gates[e.gate].boost)CP.pad(car,1.2);
    if(e.bonus>=0)CP.pad(car,T.bonus[e.bonus].secs);
    const pj=T.project(car.x,car.z,{},-1);const onP=pj.road===pi&&pj.dist<9;
    if(onP&&car.grounded)onPier+=DT;
    if(onP&&car.mode==='car'&&!car.grounded){airT+=DT}else if(airT>0){if(airT>.3){hopsDone++;airMax=Math.max(airMax,airT)}airT=0}
    const w=Tk.needsRecovery(T,r,car,DT);if(w){rec++;if(w==='water'){water++;if(process.env.DBG){const q=T.project(car.x,car.z,{},-1);console.log('WATER',t.toFixed(1),car.x.toFixed(0),car.y.toFixed(1),car.z.toFixed(0),'road',q.road,'s',q.s.toFixed(0),'d',q.dist.toFixed(1),'spd',car.s.toFixed(0))}}const rs=T.respawn(r,{});car.x=rs.x;car.y=rs.y;car.z=rs.z;car.h=rs.h;car.vx=Math.sin(rs.h)*rs.speed;car.vz=Math.cos(rs.h)*rs.speed;car.vy=0;car.s=rs.speed}
    t+=DT;if(r.finished)break;
  }
  return {sk:skill,fin:r.finished,time:t,onPier,hopsDone,airMax,rec,water,r};
}
const out=[];for(let seed=0;seed<14;seed++){const sk=['expert','steady','rookie'][seed%3],cls=['ace','comet','bruiser'][seed%3===0?seed%3:(seed>>1)%3];const o=race(sk,cls,seed);out.push(o);console.log('   ',sk,cls,seed,'fin',o.fin,o.time.toFixed(1)+'s pier',o.onPier.toFixed(1),'hops',o.hopsDone,'air',o.airMax.toFixed(2),'rec',o.rec,'water',o.water)}
ok(out.every(o=>o.fin),'every driver finishes');
const pier=out.filter(o=>o.onPier>3);ok(pier.length>=2,'some drivers take the pier ('+pier.length+')');
ok(pier.every(o=>o.hopsDone>=2),'pier drivers actually leave the ground on the hops');
ok(pier.every(o=>o.airMax>.35&&o.airMax<2.5),'hop air time is a jump, not a flight ('+pier.map(o=>o.airMax.toFixed(2)).join(',')+')');
ok(pier.filter(o=>o.sk!=='rookie').every(o=>o.water===0)&&pier.every(o=>o.water<=2),'steady and expert drivers never fall off the pier; a rookie may slip off the open entry at worst twice');
ok(out.every(o=>o.rec<=3),'recoveries stay low');
ok(out.filter(o=>o.fin).every(o=>Tk.plausible(T,o.r)),'splits are plausible');
console.log(fails?`\n${fails} FAILED`:'\nall ok');process.exit(fails?1:0);
