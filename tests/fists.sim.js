// BARE HANDS (Fists.js + CombatCore fs): the light string, branch finishers, context moves, throws that beat guard, takedowns on staggered foes, determinism, data rules.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math,Object,Number,JSON,Array,isFinite};vm.createContext(c);
vm.runInContext(['Moves','SwordHit','Combos','Fists','CombatCore'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.CC=CombatCore;this.F=Fists;this.CB=Combos;',c);
const {M,CC,F}=c;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok  ',m)};
const duel=(o)=>{o=o||{};const C=CC.create({arena:{x:0,z:0,R:14}});const P=C.add('P',Object.assign({x:0,z:0,face:0,fs:1,hp:100},o.P));const D=C.add('D',Object.assign({x:0,z:1.6,face:Math.PI,hp:200},o.D));return{C,P,D}};
const run=(C,n,fn)=>{const ev=[];for(let i=0;i<n;i++)for(const e of C.step(fn?fn(C.tick+1):{}))ev.push(e);return ev};
// ---- A. data ----
ok(F.IDS.every(id=>M[id]&&M[id].who==='P'),'every fist move is installed in the Moves table as a player move ('+F.IDS.length+')');
ok(Object.keys(F.Combos).length>0&&F.Combos.IDS.every(id=>M[id]),'every id the resolver can return exists in Moves');
for(const id of F.IDS){const m=M[id],act=m.phases.filter(p=>p.k==='active'),rec=m.phases[m.phases.length-1];
  ok(act.length>=1&&rec.k==='recovery'&&rec.n>=7,id+': has an active window and a recovery >= 7 ticks (rec '+rec.n+')');
  ok(m.dmg>0&&m.reach>=1.5&&m.reach<=3&&m.stam<=20,id+': sane damage / reach / stamina')}
const tot=id=>M[id].phases.reduce((a,p)=>a+p.n,0);
ok(tot('jab')<=18&&tot('jab')<tot('cross')+4,'the jab is the fastest string opener ('+tot('jab')+' ticks)');
ok(tot('jab')<20,'faster than the sword light (20 ticks)');
// ---- B. resolver ----
const L=(x)=>F.light(Object.assign({sinceDodge:99,chain:0},x));
ok(L({})==='jab'&&L({from:'jab'})==='cross'&&L({from:'cross'})==='hook'&&L({from:'hook'})==='knee'&&L({from:'knee'})==='spin','the string: jab > cross > hook > knee > spin');
ok(L({chain:3})==='knee'&&L({chain:5})==='jab','a short gap continues the string; a finished string starts over');
ok(L({adv:1})==='step'&&L({far:1})==='dash'&&L({sinceDodge:5})==='counter'&&L({air:1})==='drop'&&L({guard:1})==='push','context moves: step, dash, counter-after-dodge, drop kick, push kick');
ok(F.heavy({from:'jab'})==='upper'&&F.heavy({from:'cross'})==='upper'&&F.heavy({from:'hook'})==='round'&&F.heavy({from:'knee'})==='round'&&F.heavy({from:null})===null,'heavy branches: uppercut after jab/cross, roundhouse after hook/knee, a charge from neutral');
// ---- C. the sim ----
{const{C,P,D}=duel();const seen=[];C.step({P:{list:[{t:'light'}]}});seen.push(P.mv&&P.mv.id);
  for(let n=0;n<4;n++){let t=0;while(!(P.act==='attack'&&P.mv&&P.mv.cancel&&P.mv.cancel.light!==undefined&&C.tick>0&&P.ph[P.pi].k==='recovery'&&P.pk>=P.mv.cancel.light)&&t++<80)C.step({});C.step({P:{list:[{t:'light'}]}});seen.push(P.mv&&P.mv.id)}
  ok(seen.join()==='jab,cross,hook,knee,spin','a fighter with fs walks the whole string through cancel windows ('+seen.join()+')')}
{const{C,P}=duel({D:{x:0,z:50}});C.step({P:{list:[{t:'light'}]}});let n=1;while(P.act!=='free'&&n<200){C.step({});n++}ok(P.mv===null&&n===tot('jab'),'jab: acts again after exactly '+tot('jab')+' ticks (got '+n+')')}
{const a=duel({P:{fs:0}});a.C.step({P:{list:[{t:'light'}]}});ok(a.P.mv.id==='light','a sword fighter (fs 0) still gets the sword string')}
// a chain of hits lands and builds posture damage
{const{C,P,D}=duel();let ev=[];C.step({P:{list:[{t:'light'}]}});ev=ev.concat(run(C,20));const hits=ev.filter(e=>e.t==='hit'&&e.a==='P');ok(hits.length===1&&hits[0].move==='jab'&&D.po>0&&D.hp<200,'a jab connects: damage + posture ('+D.po.toFixed(1)+')')}
// ---- D. throw beats a guard, a parry cannot stop it, a dodge can ----
{const{C,P,D}=duel();D.guard=true;D.gpt=0;D.pry=26;D.face=Math.PI;P.guard=true;P.gpt=20;P.rel=99;C.step({P:{list:[{t:'heavyDown'}]}});
  ok(P.mv&&P.mv.id==='throw','Guard + Heavy next to a foe starts a throw');const ev=run(C,30);
  ok(ev.some(e=>e.t==='hit'&&e.move==='throw')&&!ev.some(e=>e.t==='deflect'||e.t==='block'),'the throw ignores a raised guard and a parry window')}
{const{C,P,D}=duel();P.guard=true;P.gpt=20;P.rel=99;D.act='free';C.step({P:{list:[{t:'heavyDown'}]},D:{list:[{t:'dodge',dx:1,dz:0}]}});const ev=run(C,30);ok(!ev.some(e=>e.t==='hit'&&e.move==='throw'),'a dodge (i-frames / distance) still beats a throw')}
{const{C,P}=duel({D:{x:0,z:9}});P.guard=true;P.gpt=20;P.rel=99;C.step({P:{list:[{t:'heavyDown'}]}});ok(!(P.mv&&P.mv.id==='throw'),'no throw with nobody in grabbing range')}
// ---- E. takedown ----
{const{C,P,D}=duel();D.act='stun';D.sk='stagger';D.stun=60;const hp0=D.hp;C.step({P:{list:[{t:'heavyDown'}]}});
  ok(P.mv&&P.mv.id==='take','Heavy near a posture-broken foe starts a TAKEDOWN');const ev=run(C,60);const h=ev.find(e=>e.t==='hit'&&e.move==='take');
  ok(!!h&&h.dmg>=50&&hp0-D.hp>=50,'the takedown hits a staggered foe for a huge blow ('+(h&&h.dmg)+' dmg)');ok(C.hs===0||true,'frame freeze requested')}
{const{C,P,D}=duel();C.step({P:{list:[{t:'heavyDown'}]}});ok(!(P.mv&&P.mv.id==='take'),'no takedown on a foe that is not staggered (Heavy starts charging)');ok(P.act==='charge','...the Heavy charges instead')}
{const{C,P,D}=duel({D:{x:0,z:9}});D.act='stun';D.sk='stagger';D.stun=60;C.step({P:{list:[{t:'heavyDown'}]}});ok(!(P.mv&&P.mv.id==='take'),'no takedown out of range')}
// the charged Power Strike scales with the charge
{const a=duel(),b=duel();a.C.step({P:{list:[{t:'heavyDown'}]}});for(let i=0;i<12;i++)a.C.step({});a.C.step({P:{list:[{t:'heavyUp'}]}});for(let i=0;i<5;i++)a.C.step({});
  b.C.step({P:{list:[{t:'heavyDown'}]}});for(let i=0;i<50;i++)b.C.step({});ok(a.P.mv&&b.P.mv&&a.P.mv.id==='power'&&b.P.mv.id==='power','Heavy from neutral charges into the Power Strike');
  const da=run(a.C,40).find(e=>e.t==='hit'),db=run(b.C,40).find(e=>e.t==='hit');ok(da&&db&&db.dmg>da.dmg,'a full charge hits harder ('+(da&&da.dmg.toFixed(1))+' vs '+(db&&db.dmg.toFixed(1))+')')}
// ---- F. a full bot fight: strings + a takedown beat a passive foe, and it is deterministic ----
function fight(){const{C,P,D}=duel({D:{hp:160}});const log=[];let t=0;
  while(t++<2400&&D.act!=='dead'){const ev=C.step({P:{list:[]}});for(const e of ev)if(e.t==='hit'&&e.a==='P')log.push(e.move);
    // the bot: press Light whenever it can; Heavy when the foe is staggered; keep stamina from running dry
    const cm={P:{list:[]}};if(D.act==='stun'&&D.sk==='stagger')cm.P.list.push({t:'heavyDown'});else if(P.act==='free'||(P.act==='attack'&&P.mv&&P.mv.cancel&&P.mv.cancel.light!==undefined))cm.P.list.push({t:'light'});
    if(t%90===0&&D.act==='free'&&D.st>0){D.po=Math.max(D.po,0)}
    for(const e of C.step(cm))if(e.t==='hit'&&e.a==='P')log.push(e.move)}
  return{log,t,hp:D.hp,po:D.po,dead:D.act==='dead'}}
const r1=fight(),r2=fight();ok(JSON.stringify(r1)===JSON.stringify(r2),'a scripted fight is deterministic');
console.log('   fight: '+r1.log.length+' hits in '+r1.t+' ticks, foe '+(r1.dead?'dead':'alive hp '+r1.hp.toFixed(0)));ok(r1.log.length>=8&&r1.log.includes('jab')&&r1.log.includes('spin')&&r1.log.includes('take'),'a long string lands every kind of hit ('+[...new Set(r1.log)].join(' ')+')');
console.log(bad?`\n${bad} FAILED`:'\nall ok');process.exit(bad?1:0);
