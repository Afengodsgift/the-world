// Combat v2 Phase 1: combo resolver + core wiring (Quick Cut chain, Advancing Cut, Evasive Punish, Rising Slash, buffering, stamina).
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math};vm.createContext(c);
vm.runInContext(['Moves','SwordHit','Combos','CombatCore'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.CC=CombatCore;this.CB=Combos',c);
const {M,CC,CB}=c;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
// ---- pure resolver ----
ok(CB.IDS.every(id=>M[id]&&M[id].who==='P'),'every combo id exists as a player move');
ok(CB.light({from:null,adv:false,chain:0,sinceDodge:99})==='light','free tap = Quick Cut 1');
ok(CB.light({from:'light',chain:1,sinceDodge:99})==='light2'&&CB.light({from:'light2',chain:2,sinceDodge:99})==='light3','cancel chain light > light2 > light3');
ok(CB.light({from:null,chain:3,sinceDodge:99})==='light','a finished chain restarts');
ok(CB.light({from:null,adv:true,chain:2,sinceDodge:99})==='advance','forward + Light = Advancing Cut');
ok(CB.light({from:null,chain:0,sinceDodge:10})==='evade'&&CB.light({from:null,chain:0,sinceDodge:40})==='light','Light right after a dodge = Evasive Punish, later = normal');
ok(CB.heavy({from:'light'})==='rising'&&CB.heavy({from:null})===null&&CB.heavy({from:'light3'})===null,'Heavy after Light = Rising Slash, otherwise a normal charge');
// ---- core ----
const mk=o=>{const C=CC.create({arena:{x:0,z:0,R:30}});const P=C.add('P',Object.assign({x:0,z:0,face:0},o&&o.P));const D=C.add('D',Object.assign({x:0,z:2,face:Math.PI,hp:1e5},o&&o.D));return{C,P,D}};
const step=(C,n,cmds)=>{const ev=[];for(let i=0;i<n;i++)for(const e of C.step(i===0&&cmds?cmds:{}))ev.push(e);return ev};
const L=(x)=>({P:{list:[Object.assign({t:'light',e:0},x||{})],face:0}});
const starts=ev=>ev.filter(e=>e.t==='start'&&e.a==='P').map(e=>e.move);
// a three-tap chain, each tap at the earliest cancel tick
{const {C,P}=mk();let seq=[];const run=(n)=>{for(let i=0;i<n;i++){const ev=C.step(i===0&&0?{}:{});seq.push(...starts(ev))}};
  step(C,1,L());seq.push('light');
  // light: startup10+active4 = recovery starts at pt14; cancel at recovery tick 6 => pt20
  let ev=step(C,19);ok(P.mv&&P.mv.id==='light'&&P.pk>=0,'light is mid-move');
  for(let i=0;i<8&&P.mv&&P.mv.id==='light';i++){const e=step(C,1,L());const s=starts(e);if(s.length)seq.push(...s)}
  ok(seq.join('>')==='light>light2','second tap inside the cancel window = light2 ('+seq.join('>')+')');
  for(let i=0;i<40&&P.mv&&P.mv.id==='light2';i++){const s=starts(step(C,1,L()));if(s.length)seq.push(...s)}
  ok(seq.join('>')==='light>light2>light3','third tap = light3 ('+seq.join('>')+')');
  for(let i=0;i<60&&P.act==='attack';i++){const s=starts(step(C,1,L()));ok(s.length===0||i>30,'light3 cannot be cancelled into another light (tap '+i+')');if(i>30)break}
}
// chain gap: tap again 12 ticks after the move ends continues the chain; 45 ticks later starts fresh
for(const [gap,want] of [[12,'light2'],[45,'light']]){const {C,P}=mk();step(C,1,L());while(P.act==='attack')step(C,1);step(C,gap);const s=starts(step(C,1,L()));ok(s[0]===want,'tap '+gap+' ticks after the move ends = '+want+' (got '+s[0]+')')}
// Advancing Cut: steps in ~1.3 m during its startup
{const {C,P}=mk({D:{z:9}});const z0=P.z;const s=starts(step(C,1,L({adv:true})));step(C,9);ok(s[0]==='advance'&&P.z-z0>1.2&&P.z-z0<1.45,'forward Light = Advancing Cut and closes '+(P.z-z0).toFixed(2)+' m')}
// Evasive Punish: Light within the gap after a dodge ends; startup is only 6 ticks
{const {C,P}=mk({D:{z:9}});step(C,1,{P:{list:[{t:'dodge',e:0,dx:1,dz:0}],face:0}});while(P.act==='dodge')step(C,1);step(C,5);const s=starts(step(C,1,L()));ok(s[0]==='evade','Light 5 ticks after a dodge = Evasive Punish');
  let t=0;while(P.pi<1&&t<20){step(C,1);t++}ok(M.evade.phases[0].n===6,'Evasive Punish startup is 6 ticks (faster than a normal Light, 10)')}
// Rising Slash
{const {C,P,D}=mk();step(C,1,L());step(C,19);let got=null;for(let i=0;i<8&&!got;i++){const s=starts(step(C,1,i===0?{P:{list:[{t:'heavyDown',e:C.tick+1}],face:0}}:null));if(s.length)got=s[0]}
  ok(got==='rising','Heavy tapped in the Light cancel window = Rising Slash');ok(M.rising.pdmg>M.light.pdmg*2.5,'Rising Slash pressures posture ('+M.rising.pdmg+' vs '+M.light.pdmg+')')}
// Heavy tapped a little EARLY is buffered and still becomes Rising once the window opens
{const {C,P}=mk();step(C,1,L());step(C,12);let got=null;const ev=step(C,1,{P:{list:[{t:'heavyDown',e:C.tick+1}],face:0}});if(starts(ev).length)got=starts(ev)[0];for(let i=0;i<20&&!got;i++){const s=starts(step(C,1));if(s.length)got=s[0]}ok(got==='rising','Heavy pressed ~13 ticks early is remembered and fires Rising Slash (got '+got+')')}
// ...but a Heavy that was buffered and then missed the window must NEVER turn into a runaway charge
{const {C,P}=mk();step(C,1,L());step(C,3);step(C,1,{P:{list:[{t:'heavyDown',e:C.tick+1}],face:0}});step(C,1,{P:{list:[{t:'heavyUp'}],face:0}});step(C,80);ok(P.act!=='charge','a stale buffered Heavy does not start a charge ('+P.act+')')}
// plain Heavy from free still charges
{const {C,P}=mk();step(C,1,{P:{list:[{t:'heavyDown',e:1}],face:0}});ok(P.act==='charge','Heavy from free still charges')}
// no stamina: Light is refused
{const {C,P}=mk();P.st=0;P.sr=0;const s=starts(step(C,20,L()));ok(s.length===0&&P.act==='free','with 0 stamina a Light does not start')}
// new moves are player-only and add no Duelist moves
ok(Object.keys(M).filter(k=>M[k]&&M[k].who==='D').length===15,'foe move count (11 melee + 4 ranged/magic)');
// every move has a clip mapping with one entry per phase (otherwise it would animate wrongly or not at all)
{const src=fs.readFileSync(R+'src/combat/WardenAnim.js','utf8'),a=src.indexOf('const MAP={')+'const MAP='.length,b=src.indexOf('};\n  const NAMES'),MAP=(new Function('return '+src.slice(a,b+1)))();
 for(const id of Object.keys(M).filter(k=>M[k]&&M[k].phases&&k!=='dodge')){const key=id==='light'?'light_b':id;const mm=MAP[key];ok(mm&&mm.length===M[id].phases.length,'clip map for '+id+' has '+(mm?mm.length:0)+' entries for '+M[id].phases.length+' phases')}}
process.exit(bad?1:0);
