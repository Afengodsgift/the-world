// BossBrain: Grady and Jake state machines (telegraph -> commit -> recover, phases, Last Stand, fake death).
const fs=require('fs'),path=require('path'),vm=require('vm');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const ctx={Math};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','src/combat/BossBrain.js'),'utf8').replace(/^const (\w+)=/m,'globalThis.$1='),ctx);
const {BossBrain}=ctx;
function run(kind,hp,secs,I){const b={},seen=new Set(),ev=[],vul=[];let t=0;
  while(t<secs){const i=Object.assign({d:(I&&I.pd&&b.s==='pounce')?1.5:18,seen:true,hp:typeof hp==='function'?hp(t):hp,range:34,ready:true},I||{});if(I&&I.pd&&b.s==='pounce')i.d=1.5;const o=BossBrain.step(kind,b,i,.05);seen.add(b.s);ev.push(...o.ev);if(o.vuln)vul.push(t);t+=.05}
  return {b,seen,ev,vul}}
let r=run('grady',1,30);
ok(['advance','deploy','fire','vent','reposition'].every(s=>r.seen.has(s)),'Grady cycles advance -> deploy -> fire -> vent -> reposition');
ok(r.ev.includes('rev')&&r.ev.includes('vent'),'Grady telegraphs (rev) and vents');
ok(r.vul.length>20,'Grady is vulnerable while venting');
r=run('grady',t=>t<5?1:.5,20);ok(r.ev.includes('phase2'),'Grady enters phase 2 at 66%');
r=run('grady',t=>t<5?1:.2,25);ok(r.ev.includes('phase3'),'Grady enters Last Stand at 33%');
const v1=run('grady',1,40).vul.length,v3=run('grady',.2,40).vul.length;ok(v3>0,'Last Stand still vents (shorter)');
{const b={},o=[];for(let t=0;t<10;t+=.05){const was=b.s,x=BossBrain.step('grady',b,{d:18,seen:true,hp:1,range:34,ready:true},.05);if(was==='fire')o.push(x.shoot)}ok(o.length&&o.every(Boolean),'Grady shoots only in the fire stage');
 const x=BossBrain.step('grady',{s:'deploy',t:1,heat:0,ph:1,side:1,sw:0},{d:18,seen:true,hp:1,range:34,ready:true},.05);ok(x.sp===0&&!x.shoot,'Grady is rooted and silent while the anchor drops')}
r=run('jake',1,25,{d:8,pd:1});
ok(['stalk','tell','pounce','recover'].every(s=>r.seen.has(s)),'Jake stalks -> tells -> pounces -> recovers');
ok(r.ev.includes('rattle')&&r.ev.includes('lunge')&&r.ev.includes('strike'),'Jake rattles before the lunge and strikes on contact');
{const b={};let cloak=0,n=0;for(let t=0;t<6;t+=.05){const was=b.s,o=BossBrain.step('jake',b,{d:14,seen:true,hp:1,range:30,ready:true},.05);if(was==='stalk'){n++;if(o.st==='cloak')cloak++}}ok(n&&cloak===n,'Jake is cloaked while stalking')}
{const b={},st=[];for(let t=0;t<8;t+=.05){const was=b.s,o=BossBrain.step('jake',b,{d:8,seen:true,hp:1,range:30,ready:true},.05);if(was==='tell'||was==='recover')st.push(o.st)}ok(st.every(s=>s!=='cloak'),'Jake is visible during the tell and the recover')}
r=run('jake',t=>t<4?1:.5,12,{d:30});ok(r.ev.includes('decoy'),'Jake sends decoys in phase 2');
r=run('jake',t=>t<4?1:.2,16,{d:30});ok(r.ev.includes('feign')&&r.ev.includes('rise'),'Jake fakes his death once and rises');
{const b={};let inv=0;for(let t=0;t<12;t+=.05){const o=BossBrain.step('jake',b,{d:30,seen:true,hp:.2,range:30,ready:true},.05);if(o.inv)inv++}ok(inv>20&&inv<90,'Jake is only invulnerable during the feigned death')}
process.exit(fails?1:0);
