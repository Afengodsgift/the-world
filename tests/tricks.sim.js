// Boss tricks (Vael's blink + lifesteal, Skrag's snares): pure rules + AI behaviour + move fairness.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const T=require(R+'src/combat/Tricks.js'),AI=require(R+'src/combat/DuelistAI.js'),M=(()=>{const c={console,Math};vm.createContext(c);vm.runInContext(fs.readFileSync(R+'src/combat/Moves.js','utf8')+';this.M=Moves',c);return c.M})();
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
// ---- lifesteal ----
ok(Math.abs(T.heal(20,0,300)-12)<1e-9,'a 20-point hit heals 12 (60%)');
ok(T.heal(20,119,300)===1&&T.heal(20,120,300)===0&&T.heal(20,500,300)===0,'healing stops at 40% of max health per fight');
{let done=0;for(let i=0;i<200;i++)done+=T.heal(30,done,360);ok(Math.abs(done-144)<1e-9,'200 hits can never drink more than 144 of 360 (40%)')}
// ---- blink spot ----
{const s=T.blinkSpot(0,0,0,null);ok(Math.abs(s.x)<1e-9&&Math.abs(s.z+T.BLINK.BEHIND)<1e-9,'facing +z: he lands behind at -z');
 const s2=T.blinkSpot(5,5,Math.PI/2,null);ok(Math.abs(s2.x-(5-T.BLINK.BEHIND))<1e-9&&Math.abs(s2.z-5)<1e-9,'facing +x: he lands at -x');
 const A={x:0,z:0,R:10},s3=T.blinkSpot(9.5,0,Math.PI/2*0+Math.PI,A);ok(Math.hypot(s3.x,s3.z)<=A.R-1+1e-9,'never lands outside the arena');
 ok(T.BLINK.WIND-T.BLINK.LOCK>=20,'the destination is locked >= 20 ticks before he appears (a real warning)')}
// ---- snare layout: deterministic, spread, off the target, inside the arena ----
{const A={x:0,z:0,R:20};const a=T.snareLayout(123,4,3,2,A),b=T.snareLayout(123,4,3,2,A),c=T.snareLayout(124,4,3,2,A);
 ok(JSON.stringify(a)===JSON.stringify(b),'same seed -> identical traps on both clients');ok(JSON.stringify(a)!==JSON.stringify(c),'a new seed -> a new layout');
 let good=true;for(let s=1;s<300;s++){const L=T.snareLayout(s,5,(s%7)-3,(s%5)-2,A);for(const p of L){if(Math.hypot(p.x-((s%7)-3),p.z-((s%5)-2))<T.SNARE.NEAR[0]-.4-1e-9)good=false;if(Math.hypot(p.x,p.z)>A.R-1.4+1e-9)good=false}
  for(let i=0;i<L.length;i++)for(let j=i+1;j<L.length;j++)if(Math.hypot(L[i].x-L[j].x,L[i].z-L[j].z)<T.SNARE.SEP-1e-9)good=false;if(L.length<3)good=false}
 ok(good,'300 seeds: traps stay off the target, >= 2 m apart, inside the arena, at least 3 of 5 placed');
 ok(T.count(false,false)===3&&T.count(true,false)===4&&T.count(false,true)===4&&T.count(true,true)===5&&T.count(true,true)<=T.SNARE.MAX,'trap count: 3 / 4 (phase 2 or co-op) / 5, never above the cap')}
// ---- trap touch rules ----
{const t={x:0,z:0};ok(T.touch(t,0,0,false,.5)===null,'an unarmed trap does nothing');ok(T.touch(t,.5,0,false,1.2)==='bite','armed + inside radius = bite');
 ok(T.touch(t,.5,0,true,1.2)==='rolled','a dodge roll through an armed trap springs it harmlessly');ok(T.touch(t,2,0,false,1.2)===null,'outside the radius is safe');
 ok(T.bite(100)<=15&&T.bite(100)>0,'a bite is a share of health, never lethal on its own')}
// ---- moves: the tricks have no blade and keep the fairness rules ----
for(const id of['blink','snare']){const m=M[id];ok(m&&m.who==='D'&&m.dmg===0&&!m.phases.some(p=>p.k==='active'),id+': no hit segment');ok(M.endRecovery(id)>=M.REC_MIN,id+': ends in >= 20 ticks of recovery');ok(m.cancel===undefined,id+': no cancel')}
ok(M.blink.phases[0].n===T.BLINK.WIND,'blink windup matches Tricks.BLINK.WIND');
// ---- AI: Vael blinks from range and when you turtle; Skrag lays snares and punishes a rooted player ----
function sim(foe,dist,ticks,P0,seed){const A=AI.create(seed,{foe,intro:0}),D={id:'D',x:0,z:0,act:'free',hp:300,hpMax:300,rm:1,guard:false},P=Object.assign({id:'P',x:0,z:dist,act:'free',guard:false,hp:100,ph:null,pi:0},P0||{});const cnt={};
 for(let t=0;t<ticks;t++){const o=AI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){cnt[c.m]=(cnt[c.m]||0)+1;D.act='attack';D.busy=t;setTimeout(()=>{},0)}
  if(D.act==='attack'&&t-D.busy>45){D.act='free'}}return{cnt,A}}
{let blinks=0,snares=0;for(let s=1;s<=20;s++){blinks+=(sim('stalker',6,900,null,s).cnt.blink||0);snares+=(sim('trapper',7,900,null,s).cnt.snare||0)}
 ok(blinks>=20,'Vael blinks from range (>= 1 per 15 s on average): '+blinks+' in 20 runs');ok(snares>=20,'Skrag lays snares regularly: '+snares+' in 20 runs')}
{let b=0;for(let s=1;s<=20;s++){const A=AI.create(s,{foe:'stalker',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:300,hpMax:300,rm:1},P={id:'P',x:0,z:2.2,act:'free',guard:true,hp:100};A.gP=60;A.bcd=0;const o=AI.think(A,P,D,[],5);if(o.list.some(c=>c.m==='blink'))b++}
 ok(b>=15,'a turtling player (guard held) is answered with a blink behind the guard ('+b+'/20)')}
{const A=AI.create(1,{foe:'stalker',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:300,hpMax:300,rm:1},P={id:'P',x:0,z:1.6,act:'free',guard:false,hp:100};A.follow='cut';A.cool=0;const o=AI.think(A,P,D,[],5);ok(o.list.length===1&&o.list[0].m==='cut','after reappearing he cuts at once (follow-up)')}
{const A=AI.create(1,{foe:'trapper',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:300,hpMax:300,rm:1},P={id:'P',x:0,z:1.9,act:'free',guard:false,hp:100};const o=AI.think(A,P,D,[],5);ok(o.list.some(c=>c.m==='cut'),'inside 2.5 m Skrag kicks you off')}
{let orb=0,bolt=0;for(let s=1;s<=40;s++){const A=AI.create(s,{foe:'trapper',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:300,hpMax:300,rm:1},P={id:'P',x:0,z:7,act:'stun',guard:false,hp:100};A.scd=999;A.see=10;A.seenKey='stun';const o=AI.think(A,P,D,[],5);for(const c of o.list){if(c.m==='orb')orb++;if(c.m==='bolt')bolt++}}
 ok(orb>bolt*2,'a rooted / staggered player eats the heavy bolt (orb '+orb+' vs bolt '+bolt+')')}
// ---- Kage: three phases, each with its own tools ----
function simK(hpf,dist,ticks,seed,P0){const A=AI.create(seed,{foe:'samurai',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:520*hpf,hpMax:520,rm:1},P=Object.assign({id:'P',x:0,z:dist,act:'free',guard:false,hp:100,ph:null,pi:0},P0||{});const cnt={};let busy=0;
 for(let t=0;t<ticks;t++){if(D.act==='attack'&&t-busy>60)D.act='free';const o=AI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){cnt[c.m]=(cnt[c.m]||0)+1;D.act='attack';busy=t}}return{cnt,A}}
{const tot={},tot2={},tot3={};for(let s=1;s<=30;s++){const a=simK(1,2.2,2400,s),b=simK(.4,2.2,2400,s),c=simK(.15,2.2,2400,s);for(const [t,r] of [[tot,a],[tot2,b],[tot3,c]])for(const m in r.cnt)t[m]=(t[m]||0)+r.cnt[m]}
 ok(!tot.feint&&!tot.counter&&!tot.requiem,'phase 1 is plain: no feint / counter draw / final technique ('+JSON.stringify(tot)+')');
 ok(Object.keys(tot).length>=4,'phase 1 already mixes at least 4 different moves');
 ok(tot2.feint>0&&tot2.iai>0&&tot2.moon>0,'phase 2 adds the feint, the draw and the crescent ('+JSON.stringify(tot2)+')');
 ok(tot3.requiem>=30,'phase 3 opens with the final technique every time ('+tot3.requiem+' in 30 runs)');
 ok(!tot.requiem&&!tot2.requiem,'the final technique is phase 3 only')}
{let ph3=0;for(let s=1;s<=10;s++){ph3+=simK(.2,2.2,60,s).A.ph3?1:0}ok(ph3===10,'below 22% health the third phase starts');let n=0;for(let s=1;s<=10;s++)n+=simK(.3,2.2,60,s).A.ph3?1:0;ok(n===0,'above 22% it has not')}
{let c=0;for(let s=1;s<=20;s++){const A=AI.create(s,{foe:'samurai',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:200,hpMax:520,rm:1},P={id:'P',x:0,z:2.4,act:'attack',guard:false,hp:100,ph:[{k:'startup'}],pi:0};A.ph2=true;A.seenKey='astartup';A.att=80;A.ccd=0;A.cool=0;const o=AI.think(A,P,D,[],5);if(o.list.some(m=>m.m==='counter'))c++}
 ok(c===20,'a player who keeps swinging at him is answered with the counter draw ('+c+'/20)');
 const A=AI.create(1,{foe:'samurai',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:200,hpMax:520,rm:1},P={id:'P',x:0,z:2.4,act:'free',guard:false,hp:100};A.ph2=true;A.att=0;A.ccd=0;A.cool=0;const o=AI.think(A,P,D,[],5);ok(!o.list.some(m=>m.m==='counter'),'but not a player who is merely standing there')}
{const A=AI.create(2,{foe:'samurai',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:500,hpMax:520,rm:1},P={id:'P',x:0,z:3,act:'free',guard:false,hp:100};A.follow='iai';A.cool=0;const o=AI.think(A,P,D,[],5);ok(o.list.length===1&&o.list[0].m==='iai','the empty sheath is followed by the real draw when he chooses it')}
// ---- The Three Oaths: one signature attack at a time ----
{const L=[{id:'a',alive:true,act:'free',mv:null,gap:0},{id:'b',alive:true,act:'attack',mv:'verdict',gap:0},{id:'c',alive:true,act:'free',mv:null,gap:0}];
 ok(T.sigBusy(L,'a')&&T.sigBusy(L,'c'),'while one boss is inside a signature move the others are locked out');ok(!T.sigBusy(L,'b'),'it does not lock itself out');
 L[1].act='free';L[1].mv=null;L[1].gap=T.GAP;ok(T.sigBusy(L,'a'),'and for a short gap after it ends');L[1].gap=0;ok(!T.sigBusy(L,'a'),'then the floor is free again');
 L[1].act='attack';L[1].mv='cut';ok(!T.sigBusy(L,'a'),'an ordinary cut holds no token');L[1].alive=false;L[1].mv='verdict';ok(!T.sigBusy(L,'a'),'a fallen boss holds nothing')}
{let v=0,g=0,blocked=0;for(let s=1;s<=30;s++){const A=AI.create(s,{foe:'penitent',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:560,hpMax:560,rm:1},P={id:'P',x:0,z:2.2,act:'free',guard:false,hp:100};
  for(let t=0,busy=0;t<3000;t++){if(D.act==='attack'&&t-busy>90)D.act='free';A.sigLock=false;const o=AI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){if(c.m==='verdict')v++;if(c.m==='groundbreaker')g++;D.act='attack';busy=t}}
  const A2=AI.create(s,{foe:'penitent',intro:0}),D2={id:'D',x:0,z:0,act:'free',hp:560,hpMax:560,rm:1};A2.sigLock=true;A2.follow='verdict';A2.cool=0;for(let t=0,busy=0;t<1500;t++){if(D2.act==='attack'&&t-busy>90)D2.act='free';A2.sigLock=true;const o=AI.think(A2,P,D2,[],t);for(const c of o.list)if(c.t==='atk'){if(c.m==='verdict'||c.m==='groundbreaker')blocked++;D2.act='attack';busy=t}}}
 ok(v>=30&&g>=15,'the Penitent uses both signatures when free ('+v+' verdicts, '+g+' groundbreakers in 30 runs)');ok(blocked===0,'and never starts one while an ally holds the token')}
{const A=AI.create(1,{foe:'penitent',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:560,hpMax:560,rm:1},P={id:'P',x:0,z:2.2,act:'free',guard:false,hp:100};A.follow='verdict';A.cool=0;const o=AI.think(A,P,D,[],5);ok(o.list.length===1&&o.list[0].m==='verdict','the Threefold Sentence ends in the verdict')}
// ---- The Veil Dancer: adaptation, borrowed motion, decoy study; the Penitent's decoy / covenant ----
{const A=AI.create(3,{foe:'veil',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:400,hpMax:400,rm:1},P={id:'P',x:0,z:2.6,act:'free',guard:false,hp:100};const seen={};
 for(let i=0;i<8;i++){P.act='dodge';AI.think(A,P,D,[],i*40);P.act='free';AI.think(A,P,D,[],i*40+20)}
 ok(A.hab&&A.hab.d>=6,'she tallies your dodges ('+(A.hab&&A.hab.d)+')');
 let ans=0;for(let s=1;s<=30;s++){const B=AI.create(s,{foe:'veil',intro:0});B.hab={d:9,g:0,h:0,l:0};B.habT=0;B.invest=0;B.cool=0;B.adaptCd=0;B.seenKey='free';const o=AI.think(B,{id:'P',x:0,z:2.6,act:'free',guard:false,hp:100},{id:'D',x:0,z:0,act:'free',hp:400,hpMax:400,rm:1},[],5);if(o.list.some(c=>c.m==='feint'))ans++}
 ok(ans>=8&&ans<=22,'a dodge-spammer is answered with the feint about half the time ('+ans+'/30), not always')}
{let g=0,h=0;for(let s=1;s<=30;s++){const mk=hab=>{const B=AI.create(s,{foe:'veil',intro:0});B.hab=hab;B.habT=0;B.invest=0;B.cool=0;B.adaptCd=0;B.seenKey='free';return AI.think(B,{id:'P',x:0,z:2.6,act:'free',guard:false,hp:100},{id:'D',x:0,z:0,act:'free',hp:400,hpMax:400,rm:1},[],5)};
  if(mk({d:0,g:9,h:0,l:0}).list.some(c=>c.m==='fall'))g++;if(mk({d:0,g:0,h:9,l:0}).list.some(c=>c.m==='counter'))h++}
 ok(g>=8&&h>=8,'a turtle meets the guard punisher ('+g+'/30), a heavy-spammer the counter draw ('+h+'/30)')}
{const B=AI.create(1,{foe:'veil',intro:0});B.hab={d:3,g:3,h:3,l:3};B.habT=0;B.invest=0;B.cool=0;B.adaptCd=0;B.seenKey='free';let any=false;for(let t=0;t<200;t++){const o=AI.think(B,{id:'P',x:0,z:2.6,act:'free',guard:false,hp:100},{id:'D',x:0,z:0,act:'free',hp:400,hpMax:400,rm:1},[],t);if(o.list.some(c=>c.m==='feint'||c.m==='counter')&&B.adapt)any=true;B.cool=0}
 ok(!any,'no clear habit = no adaptation answer (she does not guess)')}
{const A=AI.create(2,{foe:'veil',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:400,hpMax:400,rm:1},P={id:'P',x:0,z:2.6,act:'free',guard:false,hp:100};A.onDecoy=true;A.cool=0;let first=null;for(let t=0;t<120&&!first;t++){const o=AI.think(A,P,D,[],t);if(o.list.length)first=t}
 ok(first===null||first>=50,'she studies a decoy for ~50 ticks before committing (first move at '+first+')')}
{const A=AI.create(2,{foe:'penitent',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:560,hpMax:560,rm:1},P={id:'P',x:0,z:2.6,act:'free',guard:false,hp:100};A.onDecoy=true;let heavy=0,light=0;for(let s=1;s<=30;s++){const B=AI.create(s,{foe:'penitent',intro:0});B.onDecoy=true;B.cool=0;const o=AI.think(B,P,D,[],5);for(const c of o.list){if(c.m==='march'||c.m==='groundbreaker')heavy++;else light++}}
 ok(heavy>=20&&light===0,'the Penitent commits a heavy blow to a shadow ('+heavy+' heavy, '+light+' light)')}
{let n0=0,n1=0;for(let s=1;s<=30;s++)for(const cov of [null,'veil']){const A=AI.create(s,{foe:'penitent',intro:0});A.cov=cov;if(cov)A.ph2=true;const D={id:'D',x:0,z:0,act:'free',hp:560,hpMax:560,rm:1},P={id:'P',x:0,z:2.4,act:'free',guard:false,hp:100};A.ph2=true;for(let t=0,b=0;t<2400;t++){if(D.act==='attack'&&t-b>90)D.act='free';const o=AI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){if(c.m==='groundbreaker'||c.m==='march'){if(cov)n1++;else n0++}D.act='attack';b=t}}}
 ok(n1>n0*1.15,'when the Dancer falls first the Penitent throws more heavy blows ('+n0+' -> '+n1+')')}
// ---- The Veiled Saint: area denial, token-bound signatures ----
{const A=AI.create(4,{foe:'saint',intro:0}),D={id:'D',x:0,z:0,act:'free',hp:480,hpMax:480,rm:1},P={id:'P',x:0,z:7,act:'free',guard:false,hp:100};const cnt={};
 for(let s=1;s<=30;s++){const B=AI.create(s,{foe:'saint',intro:0});B.ph2=true;for(let t=0,b=0;t<3000;t++){if(D.act==='attack'&&t-b>100)D.act='free';const o=AI.think(B,P,D,[],t);for(const c of o.list)if(c.t==='atk'){cnt[c.m]=(cnt[c.m]||0)+1;D.act='attack';b=t}}}
 ok(cnt.lance>20&&cnt.returning>10&&cnt.consecrate>10&&cnt.procession>5,'she fires lances and blades and lays both kinds of ring ('+JSON.stringify(cnt)+')');
 let locked=0;for(let s=1;s<=30;s++){const B=AI.create(s,{foe:'saint',intro:0});B.ph2=true;for(let t=0,b=0;t<2000;t++){if(D.act==='attack'&&t-b>100)D.act='free';B.sigLock=true;const o=AI.think(B,P,D,[],t);for(const c of o.list)if(c.t==='atk'){if(c.m==='consecrate'||c.m==='procession')locked++;D.act='attack';b=t}}}
 ok(locked===0,'she never lays rings while an ally holds the signature token');
 const B=AI.create(1,{foe:'saint',intro:0});B.cool=0;const o=AI.think(B,{id:'P',x:0,z:1.8,act:'free',guard:false,hp:100},{id:'D',x:0,z:0,act:'free',hp:480,hpMax:480,rm:1},[],5);ok(o.list.some(c=>c.m==='cut'),'inside 2.6 m she kicks you away')}
{const mv=M.consecrate;ok(mv.fx.length===5&&mv.fx.every(f=>f.k==='aoe'&&f.delay>=50),'Consecration: five rings, each shown at least 50 ticks (~0.8 s) before it erupts');
 const rs=mv.fx.map(f=>[f.ox,f.oz]);let gap=true;for(const g of [[2.4,2.4],[-2.4,2.4],[2.4,-2.4],[-2.4,-2.4]]){if(rs.some(r=>Math.hypot(r[0]-g[0],r[1]-g[1])<mv.fx[0].r+.2))gap=false}ok(gap,'and there is a safe gap between the rings on every diagonal')}
// ---- flask punishment: drinking a flask puts every foe back on you (Vael / Skrag with a special answer), at most once per 5 s each ----
{const mk=(foe,dist)=>{const A=AI.create(3,{foe,intro:0}),D={id:'D',x:0,z:0,act:'free',hp:300,hpMax:300,rm:1},P={id:'P',x:0,z:dist,act:'free',guard:false,hp:100};return{A,D,P}};
 let a=mk('stalker',6);ok(AI.hunt(a.A)===true,'Vael accepts a flask hunt');let o=AI.think(a.A,a.P,a.D,[],5);ok(o.list.length===1&&o.list[0].m==='blink','far from you he blinks onto you');
 ok(AI.hunt(a.A)===false,'a second flask within 5 s does not re-trigger it');
 a=mk('stalker',2);AI.hunt(a.A);o=AI.think(a.A,a.P,a.D,[],5);ok(o.list.length===1&&o.list[0].m==='thrust','close to you he lunges');
 a=mk('trapper',7);AI.hunt(a.A);a.A.scd=999;o=AI.think(a.A,a.P,a.D,[],5);ok(o.list.length===1&&o.list[0].m==='orb','Skrag answers a flask with the heavy bolt');
 a=mk('knight',6);a.A.cool=40;a.A.breath=90;ok(AI.hunt(a.A)===true&&a.A.cool<=6&&a.A.breath===0,'every other foe cuts its rest short and stops breathing when you drink')}
{const pick=(foe,kid,dist,setup,gd)=>{const r={};for(let s=1;s<=40;s++){const A=AI.create(s,{foe,kid,intro:0}),D={id:'D',x:0,z:0,act:'free',hp:300,hpMax:300,rm:1},P={id:'P',x:0,z:dist,act:'free',guard:!!gd,hp:100};A.cool=0;A.bcd=0;A.scd=0;if(setup)setup(A);const o=AI.think(A,P,D,[],5);for(const c of o.list)if(c.t==='atk')r[c.m]=(r[c.m]||0)+1}return r};
ok(pick('beast','bear',7)['charge']>=30,'Bear: Frenzy Charge from range ('+JSON.stringify(pick('beast','bear',7))+')');
ok(pick('beast','maw',4)['tidal']>=30,'Maw: Tidal Roar on its timer');
ok(pick('beast','parasite',6)['spores']>=30,'Parasite: Infestation on its timer');
ok(pick('knight','paladin',6)['pursuit']>=30,'Paladin: Shield Rush from range');
ok(pick('knight','paladin',2.2,A=>{A.gP=60},true)['verdict']>=30,'Paladin: Judgment Verdict punishes a turtling guard');
ok(pick('dancer','',3.5,A=>{A.ph2=true})['consecrate']>=1||pick('dancer','',3.5,A=>{A.ph2=true})['requiem']>=1,'Arissa: phase 2 uses Ring of Fire / Cinder Waltz');
ok(pick('archer','',8,A=>{A.ph2=true})['consecrate']>=30,'Erika: phase 2 Rain of Arrows');}
 console.log(bad?'FAILED '+bad:'ALL OK');process.exit(bad?1:0);
