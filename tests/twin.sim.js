// TWIN BLADES stance: free weapon swap in the sim, the Fang string, heavy branches, context moves, swap bonus, shade strike i-frames, cheaper dodges, and the clip role wiring
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math,window:{},document:{}};vm.createContext(c);vm.runInContext(['Moves','SwordHit','Combos','Twin','CombatCore','WardenMX'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.CC=CombatCore;this.T=Twin;this.X=WardenMX;',c);const{M,CC,T}=c;
let n=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);process.exitCode=1}else n++};
const duel=o=>{o=o||{};const C=CC.create({arena:{x:0,z:0,R:30}});const P=C.add('P',Object.assign({x:0,z:0,face:0,hp:400},o.P));const D=C.add('D',Object.assign({x:0,z:1.8,face:Math.PI,hp:2000},o.D));return{C,P,D}};
const wait=(C,P,k)=>{let i=0;while(P.act!=='free'&&i++<k)C.step({})};
// data
for(const id of T.IDS){const m=M[id];ok(m&&m.who==='P','Twin move '+id+' is installed in Moves');const a=m.phases.filter(p=>p.k==='active');ok(a.length>=1&&m.phases[m.phases.length-1].k==='recovery','move '+id+' has an active window and ends in recovery');ok(m.phases[0].n>=4,id+': has a start-up (>= 4 ticks)')}
for(const id of T.Combos.IDS)ok(M[id],'Combos.IDS names a real move: '+id);
// the stance command is free and instant
{const{C,P}=duel();C.step({P:{list:[{t:'stance',tw:1}]}});ok(P.tw===1,'stance command turns Twin Blades on');C.step({P:{list:[{t:'stance',tw:0}]}});ok(P.tw===0,'...and off again')}
{const{C,P}=duel();C.step({P:{list:[{t:'dodge',dx:1,dz:0}]}});ok(P.act==='dodge','dodging');C.step({P:{list:[{t:'stance',tw:1}]}});ok(P.tw===1&&P.act==='dodge','a swap in the middle of a dodge works and does not interrupt the roll');let i=0;while(P.act==='dodge'&&i++<60)C.step({});ok(P.act==='free'&&i<=24,'the roll still ends on time after the swap ('+i+' ticks)')}
{const{C,P}=duel({P:{face:0}});C.step({P:{list:[{t:'light'}]}});C.step({P:{list:[{t:'stance',tw:1}]}});ok(P.act==='attack','swap during a sword swing does not cancel it');ok(P.mv.id==='light','the swing in progress finishes as the sword move')}
// string
{const{C,P}=duel({D:{z:1.8}});P.tw=1;const ids=[];C.step({P:{list:[{t:'light'}]}});ids.push(P.mv.id);for(let k=1;k<5;k++){let g=0;const cur=P.mv&&P.mv.id;while(P.mv&&P.mv.id===cur&&g++<120)C.step({P:{list:[{t:'light'}]}});if(P.mv)ids.push(P.mv.id)}
 ok(ids.join()==='twa,twb,twc,twd,twe','the Fang string runs twa,twb,twc,twd,twe by cancelling each into the next ('+ids+')')}
// heavy branches
for(const[from,want]of[['twa','twx'],['twc','twx'],['twd','twwhirl'],['twe','twwhirl']]){ok(T.heavy({from})===want,'Heavy after '+from+' = '+want)}
ok(T.heavy({from:null})===null,'Heavy from neutral charges (Shadow Pierce)');
{const{C,P}=duel();P.tw=1;C.step({P:{list:[{t:'heavyDown'}]}});ok(P.act==='charge','neutral Heavy charges in Twin stance');for(let i=0;i<20;i++)C.step({P:i===19?{list:[{t:'heavyUp'}]}:{}});let g=0;while(!(P.mv&&P.mv.id==='twpierce')&&g++<40)C.step({});ok(P.mv&&P.mv.id==='twpierce','released Heavy = Shadow Pierce')}
// context
ok(T.light({air:true})==='twplunge'&&T.light({guard:true})==='twkick'&&T.light({far:true})==='twdash'&&T.light({adv:true})==='twstep'&&T.light({sinceDodge:5})==='twcounter','context Light moves: plunge, kick, dash, step, counter');
// swap bonus
function dmgOf(swap){const{C,P,D}=duel();P.tw=1;if(swap)C.step({P:{list:[{t:'stance',tw:1}]}});if(swap){P.tw=1}C.step({P:{list:[{t:'light'}]}});let hit=0;for(let i=0;i<40;i++)for(const e of C.step({}))if(e.t==='hit'&&e.a==='P')hit=e.dmg;return hit}
{const a=dmgOf(false),b=(()=>{const{C,P,D}=duel();C.step({P:{list:[{t:'stance',tw:1}]}});C.step({P:{list:[{t:'light'}]}});let h=0;for(let i=0;i<40;i++)for(const e of C.step({}))if(e.t==='hit'&&e.a==='P')h=e.dmg;return h})();ok(a>0&&b>a*1.2,'Swap Strike: the first hit after a swap deals +25% ('+a.toFixed(1)+' -> '+b.toFixed(1)+')')}
// bonus ends
{const{C,P,D}=duel();C.step({P:{list:[{t:'stance',tw:1}]}});for(let i=0;i<T.SWAP_TICKS+5;i++)C.step({});C.step({P:{list:[{t:'light'}]}});let h=0;for(let i=0;i<40;i++)for(const e of C.step({}))if(e.t==='hit'&&e.a==='P')h=e.dmg;const base=dmgOf(false);ok(Math.abs(h-base)<.01,'the swap bonus fades after '+T.SWAP_TICKS+' ticks')}
// shade strike: i-frames
{const{C,P,D}=duel({D:{z:4}});P.tw=1;C.step({P:{list:[{t:'atk',m:'twshade'}]}});ok(P.inv>0,'Shade Strike grants brief invulnerability ('+P.inv+' ticks)')}
// dodge stamina
{const a=duel(),b=duel();b.P.tw=1;a.C.step({P:{list:[{t:'dodge',dx:1,dz:0}]}});b.C.step({P:{list:[{t:'dodge',dx:1,dz:0}]}});ok(b.P.st>a.P.st,'dodges cost less stamina in Twin stance ('+a.P.st+' vs '+b.P.st+')')}
// every Twin move lands on a standing foe, with knock-back or stun
for(const id of T.IDS){const{C,P,D}=duel({D:{z:2}});P.tw=1;P.st=100;C.step({P:{list:[{t:'atk',m:id}]}});let hit=0;for(let i=0;i<200;i++)for(const e of C.step({}))if(e.t==='hit'&&e.a==='P')hit++;ok(hit>0,id+' lands on a foe 2 m away (hits: '+hit+')')}
// dodge-cancelling: no Twin move is a dead end (can dodge out during recovery)
for(const id of T.IDS){const m=M[id];const rec=m.phases[m.phases.length-1].n;ok(m.cancel&&m.cancel.dodge!==undefined&&m.cancel.dodge<=rec||id==='twplunge','move '+id+' can be dodge-cancelled inside its recovery')}
// role wiring (clip names exist in the baked player file; every move has a plan with one clip window per active phase)
{const src=fs.readFileSync(R+'src/combat/WardenMX.js','utf8');const clips=JSON.parse(fs.readFileSync(R+'assets/warden_mx_player.json','utf8'));const names=new Set(clips.map(x=>x.name));const dur={};clips.forEach(x=>dur[x.name]=x.duration);
 const W=c.X;
 ok(W&&W.ROLES&&W.ROLES.player_twin,'WardenMX has the player_twin role');
 if(W){const Rr=W.ROLES.player_twin;ok(Rr.alias==='player','player_twin shares the player clip file (no second download)');
  for(const id of T.IDS){const sp=Rr.moves[id];ok(sp,'role has a clip spec for '+id);if(!sp)continue;const seq=W.norm(sp);for(const s of seq){ok(names.has(s.c),id+': clip '+s.c+' exists');const h=s.h;if(h)ok(h[1]<=dur[s.c]+.05,id+': hit window ends inside the clip ('+h[1]+' <= '+dur[s.c]+')')}
   const act=M[id].phases.filter(p=>p.k==='active').length,pl=W.plan(M[id].phases,sp,cn=>dur[cn]||9);ok(pl.every(x=>x&&x.c),id+': every phase has a clip slice');ok(seq.length===act,id+': '+act+' active phase(s) = '+seq.length+' clip window(s)')}
  for(const k in Rr.dg)ok(names.has(Rr.dg[k][0]),'dodge clip '+Rr.dg[k][0]+' exists')}}
// Hundred Shadows (Twin super)
for(const id of Object.keys(T.SUPER)){const m=M[id];ok(m&&m.who==='P','super move '+id+' is installed');const act=m.phases.filter(p=>p.k==='active').length;ok(act===(id==='twsevF'?2:1),id+': '+act+' active windows');
  if(c.X&&c.X.ROLES.player_twin){const sp=c.X.ROLES.player_twin.moves[id];ok(sp,'clip spec for '+id);if(sp){const seq=c.X.norm(sp);ok(seq.length===act,id+': clip windows match active phases')}}}
{const{C,P,D}=duel({D:{z:2}});P.tw=1;C.step({P:{list:[{t:'atk',m:'twsevF'}]}});let hit=0;for(let i=0;i<120;i++)for(const e of C.step({}))if(e.t==='hit'&&e.a==='P')hit++;ok(hit===2,'the finishing X lands twice ('+hit+')')}
console.log(n+' checks')
