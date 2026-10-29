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
ok(CB.heavy({from:'light'})==='rising'&&CB.heavy({from:null})===null&&CB.heavy({from:'light3'})==='whirl','Heavy after Light = Rising Slash, after the 3rd = Tempest, otherwise a normal charge');
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
  let t=0;while(P.pi<1&&t<20){step(C,1);t++}ok(M.evade.phases[0].n===4&&M.evade.phases[0].n<M.light.phases[0].n,'Evasive Punish startup is 4 ticks (faster than a normal Light, 7)')}
// Plunge Strike: Light while airborne (Jump + Light) = a dive that lands a heavy, posture-breaking hit
{ok(CB.light({air:true,from:null,chain:0,sinceDodge:99})==='plunge'&&CB.light({air:false,from:null,chain:0,sinceDodge:99})==='light','Light in the air = Plunge Strike, on the ground = Light');
 const {C,P,D}=mk({D:{z:2.2}});P.y=2;const s=starts(step(C,1,L()));ok(s[0]==='plunge','an airborne Light starts the Plunge ('+s[0]+')');P.y=0;const hp0=D.hp;let hit=0;for(let i=0;i<40;i++){const ev=step(C,1);hit+=ev.filter(e=>e.t==='hit'&&e.a==='P').length}
 ok(hit===1&&D.hp<hp0-25,'it lands one hit for 25+ damage on a foe in front of you (hp '+hp0+' -> '+D.hp+')');ok(M.plunge.pdmg>=M.rising.pdmg&&M.plunge.dmg>M.light.dmg*2,'it breaks posture harder than Rising Slash and hits over twice as hard as Light');ok(M.plunge.phases[2].n>=M.light.phases[2].n,'and costs a long recovery ('+M.plunge.phases[2].n+' ticks)')}
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
ok(Object.keys(M).filter(k=>M[k]&&M[k].who==='D').length===29,'foe move count (14 melee + 4 ranged/magic + blink + snare + 5 Kage moves + 4 Penitent moves)');
// every move has a clip mapping with one entry per phase (otherwise it would animate wrongly or not at all)
{const src=fs.readFileSync(R+'src/combat/WardenAnim.js','utf8'),a=src.indexOf('const MAP={')+'const MAP='.length,b=src.indexOf('};\n  const NAMES'),MAP=(new Function('return '+src.slice(a,b+1)))();
 for(const id of Object.keys(M).filter(k=>M[k]&&M[k].phases&&k!=='dodge')){const key=id==='light'?'light_b':id;const mm=MAP[key];ok(mm&&mm.length===M[id].phases.length,'clip map for '+id+' has '+(mm?mm.length:0)+' entries for '+M[id].phases.length+' phases')}}
// ---- new sets: Shield Shove, Lunge, Tempest, super armour ----
{const {C,P}=mk({D:{z:9}});step(C,1,{P:{list:[{t:'guardDown',e:0}],face:0}});step(C,5);const s=starts(step(C,1,L()));ok(s[0]==='shove','Guard + Light = Shield Shove ('+s[0]+')')}
{const {C,P}=mk({D:{z:9}});step(C,1,{P:{list:[{t:'dodge',e:0,dx:1,dz:0}],face:0}});while(P.act==='dodge')step(C,1);step(C,4);const s=starts(step(C,1,{P:{list:[{t:'heavyDown',e:C.tick+1}],face:0}}));ok(s[0]==='lunge','Heavy just after a dodge = Lunge ('+s[0]+')')}
{const {C,P}=mk({D:{z:9}});step(C,1,L());let seq=[];for(let k=0;k<2;k++){let g=0;while(!(P.mv&&P.act==='attack'&&P.pi>=2&&P.pt>0&&M[P.mv.id].cancel.light!==undefined&&C.tick>=0&&g<80)&&g<80){step(C,1);g++;if(P.pi>=2)break}for(let i=0;i<30&&P.mv&&(P.mv.id==='light'||P.mv.id==='light2');i++){const e=step(C,1,L());const st=starts(e);if(st.length){seq.push(st[0]);break}}}
  while(!(P.mv&&P.mv.id==='light3')&&C.tick<400)step(C,1);let got=null;for(let i=0;i<60&&!got&&P.mv&&P.mv.id==='light3';i++){const st=starts(step(C,1,{P:{list:[{t:'heavyDown',e:C.tick+1}],face:0}}));if(st.length)got=st[0]}ok(got==='whirl','Heavy after the third Light = Tempest ('+got+')');ok(M.whirl.phases.find(p=>p.k==='active').a0>3,'Tempest covers a full circle')}
{const {C,P,D}=mk({P:{sa:1},D:{z:1.6,sa:1,hp:1e5}});C.start('D','cut');step(C,14);const hp=D.hp;C.start('P','heavy');for(let i=0;i<60&&D.hp===hp;i++)step(C,1);
  ok(D.hp<hp&&D.act==='attack'||D.hp<hp&&D.act==='free','super-armoured foe takes the hit but is not interrupted (hp '+hp+'>'+D.hp+', act '+D.act+')');ok(D.kr===0,'super armour: no knockback');}
{const {C,P,D}=mk({P:{sa:1},D:{z:1.6,hp:1e5}});C.start('D','cut');step(C,14);C.start('P','heavy');for(let i=0;i<60&&D.act!=='stun'&&D.hp===1e5;i++)step(C,1);ok(D.act==='stun'&&D.sk==='hit','a normal foe is still interrupted (control)')}
// ---- gear hooks: stamina cost, posture, deflect window ----
{const a=mk(),b=mk({P:{}});b.P.sm=.5;a.P.sm=1;step(a.C,1,L());step(b.C,1,L());ok(b.P.st>a.P.st,'stamina cost multiplier (sm .5 spends less)')}
{const {C,P,D}=mk({P:{sa:1},D:{z:1.6,hp:1e5}});P.pm=2;D.sa=0;C.start('P','light');for(let i=0;i<30&&D.po===0;i++)step(C,1);const p2=D.po;
 const o=mk({P:{sa:1},D:{z:1.6,hp:1e5}});o.C.start('P','light');for(let i=0;i<30&&o.D.po===0;i++)step(o.C,1);ok(p2>1.9*o.D.po&&o.D.po>0,'posture multiplier (pm 2 doubles posture damage: '+p2.toFixed(1)+' vs '+o.D.po.toFixed(1)+')')}
// ---- Rush: Light with a foe more than 4.5 m away dashes in ----
ok(CB.light({from:null,far:true,chain:0,sinceDodge:99})==='rush'&&CB.light({from:'rush',chain:1,sinceDodge:99})==='light2'&&CB.heavy({from:'rush'})==='rising','far Light = Rush, and it chains on like a normal cut');
{const {C,P}=mk({D:{z:9,face:Math.PI}});const z0=P.z;step(C,1,L({far:true}));step(C,14);ok(P.z-z0>3.5,'Rush covers the gap fast: '+(P.z-z0).toFixed(1)+' m inside 15 ticks')}

process.exit(bad?1:0);
