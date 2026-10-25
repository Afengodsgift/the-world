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
console.log(bad?bad+' FAILED':'all ok');process.exit(bad?1:0)
