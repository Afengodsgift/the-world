// Simulation of Soccer: pitch terrain, ball physics, dribbling, kicks (host + guest), goals, match flow, solo practice and sync.
// Run: NODE_PATH=<dir with three@0.147.0>/node_modules node tests/soccer.sim.js
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const ROOM='SOCCER-TEST1';
const A=client('a','Alex',ROOM),B=client('b','Bee',ROOM);
A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;       // each sees the other's real position
const SO=A.Soccer,P=A.PITCH,C=A.SOCCER,SB=B.Soccer;
const at=(c,x,z)=>{c.S.x=x;c.S.z=z;c.S.y=P.y+.05;c.S.state='idle';c.S.grounded=true;c.S.flying=false;c.S.rot=Math.PI/2};  // rot=pi/2 faces +x (east)
const frame=(dt)=>{A.Soccer._step(dt);B.Soccer._step(dt)};
const run=(sec,dt)=>{dt=dt||.02;for(let i=0;i<Math.round(sec/dt);i++)frame(dt)};
const sp=b=>Math.hypot(b.vx,b.vz);
const reset=()=>{A.Soccer._stop(true);run(.1)};

// ---------- 1. the pitch exists, is flat, and nothing else lands on it ----------
{
  let lo=1e9,hi=-1e9;for(let i=0;i<400;i++){const x=P.x+(Math.random()*2-1)*P.hw,z=P.z+(Math.random()*2-1)*P.hh,h=A.H(x,z);lo=Math.min(lo,h);hi=Math.max(hi,h)}
  ok(hi-lo<1e-6&&Math.abs(lo-P.y)<1e-6,`terrain is perfectly flat across the whole pitch (y=${P.y})`);
  const edge=A.H(P.x+P.hw+4.5,P.z),far=A.H(P.x+P.hw+40,P.z);
  ok(Math.abs(edge-P.y)>1e-4&&Math.abs(edge-P.y)<Math.abs(far-P.y)+3,'terrain blends out smoothly beyond the pitch edge');
  ok(A.LOCS.some(l=>l.n==='Soccer Pitch'),'pitch is a discoverable place on the map');
  ok(C.hw<P.hw&&C.hh<P.hh,'playing surface + goals fit inside the flattened rectangle');
  let bad=0;for(let i=0;i<300;i++){const s=A.Sites.find({tag:'soccertest',key:'k'+i,name:'x',cx:P.x,cz:P.z,rmin:0,rmax:60,clear:4});if(s&&Math.abs(s.x-P.x)<P.hw+25&&Math.abs(s.z-P.z)<P.hh+25)bad++}
  ok(bad===0,'Sites never places camps/vaults/events on or next to the pitch');
}
// ---------- 2. ball physics (pure) ----------
{
  const b=SO._ball;Object.assign(b,{x:P.x,y:.4,z:P.z,vx:10,vy:0,vz:0});for(let i=0;i<250;i++)SO._phys(.02);
  ok(sp(b)<1.4,`a rolling ball slows to a stop (10 m/s -> ${sp(b).toFixed(2)} m/s after 5 s)`);
  Object.assign(b,{x:P.x,y:5,z:P.z,vx:0,vy:0,vz:0});let peak=0,bounced=false,prev=5;for(let i=0;i<120;i++){SO._phys(.02);if(b.vy>0&&!bounced){bounced=true}if(bounced)peak=Math.max(peak,b.y)}
  ok(bounced&&peak<4&&peak>1,`dropped ball bounces, losing energy (peak ${peak.toFixed(2)} m < 5 m)`);
  Object.assign(b,{x:P.x,y:.4,z:P.z+C.hh-.5,vx:0,vy:0,vz:12});for(let i=0;i<20;i++)SO._phys(.02);
  ok(b.vz<0&&b.z<=P.z+C.hh,'side wall bounces the ball back in');
  Object.assign(b,{x:P.x+C.hw-.5,y:.4,z:P.z+C.goalW/2+2,vx:12,vy:0,vz:0});for(let i=0;i<20;i++)SO._phys(.02);
  ok(b.vx<0&&b.x<=P.x+C.hw,'end wall (outside the goal mouth) bounces the ball back');
  Object.assign(b,{x:P.x+C.hw-.5,y:C.goalH+.6,z:P.z,vx:12,vy:0,vz:0});for(let i=0;i<20;i++)SO._phys(.02);
  ok(b.vx<0,'a ball above the crossbar does not go in');
  Object.assign(b,{x:P.x,y:.4,z:P.z,vx:80,vy:0,vz:0});SO._phys(.02);ok(sp(b)<=C.ball.maxSpeed+1e-6,'ball speed is capped');
}
// ---------- 3. build + start a match (guest follows) ----------
A.Soccer.build();B.Soccer.build();
{
  let kids=0;A.scene.traverse(()=>kids++);ok(kids>40,`pitch built: goals, lines, boards, flags, lights, ball (${kids} objects)`);
  at(A,P.x-4,P.z);at(B,P.x+4,P.z);
  ok(A.Interaction&&true,'interaction registry present');
  SO._start();
  ok(SO._s.host==='a'&&SO._s.phase==='kickoff'&&!SO._s.solo,'host starts a 1v1 match');
  ok(SB._s.host==='a'&&SB._s.phase==='kickoff'&&A.log.banners.length>0&&B.log.banners.some(b=>/RED/.test(b)),'guest is told: match on, you are RED');
  run(3.2);
  ok(SO._s.phase==='play','kick-off countdown ends and play begins when both players are on the pitch');
  ok(B.Soccer._s.phase==='play'&&SB._s.a===0,'guest mirrors the phase from snapshots');
}
// ---------- 4. dribble + kick + validation ----------
{
  const b=SO._ball;Object.assign(b,{x:P.x,y:.4,z:P.z,vx:0,vy:0,vz:0});at(A,P.x-3,P.z);at(B,P.x-20,P.z+10);
  for(let i=0;i<40;i++){A.S.x+=.2;frame(.02)}            // A runs east at 10 m/s through the ball
  ok(b.x>P.x&&b.vx>3,`running into the ball dribbles it ahead (ball vx ${b.vx.toFixed(1)} m/s)`);
  Object.assign(b,{x:P.x,y:.4,z:P.z,vx:0,vy:0,vz:0});at(A,P.x-1.6,P.z);SO._players(.02);
  const ok1=SO._kick(1);ok(ok1&&Math.abs(b.vx)>20&&b.vy>5,`full-power kick: ${Math.hypot(b.vx,b.vz).toFixed(1)} m/s with loft ${b.vy.toFixed(1)}`);
  Object.assign(b,{x:P.x,y:.4,z:P.z,vx:0,vy:0,vz:0});SO._kick(0);const tap=Math.hypot(b.vx,b.vz);
  ok(tap>9&&tap<13,`tap = soft pass (${tap.toFixed(1)} m/s)`);
  at(A,P.x-30,P.z);Object.assign(b,{x:P.x,y:.4,z:P.z,vx:0,vy:0,vz:0});ok(SO._kick(1)===false&&sp(b)===0,'cannot kick a ball that is out of reach');
  A.S.y=P.y+8;at(A,P.x-1.5,P.z);A.S.y=P.y+8;ok(SO._kick(1)===false,'cannot kick while flying high');
  at(A,P.x-1.5,P.z);
  // flying players do not dribble
  Object.assign(b,{x:P.x,y:.4,z:P.z,vx:0,vy:0,vz:0});A.S.y=P.y+8;A.S.x=P.x-.3;frame(.02);ok(sp(b)===0,'a flying player does not push the ball');
  at(A,P.x-14,P.z-9);   // step well away from the ball again
  // guest kick travels over the network and is validated against the guest's real position
  Object.assign(b,{x:P.x,y:.4,z:P.z,vx:0,vy:0,vz:0});at(B,P.x+1.5,P.z);B.S.rot=-Math.PI/2;run(.3);
  SB._view.x=P.x;SB._view.z=P.z;const sent=SB._kick(1);run(.1);
  ok(sent&&b.vx<-15,`guest kick reaches the host ball (vx ${b.vx.toFixed(1)}, west)`);
  Object.assign(b,{x:P.x,y:.4,z:P.z,vx:0,vy:0,vz:0});at(B,P.x+30,P.z+10);SB._view.x=P.x;SB._view.z=P.z;SB._kick(1);run(.1);
  ok(sp(b)<.5,'host rejects a guest kick when the guest is not actually near the ball');
}
// ---------- 5. goals ----------
{
  const b=SO._ball;at(A,P.x-20,P.z+10);at(B,P.x+20,P.z-10);
  Object.assign(b,{x:P.x+C.hw-3,y:.4,z:P.z,vx:14,vy:0,vz:0});run(.6);
  ok(SO._s.a===1&&SO._s.phase==='goal','shot into the east goal: BLUE scores (host side)');
  ok(B.log.banners.some(x=>/Blue scores\s+1 – 0/.test(x)),'guest is told: Blue scores 1 – 0');
  run(.5);ok(SB._s.a===1&&SB._s.b===0,'guest scoreboard follows via snapshots');
  run(C.match.goalPause+2);ok(SO._s.phase==='kickoff'||SO._s.phase==='play','match restarts after the goal');
  run(4);at(A,P.x-5,P.z);at(B,P.x+5,P.z);run(3);
  Object.assign(b,{x:P.x-C.hw+3,y:.4,z:P.z+1,vx:-14,vy:0,vz:0});run(.6);
  ok(SO._s.b===1,'shot into the west goal: RED (guest) scores');
  run(C.match.goalPause+3);at(A,P.x-5,P.z);at(B,P.x+5,P.z);run(3);
  Object.assign(b,{x:P.x+C.hw-3,y:.4,z:P.z+C.goalW/2+1.5,vx:14,vy:0,vz:0});run(.6);
  ok(SO._s.a===1,'a shot wide of the posts is not a goal');
  Object.assign(b,{x:P.x+C.hw-3,y:3.4,z:P.z,vx:14,vy:0,vz:0});run(.6);
  ok(SO._s.a===1,'a shot over the bar is not a goal');
}
// ---------- 6. full time: first to 5, then back to idle ----------
{
  reset();at(A,P.x-5,P.z);at(B,P.x+5,P.z);SO._start();run(3.2);
  const b=SO._ball;SO._s.a=4;SO._s.b=2;
  Object.assign(b,{x:P.x+C.hw-3,y:.4,z:P.z,vx:14,vy:0,vz:0});run(.6);
  run(C.match.goalPause+.5);
  ok(SO._s.phase==='over'&&SO._s.a===5,'first to 5 ends the match');
  ok(A.log.banners.some(x=>/You win! 5 – 2/.test(x))&&B.log.banners.some(x=>/Alex wins|Bee wins|wins/.test(x)),'both players get a result banner (winner / loser view)');
  run(C.match.overPause+.5);ok(SO._s.phase==='idle'&&SB._s.phase==='idle','match returns to idle for both after full time');
}
// ---------- 7. the clock: timed finish and golden goal ----------
{
  reset();at(A,P.x-5,P.z);at(B,P.x+5,P.z);SO._start();run(3.2);
  SO._s.a=2;SO._s.b=2;SO._s.t=.05;run(.2);
  ok(SO._s.golden&&SO._s.phase==='play','tied at time: play continues as a golden goal');
  const b=SO._ball;Object.assign(b,{x:P.x-C.hw+3,y:.4,z:P.z,vx:-14,vy:0,vz:0});run(.6);run(C.match.goalPause+.5);
  ok(SO._s.phase==='over'&&SO._s.b===3,'golden goal ends the match');
  reset();at(A,P.x-5,P.z);at(B,P.x+5,P.z);SO._start();run(3.2);SO._s.a=3;SO._s.b=1;SO._s.t=.05;run(.3);
  ok(SO._s.phase==='over','clock running out with a lead ends the match');
}
// ---------- 8. solo practice ----------
{
  reset();const saved=new Map(A.others);A.others.clear();at(A,P.x-5,P.z);SO._start();
  ok(SO._s.solo===true,'no partner: practice mode');run(3.2);ok(SO._s.phase==='play','practice starts');
  const b=SO._ball;Object.assign(b,{x:P.x+C.hw-3,y:.4,z:P.z,vx:14,vy:0,vz:0});run(.6);
  Object.assign(b,{x:P.x-C.hw+3,y:.4,z:P.z,vx:-14,vy:0,vz:0});run(C.match.goalPause+3.5);run(.6);
  ok(SO._s.a>=1,'practice: goals count for you');
  const t0=SO._s.t;run(5);ok(SO._s.t===t0,'practice has no clock');
  for(const [k,v] of saved)A.others.set(k,v);reset();
}
// ---------- 9. sync quality ----------
{
  reset();at(A,P.x-5,P.z);at(B,P.x+5,P.z);SO._start();run(3.2);
  const b=SO._ball;Object.assign(b,{x:P.x-8,y:.4,z:P.z,vx:9,vy:0,vz:2});
  let maxErr=0;for(let i=0;i<120;i++){frame(.02);if(i>20)maxErr=Math.max(maxErr,Math.hypot(SB._view.x-b.x,SB._view.z-b.z))}
  ok(maxErr<1.2,`guest's drawn ball tracks the host ball (worst error ${maxErr.toFixed(2)} m while rolling)`);
  let msgs=0;const orig=A.Net.emit;A.Net.emit=(t,d)=>{if(t==='soc'&&d.k==='s')msgs++;return orig.call(A.Net,t,d)};run(2);A.Net.emit=orig;
  ok(msgs>=26&&msgs<=34,`snapshot rate ~${C.net.rate} Hz (${msgs} in 2 s)`);
  reset();
}
// ---------- 10. safety ----------
{
  reset();ok(SB._kick(1)===false,'no kicking when no match is running');
  at(A,P.x-1.5,P.z);ok(SO._kick(1)===false,'host cannot kick in the idle phase either');
  SO._start();SO._s.phase='kickoff';ok(SO._kick(1)===false,'no kicking during the kick-off countdown');
  reset();
}
console.log(fails?`\n${fails} failure(s)`:'\nall soccer checks passed');process.exit(fails?1:0);
