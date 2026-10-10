// CombatPose: strafe/backpedal leg twist. plan() = pure maths; twist() = bone maths on a Blender-style rig (rotated rest axes).
const fs=require('fs'),vm=require('vm'),THREE=require('three'),R=__dirname+'/../';
const c={Math,THREE};vm.createContext(c);vm.runInContext(fs.readFileSync(R+'src/character/CombatPose.js','utf8')+';this.CP=CombatPose',c);const CP=c.CP;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const run=(rel,v=5,steps=90,q={})=>{const fy=.7;for(let i=0;i<steps;i++)CP.plan(q,1/60,Math.sin(fy+rel)*v/60,Math.cos(fy+rel)*v/60,v,fy,true);return q};
let q=run(0);ok(Math.abs(q.cpT)<.01&&!q.cpRev,'moving along the aim: no twist, forward clip');
q=run(Math.PI/2);ok(Math.abs(q.cpT-Math.PI/2)<.03&&!q.cpRev,'strafing right: legs twist +90 deg, forward clip ('+q.cpT.toFixed(2)+')');
q=run(-Math.PI/2);ok(Math.abs(q.cpT+Math.PI/2)<.03&&!q.cpRev,'strafing left: legs twist -90 deg');
q=run(Math.PI);ok(q.cpRev&&Math.abs(q.cpT)<.05,'backpedal: legs face forward, clip plays in reverse');
q=run(-Math.PI*.75);ok(q.cpRev&&Math.abs(q.cpT-Math.PI/4)<.05,'back-left: reverse clip with a 45 deg twist ('+q.cpT.toFixed(2)+')');
q=run(Math.PI*.35);ok(!q.cpRev&&Math.abs(q.cpT-Math.PI*.35)<.03,'forward-right diagonal follows the travel direction');
// hysteresis near 90-110 deg so the clip does not flicker
const prime=r=>({cmx:Math.sin(.7+r)*5,cmz:Math.cos(.7+r)*5,cpT:0});q=Object.assign(prime(1.5),{cpRev:false});run(1.5,5,30,q);ok(!q.cpRev,'86 deg stays forward when it was forward');q=Object.assign(prime(1.5),{cpRev:true});run(1.5,5,30,q);ok(q.cpRev,'86 deg stays reversed when it was reversed');
q=run(Math.PI/2,5,60);for(let i=0;i<40;i++)CP.plan(q,1/60,0,0,0,.7,true);ok(Math.abs(q.cpT)<.02&&!q.cpRev,'stopping relaxes the twist and the reverse flag');
q=run(Math.PI/2,5,60);for(let i=0;i<40;i++)CP.plan(q,1/60,0,0,5,.7,false);ok(Math.abs(q.cpT)<.02,'not moving on foot (swim/jump) also relaxes it');
q=run(1.9,5,200);ok(Math.abs(q.cpT)<=1.6001,'twist is clamped (never wraps the pelvis around)');
// no propeller legs: aim spinning fast while travel direction jitters, the twist never whips around
{const qq={};let maxStep=0,prev=0;for(let i=0;i<300;i++){const fy=i*.25,mv=(i%2?1:-1)*.6;CP.plan(qq,1/60,Math.sin(fy*.3+mv)*6/60,Math.cos(fy*.3+mv)*6/60,6,fy,true);maxStep=Math.max(maxStep,Math.abs(CP.wrap(qq.cpT-prev))*60);prev=qq.cpT}
 ok(maxStep<=5.01,'twist changes at most ~5 rad/s even with a violently spinning aim ('+maxStep.toFixed(2)+' rad/s)')}
{const qq={};for(let i=0;i<20;i++)CP.plan(qq,1/60,0,.05,3,0,true);const spd=Math.hypot(qq.cmx,qq.cmz);ok(spd>1&&Math.abs(qq.cpT)<.05,'steady forward travel keeps the legs straight')}
{const qq={};for(let i=0;i<30;i++)CP.plan(qq,1/60,(Math.random()-.5)*.02,(Math.random()-.5)*.02,.5,0,true);ok(Math.abs(qq.cpT)<.02&&!qq.cpRev,'jitter while (nearly) standing does not twist')}
// ---- bones: pelvis + legs turn by t about the WORLD vertical, the upper body ends up exactly where it was
const mk=(name,par,rx,ry,rz,ty)=>{const b=new THREE.Bone();b.name=name;b.quaternion.setFromEuler(new THREE.Euler(rx,ry,rz));b.position.set(0,ty,0);if(par)par.add(b);return b};
const root=new THREE.Group();root.rotation.y=.9;const hips=mk('Hips',root,-Math.PI/2,0,.3,1),spine=mk('Spine',hips,.4,.2,0,.2),chest=mk('Chest',spine,-.1,0,.3,.2),up=mk('UpperChest',chest,.2,-.3,0,.2);root.updateMatrixWorld(true);
const wq=o=>{const x=new THREE.Quaternion();o.getWorldQuaternion(x);return x},upBefore=wq(up),hipsBefore=wq(hips);
CP.twist({cpT:1.0,bones:{Hips:hips,Spine:spine,Chest:chest,UpperChest:up}});root.updateMatrixWorld(true);
const dq=wq(up).angleTo(upBefore),yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),1.0),hipsExpected=yaw.clone().multiply(hipsBefore);
ok(dq<1e-5,'upper body (torso/arms) world orientation is unchanged by the twist ('+dq.toExponential(1)+' rad)');
ok(wq(hips).angleTo(hipsExpected)<1e-5,'pelvis turns exactly t radians about the world vertical');
ok(wq(chest).angleTo(upBefore)>0,'(spine bones in between take part of the counter-rotation)');
CP.twist({cpT:.005,bones:{Hips:hips}});ok(true,'tiny twists are ignored');
// untwist restores exactly what the animation gave (no accumulation if a clip never keys the bones)
{const before=[hips,spine,chest,up].map(b=>b.quaternion.clone());const qq={cpT:1.2,bones:{Hips:hips,Spine:spine,Chest:chest,UpperChest:up}};
 for(let i=0;i<5;i++){CP.untwist(qq);CP.twist(qq)}CP.untwist(qq);ok([hips,spine,chest,up].every((b,i)=>b.quaternion.angleTo(before[i])<1e-6),'repeated twist/untwist never accumulates')}
console.log(bad?bad+' problem(s)':'combat pose OK');process.exit(bad?1:0);
