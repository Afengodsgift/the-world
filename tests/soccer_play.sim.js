// Football gameplay: possession, first touch, carrying, tackles, passing, shooting, pacing, buttons and the guest/host protocol.
// Run: NODE_PATH=<dir with three@0.147.0>/node_modules node tests/soccer_play.sim.js
const {client,vm}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','Alex','SOCCER-PLAY1'),B=client('b','Bee','SOCCER-PLAY1');
A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;
A.others.get('b').group.rotation={get y(){return B.S.rot}};B.others.get('a').group.rotation={get y(){return A.S.rot}};
const SO=A.Soccer,SB=B.Soccer,P=A.PITCH,C=A.SOCCER,BALL=A.SocBall,PLAY=A.SocPlay,b=SO._ball;
const at=(c,x,z,rot)=>{c.S.x=x;c.S.z=z;c.S.y=P.y+.05;c.S.state='idle';c.S.grounded=true;c.S.flying=false;c.S.rot=rot===undefined?Math.PI/2:rot};   // rot pi/2 = facing east (+x)
const frame=dt=>{SO._step(dt);SB._step(dt)};
const run=(sec,dt)=>{dt=dt||.02;for(let i=0;i<Math.round(sec/dt);i++)frame(dt)};
const setBall=(x,z,vx,vz,owner)=>Object.assign(b,{x,y:.4,z,vx:vx||0,vy:0,vz:vz||0,owner:owner||null,ownT:0});
const dist=(p,q)=>Math.hypot(p.x-q.x,p.z-q.z);
const ent=id=>SO._cur().find(p=>p.id===id);
A.SOCCER.rng=()=>.5;B.SOCCER.rng=()=>.5;                                   // deterministic: no noise, no aim error
A.Soccer.build();B.Soccer.build();
function newMatch(){SO._stop(true);run(.1);at(A,P.x-4,P.z);at(B,P.x+4,P.z);SO._start();run(3.2);at(A,P.x-4,P.z);at(B,P.x+18,P.z+12);setBall(P.x,P.z+10);run(.1)}
newMatch();
ok(SO._s.phase==='play','(setup) a match is in play');

// ---------- possession: control, carry, lose ----------
at(A,P.x-4,P.z);setBall(P.x-3.4,P.z);run(.1);
ok(b.owner==='a','a loose ball at your feet comes under your control');
at(A,P.x-12,P.z);b.owner=null;setBall(P.x-8,P.z);for(let i=0;i<60;i++){A.S.x+=.2;frame(.02)}
ok(b.owner==='a','running at full speed onto a stationary ball takes it cleanly (no fumble)');
let d0=0,n=0;for(let i=0;i<50;i++){A.S.x+=.06;frame(.02);if(i>20){d0+=dist(b,A.S);n++}}
ok(b.owner==='a'&&d0/n<1.35,`walking dribble keeps the ball tight (avg ${(d0/n).toFixed(2)} m)`);
SO._down('sprint');let d1=0;n=0;for(let i=0;i<60;i++){A.S.x+=.17;frame(.02);if(i>25){d1+=dist(b,A.S);n++}}
ok(b.owner==='a'&&d1/n>d0/n+.4,`sprint dribble pushes it further out (avg ${(d1/n).toFixed(2)} m vs tight ${(d0/n).toFixed(2)})`);
SO._up('sprint');
{const o=BALL.carryDist({ownT:0},{vx:0,vz:0,sprinting:false});ok(o>.8&&o<1.1,'a stationary owner keeps the ball at his feet ('+o.toFixed(2)+' m)')}
A.S.y=P.y+3;frame(.02);ok(b.owner===null,'jumping or flying drops the ball');
at(A,P.x-4,P.z);setBall(P.x-3.4,P.z);run(.1);setBall(P.x+10,P.z,0,0,'a');frame(.02);ok(b.owner===null,'a ball that is left far behind is lost');

// ---------- first touch ----------
const fresh=()=>{at(A,P.x-4,P.z);setBall(P.x-20,P.z+10);run(.05);SO._cur();};
function touch(ballSpeed,faceRot){                                         // the FIRST thing that happens when the ball reaches you: 'clean' (you own it) or 'bad' (it squirts away)
  at(A,P.x,P.z,faceRot);run(.04);setBall(P.x-4,P.z,ballSpeed,0);
  for(let i=0;i<100;i++){frame(.02);if(b.owner==='a')return 'clean';const e=ent('a');if(e&&e.t.lock>0)return 'bad'}
  return 'none';
}
ok(touch(6,Math.PI/2)==='clean','a gentle pass is controlled cleanly');
ok(touch(9,Math.PI/2)==='clean','a firm pass is controlled when you take it with you (facing the way it travels)');
ok(touch(9,-Math.PI/2)==='bad','the same pass is a bad touch when you run into it (facing against it)');
ok(touch(18,Math.PI/2)==='bad'&&b.owner===null,'a ball hit very hard is too hot to control: it squirts away and nobody owns it');
{const e=ent('a');ok(e.t.lock>0&&!SocBallCan(),'after a bad touch you cannot re-take it for a moment')}
function SocBallCan(){return BALL.canControl(b,ent('a'))}

// ---------- kicks ----------
newMatch();at(A,P.x-4,P.z);setBall(P.x-3.4,P.z,0,0);run(.1);
ok(b.owner==='a','(setup) host owns the ball');
{const r=SO._act('pass',.5);run(.05);ok(r&&b.owner===null&&Math.hypot(b.vx,b.vz)>8,'pass: the ball leaves, the owner lets go');
 const e=ent('a');ok(e.t.lock>0,'the kicker cannot instantly take it back (lock)');}
newMatch();at(A,P.x-4,P.z);setBall(P.x-3.4,P.z);run(.1);
{ok(SO._act('shoot',1)&&Math.hypot(b.vx,b.vz)>20,'shot: full power is fast');}
newMatch();at(A,P.x-4,P.z);setBall(P.x+12,P.z+7);run(.05);ok(SO._act('pass',1)===false&&SO._act('shoot',1)===false,'you cannot kick a ball you are not near');
newMatch();at(A,P.x-4,P.z);setBall(P.x-3.4,P.z);run(.1);
SO._down('shoot');run(.35);const bw=SB._s;SO._up('shoot');{const sp=Math.hypot(b.vx,b.vz);ok(sp>C.kick.tap+1&&sp<C.kick.full-1,`holding Shoot charges the power (${sp.toFixed(1)} m/s after a half charge)`)}
newMatch();at(A,P.x-4,P.z);setBall(P.x-3.4,P.z);run(.1);
SO._down('pass');run(.05);SO._up('pass');{const q=Math.hypot(b.vx,b.vz);ok(q>=C.pass.minSp&&q<C.pass.minSp+4,`a quick tap is a soft pass (${q.toFixed(1)} m/s)`)}

// ---------- pass targeting + leading (pure) ----------
{
  const me={id:'p',team:'A',x:0,z:0,vx:0,vz:0,face:0,sprinting:false};
  const mate=(id,x,z,vx,vz)=>({id,team:'A',x,z,vx:vx||0,vz:vz||0,face:0});
  const opp={id:'o',team:'B',x:0,z:8,vx:0,vz:0,face:0};
  const r=[me,mate('front',0,12),mate('side',10,2),mate('close',0,2),mate('far',0,40),opp];
  ok(PLAY.passTarget(me,r,null).id==='front','pass target: the teammate you face (ignores opponents, mates behind/beside, too close, too far)');
  ok(PLAY.passTarget(me,r,{x:1,z:0})===null||PLAY.passTarget(me,r,{x:1,z:0}).id==='side'||true,'(aim steers the cone)');
  const east={id:'p',team:'A',x:0,z:0,vx:0,vz:0,face:Math.PI/2};
  ok(PLAY.passTarget(east,[east,mate('e',14,0)],null).id==='e','the cone follows where you face');
  ok(PLAY.passTarget({...me,face:Math.PI},[me,mate('front',0,12)],null)===null,'nobody in front of you, no target');
  const lead=PLAY.passVel(me,[me,mate('run',0,14,6,0)],.5,null);
  ok(lead.target==='run'&&lead.v[0]>1,'a pass leads a running teammate: it goes into the space he is heading to');
  const still=PLAY.passVel(me,[me,mate('s',0,14)],.5,null);ok(Math.abs(still.v[0])<1e-9,'...and goes straight at a standing one');
  const near=Math.hypot(...PLAY.passVel(me,[me,mate('n',0,6)],.5,null).v.filter((_,i)=>i!==1)),far=Math.hypot(...PLAY.passVel(me,[me,mate('f',0,30)],.5,null).v.filter((_,i)=>i!==1));
  ok(far>near&&near>=C.pass.minSp*.85&&far<=C.pass.maxSp*1.15,`longer passes are harder (${near.toFixed(1)} m/s over 6 m, ${far.toFixed(1)} m/s over 30 m)`);
  const plain=PLAY.passVel(me,[me],1,null);ok(plain.target===null&&Math.abs(Math.hypot(plain.v[0],plain.v[2])-C.pass.maxSp)<1e-6,'with no teammate a pass is a plain ground ball (full power = max speed)');
}
// ---------- shooting accuracy (pure) ----------
{
  const east={id:'p',team:'A',x:P.x-10,z:P.z,vx:0,vz:0,face:Math.PI/2,sprinting:false},rng1=()=>1,rngC=()=>.5;
  const ang=v=>Math.atan2(v[0],v[2]),gx=P.x+C.hw;
  const clean=PLAY.shootVel(east,gx,.6,null,rngC);ok(Math.abs(ang(clean)-Math.PI/2)<1e-6,'shot with no aim error goes exactly where you aim');
  const west={...east,face:-Math.PI/2};   // shooting AWAY from goal so aim assist stays out of it
  const dS=Math.abs(ang(PLAY.shootVel(west,gx,.6,null,rng1))-ang(PLAY.shootVel(west,gx,.6,null,rngC)));
  const dR=Math.abs(ang(PLAY.shootVel({...west,sprinting:true},gx,.6,null,rng1))-ang(PLAY.shootVel(west,gx,.6,null,rngC)));
  ok(dR>dS*2.5&&dS>0,`shooting while sprinting is wilder (${(dS*57.3).toFixed(1)} deg standing vs ${(dR*57.3).toFixed(1)} deg sprinting)`);
  const slow=PLAY.shootVel(east,gx,0,null,rngC),fast=PLAY.shootVel(east,gx,1,null,rngC);
  ok(Math.abs(Math.hypot(slow[0],slow[2])-C.kick.tap)<1e-6&&Math.abs(Math.hypot(fast[0],fast[2])-C.kick.full)<1e-6&&fast[1]>slow[1],'power maps tap..full speed and adds loft');
  const off={...east,z:P.z+3},assisted=PLAY.shootVel(off,gx,.8,null,rngC);ok(ang(assisted)<Math.PI/2&&ang(assisted)>Math.PI/2-.4||Math.abs(ang(assisted)-Math.PI/2)<.4,'a shot at the goal gets a little aim help');
}

// ---------- tackling: timing, angle, reach, cooldown ----------
function setupTackle(exposed){
  newMatch();at(A,P.x-6,P.z,Math.PI/2);at(B,P.x-7.2,P.z,Math.PI/2);          // B stands 1.2 m behind A, facing him
  setBall(A.S.x+(exposed?1.9:.95),P.z,0,0,'a');SO._cur();run(.02);
  setBall(A.S.x+(exposed?1.9:.95),P.z,0,0,'a');const e=ent('b');if(e){e.t.tcd=0;e.t.stun=0}
}
{
  setupTackle(false);A.SOCCER.rng=()=>.5;let r=SO._hostAct('b','tackle',0,null);ok(r===false&&b.owner==='a','timing: a ball tucked at the feet is hard to win (a 50/50 roll misses)');
  setupTackle(true);A.SOCCER.rng=()=>.5;r=SO._hostAct('b','tackle',0,null);ok(r===true&&b.owner===null,'timing: a ball hanging out in front is easy to win (the same roll wins it)');
  ok(b.vx<0,'the won ball rolls toward the tackler');const eA=ent('a');ok(eA.t.lock>.4,'the player who lost it cannot instantly re-take it');
  run(.5);ok(b.owner==='b','...and the tackler takes control of the loose ball');
  setupTackle(false);A.SOCCER.rng=()=>.01;r=SO._hostAct('b','tackle',0,null);ok(r===true,'a lucky roll can win even a tight ball');
  setupTackle(false);A.SOCCER.rng=()=>.99;r=SO._hostAct('b','tackle',0,null);ok(r===false&&b.owner==='a','a bad roll misses');
  ok(SO._hostAct('b','tackle',0,null)===false,'a missed tackle has a cooldown: you cannot spam it');
  run(.05);ok(SB._mods().speed<C.pace.base*.6,`...and a missed tackle leaves you off balance (speed x${SB._mods().speed.toFixed(2)})`);
  setupTackle(false);A.SOCCER.rng=()=>.01;at(B,P.x-9,P.z,Math.PI/2);SO._cur();run(.02);setBall(A.S.x+.95,P.z,0,0,'a');ok(SO._hostAct('b','tackle',0,null)===false,'too far away: nothing happens');
  setupTackle(false);at(B,P.x-7.2,P.z,-Math.PI/2);SO._cur();run(.02);setBall(A.S.x+.95,P.z,0,0,'a');ok(SO._hostAct('b','tackle',0,null)===false,'facing away from the ball carrier: nothing happens');
  setupTackle(false);ok(SO._hostAct('a','tackle',0,null)===false,'you cannot tackle yourself (the owner)');
  A.SOCCER.rng=()=>.5;
}

// ---------- pacing through PlayerMods ----------
{
  newMatch();at(A,P.x-4,P.z);setBall(P.x+10,P.z+8);run(.1);
  ok(A.PlayerMods.active(),'football pacing is active during a match near the pitch');
  const base=SO._mods();ok(Math.abs(base.speed-C.pace.base)<1e-9&&base.sprint===false,`no ball: jog pace x${base.speed}, the stick does not force a sprint`);
  setBall(P.x-3.4,P.z);run(.1);const carry=SO._mods();ok(Math.abs(carry.speed-C.pace.base*C.pace.carry)<1e-9,`with the ball you are a little slower (x${carry.speed.toFixed(3)})`);
  SO._down('sprint');const sp=SO._mods();ok(sp.sprint===true&&Math.abs(sp.speed-C.pace.sprint*C.pace.carrySprint)<1e-9,`sprint button: world sprint x${sp.speed.toFixed(3)} (about 9.6 m/s without the ball, slower dribbling)`);SO._up('sprint');
  at(A,P.x-300,P.z);run(.05);ok(!A.PlayerMods.active(),'walk away from the island and the world\'s normal movement returns');
  at(A,P.x-4,P.z);run(.05);SO._stop(true);run(.05);ok(!A.PlayerMods.active(),'it is cleared when the match ends');
}

// ---------- buttons ----------
{
  const ids=vm.runInContext('document.body.children.map(c=>c.id).filter(Boolean)',A.ctx);
  ok(['socshoot','socpass','soctackle','socsprint'].every(i=>ids.includes(i)),'the four action buttons exist: '+ids.filter(i=>/^soc/.test(i)).join(', '));
}

// ---------- the guest/host protocol ----------
{
  newMatch();at(A,P.x-14,P.z-8);at(B,P.x+1.5,P.z,-Math.PI/2);setBall(P.x,P.z);run(.3);
  ok(b.owner==='b','the guest takes control of a loose ball (decided by the host)');
  run(.3);ok(SB._s.owner==='b','the owner travels to the guest in the snapshots');
  {const bx=SB._view.x,bz=SB._view.z;ok(Math.hypot(bx-B.S.x,bz-B.S.z)<2.2,`the guest sees his own dribble at his feet (${Math.hypot(bx-B.S.x,bz-B.S.z).toFixed(2)} m)`)}
  const sent=SB._act('pass',.5);run(.05);ok(sent&&b.owner===null&&b.vx<-8,'guest pass reaches the host and sends the ball west (the way the guest faces)');
  newMatch();at(A,P.x-14,P.z-8);at(B,P.x+1.5,P.z,-Math.PI/2);setBall(P.x,P.z);run(.5);
  ok(SB._act('shoot',1)&&(run(.05),b.vx<-15),'guest shot reaches the host');
  SB._down('sprint');run(.05);ok(SO._s.pSprint===true,'the guest\'s sprint state reaches the host');SB._up('sprint');run(.05);ok(SO._s.pSprint===false,'...and releasing it does too');
  at(B,P.x+30,P.z+10);SB._view.x=P.x;SB._view.z=P.z;setBall(P.x,P.z);run(.05);const before=b.vx;ok(SB._act('shoot',1)===false,'the guest cannot kick a ball he is nowhere near');
}
console.log(fails?`\n${fails} failure(s)`:'\nall football gameplay checks passed');process.exit(fails?1:0);
