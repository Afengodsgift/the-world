// Skybreak Grand Circuit (skybreak-2): a longer course with a dirt shortcut (Cay Cut), optional gates, gold bonus rings and a Palm finish.
// Geometry sanity, fork/skip/bonus logic, and full AI races driven with the real physics. Run: node tests/rally_track2.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const ctx={Math,Object,Number,JSON,Array,isFinite,Map,Float32Array};vm.createContext(ctx);
vm.runInContext(['src/data/rally.js','src/race/CarPhysics.js','src/data/tracks.js','src/race/Track.js','src/race/Pilot.js'].map(f=>fs.readFileSync(R+f,'utf8')).join('\n')+';this.RL=RALLY;this.CP=CarPhysics;this.TR=TRACKS;this.Tk=Track;this.Pilot=Pilot',ctx);
const {CP,TR,Tk,Pilot}=ctx;
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const ISL=[{x:760,z:1400,R:230,pk:0},{x:0,z:1750,R:180,pk:10},{x:-980,z:1450,R:300,pk:60}];
const H=(x,z)=>{let h=-12;for(const I of ISL){const dx=x-I.x,dz=z-I.z,dd=Math.hypot(dx,dz),v=Math.max(-12,(1-(dd/I.R)**2)*4-.6)+Math.sin(x*.09)*Math.cos(z*.11)*.7+I.pk*Math.exp(-dd*dd/(2*(I.R*.35)**2));if(v>h)h=v}return h};
const T=Tk.build(TR['skybreak-2'],{H}),T1=Tk.build(TR['skybreak-1'],{H});

// ---------- geometry ----------
{
  let mr=1e9,ms=0,minY=1e9;
  for(const r of T.roads){for(let i=2;i<r.m-2;i++){const a=Math.atan2(r.TX[i+1],r.TZ[i+1])-Math.atan2(r.TX[i-1],r.TZ[i-1]),da=Math.abs(Math.atan2(Math.sin(a),Math.cos(a)));if(da>1e-6)mr=Math.min(mr,(r.S[i+1]-r.S[i-1])/da);ms=Math.max(ms,Math.abs(r.Y[i+1]-r.Y[i-1])/(r.S[i+1]-r.S[i-1]))}for(let i=0;i<r.m;i++)minY=Math.min(minY,r.Y[i])}
  ok(mr>=12,`tightest bend ${mr.toFixed(1)} m radius`);ok(ms<=.62,`steepest slope ${ms.toFixed(2)}`);ok(minY>=.45-1e-6,'no road dips below the waterline');
  const main=T.roads.filter(r=>!r.alt).reduce((a,r)=>a+r.len,0),cl=T1.roads.reduce((a,r)=>a+r.len,0);
  ok(main>cl*1.2,`the Grand Circuit is much longer: ${main.toFixed(0)} m of main road vs ${cl.toFixed(0)} m for the classic`);
  ok(T.gates.length>T1.gates.length+10,`${T.gates.length} gates vs ${T1.gates.length}`);
  ok(T.forks.length>=1&&T.forks.every(f=>T.roads[f.alt].alt),`${T.forks.length} shortcut fork(s), each leading onto a dirt road`);
  const cut=T.roads.find(r=>r.id==='storm-cut'),mainRoad=T.roads.find(r=>r.id==='storm');
  ok(cut&&cut.len<150+mainRoad.len,'the Cay Cut exists');
  ok(T.gates.some(g=>g.opt),'optional gates exist on the main route');
  ok(T.bonus.length>=6,`${T.bonus.length} gold bonus rings`);
  ok(T.gates[T.gates.length-1].finish,'the last gate is the finish');
}

// ---------- full races ----------
function race(skill,cls,seed){
  const s=T.gridSlots(12)[seed%12],env={ground:T.ground,surf:T.surf,landOK:T.landOK};
  const car=CP.newCar(s.x,s.z,s.h,cls,env),r=Tk.racer(),p=Pilot.make(T,skill,seed+1),inp={},DT=1/60;let t=0,cuts=0,bonus=0,rec=0,order=true,last=-1;
  for(let i=0;i<60*420;i++){
    Pilot.drive(p,car,r,t,DT,inp);
    const wasFly=car.mode==='fly';CP.step(car,inp,DT,env);void wasFly;
    if(car.mode==='car'&&car.grounded&&T.padAt(car.x,car.y,car.z)>=0)CP.pad(car,1.4);
    const e=Tk.advance(T,r,car.x,car.y,car.z,t);
    if(e.gate>=0){if(e.gate<=last)order=false;last=e.gate;if(e.mode==='fly'&&car.mode==='car')CP.toFly(car);if(e.perfect&&T.gates[e.gate].type==='air'&&T.gates[e.gate].boost)CP.pad(car,1.2)}
    if(e.cut)cuts++;if(e.bonus>=0){bonus++;CP.pad(car,T.bonus[e.bonus].secs)}
    const w=Tk.needsRecovery(T,r,car,DT);if(w){rec++;const rs=T.respawn(r,{});car.x=rs.x;car.y=rs.y;car.z=rs.z;car.h=rs.h;car.vx=Math.sin(rs.h)*rs.speed;car.vz=Math.cos(rs.h)*rs.speed;car.vy=0;car.grounded=rs.mode==='car';car.mode='car';if(rs.mode==='fly')CP.toFly(car)}
    t+=DT;if(r.finished)return {fin:true,time:t,cuts,bonus,rec,order,r};
  }
  return {fin:false,time:t,cuts,bonus,rec,order,r};
}
{
  const out=[];
  for(const [sk,cls,seed] of [['expert','ace',0],['expert','comet',3],['steady','ace',1],['steady','bruiser',5],['rookie','ace',2],['expert','bruiser',7],['rookie','bruiser',9],['rookie','comet',4],['rookie','ace',6]]){const o=race(sk,cls,seed);out.push(o);console.log(`     [${sk}/${cls}] ${o.fin?'finished '+o.time.toFixed(0)+' s':'DID NOT FINISH'} cuts ${o.cuts} bonus ${o.bonus} recoveries ${o.rec}`)}
  ok(out.every(o=>o.fin),'every AI skill and car finishes the whole Grand Circuit');
  ok(out.every(o=>o.order),'gates are always passed in increasing order');
  ok(out.some(o=>o.cuts>0)&&out.some(o=>o.cuts===0),'the shortcut is a real choice: some drivers take it, some do not');
  { // the AI ignores the gold rings; a car flying straight through one must still collect it exactly once
    const b=T.bonus[0],r=Tk.racer();r.next=0;let n=0;
    for(let k=-6;k<=6;k++){const e=Tk.advance(T,r,b.x+b.nx*k*2,b.y,b.z+b.nz*k*2,k);if(e.bonus>=0)n++}
    ok(n===1,'flying through a bonus ring collects it exactly once') }
  ok(out.every(o=>o.rec<=3),'no driver needs more than 3 recoveries');
  ok(out.filter(o=>o.fin).every(o=>Tk.plausible(T,o.r)),'splits stay plausible, skipped gates included');
  const ex=out[0];ok(ex.time>80,`the race is long (${ex.time.toFixed(0)} s for an expert)`);
}
// ---------- guard walls: you cannot drive off a mountain edge or bridge, and the shortcut is still open ----------
{
  const env={ground:T.ground,surf:T.surf,landOK:T.landOK,block:T.block};
  let flagged=0,total=0;for(const r of T.roads){for(let i=0;i<r.m;i++){total+=2;flagged+=r.GP[i]+r.GM[i]}}
  ok(flagged>total*.04,`guard walls cover the drop-offs (${(flagged/total*100).toFixed(0)}% of road edges)`);
  const fa=T.roads.find(r=>r.id==='frost-a');let pick=-1,side=0;for(let i=20;i<fa.m-20&&pick<0;i+=3){if(fa.GP[i]&&fa.GP[i+2]&&fa.GP[i-2]){pick=i;side=1}else if(fa.GM[i]&&fa.GM[i+2]&&fa.GM[i-2]){pick=i;side=-1}}
  ok(pick>=0,'the mountain spiral has guarded edges');
  if(pick>=0){
    let worst=0,drop=0;
    for(const ang of [.5,.9,1.3]){
      const i=pick,nx=-fa.TZ[i]*side,nz=fa.TX[i]*side,hd=Math.atan2(fa.TX[i],fa.TZ[i]),c=CP.newCar(fa.X[i],fa.Z[i],hd,'ace',env);c.y=fa.Y[i];c.vx=Math.sin(hd)*30;c.vz=Math.cos(hd)*30;
      c.h=hd-ang*side*(-1)*(Math.sign(nx*Math.cos(hd)-nz*Math.sin(hd))||1)*0;   // (heading set below by aiming at the edge)
      const tx=fa.X[i]+nx*30,tz=fa.Z[i]+nz*30;c.h=Math.atan2(tx-c.x,tz-c.z);c.vx=Math.sin(c.h)*28;c.vz=Math.cos(c.h)*28;
      for(let k=0;k<60*4;k++){CP.step(c,{thr:1,steer:0},1/60,env);const p=T.project(c.x,c.z,{},-1);
        worst=Math.max(worst,Math.abs(p.d)-p.w/2);drop=Math.max(drop,p.y-c.y)}
    }
    ok(worst<2.2&&drop<3,`driving straight at the mountain edge never leaves the deck (max ${worst.toFixed(1)} m past the edge, ${drop.toFixed(1)} m drop)`);
  }
  // the Cay Cut can be entered: a car on the main road heading into the cut's first sample reaches it without a wall in the way
  const cut=T.roads.find(r=>r.id==='storm-cut'),st=T.roads.find(r=>r.id==='storm');let walls=0;
  for(let i=0;i<st.m;i++)if(Math.hypot(st.X[i]-cut.X[0],st.Z[i]-cut.Z[0])<45)walls+=st.GP[i]+st.GM[i];
  ok(walls===0,'no guard wall within 45 m of where the shortcut leaves the main road');
}
// ---------- skip logic: crossing the merge gate skips the optional gates; missing it does not ----------
{
  const i0=T.gates.findIndex(g=>g.opt);const g0=T.gates[i0];let k=i0;while(T.gates[k].opt)k++;const merge=T.gates[k];
  const r=Tk.racer();r.next=r.passed=i0;r.alt=true;
  ok(Tk.navGate(T,r)===merge,'on the shortcut, the arrow points at the merge gate');
  const q=Tk.racer();q.next=q.passed=i0;
  ok(Tk.navGate(T,q)===g0,'on the main road, the arrow points at the next optional gate');
  const s1=Tk.score(T,r,merge.x-30,merge.y,merge.z),s2=Tk.score(T,q,g0.x,g0.y,g0.z);
  ok(s1>s2,'a driver on the shortcut ranks ahead of one still at the fork');
}
process.exit(fails?1:0);
