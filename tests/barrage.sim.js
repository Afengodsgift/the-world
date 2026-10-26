// Phantom Barrage: damage budget, bullet-time curve, trigger stages, and on the REAL sim: a dodge at the sweet tick beats all three strikes, standing still eats all three (about half health, never lethal).
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math};vm.createContext(c);
vm.runInContext(['Moves','SwordHit','Combos','CombatCore','Barrage'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.CC=CombatCore;this.B=Barrage',c);
const {M,CC,B}=c;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
ok(M[B.MOVE]&&M[B.MOVE].who==='D','the barrage strike is an existing foe move ('+B.MOVE+')');
ok(Math.abs(B.dmFor(100,100,22,3)*22*3-50)<1e-9,'a missed barrage costs half of max health (100 hp -> 50)');
ok(B.dmFor(100,30,22,3)*22*3<=30*.9+1e-9&&B.dmFor(100,1,22,3)===0,'never lethal: 30 hp loses at most 27, 1 hp loses nothing');
ok(B.speed(0,0)===1&&Math.abs(B.speed(12,0)-B.SCALE)<1e-9&&B.speed(6,0)<1&&B.speed(6,0)>B.SCALE,'bullet time: normal at the lunge, eased down, held at '+B.SCALE);
ok(Math.abs(B.speed(0,.001)-B.SCALE)<.01&&B.speed(0,1)===1,'speed eases back to normal after the hits');
ok(B.stage(.9)===0&&B.stage(.65)===1&&B.stage(.4)===1&&B.stage(.3)===2&&B.stage(.1)===2,'barrage stages at 65% and 30% boss health');
ok(B.inWindow(B.SWEET)&&!B.inWindow(2)&&!B.inWindow(40)&&B.ring(0)===0&&B.ring(B.SWEET)===1,'the prompt ring reaches the sweet spot at tick '+B.SWEET);
// ---- the real sim ----
function run(dodgeAt){
  const C=CC.create({arena:{x:0,z:0,R:30}});const P=C.add('P',{x:0,z:0,face:0,hp:100});const ids=['A','B','D'],E=[];
  [0,2.1,-2.1].forEach((a,i)=>{const f=C.add(ids[i],{x:Math.sin(a)*2.9,z:Math.cos(a)*2.9,face:0,hp:9999,team:'e'});f.face=Math.atan2(-f.x,-f.z);f.dm=B.dmFor(P.hpMax,P.hp,M[B.MOVE].dmg,3);E.push(f)});
  let hits=0,dodged=0;for(let t=0;t<90;t++){const cm={P:{list:[],face:0}};for(const f of E)cm[f.id]={list:t===0?[{t:'atk',m:B.MOVE}]:[],face:Math.atan2(-f.x,-f.z)};
    if(dodgeAt!==null&&t===dodgeAt)cm.P.list.push({t:'dodge',e:C.tick,dx:0,dz:-1});
    for(const e of C.step(cm)){if(e.t==='hit'&&e.d==='P')hits++;if(e.t==='dodged'&&e.d==='P')dodged++}}
  return{hits,dodged,hp:P.hp}}
const miss=run(null),good=run(B.SWEET),early=run(2),late=run(40);
ok(miss.hits===3&&miss.hp<=52&&miss.hp>=48,'standing still: all 3 hit, health 100 -> '+miss.hp.toFixed(0)+' (about half)');
ok(good.hits===0&&good.dodged>=1&&good.hp===100,'dodging at the sweet tick: no hits, no damage (dodged '+good.dodged+')');
ok(late.hits>0,'a dodge that comes too late still gets hit (late '+late.hits+'); an early one just backs you out of reach ('+early.hits+' hits) - generous on a phone');
// ---- input timing in bullet time (the "dodge fires after the cinematic" bug) ----
// Model of the fight loop: the sim clock vt advances at tsc x real time; a tap is stamped by the browser in real time. Old: stamp = real time since fight start. New: Barrage.stamp.
function bullet(useNew){
  const C=CC.create({arena:{x:0,z:0,R:30}});C.add('P',{x:0,z:0,face:0,hp:100});const ST=CC.stepper(C,6);
  let real=1000,vt=0,vl=real,tsc=1,fired=null,tapReal=null;const t0=1000;
  for(let fr=0;fr<400;fr++){
    real+=16.7;tsc=real<3000?1:real<6000?.25:1;               // 1 s normal, 3 s bullet time, then normal
    if(real>=4000&&tapReal===null){tapReal=real-5;const ts=tapReal;ST.input('P',{t:'dodge',e:C.tick,dx:0,dz:-1},useNew?B.stamp(ts,vl,vt,tsc):ts-t0)}   // a tap 5 ms before this frame
    vt+=Math.min(100,real-vl)*tsc;vl=real;
    ST.advance(vt,null,null);if(fired===null&&C.F.P.act==='dodge')fired=real}
  return{lag:fired===null?Infinity:fired-tapReal,vt}}
const oldI=bullet(false),newI=bullet(true);
ok(oldI.lag>1000,'OLD stamping: a tap in bullet time waited '+oldI.lag.toFixed(0)+' ms (the bug: it fired after the slow motion)');
ok(newI.lag<150,'NEW stamping: the same tap starts the dodge within '+newI.lag.toFixed(0)+' ms of real time');
ok(B.stamp(5000,0,100,.25)===100&&B.stamp(5016,5000,100,1)===116&&Math.abs(B.stamp(5100,5000,100,.25)-110)<1e-9&&B.stamp(9e9,5000,100,1)===100,'Barrage.stamp: before first frame = sim now, scales by speed, clamps odd time bases');
// ---- co-op rules ----
{const s=B.plan(false),c=B.plan(true);
ok(s.roles==='hhh'&&c.roles==='hggh'&&c.off.length===4,'solo: 3 attackers on you; co-op: 4 attackers, two aimed at each player');
ok(B.count(c.roles,'h')===2&&B.count(c.roles,'g')===2&&B.count(s.roles,'h')===3,'each player faces their own share of attackers');
const sh=B.slot('h',0.7,true),sg=B.slot('g',0.7,true),s0=B.slot('h',.7,false);
ok(Math.abs(Math.hypot(sh.dx-sg.dx,sh.dz-sg.dz)-3)<1e-9&&s0.dx===0&&s0.dz===0,'co-op players stand 3 m apart, perpendicular to the lunge; solo stands at the centre');
ok(B.reward(true)*2===B.reward(false),'two perfect co-op dodges earn the full solo boss reward; one earns half');
// each player is judged alone: damage budget per player is the same as solo (half max health) however many attackers aim at them
const per=B.dmFor(100,100,22,2)*22*2,solo=B.dmFor(100,100,22,3)*22*3;ok(Math.abs(per-solo)<1e-9&&Math.abs(per-50)<1e-9,'a miss costs half of YOUR health in solo and in co-op');}
console.log(bad?bad+' FAILED':'all ok');process.exit(bad?1:0)
