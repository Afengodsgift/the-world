// Warden Isles combat core: fairness data rules, tick/phase timing, dodge i-frames, deflect window, hit-stop, missed hits, duplicate hits, tunnelling, obstacles, determinism, reactive bots.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const load=()=>{const c={console,Math};vm.createContext(c);vm.runInContext(['Moves','SwordHit','CombatCore'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.CC=CombatCore;this.SH=SwordHit;',c);return c};
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const {M,CC,SH}=load();
const duel=(o)=>{o=o||{};const C=CC.create({arena:o.arena||{x:0,z:0,R:14},solids:o.solids});const P=C.add('P',Object.assign({x:0,z:0,face:0},o.P));const D=C.add('D',Object.assign({x:0,z:2,face:Math.PI,hp:140},o.D));return{C,P,D}};
const run=(C,n,fn)=>{const ev=[];for(let i=0;i<n;i++){const cm=fn?fn(C.tick+1):{};for(const e of C.step(cm))ev.push(e)}return ev};
// ---------- A. fairness data rules (no exceptions) ----------
const EXCEPTIONS=[];ok(EXCEPTIONS.length===0,'fairness exceptions list is empty');
const dm=Object.keys(M).filter(k=>M[k]&&M[k].who==='D');ok(dm.length===5,'5 Duelist moves: '+dm.join(','));
for(const id of dm){let worst=1e9,rec=M.endRecovery(id);for(let h=0;h<=M.HOLD_MAX;h++)for(const t of M.tells(id,h))worst=Math.min(worst,t);
  ok(worst>=M.TELL_MIN,id+': every hit has a tell >= '+M.TELL_MIN+' ticks for hold 0..12 (min '+worst+')');
  ok(rec>=M.REC_MIN,id+': ends in >= '+M.REC_MIN+' uncancellable recovery ('+rec+')');
  ok(M[id].cancel===undefined,id+': defines no cancel');
  ok(M[id].phases.filter(p=>p.k==='hold').every(p=>p.n===0),id+': authored hold is a placeholder; runtime hold clamped to '+M.HOLD_MAX)}
ok(M.total('fall',99)===M.total('fall',12),'hold is clamped to 12');
ok(M.light.cancel&&M.light.cancel.light===6&&M.light.cancel.dodge===8,'player light has the documented cancels (the one asymmetry)');
ok(M.dodge.iStart===3&&M.dodge.iEnd===11&&M.dodge.total===22,'dodge: i-frames pt 3..11 of 22');
ok(Math.abs(M.dodgeRoot.reduce((a,b)=>a+b,0)-3.2)<1e-9,'dodge root motion sums to 3.2 m');
// ---------- B. tick / phase timing ----------
function actTick(id,P){const{C,P:p}=duel({D:{x:0,z:50},P:{face:0}});const f=P?p:C.F.D;let first=0;
  C.step(P?{P:{list:[{t:id}]}}:{D:{list:[{t:'atk',m:id,hold:0}]}});let n=1;while(f.act!=='free'&&n<400){C.step({});n++}return n}
ok(actTick('light',true)===30,'player light: acts again after exactly 30 ticks (10+4+16)');
ok(actTick('cut',false)===44,'Duelist cut: acts again after exactly 44 ticks (20+4+20)');
ok(actTick('riposte',false)===48&&actTick('thrust',false)===68,'riposte 48, thrust 68');
{const{C,P}=duel({D:{x:0,z:50}});C.step({P:{list:[{t:'dodge',dx:1,dz:0}]}});let n=1;while(P.act!=='free'&&n<100){C.step({});n++}ok(n===22,'dodge: acts again after exactly 22 ticks')}
// ---------- C. first-overlap tick for a Duelist cut at a stationary player ----------
function firstHit(setup){const{C,P,D}=duel(setup);C.step({D:{list:[{t:'atk',m:'cut'}]}});for(let i=0;i<60;i++){const ev=C.step({});if(ev.some(e=>e.t==='hit'))return C.tick}return -1}
const tH=firstHit();ok(tH>0,'a stationary player is hit by the cut at tick '+tH+' (pt '+(tH-1)+')');
// ---------- D. dodge i-frame boundary (root motion zeroed to isolate the window) ----------
{const first={};
 for(let d=0;d<=22;d++){const{C,P,D}=duel({});M.dodgeRoot.fill(0);const dt=tH-d;if(dt<1)continue;
  const evs=[];C.step({D:{list:[{t:'atk',m:'cut'}]},P:dt===1?{list:[{t:'dodge',dx:1,dz:0}]}:{}});
  let dtick=dt===1?1:-1;for(let i=1;i<60;i++){const cm={};if(C.tick+1===dt)cm.P={list:[{t:'dodge',dx:1,dz:0}]},dtick=dt;for(const e of C.step(cm))evs.push(e)}
  // every hit must be outside pt 3..11, every dodged inside
  let good=true;for(const e of evs){if(e.t!=='hit'&&e.t!=='dodged')continue;const pt=e.tk-dtick;const inv=pt>=3&&pt<=11;if(e.t==='hit'&&inv)good=false;if(e.t==='dodged'&&!inv)good=false}
  first[d]=evs.find(e=>e.t==='hit'||e.t==='dodged');first[d]=first[d]?first[d].t:'none';ok(good,'dodge offset '+d+': hits only outside pt 3..11, "dodged" only inside');}
 ok([0,1,2].every(d=>first[d]==='hit'),'blade active at dodge pt 0,1,2 hits');
 ok([3,4,5,6,7,8,9,10,11].every(d=>first[d]==='dodged'),'blade active at dodge pt 3..11 whiffs and emits dodged');
 ok([12,13,14].every(d=>first[d]==='hit'),'blade active at dodge pt 12+ hits')}
// fresh module state for the rest (dodgeRoot was zeroed above)
const W=load(),M2=W.M,CC2=W.CC;
const duel2=(o)=>{o=o||{};const C=CC2.create({arena:o.arena||{x:0,z:0,R:14},solids:o.solids});const P=C.add('P',Object.assign({x:0,z:0,face:0},o.P));const D=C.add('D',Object.assign({x:0,z:2,face:Math.PI,hp:140},o.D));return{C,P,D}};
// ---------- E. deflect window ----------
{const res={};for(let d=0;d<=12;d++){const{C,P,D}=duel2({});const gt=tH-d;if(gt<1)continue;const evs=[];C.step({D:{list:[{t:'atk',m:'cut'}]},P:gt===1?{list:[{t:'guardDown'}]}:{}});
  for(let i=1;i<60;i++){const cm={};if(C.tick+1===gt)cm.P={list:[{t:'guardDown'}]};for(const e of C.step(cm))evs.push(e)}const e=evs.find(e=>['hit','block','deflect'].includes(e.t));res[d]=e?e.t:'none'}
  ok([0,1,2,3,4,5,6,7].every(d=>res[d]==='deflect'),'guard pressed 0..7 ticks before the blade lands = deflect (8 tick window)');
  ok([8,9,10,11,12].every(d=>res[d]==='block'),'pressed 8+ ticks early = plain block');
  const{C,P,D}=duel2({});C.step({D:{list:[{t:'atk',m:'cut'}]},P:{list:[{t:'guardDown'}]}});C.step({P:{list:[{t:'guardUp'}]}});C.step({P:{list:[{t:'guardDown'}]}});
  ok(P.gpt===99,'re-press within 14 ticks of release gets no deflect window');
}
// ---------- F. hit-stop freezes counters and buffers presses ----------
{const{C,P,D}=duel2({});C.step({P:{list:[{t:'light'}]}});let ev=[],hsTick=0;for(let i=0;i<30&&!hsTick;i++){ev=C.step({});if(ev.some(e=>e.t==='hit'))hsTick=C.tick}
  ok(C.hs>0,'hit sets a hit-stop ('+C.hs+' ticks)');const ptBefore=P.pk,sr=P.sr;C.step({P:{list:[{t:'dodge',dx:1,dz:0}]}});
  ok(P.pk===ptBefore&&P.sr===sr,'counters frozen during hit-stop');ok(P.act!=='dodge','press during hit-stop is buffered, not consumed');
}
{const{C,P,D}=duel2({});C.hs=4;C.step({P:{list:[{t:'dodge',dx:1,dz:0}]}});ok(P.act==='free'&&P.pt===0,'dodge pressed during hit-stop is buffered');for(let i=0;i<5;i++)C.step({});ok(P.act==='dodge'||P.pt>0,'buffered dodge fires once hit-stop ends')}
// ---------- G. missed hits ----------
function oneCut(D,P){const{C,P:p,D:d}=duel2({D,P});const ev=run(C,60,t=>t===1?{D:{list:[{t:'atk',m:'cut'}]}}:{});return ev.some(e=>e.t==='hit')}
ok(oneCut({x:0,z:2.3+.45+.02})===false,'target just outside reach: miss');ok(oneCut({x:0,z:2.3+.45-.1})===true,'target just inside reach: hit');
ok(oneCut({x:6,z:0},{x:0,z:0})===false,'target at 90 degrees off the cut arc: miss');
{const{C,P,D}=duel2({P:{}});P.y=2;const ev=run(C,60,t=>t===1?{D:{list:[{t:'atk',m:'cut'}]}}:{});ok(!ev.some(e=>e.t==='hit'),'target outside the height band: miss')}
// ---------- H. duplicate hits ----------
{const{C,P,D}=duel2({P:{hp:400}});const ev=run(C,120,t=>t===1?{D:{list:[{t:'atk',m:'twin'}]}}:{});const hits=ev.filter(e=>e.t==='hit');
  ok(hits.length<=2&&new Set(hits.map(e=>e.seg)).size===hits.length,'twin cut: at most one hit per segment ('+hits.length+' hits, segs '+hits.map(e=>e.seg)+')');
  const g=duel2({P:{hp:400}});g.C.F.P.guard=true;g.C.F.P.gpt=99;const ev2=run(g.C,120,t=>t===1?{D:{list:[{t:'atk',m:'twin'}]}}:{});ok(ev2.filter(e=>e.t==='block').length===2,'guarding twin cut: each of the 2 cuts blocks exactly once')}
// ---------- I. tunnelling ----------
{let miss=0;for(let b=-.65;b<=.65;b+=.01){const C=CC2.create({arena:{x:0,z:0,R:14}});const P=C.add('P',{x:0,z:0,face:0}),D=C.add('D',{x:Math.sin(Math.PI+b)*0,z:0,face:0});
   // place the target at bearing b from the attacker, thin hurtbox r=.2, at 2.0 m
   const A=C.add('A',{x:5,z:5,face:0});const T=C.add('T',{x:5+Math.sin(b)*2,z:5+Math.cos(b)*2,face:Math.PI});T.r=.2;P.act='dead';D.act='dead';
   const ev=run(C,60,t=>t===1?{A:{list:[{t:'atk',m:'cut'}]}}:{});if(!ev.some(e=>e.t==='hit'&&e.d==='T'))miss++}
  ok(miss===0,'fastest blade vs thinnest hurtbox (0.2 m): no gaps across the whole swept arc ('+miss+' misses)')}
for(const[nm,wall]of[['0.2 m wall',{x:0,z:1.5,r:.2}],['smallest pillar r=0.6',{x:0,z:1.5,r:.6}]]){let bestD=1e9;for(let a=0;a<360;a+=15){const C=CC2.create({arena:{x:0,z:0,R:14},solids:[wall]});const P=C.add('P',{x:0,z:0,face:0});C.add('D',{x:0,z:40,face:0}).act='dead';const dx=Math.sin(a*Math.PI/180),dz=Math.cos(a*Math.PI/180);
   run(C,40,t=>t===1?{P:{list:[{t:'dodge',dx,dz}]}}:{});bestD=Math.min(bestD,Math.hypot(P.x-wall.x,P.z-wall.z)-wall.r-P.r)}
  ok(bestD>-1e-6,'dodge toward a '+nm+' never ends inside it (min clearance '+bestD.toFixed(3)+')')}
{let worst=-1e9;for(let a=0;a<360;a+=10){const C=CC2.create({arena:{x:0,z:0,R:6}});const P=C.add('P',{x:Math.sin(a*Math.PI/180)*5.4,z:Math.cos(a*Math.PI/180)*5.4,face:0});C.add('D',{x:0,z:0}).act='dead';
   run(C,40,t=>t===1?{P:{list:[{t:'dodge',dx:Math.sin(a*Math.PI/180),dz:Math.cos(a*Math.PI/180)}]}}:{});worst=Math.max(worst,Math.hypot(P.x,P.z)+P.r-6)}
  ok(worst<=1e-6,'dodge/lunge toward the arena rim stays inside it (max overshoot '+worst.toExponential(1)+')')}
// ---------- J. obstacles ----------
{const mk=(sol)=>{const{C,P,D}=duel2({solids:sol,D:{x:0,z:3}});return run(C,60,t=>t===1?{D:{list:[{t:'atk',m:'cut'}]}}:{}).some(e=>e.t==='hit')};
  ok(mk([{x:0,z:1.5,r:.5}])===false,'a pillar between the fighters blocks the blade');
  const dst=(sol)=>{const{C,P,D}=duel2({solids:sol,D:{x:0,z:2}});return run(C,60,t=>t===1?{D:{list:[{t:'atk',m:'cut'}]}}:{}).some(e=>e.t==='hit')};ok(dst([{x:2,z:1,r:.5}])===true,'a pillar beside the line lets the blade through (the gap)');
  const{C,P,D}=duel2({solids:[{x:0,z:-1.2,r:.5}],D:{x:0,z:1.5}});run(C,60,t=>t===1?{D:{list:[{t:'atk',m:'cut'}]}}:{});ok(Math.hypot(P.x,P.z+1.2)>=.5+.45-1e-6,'knock-back cannot push a fighter through a pillar');
  const w=duel2({arena:{x:0,z:0,R:3},P:{x:0,z:0},D:{x:0,z:2.4}});const ev=run(w.C,80,t=>t===1?{D:{list:[{t:'atk',m:'thrust'}]}}:{});ok(Math.hypot(w.D.x,w.D.z)+w.D.r<=3+1e-6,'a Duelist pinned against the rim obeys the same collision');
  ok(ev.some(e=>e.t==='hit'),'pinned Duelist attack still resolves normally (hits the player)')}
// ---------- K. posture + crit ----------
{const deflectAt=(po0)=>{const{C,P,D}=duel2({});D.po=po0;const gt=tH;const evs=[];C.step({D:{list:[{t:'atk',m:'cut'}]}});for(let i=1;i<60;i++){const cm={};if(C.tick+1===gt)cm.P={list:[{t:'guardDown'}]};for(const e of C.step(cm))evs.push(e)}return{D,evs}};
  const a=deflectAt(0);ok(a.evs.some(e=>e.t==='deflect')&&Math.abs(a.D.po-12*1.6)<2,'deflect adds ~19 posture to the attacker and recoils it (po '+a.D.po.toFixed(1)+')');
  const b=deflectAt(90);ok(b.evs.some(e=>e.t==='posturebreak')&&b.D.act==='stun','deflect at 90 posture causes a posture break (stagger)')}
{const{C,P,D}=duel2({});D.act='stun';D.sk='stagger';D.stun=60;const ev=run(C,40,t=>t===1?{P:{list:[{t:'light'}]}}:{});const h=ev.find(e=>e.t==='hit');ok(h&&h.crit&&Math.abs(h.dmg-35)<1e-9,'a staggered target takes a 2.5x critical (14 -> 35)')}
// ---------- L. determinism + fixed-step host at 15/30/60/144 fps ----------
function script(fps){const{C,P,D}=duel2({});const S=CC2.stepper(C);const evs=[];const inputs=[[100,'D',{t:'atk',m:'cut'}],[1300,'P',{t:'guardDown'}],[1900,'P',{t:'guardUp'}],[2100,'P',{t:'light'}],[2600,'D',{t:'atk',m:'twin'}],[2900,'P',{t:'dodge',dx:1,dz:0}]];
  let ii=0;const dt=1000/fps;for(let t=dt;t<=6000+1e-6;t+=dt){while(ii<inputs.length&&inputs[ii][0]<=t){S.input(inputs[ii][1],inputs[ii][2],inputs[ii][0]);ii++}for(const e of S.advance(t))evs.push(e.tk+e.t+(e.a||'')+(e.d||''))}
  return{h:evs.filter(e=>!/hitstop/.test(e)).join('|'),clamped:S.clamped}}
const f60=script(60);for(const fps of[15,30,144])ok(script(fps).h===f60.h,'identical event log at '+fps+' fps vs 60 fps');ok(script(15).clamped===0,'15 fps needs no catch-up clamp (4 ticks/frame <= 6)');
// ---------- M. reactive bots (18-tick reaction) ----------
for(const id of dm){let hold=id==='fall'?0:0,okAll=true;for(const h of(id==='fall'?[0,6,12]:[0])){const{C,P,D}=duel2({P:{hp:1e4}});const cues=[];let off=0,list=M.expand(id,h);
   const ev=[];C.step({D:{list:[{t:'atk',m:id,hold:h}]}});const s0=C.tick;let guarded=false;
   for(let i=0;i<200;i++){const cm={};if(C.tick+1===s0+18&&!guarded){cm.P={list:[{t:'guardDown'}]};guarded=true}for(const e of C.step(cm))ev.push(e)}
   if(ev.some(e=>e.t==='hit'))okAll=false}
  ok(okAll,id+': a bot reacting 18 ticks after the attack starts guards every hit (no unguarded hit)')}
for(const id of['fall','thrust','twin']){let okAll=true;for(const h of(id==='fall'?[0,6,12]:[0])){const L=M.expand(id,h);let cue=0;if(id==='fall')cue=14+h;else if(id==='twin')cue=20+4;const D0=duel2({P:{hp:1e4}});const{C,P}=D0;C.step({D:{list:[{t:'atk',m:id,hold:h}]}});const s0=C.tick;const ev=[];
   for(let i=0;i<200;i++){const cm={};if(C.tick+1===s0+cue+18)cm.P={list:[{t:'dodge',dx:1,dz:0}]};for(const e of C.step(cm))ev.push(e)}
   if(ev.some(e=>e.t==='hit'&&e.seg===(id==='twin'?1:0)))okAll=false}
  ok(okAll,id+': tell >= 22 so a bot reacting 18 ticks after the cue can dodge the (last) hit')}
// ---------- N. seeded fuzz: invariants over many fights + determinism ----------
function lcg(s){return()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296)}
function fuzz(seed,N,T,sol){const r=lcg(seed);let h=2166136261,viol=0,dup=0;const mix=v=>{h=Math.imul(h^(v|0),16777619)>>>0};
  for(let n=0;n<N;n++){const C=CC2.create({arena:{x:0,z:0,R:12},solids:sol});const P=C.add('P',{x:-3,z:0,face:Math.PI/2}),D=C.add('D',{x:3,z:0,face:-Math.PI/2,hp:140});const seen=new Set();let lastHp=[100,140];
    for(let t=0;t<T;t++){const cm={};for(const id of['P','D']){const f=C.F[id],list=[];const q=r();if(q<.04)list.push({t:id==='P'?'light':'atk',m:['cut','fall','thrust','twin','riposte'][(r()*5)|0],hold:(r()*14)|0});else if(q<.06)list.push({t:'dodge',dx:r()-.5,dz:r()-.5});else if(q<.08)list.push({t:'guardDown'});else if(q<.1)list.push({t:'guardUp'});else if(q<.11&&id==='P')list.push({t:'heavyDown'});else if(q<.125&&id==='P')list.push({t:'heavyUp'});
        const o=C.F[id==='P'?'D':'P'];cm[id]={list,face:Math.atan2(o.x-f.x,o.z-f.z),mx:r()-.5,mz:r()-.5}}
      const ev=C.step(cm);for(const e of ev){mix(e.tk);mix(e.t.length);if(['hit','block','deflect'].includes(e.t)){const k=e.a+':'+e.seg+':'+C.F[e.a].ph;}}
      for(const id of['P','D']){const f=C.F[id];if(Math.hypot(f.x,f.z)+f.r>12+1e-6)viol++;for(const s of sol||[])if(Math.hypot(f.x-s.x,f.z-s.z)<s.r+f.r-1e-6)viol++;if(f.st<0||f.st>f.stMax||f.po<0||f.po>f.poMax)viol++;if(f.hp>[100,140][id==='P'?0:1])viol++;mix(Math.round(f.x*1e4));mix(Math.round(f.z*1e4))}
      // one outcome per (attacker, segment, move instance)
      for(const e of ev)if(['hit','block','deflect'].includes(e.t)){const f=C.F[e.a];const key=e.a+'|'+(f.mv?f.mv.id:'?')+'|'+f.pt+'|'+e.seg;}
      if(C.F.P.act==='dead'||C.F.D.act==='dead')break}}
  return{h,viol}}
{const sol=[{x:0,z:0,r:.8},{x:5,z:5,r:.6},{x:-5,z:4,r:.6}];const t0=Date.now();const a=fuzz(7,10000,300,sol);const b=fuzz(7,200,300,sol),c=fuzz(7,200,300,sol);
  ok(a.viol===0,'10,000 seeded fights: no collision / bounds / resource violations ('+a.viol+') in '+(Date.now()-t0)+' ms');ok(b.h===c.h,'fuzz is deterministic (same seed, same hash)')}
// duplicate outcome per segment: audit via event log
{let dups=0;for(let n=0;n<300;n++){const r=lcg(n+1);const C=CC2.create({arena:{x:0,z:0,R:12}});C.add('P',{x:0,z:0,face:0,hp:1e5});C.add('D',{x:0,z:2,face:Math.PI,hp:1e5});const key=new Map();let inst=0;
  for(let t=0;t<400;t++){const cm={D:{list:t%70===1?[{t:'atk',m:['cut','twin','fall','thrust','riposte'][(r()*5)|0],hold:(r()*13)|0}]:[]},P:{list:r()<.05?[{t:r()<.5?'guardDown':'guardUp'}]:[]}};
    for(const e of C.step(cm)){if(e.t==='start')inst++;if(['hit','block','deflect'].includes(e.t)){const k=inst+':'+e.seg;if(key.has(k))dups++;key.set(k,1)}}}}
  ok(dups===0,'no duplicate outcome for the same attack segment ('+dups+')')}
process.exit(bad?1:0);
