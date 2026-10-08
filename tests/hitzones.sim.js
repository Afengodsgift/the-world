// HitZones: body zones + height-aware cover (the spec's scenarios: head over a crate, torso blocked, only an arm exposed), zone damage, rotation, ranges.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';const c={Math};vm.createContext(c);
vm.runInContext(fs.readFileSync(R+'src/combat/HitZones.js','utf8')+';this.HZ=HitZones',c);const HZ=c.HZ;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const dir=(o,t)=>{const x=t[0]-o.x,y=t[1]-o.y,z=t[2]-o.z,l=Math.hypot(x,y,z);return {x:x/l,y:y/l,z:z/l}};
// resolve a shot like Outlaw.fire(): nearest of cover and body zones
const shoot=(o,tgt,cover,npc)=>{const d=dir(o,tgt),w=HZ.coverT(o,d,100,cover),h=HZ.hit(o.x,o.y,o.z,d.x,d.y,d.z,w.t,npc.x,npc.y,npc.z,npc.ry,npc.sc||1);return h?{kind:'body',zone:h.zone,t:h.t}:w.c?{kind:'cover',t:w.t}:{kind:'miss'}};
const o={x:0,y:1.5,z:0};
// ---- TEST 3/4: raider behind a crate (1.3 m high): head sticks out, torso/legs are hidden
const crate=[{x:0,z:6,r:.95,y:0,h:1.3}],npc={x:0,y:0,z:7.2,ry:Math.PI};
let r=shoot(o,[0,1.62,7.2],crate,npc);ok(r.kind==='body'&&r.zone==='head','head shot passes over the crate and registers as HEAD');
r=shoot(o,[0,1.05,7.2],crate,npc);ok(r.kind==='cover','lower torso shot is BLOCKED by the crate');
r=shoot(o,[0,.4,7.2],crate,npc);ok(r.kind==='cover','leg shot is BLOCKED by the crate');
r=shoot(o,[0,1.42,7.2],crate,npc);ok(r.kind==='body'&&(r.zone==='torso'||r.zone==='head'),'upper chest above the crate line is exposed ('+r.zone+')');
// the same raider with the crate removed: every part is hittable
for(const [name,tgt,zone] of [['head',[0,1.62,7.2],'head'],['torso',[0,1.2,7.2],'torso'],['leg',[.12,.5,7.2],'leg']]){r=shoot(o,tgt,[],npc);ok(r.kind==='body'&&r.zone===zone,'no cover: aiming at the '+name+' hits the '+zone)}
// ---- TEST 5: only an arm is exposed beside a tall wall (unlimited height)
const wall=[{x:0,z:6,r:1.3}],peek={x:1.5,y:0,z:8,ry:Math.PI};
r=shoot(o,[1.5,1.2,8],wall,peek);ok(r.kind==='cover','torso behind the wall is blocked');
r=shoot(o,[1.89,1.2,8],wall,peek);ok(r.kind==='body'&&r.zone==='arm','exposed arm registers as ARM');
// ---- damage model
ok(HZ.zoneMult('torso','pistol')===1,'torso = 100%');ok(HZ.zoneMult('arm','rifle')<1&&HZ.zoneMult('leg','rifle')<1&&HZ.zoneMult('arm','rifle')>=.5,'arms/legs reduced (50-70%)');
ok(HZ.zoneMult('head','sniper')>HZ.zoneMult('head','pistol')&&HZ.zoneMult('head','pistol')>HZ.zoneMult('head','smg')&&HZ.zoneMult('head','smg')>1,'headshot multiplier is per weapon class (sniper > pistol > smg > body)');
ok(HZ.zoneMult('head','pistol',.6)<HZ.zoneMult('head','pistol')&&HZ.zoneMult('head','pistol',.5)<1.2*HZ.zoneMult('head','pistol'),'heavy raiders soften headshots (not one-tap)');
ok(HZ.zoneMult('head','pistol',1,5)>HZ.zoneMult('head','pistol',1,0),'crit upgrade raises the headshot multiplier');
// ---- geometry
const dd=dir(o,[0,1.62,7.2]);let h=HZ.hit(o.x,o.y,o.z,dd.x,dd.y,dd.z,100,0,0,7.2,Math.PI,1);ok(h&&Math.abs(h.t-(Math.hypot(0,.12,7.2)-.2))<.15,'head hit distance is right');
const miss=dir(o,[1.5,1.5,7.2]);ok(HZ.hit(o.x,o.y,o.z,miss.x,miss.y,miss.z,100,0,0,7.2,Math.PI,1)===null,'a shot beside the raider misses');
const hi=dir(o,[0,3,7.2]);ok(HZ.hit(o.x,o.y,o.z,hi.x,hi.y,hi.z,100,0,0,7.2,Math.PI,1)===null,'a shot over his head misses');
// arms rotate with his heading: facing +x (ry=PI/2), his arms are along z
const vs=HZ.volumes(0,0,0,Math.PI/2,1).filter(v=>v.zone==='arm'),zs=vs.map(v=>v.a[2]).sort();ok(Math.abs(zs[0]+.37)<.01&&Math.abs(zs[1]-.37)<.01&&vs.every(v=>Math.abs(v.a[0])<.01),'arm volumes rotate with the raider');
const big=HZ.volumes(0,0,0,0,1.5).find(v=>v.zone==='head');ok(Math.abs(big.a[1]-1.62*1.5)<.01&&Math.abs(big.r-.2*1.5)<.01,'volumes scale with the raider (boss size)');
// ---- cover edge cases
ok(HZ.coverT({x:0,y:1.5,z:6},{x:0,y:0,z:1},100,crate).t===100,'a shot starting inside a cover circle ignores it (standing against a crate)');
const over=HZ.coverT({x:0,y:3,z:0},dir({x:0,y:3,z:0},[0,2.5,12]),100,crate);ok(over.c===null,'a high shot passes over low cover');
const down=HZ.coverT({x:0,y:4,z:0},dir({x:0,y:4,z:0},[0,.2,6]),100,crate);ok(down.c===crate[0],'a steep downward shot that reaches the crate top is blocked');
ok(HZ.coverT(o,dir(o,[0,3,6.5]),100,[{x:0,z:6,r:.95}]).c!==null,'cover without a height (buildings) blocks at any height');
const train=[{x:0,z:6,r:2,y:0,h:4}];ok(HZ.coverT(o,dir(o,[0,3,12]),100,train).c===train[0],'train car (4 m) blocks a 3 m shot');
// ---- far targets are a bit more forgiving (phone thumbs), but never absurdly
const far={x:0,y:0,z:60,ry:Math.PI},fo={x:0,y:1.5,z:0};let miss2=dir(fo,[.45,1.62,60]);const farHit=HZ.hit(fo.x,fo.y,fo.z,miss2.x,miss2.y,miss2.z,200,far.x,far.y,far.z,far.ry,1);const farBody=dir(fo,[.9,1.2,60]);ok(HZ.hit(fo.x,fo.y,fo.z,farBody.x,farBody.y,farBody.z,200,far.x,far.y,far.z,far.ry,1)===null,'but a shot a full metre wide still misses at 60 m');
console.log(bad?bad+' problem(s)':'hit zones OK');process.exit(bad?1:0);
