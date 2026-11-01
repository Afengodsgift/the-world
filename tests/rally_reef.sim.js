// REEF RUN (reef-run): the Palm -> Storm course with a fork between the SKY route (ramp + rings) and the REEF TUNNEL, a road on the seabed. Checks the underwater road
// geometry, that cars on it are not "rescued" from the sea, that AI drivers finish by either route, and that the tunnel is a real choice. Run: node tests/rally_reef.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const ctx={Math,Object,Number,JSON,Array,isFinite,Map,Float32Array};vm.createContext(ctx);
vm.runInContext(['src/data/rally.js','src/race/CarPhysics.js','src/data/tracks.js','src/race/Track.js','src/race/Pilot.js'].map(f=>fs.readFileSync(R+f,'utf8')).join('\n')+';this.TR=TRACKS;this.Tk=Track;this.CP=CarPhysics;this.Pilot=Pilot',ctx);
const {TR,Tk,CP,Pilot}=ctx;let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const ISL=[{x:760,z:1400,R:230,pk:0},{x:0,z:1750,R:180,pk:10},{x:-980,z:1450,R:300,pk:60}];
const H=(x,z)=>{let h=-12;for(const I of ISL){const dx=x-I.x,dz=z-I.z,dd=Math.hypot(dx,dz),v=Math.max(-12,(1-(dd/I.R)**2)*4-.6)+Math.sin(x*.09)*Math.cos(z*.11)*.7+I.pk*Math.exp(-dd*dd/(2*(I.R*.35)**2));if(v>h)h=v}return h};
ok(!!TR['reef-run'],'the Reef Run track exists');
const T=Tk.build(TR['reef-run'],{H}),tun=T.roads.find(r=>r.id==='reef-tunnel');
{
  ok(tun&&tun.alt&&tun.sub,'the tunnel is an alternate, underwater (sub) road');
  let minY=1e9,flat=0;for(let i=0;i<tun.m;i++){minY=Math.min(minY,tun.Y[i]);if(Math.abs(tun.Y[i]+5)<.01)flat++}
  ok(minY>=-5.01&&flat>tun.m*.4,`it runs level at -5 m for ${(flat/tun.m*100).toFixed(0)}% of its length (lowest ${minY.toFixed(2)})`);
  let under=0;for(let i=0;i<tun.m;i++)if(tun.Y[i]<-.3)under++;ok(under>tun.m*.6,`${(under/tun.m*100).toFixed(0)}% of the tunnel is below the waves`);
  let ground=true,maxSlope=0;for(let i=1;i<tun.m;i++){if(tun.Y[i]<H(tun.X[i],tun.Z[i])+.05)ground=false;maxSlope=Math.max(maxSlope,Math.abs(tun.Y[i]-tun.Y[i-1])/2)}
  ok(ground,'the deck never goes inside the seabed or the beach');ok(maxSlope<.6,`gentle slopes (max ${maxSlope.toFixed(2)})`);
  ok(T.forks.length===2&&T.forks[0].alt===T.roadIndex['reef-tunnel'],'two forks: the tunnel and the splash pier');
  ok(tun.len>600&&tun.len<1000,`tunnel length ${tun.len.toFixed(0)} m`);
  ok(T.bonus.filter(b=>b.y<0).length===3&&T.bonus.filter(b=>b.name==='SPLASH RING').length===2,'three pearl rings hang inside the tunnel, two splash rings over the pier');
  ok(T.gates.filter(g=>g.opt).length===7&&T.gates[T.gates.length-1].finish,'the sky route gates are optional; the last gate is the finish');
  ok(T.subAt(tun.X[tun.m>>1],tun.Z[tun.m>>1])&&!T.subAt(760,1400),'subAt tells tunnel from island');
  // a car in the tunnel is not "rescued from the sea"; a car in open water is
  const mid=tun.m>>1,r=Tk.racer(),c={mode:'car',grounded:true,x:tun.X[mid],z:tun.Z[mid],y:tun.Y[mid],vx:20,vz:0,vy:0};
  ok(Tk.needsRecovery(T,r,c,.016)===null,'a car on the underwater road is not rescued');
  const c2={mode:'car',grounded:true,x:200,z:900,y:-3,vx:20,vz:0,vy:0};ok(Tk.needsRecovery(T,Tk.racer(),c2,.016)==='water','a car swimming in open sea still is');
}
function race(skill,cls,seed){
  const s=T.gridSlots(12)[seed%12],env={ground:T.ground,surf:T.surf,landOK:T.landOK,block:T.block};
  const car=CP.newCar(s.x,s.z,s.h,cls,env),r=Tk.racer(),p=Pilot.make(T,skill,seed+1),inp={},DT=1/60;let t=0,cuts=0,water=0,rec=0,deep=0;
  for(let i=0;i<60*300;i++){
    Pilot.drive(p,car,r,t,DT,inp);CP.step(car,inp,DT,env);
    if(car.mode==='car'&&car.grounded&&T.padAt(car.x,car.y,car.z)>=0)CP.pad(car,1.4);
    const e=Tk.advance(T,r,car.x,car.y,car.z,t);
    if(e.gate>=0&&e.mode==='fly'&&car.mode==='car')CP.toFly(car);if(e.gate>=0&&e.perfect&&T.gates[e.gate].type==='air'&&T.gates[e.gate].boost)CP.pad(car,1.2);
    if(e.cut)cuts++;if(e.bonus>=0)CP.pad(car,T.bonus[e.bonus].secs);if(car.y<-3&&car.grounded)deep++;
    const w=Tk.needsRecovery(T,r,car,DT);if(w){rec++;if(w==='water')water++;const rs=T.respawn(r,{});car.x=rs.x;car.y=rs.y;car.z=rs.z;car.h=rs.h;car.vx=Math.sin(rs.h)*rs.speed;car.vz=Math.cos(rs.h)*rs.speed;car.vy=0;car.grounded=rs.mode==='car';car.mode='car';if(rs.mode==='fly')CP.toFly(car)}
    t+=DT;if(r.finished)return {fin:true,time:t,cuts,rec,water,deep,r};
  }
  return {fin:false,time:t,cuts,rec,water,deep,r};
}
{
  const out=[];for(const [sk,cls,seed] of [['expert','ace',0],['expert','comet',3],['steady','ace',1],['steady','bruiser',5],['rookie','ace',2],['rookie','comet',4],['expert','bruiser',7],['rookie','bruiser',9]]){const o=race(sk,cls,seed);out.push(o);console.log(`     [${sk}/${cls}] ${o.fin?'finished '+o.time.toFixed(0)+' s':'DID NOT FINISH'}, ${o.cuts?'TUNNEL':'sky'}, ${o.deep} frames deep, rescues ${o.rec} (water ${o.water})`)}
  ok(out.every(o=>o.fin),'every AI skill and car finishes the Reef Run');
  ok(out.some(o=>o.cuts>0)&&out.some(o=>o.cuts===0),'the tunnel is a real choice: some drivers dive, some fly');
  ok(out.filter(o=>o.deep>60).every(o=>o.water===0),'nobody who takes the tunnel is rescued from the "sea"');
  ok(out.some(o=>o.deep>60),'some drivers really do dive underwater (the rest take the sky or the pier)');
  ok(out.every(o=>o.rec<=3),'no driver needs more than 3 recoveries');
  ok(out.filter(o=>o.fin).every(o=>Tk.plausible(T,o.r)),'splits stay plausible');
}
console.log(fails?`\n${fails} FAILED`:'\nall ok');process.exit(fails?1:0);
