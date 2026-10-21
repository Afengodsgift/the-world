// Skybreak Rally track system: geometry fits the real islands, surface queries, gates (order, tunnelling, near-miss), pads, hazards (fairness),
// start grid, recovery, host plausibility, and a FULL AUTOMATED RACE (grid -> slalom -> hammers -> hairpins -> bridge -> kicker -> launch ramp ->
// flight through the rings -> landing -> finish) driven by the Pilot with the real physics. Pure modules, no THREE. Run: node tests/rally_track.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const ctx={Math,Object,Number,JSON,Array,isFinite,Map,Float32Array};vm.createContext(ctx);
vm.runInContext(['src/data/rally.js','src/race/CarPhysics.js','src/data/tracks.js','src/race/Track.js','src/race/Pilot.js'].map(f=>fs.readFileSync(R+f,'utf8')).join('\n')+';this.RL=RALLY;this.CP=CarPhysics;this.TR=TRACKS;this.Tk=Track;this.Pilot=Pilot',ctx);
const {RL,CP,TR,Tk,Pilot}=ctx;
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
// Replica of the game's terrain for the three islands involved (index.html H(): the ISL term; main-island terms are far below sea level out here)
const ISL=[{x:760,z:1400,R:230,pk:0},{x:0,z:1750,R:180,pk:10},{x:-980,z:1450,R:300,pk:60}];
const H=(x,z)=>{let h=-12;for(const I of ISL){const dx=x-I.x,dz=z-I.z,dd=Math.hypot(dx,dz),v=Math.max(-12,(1-(dd/I.R)**2)*4-.6)+Math.sin(x*.09)*Math.cos(z*.11)*.7+I.pk*Math.exp(-dd*dd/(2*(I.R*.35)**2));if(v>h)h=v}return h};
const T=Tk.build(TR['skybreak-1'],{H});
const PALM={x:760,z:1400},KT={hw:95,hh:65};
const A=T.roads[0],B=T.roads[1],S=T.roads[2];

// ---------- 1. geometry fits the islands ----------
{
  let shore=1e9,kt=1e9,minY=1e9,minR=1e9,maxSl=0,maxSlB=0;
  for(const r of [A,B]){for(let i=0;i<r.m;i++){
    const lx=r.X[i]-PALM.x,lz=r.Z[i]-PALM.z;shore=Math.min(shore,212-(Math.hypot(lx,lz)+r.W[i]/2));
    kt=Math.min(kt,Math.hypot(Math.max(0,Math.abs(lx)-KT.hw),Math.max(0,Math.abs(lz)-KT.hh))-r.W[i]/2);minY=Math.min(minY,r.Y[i]);
    if(i>1&&i<r.m-2){const a=Math.atan2(r.TX[i+1],r.TZ[i+1])-Math.atan2(r.TX[i-1],r.TZ[i-1]),da=Math.abs(Math.atan2(Math.sin(a),Math.cos(a)));if(da>1e-6)minR=Math.min(minR,(r.S[i+1]-r.S[i-1])/da)}
    if(i>0){const sl=Math.abs(r.Y[i]-r.Y[i-1])/(r.S[i]-r.S[i-1]);maxSl=Math.max(maxSl,sl)}}}
  ok(shore>6,`both Palm roads stay on land: road edge is >= ${shore.toFixed(1)} m from the beach`);
  ok(kt>12,`clear of the existing foot-race loop by ${kt.toFixed(1)} m (never crosses it)`);
  ok(minY>=.45-1e-6,`roads never dip below the waterline (min deck y ${minY.toFixed(2)})`);
  ok(minR>=12,`tightest bend has a ${minR.toFixed(1)} m centre-line radius (road is 16 m wide)`);
  ok(maxSl<=.62&&maxSl>.4,`steepest slope is the launch ramp: ${maxSl.toFixed(2)} (kit-ramp territory, not a wall)`);
  { let mr=1e9,ms=0;for(const r of T.roads)for(let i=2;i<r.m-2;i++){const a=Math.atan2(r.TX[i+1],r.TZ[i+1])-Math.atan2(r.TX[i-1],r.TZ[i-1]),da=Math.abs(Math.atan2(Math.sin(a),Math.cos(a)));if(da>1e-6)mr=Math.min(mr,(r.S[i+1]-r.S[i-1])/da);ms=Math.max(ms,Math.abs(r.Y[i+1]-r.Y[i-1])/(r.S[i+1]-r.S[i-1]))}
    ok(mr>=12&&ms<=.62,`across all five roads: tightest bend ${mr.toFixed(1)} m radius, steepest slope ${ms.toFixed(2)}`);
    ok(T.roads.every(r=>{let m=1e9;for(let i=0;i<r.m;i++)m=Math.min(m,r.Y[i]);return m>=.45-1e-6}),'no road anywhere dips below the waterline');
    const tot=T.roads.reduce((a,r)=>a+r.len,0);ok(tot>1900&&tot<2300,`${tot.toFixed(0)} m of road across three islands`)}
  ok(A.len>600&&A.len<750,`Palm ground course is ${A.len.toFixed(0)} m, plus ${B.len.toFixed(0)} m run-up/ramp`);
  const lipA=[A.X[A.m-1],A.Z[A.m-1]],b0=[B.X[0],B.Z[0]];
  ok(Math.abs(Math.hypot(lipA[0]-b0[0],lipA[1]-b0[1])-24)<1,'the kicker is a real 24 m gap between two roads');
  // no road runs through another one: samples far apart along a road are never closer than the road width
  let overlap=0;const all=[];for(const r of T.roads)for(let i=0;i<r.m;i+=2)all.push([r.id,r.S[i],r.X[i],r.Z[i],r.W[i]]);
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j];if(a[0]===b[0]&&Math.abs(a[1]-b[1])<50)continue;if(a[0]!==b[0]){const ia=T.roads.findIndex(r=>r.id===a[0]),ib=T.roads.findIndex(r=>r.id===b[0]),ra=T.roads[ia],rb=T.roads[ib];if(Math.abs(ia-ib)===1&&((ia<ib&&a[1]>ra.len-45&&b[1]<45)||(ib<ia&&b[1]>rb.len-45&&a[1]<45)))continue}   // consecutive roads meet across a kicker gap: that is the point
    if(Math.hypot(a[2]-b[2],a[3]-b[3])<(a[0]===b[0]?20:(a[4]+b[4])/2+2))overlap++}
  ok(overlap===0,'no stretch of road passes within 20 m of a different stretch (no accidental crossings)');
  // every authored reference resolved (a bad control-point index would silently become NaN)
  ok(T.gates.length===32&&T.gates.every(g=>[g.x,g.y,g.z,g.nx,g.nz].every(isFinite)),'all 32 gates resolve to real positions');
  ok(T.pads.every(p=>[p.x,p.y,p.z].every(isFinite))&&T.hazards.every(h=>[h.x,h.y,h.z].every(isFinite)),'every boost pad and hammer resolves to a real position');
  // the launch ramps aim at the first ring of their flight; each flight ends in a landing zone
  const lips=T.gates.map((g,i)=>[g,i]).filter(([g])=>g.k==='lip'),tds=T.gates.map((g,i)=>[g,i]).filter(([g])=>g.k==='touchdown');
  ok(lips.length===2&&tds.length===2,'two flights: two launch lips, two touchdowns');
  for(const [g,i] of lips){const rd=T.roads[g.road],ramp=Math.atan2(rd.TX[rd.m-1],rd.TZ[rd.m-1]),ring=T.gates[i+1],ang=Math.atan2(ring.x-g.x,ring.z-g.z);
    ok(Math.abs(Tk.wrap(ang-ramp))<.6&&ring.y>g.y,`lip ${i}: the ramp heading is within ${(Math.abs(Tk.wrap(ang-ramp))*57.3).toFixed(0)} deg of the first ring, which is higher than the lip`)}
  for(const [g,i] of tds)ok(T.landOK(g.x,g.z)&&!T.landOK(0,0),`touchdown ${i} is inside a landing zone (and the world origin is not)`);
  ok(T.gates.slice(9,14).concat(T.gates.slice(19,24)).every(g=>g.type==='air'),'two sets of five aerial rings');
  // the sky legs: ring spacing is sane and the last ring of each leg is a shallow glide to the strip
  for(const [a,b] of [[9,14],[19,24]]){let mx=0,mn=1e9;for(let i=a;i<b;i++){const d=Math.hypot(T.gates[i+1].x-T.gates[i].x,T.gates[i+1].z-T.gates[i].z);mx=Math.max(mx,d);mn=Math.min(mn,d)}
    const last=T.gates[b-1],td=T.gates[b],gl=Math.atan2(last.y-T.ground(td.x,td.z,1e4),Math.hypot(td.x-last.x,td.z-last.z));
    ok(mn>70&&mx<220&&gl<.3,`flight ${a}: rings ${mn.toFixed(0)}-${mx.toFixed(0)} m apart, final glide ${(gl*57.3).toFixed(0)} deg`)}
  const fr=T.roads[3],fb=T.roads[4];ok(Math.abs(Math.hypot(fr.X[fr.m-1]-fb.X[0],fr.Z[fr.m-1]-fb.Z[0])-24)<2,'Frost also has a real 24 m kicker gap');
  ok(fb.Y[fb.m-1]>35,`the Frost finish is on the mountain (${fb.Y[fb.m-1].toFixed(0)} m above the sea)`);
}
// ---------- 2. surface ----------
{
  const mid=A.m>>1,x=A.X[mid],z=A.Z[mid],y=A.Y[mid];
  ok(Math.abs(T.ground(x,z,y+1)-y)<1e-3,'centre of the road returns the deck height');
  ok(!T.surf(x,z).rough,'on the road: not rough');
  const nx=-A.TZ[mid],nz=A.TX[mid];
  ok(T.surf(x+nx*12,z+nz*12).rough,'12 m off the road: rough (grass slows you)');
  ok(Math.abs(T.ground(PALM.x,PALM.z,50)-H(PALM.x,PALM.z))<1e-6,'far from any road (island centre): plain terrain');
  // shoulder: monotone blend from deck to terrain, no wall (a car can leave the road without hitting a step)
  let prev=T.ground(x,z,y+1),worst=0;for(let d=0;d<=14;d+=.5){const h=T.ground(x+nx*d,z+nz*d,y+1);worst=Math.max(worst,Math.abs(h-prev));prev=h}
  ok(worst<.6,`road edge blends into terrain with no step (largest 0.5 m jump ${worst.toFixed(2)} m)`);
  // the bridge is 6 m up and falls away at the edge (a drop, not a ramp)
  const br=T.at(0,A.cs[21],{});ok(Math.abs(br.y-(Math.max(H(br.x,br.z)+.08,.45)+6))<.2,`bridge deck is 6 m above the terrain (${(br.y-H(br.x,br.z)).toFixed(1)} m)`);
  const sideD=T.ground(br.x-br.tz*14,br.z+br.tx*14,50);ok(br.y-sideD>4,'beside the bridge the ground is far below (leaving it is a fall)');
  // the road ends at the ramp lip: just past it there is only terrain
  const lip=T.at(1,B.len,{});ok(lip.y>20&&T.ground(lip.x+lip.tx*4,lip.z+lip.tz*4,lip.y+1)<4,'past the lip there is no road: the ramp really is a launch');
  // performance sanity
  const t0=Date.now();let acc=0;for(let i=0;i<200000;i++)acc+=T.ground(A.X[i%A.m]+3,A.Z[i%A.m]+2,10);const ms=Date.now()-t0;
  ok(ms<1500,`200 000 surface queries in ${ms} ms (a car makes ~8 per frame)`);
}
// ---------- 3. gates ----------
{
  const g=T.gates[2],r=Tk.racer();Tk.advance(T,r,g.x-g.nx*5,g.y,g.z-g.nz*5,0);
  // a 100 m/s frame (1.7 m) cannot tunnel, but even a 40 m jump across the plane counts
  let e=Tk.advance(T,r,g.x+g.nx*40,g.y,g.z+g.nz*40,.1);
  ok(e.gate===-1&&r.passed===0,'gate 2 does not count before gates 0 and 1 (strictly in order)');
  const r2=Tk.racer();let t=0;for(let i=0;i<3;i++){const q=T.gates[i];Tk.advance(T,r2,q.x-q.nx*20,q.y,q.z-q.nz*20,t);e=Tk.advance(T,r2,q.x+q.nx*20,q.y,q.z+q.nz*20,t+=.5)}
  ok(r2.passed===3&&r2.next===3&&e.gate===2&&e.perfect,'three gates in order: progress 3, last one perfect');
  const r3=Tk.racer();const q=T.gates[0];Tk.advance(T,r3,q.x+q.nx*20,q.y,q.z+q.nz*20,0);Tk.advance(T,r3,q.x-q.nx*20,q.y,q.z-q.nz*20,1);
  ok(r3.passed===0,'crossing the gate backwards does not count');
  const r4=Tk.racer();const off=q.r*1.3;Tk.advance(T,r4,q.x-q.nx*3+(-q.nz)*off,q.y,q.z-q.nz*3+q.nx*off,0);e=Tk.advance(T,r4,q.x+q.nx*3+(-q.nz)*off,q.y,q.z+q.nz*3+q.nx*off,.1);
  ok(r4.passed===1&&!e.perfect,'a near miss (inside 1.5x radius) still progresses but is not perfect');
  const r5=Tk.racer(),o3=q.r*3;Tk.advance(T,r5,q.x-q.nx*3+(-q.nz)*o3,q.y,q.z-q.nz*3+q.nx*o3,0);e=Tk.advance(T,r5,q.x+q.nx*3+(-q.nz)*o3,q.y,q.z+q.nz*3+q.nx*o3,.1);
  ok(r5.passed===0,'a wide miss (3x radius) does not count: you have to go back');
  // skip tolerance: miss ordinary gate 2 by 40 m but pass gate 3 -> both count; never for the start, lips, touchdowns
  { const rs=Tk.racer();rs.next=2;rs.passed=2;const g2=T.gates[2],g3=T.gates[3];
    Tk.advance(T,rs,g3.x-g3.nx*10,g3.y,g3.z-g3.nz*10,5);const e3=Tk.advance(T,rs,g3.x+g3.nx*10,g3.y,g3.z+g3.nz*10,5.4);
    ok(rs.passed===4&&rs.next===4&&e3.gate===3&&rs.splits.length===2&&rs.sk[0]===1,'missing an ordinary gate but passing the next one counts both (skip tolerance)');
    const rl=Tk.racer();rl.next=8;rl.passed=8;const l9=T.gates[9];Tk.advance(T,rl,l9.x-l9.nx*10,l9.y,l9.z-l9.nz*10,5);Tk.advance(T,rl,l9.x+l9.nx*10,l9.y,l9.z+l9.nz*10,5.4);
    ok(rl.passed===8,'but the launch lip can never be skipped (the transformation happens there)');
    const rt=Tk.racer();rt.next=14;rt.passed=14;const t15=T.gates[15];Tk.advance(T,rt,t15.x-t15.nx*10,t15.y,t15.z-t15.nz*10,5);Tk.advance(T,rt,t15.x+t15.nx*10,t15.y,t15.z+t15.nz*10,5.4);
    ok(rt.passed===14,'nor a touchdown');
    ok(Tk.plausible(T,rs),'a skipped gate does not trip the host plausibility check') }
  // aerial ring: height matters (flying 40 m under it is a miss)
  const ring=T.gates[10],r6=Tk.racer();r6.next=10;r6.passed=10;Tk.advance(T,r6,ring.x-ring.nx*10,ring.y-40,ring.z-ring.nz*10,0);Tk.advance(T,r6,ring.x+ring.nx*10,ring.y-40,ring.z+ring.nz*10,.2);
  ok(r6.passed===10,'flying 40 m below a ring is a miss');
  Tk.advance(T,r6,ring.x-ring.nx*10,ring.y+3,ring.z-ring.nz*10,.3);Tk.advance(T,r6,ring.x+ring.nx*10,ring.y+3,ring.z+ring.nz*10,.5);
  ok(r6.passed===11&&r6.perfect===1,'threading a ring is a perfect pass');
  // ranking key
  const a=Tk.racer(),b=Tk.racer();a.passed=a.next=5;b.passed=b.next=5;
  const g5=T.gates[5];ok(Tk.score(T,a,g5.x-10,g5.y,g5.z,0)>Tk.score(T,b,g5.x-80,g5.y,g5.z,0),'same gates: the one closer to the next gate ranks ahead');
  b.passed=6;b.next=6;ok(Tk.score(T,b,g5.x-300,g5.y,g5.z,0)>Tk.score(T,a,g5.x-1,g5.y,g5.z,0),'more gates always outranks being closer');
  const f=Tk.racer();f.finished=true;f.finishT=90;const f2=Tk.racer();f2.finished=true;f2.finishT=95;
  ok(Tk.score(T,f,0,0,0,0)>Tk.score(T,f2,0,0,0,0)&&Tk.score(T,f2,0,0,0,0)>Tk.score(T,b,0,0,0,0),'finishers rank by time, above everyone still racing');
  // host plausibility
  const hp=Tk.racer();hp.splits=[1,1.2,1.4];ok(!Tk.plausible(T,hp),'host rejects gates passed 0.2 s apart across hundreds of metres');
  const hq=Tk.racer();hq.splits=[5,12,19,26];ok(Tk.plausible(T,hq),'a sensible split sequence is accepted');
}
// ---------- 4. pads, hazards, grid, recovery ----------
{
  const p=T.pads[0];ok(T.padAt(p.x,p.y,p.z)===0&&T.padAt(p.x+30,p.y,p.z)===-1&&T.padAt(p.x,p.y+10,p.z)===-1,'pad detection: on it, beside it, and not from a bridge above it');
  const h0=T.hazards[0];
  const pos=(t)=>{const o={};T.hazardPos(h0,t,o);return [o.x,o.z]};
  ok(JSON.stringify(pos(1.234))===JSON.stringify(pos(1.234))&&Math.abs(pos(0)[0]-h0.x)<1e-6,'hazard position is a pure function of race time (identical on every client, zero traffic)');
  ok(Math.abs(pos(0)[0]-pos(h0.period)[0])<1e-4,'hammers are periodic');
  // fairness: at every lane on the road there is a good chance to pass, and the hammer never covers the whole road
  let worstSafe=1,maxCover=0;const carR=1.65,N=2000;
  for(let lane=-7;lane<=7;lane+=.5){let safe=0;for(let i=0;i<N;i++){const l=h0.amp*Math.sin(2*Math.PI*i/N);if(Math.abs(l-lane)>h0.r+carR)safe++}worstSafe=Math.min(worstSafe,safe/N)}
  for(let i=0;i<N;i++){const l=h0.amp*Math.sin(2*Math.PI*i/N);maxCover=Math.max(maxCover,2*(h0.r+carR))}
  ok(worstSafe>=.45,`every lane is clear at least ${(worstSafe*100).toFixed(0)}% of the time: readable and fair`);
  ok(maxCover<A.W[0]/2,`one hammer blocks ${maxCover.toFixed(1)} m of a 16 m road at a time: a gap always exists`);
  ok(T.hitHazard(pos(0)[0],h0.y,pos(0)[1],0,1.65)===0&&T.hitHazard(pos(0)[0]+9,h0.y,pos(0)[1],0,1.65)===-1,'hit test: inside the swing hits, 9 m away does not');
  const slots=T.gridSlots(12);let minD=1e9,offRoad=0,wrongH=0;
  for(let i=0;i<slots.length;i++){const s=slots[i];const o={};T.deck(s.x,s.z,s.y+2,o);if(!o.onRoad)offRoad++;
    for(let j=i+1;j<slots.length;j++)minD=Math.min(minD,Math.hypot(s.x-slots[j].x,s.z-slots[j].z))}
  ok(slots.length===12&&minD>=6.5,`12 grid slots, nearest pair ${minD.toFixed(1)} m apart (a car is 3.3 m wide)`);
  ok(offRoad===0,'every grid slot is on the road deck');
  const g0=T.gates[0];ok(slots.every(s=>(s.x-g0.x)*g0.nx+(s.z-g0.z)*g0.nz<0),'the whole grid starts behind the start line');
  // recovery
  const rr=Tk.racer();rr.passed=0;let rc=T.respawn(rr,{});ok(rc.mode==='car'&&Math.abs(rc.x-slots[0].x)<1e-6,'recovery before any gate: back to the grid');
  rr.passed=9;rc=T.respawn(rr,{});ok(rc.mode==='fly'&&rc.speed>=RL.fly.cruise,'recovery after the launch lip: respawned FLYING at cruise speed (mode and progress preserved)');
  rr.passed=4;rc=T.respawn(rr,{});ok(rc.mode==='car'&&Math.abs(T.ground(rc.x,rc.z,rc.y+1)-rc.y)<.3,'recovery on the ground: on the deck, driving');
  const car=CP.newCar(slots[0].x,slots[0].z,slots[0].h,'ace',{ground:T.ground});car.y=-2;const rcv=Tk.racer();
  ok(Tk.needsRecovery(T,rcv,car,.016)==='water','a car in the sea is flagged for recovery');
  const car2=CP.newCar(slots[0].x,slots[0].z,slots[0].h,'ace',{ground:T.ground});let why=null;for(let i=0;i<260&&!why;i++)why=Tk.needsRecovery(T,Tk.racer.call?rcv:rcv,car2,.016);
  ok(why==='stuck','a car that has not moved for 3 s is flagged as stuck');
}
// ---------- 5. the full automated race ----------
function race(skill,t0,cls,seed){
  const slots=T.gridSlots(12),s=slots[seed%12];
  const env={ground:T.ground,surf:T.surf,landOK:T.landOK};
  const car=CP.newCar(s.x,s.z,s.h,cls||'ace',env),r=Tk.racer(),p=Pilot.make(T,skill,seed+1),inp={};
  const o={finished:false,time:0,gates:0,perfect:0,hits:0,bumps:0,rec:0,launchVy:0,toFly:0,landings:[],maxSpeed:0,offRoadT:0,minGap:1e9,flew:false,modeAtFinish:null,airT:0,order:true,lastGate:-1};
  const DT=1/60;let t=t0,hitCd=0;
  for(let i=0;i<60*200;i++){
    Pilot.drive(p,car,r,t,DT,inp);
    const wasFly=car.mode==='fly',ev=CP.step(car,inp,DT,env);
    if(ev.launch&&car.mode==='car')o.launchVy=Math.max(o.launchVy,car.vy);
    if(ev.bump>10)o.bumps++;
    if(wasFly&&car.mode==='car'&&ev.land)o.landings.push({t:t-t0,x:car.x,z:car.z,imp:ev.land,landOK:T.landOK(car.x,car.z)});
    if(car.mode==='car'&&car.grounded&&T.padAt(car.x,car.y,car.z)>=0)CP.pad(car,1.4);
    hitCd-=DT;if(car.mode==='car'&&car.grounded&&hitCd<=0&&T.hitHazard(car.x,car.y,car.z,t,1.65)>=0){o.hits++;hitCd=1;car.vx*=.4;car.vz*=.4}
    const e=Tk.advance(T,r,car.x,car.y,car.z,t);
    if(e.gate>=0){if(e.gate!==o.lastGate+1)o.order=false;o.lastGate=e.gate;
      if(e.mode==='fly'&&car.mode==='car'){CP.toFly(car);o.toFly++;o.flew=true}
      if(e.perfect&&T.gates[e.gate].type==='air'&&T.gates[e.gate].boost)CP.pad(car,1.2)}
    const w=Tk.needsRecovery(T,r,car,DT);if(w){o.rec++;const rs=T.respawn(r,{});car.x=rs.x;car.y=rs.y;car.z=rs.z;car.h=rs.h;car.vx=Math.sin(rs.h)*rs.speed;car.vz=Math.cos(rs.h)*rs.speed;car.vy=0;car.grounded=rs.mode==='car';car.mode='car';if(rs.mode==='fly')CP.toFly(car)}
    o.maxSpeed=Math.max(o.maxSpeed,car.s);if(car.mode==='fly')o.airT+=DT;
    t+=DT;if(r.finished){o.finished=true;o.time=t-t0;o.gates=r.passed;o.perfect=r.perfect;o.modeAtFinish=car.mode;o.splits=r.splits.map(x=>x-t0);break}
  }
  o.racer=r;return o;
}
{
  const res={};
  for(const sk of ['rookie','steady','expert']){res[sk]=race(sk,0,'ace',0);const o=res[sk];
    console.log(`     [${sk}] ${o.finished?'finished':'DID NOT FINISH'} in ${o.time.toFixed(1)} s, gates ${o.gates}/${T.gates.length}, perfect ${o.perfect}, hammer hits ${o.hits}, wall bumps ${o.bumps}, recoveries ${o.rec}, launch vy ${o.launchVy.toFixed(1)}, air time ${o.airT.toFixed(1)} s, top speed ${o.maxSpeed.toFixed(0)}`)}
  const ex=res.expert,st=res.steady,rk=res.rookie;
  ok(ex.finished&&st.finished&&rk.finished,'every skill level completes the whole route: grid to finish across the sea');
  ok(ex.gates===T.gates.length&&ex.order,`all ${T.gates.length} gates passed, strictly in order (3 islands, 2 ramps, 10 rings, 2 touchdowns, finish)`);
  ok(ex.toFly===2&&ex.flew,'transformed to flight exactly twice, once at each launch lip');
  ok(ex.launchVy>14,`the ramp throws the car skyward (climb rate ${ex.launchVy.toFixed(1)} m/s at the lip)`);
  ok(ex.landings.length===2&&ex.landings.every(l=>l.landOK),`both flights touched down inside their landing zones and became cars again (impacts ${ex.landings.map(l=>l.imp.toFixed(0)).join(', ')} m/s)`);
  ok(ex.modeAtFinish==='car','finished on the ground, in car mode');
  ok(ex.airT>12&&ex.airT<40,`the sky sections are real flights: ${ex.airT.toFixed(1)} s in the air`);
  ok(ex.rec===0&&st.rec===0&&rk.rec===0,'nobody needed rescuing (no water, no stuck, no lost)');
  ok(ex.time<st.time&&st.time<rk.time,`skill matters: expert ${ex.time.toFixed(0)} s < steady ${st.time.toFixed(0)} s < rookie ${rk.time.toFixed(0)} s (no cheating speed)`);
  ok(rk.time/ex.time<1.6,'the easy driver is beatable but not absurdly slow (within 1.6x of the expert)');
  ok(ex.perfect>=T.gates.length*.7,`the expert threads most gates (${ex.perfect}/${T.gates.length} perfect)`);
  ok(Tk.plausible(T,ex.racer)&&Tk.plausible(T,rk.racer),'the host referee accepts honest split times');
  // hammer timing: start the race at different moments of the hammer cycle; the pilot must read them rather than get lucky
  let hits=0,fin=0,n=0;for(const t0 of [0,.4,.8,1.2,1.6,2,2.4,2.8]){const o=race('expert',t0,'ace',1);n++;hits+=o.hits;if(o.finished)fin++}
  ok(fin===n,`finishes from every hammer phase (${fin}/${n})`);
  ok(hits<=5,`reads the four swinging hammers: ${hits} clips over ${n} stress runs (occasional recoverable mistakes are intended AI behaviour)`);
  // other classes and grid slots work too
  const cm=race('expert',0,'comet',3),br=race('steady',0,'bruiser',7);
  console.log(`     [comet/expert] ${cm.time.toFixed(1)} s   [bruiser/steady] ${br.time.toFixed(1)} s`);
  ok(cm.finished&&br.finished,'comet and bruiser also complete the route from other grid slots');
  ok(cm.time<ex.time+8,'the faster class is not slower than the balanced one');
}
console.log(fails?`\n${fails} FAILED`:'\nall ok');process.exit(fails?1:0);
