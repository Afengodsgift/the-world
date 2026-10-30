// Fighting styles: stat layer, taunt, and the Shadow Edge backstab on the REAL combat sim.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math};vm.createContext(c);
vm.runInContext(['Moves','SwordHit','Combos','CombatCore','Styles'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.CC=CombatCore;this.S=WardenStyle',c);
const {M,CC,S}=c;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const w={hp:1,dm:1,pm:1,sm:1,dfl:0,flow:1};
ok(S.IDS.length===4&&S.get('twin').dual===1&&S.valid('wall')&&!S.valid('nope')&&S.get('nope')===S.get(S.DEFAULT),'four styles; unknown ids fall back to the default');
const g=S.mix(w,'ginga'),a=S.mix(w,'wall'),h=S.mix(w,'shade');
ok(a.hp>g.hp&&a.dfl>g.dfl&&a.dm<g.dm&&h.hp<g.hp&&h.dm>g.dm&&g.flow>1,'Iron Wall: tougher, wider deflect, softer hits; Shadow Edge: frailer, harder hits; Ginga: more Flow');
ok(S.mix({hp:1.1,dm:1.2,pm:1,sm:.8,dfl:2,flow:1.3},'wall').dfl===2+S.get('wall').dfl,'styles stack on top of weapon + affix stats');
ok(S.taunt('wall')>0&&S.taunt('shade')<0&&S.taunt('ginga')===0,'taunt: Wall draws foes, Shadow Edge repels them');
ok(S.get('shade').shCd<1&&S.get('shade').shLife>S.get('ginga').shLife&&S.get('wall').shCd>1,'Afterimage: Shadow Edge recharges faster and lasts longer, Iron Wall slower');
// backstab on the real sim: attacker behind a foe that faces away hits harder; from the front there is no bonus
function hit(bk,behind){
  const C=CC.create({arena:{x:0,z:0,R:30}});const P=C.add('P',{x:0,z:0,face:0,hp:100,team:'p'}),D=C.add('D',{x:0,z:1.6,face:behind?0:Math.PI,hp:1000,team:'e'});P.bk=bk;let dmg=0;
  for(let t=0;t<60;t++){const cm={P:{list:t===0?[{t:'light',e:0}]:[],face:0},D:{list:[],face:D.face}};for(const e of C.step(cm))if(e.t==='hit'&&e.a==='P')dmg+=e.dmg}return dmg}
const base=hit(0,true),back=hit(.35,true),front=hit(.35,false);
ok(base>0&&Math.abs(back/base-1.35)<1e-6,'Shadow Edge: hitting a foe from behind does +35% ('+base.toFixed(1)+' -> '+back.toFixed(1)+')');
ok(front>0&&Math.abs(front-hit(0,false))<1e-9,'no bonus against a foe that faces you');
console.log(bad?bad+' FAILED':'all ok');process.exit(bad?1:0)
