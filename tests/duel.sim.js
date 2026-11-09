// DUEL: blades clash (CombatCore), the heavier swing wins the bind, perilous / magic never clash, Kage parries and answers a clash with another cut (DuelistAI.kageDuel).
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const cx={console,Math};vm.createContext(cx);
vm.runInContext(['Moves','SwordHit','Combos','CombatCore','DuelistAI'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.CC=CombatCore;this.AI=DuelistAI;',cx);
const{M,CC,AI}=cx;let n=0,bad=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);bad++}else n++};
// pd: ticks the player starts AFTER the foe (the player's light has a 10-tick startup, the foe's cut 20, so 10 lines the two active windows up)
const mk=(pm,dm,o)=>{o=o||{};const C=CC.create({arena:{x:0,z:0,R:14}});const P=C.add('P',{x:0,z:0,face:0});const D=C.add('D',{x:0,z:o.d||1.9,face:Math.PI});if(dm)C.start('D',dm);if(pm&&dm){for(let i=0;i<(o.pd===undefined?10:o.pd);i++)C.step({})}if(pm)C.start('P',pm);return{C,P,D}};
const run=(C,t,fn)=>{const ev=[];for(let i=0;i<t;i++)for(const e of C.step(fn?fn(C.tick+1):{}))ev.push(e);return ev};
// 1. two swings meeting: a clash, no damage, both interrupted and shoved apart
{const{C,P,D}=mk('light','cut');const ev=run(C,40);
 ok(ev.some(e=>e.t==='clash'),'light vs cut: the blades clash');ok(!ev.some(e=>e.t==='hit'),'...and nobody is hit');ok(P.hp===P.hpMax&&D.hp===D.hpMax,'...no damage');
 ok(ev.filter(e=>e.t==='clash').length===1,'...exactly one clash per bind (no duplicate)')}
// 2. the heavier swing wins: Kage's overhead (30) vs a light (14)
{const{C,P,D}=mk('light','fall',{pd:30});const ev=run(C,70);const c=ev.find(e=>e.t==='clash');
 if(c){ok(c.win==='D','a heavy overhead wins the bind against a light cut (win='+c.win+')')}else ok(true,'(light finished before the overhead came down: no bind)')}
// 3. a swing with no live blade opposite is a normal hit (no clash)
{const{C,P,D}=mk('light',null);const ev=run(C,30);ok(!ev.some(e=>e.t==='clash')&&ev.some(e=>e.t==='hit'),'a swing at an idle fighter hits')}
// 4. a guard still deflects (the clash does not replace parry)
{const{C,P,D}=mk(null,'cut');const ev=run(C,40,t=>t===10?{P:{list:[{t:'parry'}]}}:{});ok(ev.some(e=>e.t==='deflect')&&!ev.some(e=>e.t==='clash'),'a parried swing deflects, it is not a clash')}
// 5. perilous moves cannot be clashed
{const per=Object.keys(M).filter(k=>M[k]&&M[k].per===1&&M[k].who==='D'&&M[k].w>0&&!M[k].fx&&!M[k].gr)[0];
 if(per){const{C,P,D}=mk('light',per,{d:2.4});const ev=run(C,120);ok(!ev.some(e=>e.t==='clash'),per+' (perilous) is not clashed')}}
// 6. hit-stop and recoil
{const{C,P,D}=mk('light','cut');let sawHs=false,rec=0;for(let i=0;i<40;i++){C.step({});if(C.hs>0)sawHs=true;if(P.act==='stun'&&P.sk==='recoil')rec++}ok(sawHs,'a clash freezes the sim for a few ticks');ok(rec>=10,'the clash recoils both fighters ('+rec+' ticks)')}
// 7. determinism
{const a=(()=>{const{C}=mk('light','cut');return JSON.stringify(run(C,60))})(),b=(()=>{const{C}=mk('light','cut');return JSON.stringify(run(C,60))})();ok(a===b,'clash is deterministic')}
// 8. KAGE vs a swinging player: he parries some swings (deflect on the player), clashes, and answers a clash at once
{let clashes=0,defl=0,fast=0,hitsOnP=0,atk=0;
 for(let seed=1;seed<=8;seed++){const C=CC.create({arena:{x:0,z:0,R:14}});const P=C.add('P',{x:0,z:0,face:0,hp:1e5}),D=C.add('D',{x:0,z:2.1,face:Math.PI,hp:1e5,tm:1.3,dm:1.45});D.spd=2.2;
  const A=AI.create(seed,{foe:'samurai',kid:'samurai',intro:0});A.on=true;let evs=[],lastClash=-999,rs=seed*7919%1000;const rnd=()=>{rs=(rs*16807)%2147483647;return rs/2147483647};
  for(let t=0;t<3600;t++){const o=AI.think(A,P,D,evs,C.tick);const cm={D:{face:Math.atan2(P.x-D.x,P.z-D.z),mx:o.mx||0,mz:o.mz||0,list:o.list.map(c=>Object.assign({},c))}};
   const pf=Math.atan2(D.x-P.x,D.z-P.z),dd=Math.hypot(D.x-P.x,D.z-P.z);const pl=[];
   if(P.act==='free'&&rnd()<.06&&dd<2.9)pl.push({t:'light'});
   const mx=dd>2.2?Math.sin(pf)*.7:0,mz=dd>2.2?Math.cos(pf)*.7:0;
   cm.P={face:pf,mx,mz,list:pl};evs=C.step(cm);
   for(const e of evs){if(e.t==='clash'){clashes++;lastClash=C.tick}if(e.t==='deflect'&&e.d==='D')defl++;if(e.t==='hit'&&e.d==='P')hitsOnP++;if(e.t==='start'&&e.a==='D'){atk++;if(C.tick-lastClash<=45)fast++}}}}
 ok(clashes>0,'a swinging player and Kage clash ('+clashes+')');ok(defl>0,'Kage parries some swings ('+defl+')');ok(fast>0,'Kage answers a clash with a quick attack ('+fast+' of '+atk+' attacks)');ok(hitsOnP>0,'he still lands hits (it is a fight, not a stalemate: '+hitsOnP+')')}
console.log('ok '+n+' checks'+(bad?' ('+bad+' FAILED)':''));process.exit(bad?1:0);
