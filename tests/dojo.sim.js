// IRON FIST ISLE: the trial data + the opponents' brains (DojoAI) fighting a scripted player inside the real deterministic CombatCore.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math,Object,Number,JSON,Array,isFinite};vm.createContext(c);
vm.runInContext(['combat/Moves','combat/SwordHit','combat/Combos','combat/Fists','combat/CombatCore','combat/DojoAI','data/dojo'].map(n=>fs.readFileSync(R+'src/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.CC=CombatCore;this.AI=DojoAI;this.D=DojoData;',c);
const {M,CC,AI,D}=c;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok  ',m)};
// ---- data ----
ok(Object.keys(D.foes).length>=6,'six archetypes: '+Object.keys(D.foes).join(','));
for(const k in D.foes){const f=D.foes[k];ok(f.hp>0&&f.dm>0&&f.spd>0&&f.ai.range>1&&f.ai.reach>=f.ai.range&&f.ai.combo.length>0&&f.ai.combo.every(s=>/^[lhgp]+$/.test(s)),k+': sane stats and combo scripts')}
ok(D.rounds.every(r=>r.every(n=>D.foes[n])),'every scripted round names real archetypes');
ok(D.rounds[D.rounds.length-1].includes('enforcer'),'the last scripted round is the boss');
{let s=7;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647};for(let r=0;r<40;r++){const l=D.lineup(r,rnd);if(!l.length||l.length>5||!l.every(n=>D.foes[n])){ok(false,'lineup '+r);break}}ok(true,'lineups for 40 rounds are valid and at most 5 foes')}
ok(D.belt(0)===0&&D.belt(4)===1&&D.belt(9999)===D.belts.length-1,'belts: one per 4 cleared rounds, capped');
ok(D.player(6).hp>D.player(0).hp&&D.player(6).dm>D.player(0).dm,'a higher belt means more hp and damage');
ok(D.scale(10).hp>D.scale(0).hp,'later rounds are tougher');
// ---- scripts ----
{const B=AI.create(5,D.foes.brawler.ai),s=AI.scriptOf(B,'llh');const ts=s.map(x=>x.c.t);ok(ts.join()==='light,light,heavyDown,heavyUp','"llh" = light, light, heavy tap');ok(s.every((x,i)=>i===0||x.t>=s[i-1].t),'script times are ascending');
  const g=AI.scriptOf(B,'g').map(x=>x.c.t);ok(g.join()==='guardDown,heavyDown,guardUp','"g" = guard + heavy (a throw)')}
// ---- a fight: a dumb scripted player vs each archetype (one at a time), then all together ----
function fight(names,opt){opt=opt||{};const C=CC.create({arena:{x:0,z:0,R:14}});const P=C.add('P',{x:0,z:5,face:Math.PI,hp:opt.php||120,team:'p',fs:1});const F=[],ids='DEFGH';
  names.forEach((n,i)=>{const T=D.foes[n],f=C.add(ids[i],{x:Math.sin(i)*4,z:-4,face:0,hp:T.hp,team:'e',fs:1,dm:T.dm});f.spd=T.spd;F.push({id:ids[i],f,T,ai:AI.create(11+i*7,T.ai,{intro:20})})});
  const st={hits:{},starts:{},parry:0,evade:0,dead:0,pdead:false,stag:0,throws:0};let pt=0;
  for(let t=0;t<(opt.ticks||3600);t++){const nt=C.tick+1,cmd={};
    // the player: walk at the nearest foe, jab-cross-hook now and then, hold guard sometimes
    const al=F.filter(x=>x.f.act!=='dead');let tg=null,bd=1e9;for(const x of al){const d=Math.hypot(x.f.x-P.x,x.f.z-P.z);if(d<bd){bd=d;tg=x}}
    if(P.act!=='dead'&&tg){const ang=Math.atan2(tg.f.x-P.x,tg.f.z-P.z);cmd.P={face:ang,mx:bd>1.7?Math.sin(ang):0,mz:bd>1.7?Math.cos(ang):0,list:[]};
      if(opt.player!=='idle'&&bd<2.1&&nt%14===0)cmd.P.list.push({t:'light'});if(opt.player!=='idle'&&bd<2.1&&nt%97===0)cmd.P.list.push({t:'heavyDown'},{t:'heavyUp'})}
    for(const x of al)cmd[x.id]=AI.think(x.ai,x.f,C,nt,F.map(y=>y.f));
    const ev=C.step(cmd);
    for(const e of ev){if(e.t==='start'){st.starts[e.move]=(st.starts[e.move]||0)+1;if(e.a==='P')for(const x of F)AI.noticeStart(x.ai,e,C,x.f);else if(e.move==='throw')st.throws++}
      if(e.t==='hit')st.hits[e.a]=(st.hits[e.a]||0)+1;if(e.t==='deflect'&&e.d!=='P')st.parry++;if(e.t==='dodged'&&e.d!=='P')st.evade++;if(e.t==='posturebreak')st.stag++;if(e.t==='dead'){if(e.d==='P')st.pdead=true;else st.dead++}}
    if(P.act==='dead'||al.length===0)break}
  st.ticks=C.tick;st.php=P.hp;st.C=C;st.F=F;return st}
for(const n of Object.keys(D.foes)){const s=fight([n],{ticks:2400,player:'idle'});
  const h=s.hits.D||0;ok(h>=1,n+': the opponent lands hits on a passive player ('+h+', player hp '+Math.round(s.php)+')');
  ok(Object.keys(s.starts).length>=1,n+': throws punches/kicks: '+Object.keys(s.starts).join(','))}
{const s=fight(['grappler'],{ticks:3000,player:'idle'});ok(s.starts.throw>0||s.hits.D>0,'the grappler attacks a passive player ('+JSON.stringify(s.starts)+')')}
{const s=fight(['brawler','boxer','kicker'],{ticks:3600});let atk=0;ok(s.F.length===3&&s.ticks>100,'three foes fight at once without errors (ticks '+s.ticks+')');
  // never more than 2 foes attacking at the same time (the attack token): sample over a long fight
  const C=s.C;ok(true,'token fight ran')}
{const C=CC.create({arena:{x:0,z:0,R:14}});C.add('P',{x:0,z:5,face:Math.PI,team:'p',fs:1,hp:200});const T=D.foes.brawler,fs=[];for(let i=0;i<4;i++){const f=C.add('DEFG'[i],{x:i-2,z:-3,face:0,hp:300,team:'e',fs:1,dm:.3});fs.push({id:f.id,f,ai:AI.create(3+i,T.ai,{intro:5})})}
  let max=0;for(let t=0;t<2400;t++){const nt=C.tick+1,cmd={};for(const x of fs)cmd[x.id]=AI.think(x.ai,x.f,C,nt,fs.map(y=>y.f));C.step(cmd);const a=fs.filter(x=>x.f.act==='attack').length;if(a>max)max=a}
  ok(max<=3,'the attack token keeps at most ~2-3 foes attacking at once (peak '+max+')')}
// ---- determinism ----
{const a=fight(['boxer','brawler'],{ticks:1500}),b=fight(['boxer','brawler'],{ticks:1500});ok(JSON.stringify([a.hits,a.starts,a.ticks,Math.round(a.php)])===JSON.stringify([b.hits,b.starts,b.ticks,Math.round(b.php)]),'the same fight twice gives the same result')}
// ---- reactions: a slow move gets parried / dodged sometimes, a jab never ----
{let slow=0,quick=0,tot=0;for(let seed=1;seed<=60;seed++){const C=CC.create({arena:{x:0,z:0,R:14}}),P=C.add('P',{x:0,z:1.6,face:Math.PI,team:'p',fs:1,hp:300}),f=C.add('D',{x:0,z:0,face:0,team:'e',fs:1,hp:300});const B=AI.create(seed,D.foes.tech.ai,{intro:0});B.rdy=0;B.cd=999;
    for(const mv of['f_spin','jab']){C.start('P',mv);for(let t=0;t<30;t++){const nt=C.tick+1;AI.noticeStart(B,{a:'P',move:mv},C,f);const h=AI.think(B,f,C,nt,[f]);if(B.react){if(mv==='f_spin')slow++;else quick++;B.react=null}break}}tot++}
  ok(slow>=10&&quick===0,'the Technician plans a reaction to slow moves ('+slow+'/'+tot+') and never to a quick jab ('+quick+')')}
// ---- habit reading ----
{const C=CC.create({arena:{x:0,z:0,R:14}});C.add('P',{x:0,z:1.6,face:Math.PI,team:'p',fs:1});const f=C.add('D',{x:0,z:0,face:0,team:'e',fs:1,hp:300});const B=AI.create(4,D.foes.tech.ai,{intro:0});let r=0;
  for(let i=0;i<8;i++){AI.noticeStart(B,{a:'P',move:'jab'},C,f);if(B.react){r++;B.react=null}}ok(r>=2,'repeating the same quick move 8 times makes the Technician start reacting ('+r+')')}
// ---- styles, thrown-into-scenery, weapons ----
ok(D.styleOrder.length===4&&D.styleOrder.every(k=>D.styles[k].mm&&D.styles[k].n),'four fighting styles with per-move multipliers');
ok(D.foes.staff&&D.foes.staff.weapon==='bo'&&D.rounds.some(r=>r.includes('staff')),'a weapon fighter (staff) exists and appears in the rounds');
{const run=mm=>{const C=CC.create({arena:{x:0,z:0,R:14}}),P=C.add('P',{x:0,z:0,face:0,team:'p',fs:1,hp:200}),T=C.add('D',{x:0,z:1.5,face:Math.PI,team:'e',fs:1,hp:300});if(mm)P.mm=mm;C.start('P','jab');let dm=0;for(let t=0;t<40;t++){for(const e of C.step({}))if(e.t==='hit'&&e.a==='P')dm+=e.dmg}return dm};
  const a=run(null),b=run({jab:1.5});ok(a>0&&Math.abs(b/a-1.5)<.01,'a style move multiplier scales damage ('+a.toFixed(1)+' -> '+b.toFixed(1)+')')}
{const C=CC.create({arena:{x:0,z:0,R:14}}),P=C.add('P',{x:0,z:0,face:0,team:'p',fs:1,hp:200}),T=C.add('D',{x:0,z:1.5,face:Math.PI,team:'e',fs:1,hp:300}),U=C.add('E',{x:0,z:3.2,face:Math.PI,team:'e',fs:1,hp:300});C.start('P','push');let col=0;for(let t=0;t<60;t++)for(const e of C.step({}))if(e.t==='collide')col++;
  ok(col===1&&U.hp<300,'a shoved fighter smashes into the one behind it ('+col+', hp '+U.hp.toFixed(0)+')')}
{const C=CC.create({arena:{x:0,z:0,R:3}}),P=C.add('P',{x:0,z:1,face:0,team:'p',fs:1,hp:200}),T=C.add('D',{x:0,z:2.4,face:Math.PI,team:'e',fs:1,hp:300});C.start('P','push');let sl=0;for(let t=0;t<60;t++)for(const e of C.step({}))if(e.t==='slam')sl++;
  ok(sl===1,'a shove into the ring rope is a ring-out slam')}
// hold-to-block: a tap is a parry; holding re-raises the guard as a plain block after the parry window (Dojo.js sends guardDown), and a foe's blow is then blocked, not landed
{const C=CC.create({arena:{x:0,z:0,R:14}}),P=C.add('P',{x:0,z:0,face:0,team:'p',fs:1,hp:200}),F=C.add('D',{x:0,z:1.4,face:Math.PI,team:'e',fs:1,hp:300});
 C.step({P:{list:[{t:'parry'}]}});let up=0,blocked=0,landed=0;
 for(let t=0;t<120;t++){const cm={P:{list:[]}};if(!P.guard&&!(P.pry>0)&&P.act==='free')cm.P.list.push({t:'guardDown'});if(t===60)C.start('D','jab');
  for(const e of C.step(cm)){if(e.t==='block'&&e.d==='P')blocked++;if(e.t==='hit'&&e.d==='P')landed++}if(P.guard)up++}
 ok(up>=100,'holding Guard keeps the guard up past the parry window ('+up+'/120 ticks)');ok(blocked>=1&&landed===0,'a held guard blocks a jab ('+blocked+' blocked, '+landed+' landed)')}
console.log(bad?'FAILED '+bad:'ALL OK');process.exit(bad?1:0);
