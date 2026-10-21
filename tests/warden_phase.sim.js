// Boss phase safety (CombatCore phase gate): a hit that would cross the phase line, or kill a boss before its phase has happened, stops at the line and starts a short invulnerable roar.
// Not immortality: once the phase is gone (or the foe was already past the line) damage works normally.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math};vm.createContext(c);vm.runInContext(['Moves','SwordHit','Combos','CombatCore'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.CC=CombatCore',c);const CC=c.CC;
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
function mk(dOpt,pOpt){const C=CC.create({arena:{x:0,z:0,R:14}});const P=C.mkFighter?null:null;
  const p=CC.mkFighter('P',Object.assign({x:0,z:0,face:0,team:'p'},pOpt)),d=CC.mkFighter('D',Object.assign({x:0,z:1.6,face:Math.PI,team:'e'},dOpt));
  C.F.P=p;C.F.D=d;C.order.push('P','D');return{C,P:p,D:d}}
// swing until the foe has been hit (or n ticks pass); returns the events
function swing(C,n){const ev=[];C.step({P:{list:[{t:'light'}]}});for(let i=0;i<(n||60);i++)for(const e of C.step({}))ev.push(e);return ev}
{const{C,D}=mk({hp:100,pg:.5},{dm:10});const ev=swing(C);
  ok(D.act!=='dead'&&D.hp===49,'a huge hit on a full-health boss stops at the phase line (hp '+D.hp+')');
  ok(ev.filter(e=>e.t==='phase').length===1,'exactly one phase event');
  ok(!ev.some(e=>e.t==='dead'),'no death event');
  ok(D.pgd===true,'gate marked as used')}
{const{C,D}=mk({hp:100,pg:.5},{dm:10});C.step({P:{list:[{t:'light'}]}});let first=-1,imm=0,hpAfter=0;
  for(let i=0;i<90;i++){const ev=C.step({});if(first<0&&ev.some(e=>e.t==='phase')){first=C.tick;hpAfter=D.hp}}
  ok(first>0&&D.hp===hpAfter,'the roar window ignores a second hit in the same swing (hp stays '+D.hp+')')}
{const{C,D}=mk({hp:100,pg:.5},{dm:10});C.step({P:{list:[{t:'light'}]}});let imm=0,pt=-1;for(let i=0;i<30;i++)for(const e of C.step({}))if(e.t==='phase')pt=C.tick;
  while(C.F.P.act!=='free'&&C.tick<pt+60)C.step({});C.step({P:{list:[{t:'light'}]}});for(let i=0;i<14;i++)for(const e of C.step({}))if(e.t==='immune')imm++;
  ok(imm>=1&&D.hp===49,'a follow-up hit inside the roar window is ignored (immune events '+imm+', hp '+D.hp+')')}
{const{C,D}=mk({hp:100,pg:.5},{dm:10});swing(C,70);ok(D.inv===0,'invulnerability is short and ends ('+D.inv+')');
  D.act='free';D.ph=null;D.mv=null;const P=C.F.P;P.act='free';P.ph=null;P.mv=null;P.st=100;
  const ev=swing(C,80);ok(D.act==='dead'||D.hp<49,'after the roar the boss takes damage and can die normally (hp '+D.hp+')')}
{const{C,D}=mk({hp:100,pg:.5},{dm:10});D.hp=30;const ev=swing(C);ok(D.act==='dead','a boss already past the line (hp 30) dies to a lethal hit: no immortality')}
{const{C,D}=mk({hp:100,pg:0},{dm:10});const ev=swing(C);ok(D.act==='dead'&&!ev.some(e=>e.t==='phase'),'a foe with no phase line is simply killed')}
{const{C,D}=mk({hp:100,pg:.5},{dm:.3});swing(C);ok(D.hp>50&&D.pgd===false&&D.inv===0,'a normal hit that stays above the line does nothing special ('+D.hp.toFixed(1)+')')}
{// determinism: the same input gives the same result
 const a=mk({hp:100,pg:.5},{dm:10}),b=mk({hp:100,pg:.5},{dm:10});swing(a.C);swing(b.C);ok(a.D.hp===b.D.hp&&a.D.inv===b.D.inv,'deterministic')}
{// source check: every boss foe type is created with the gate
 const s=fs.readFileSync(R+'src/combat/PlayerCombat.js','utf8');ok(/pg:!hum&&T\.boss\?\.5:0/.test(s),'PlayerCombat gives every boss the phase gate')}
process.exit(bad?1:0);
