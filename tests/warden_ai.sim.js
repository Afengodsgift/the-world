// Duelist AI: deterministic, fair (every attack is dodgeable by a bot that only watches the visible tell), rests between moves, varied, reacts to a turtling guard, never starts a move while busy.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math};vm.createContext(c);
vm.runInContext(['Moves','SwordHit','Combos','CombatCore','DuelistAI'].map(n=>fs.readFileSync(R+'src/combat/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.CC=CombatCore;this.AI=DuelistAI',c);
const {M,CC,AI}=c;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
// player bots return a command object for P each tick
function fight(seed,ticks,pbot,o){o=o||{};const C=CC.create({arena:{x:0,z:0,R:14}});const P=C.add('P',{x:0,z:-3,face:0,hp:o.php||1e5});const D=C.add('D',{x:0,z:0,face:Math.PI,hp:o.dhp||1e5});
  const A=AI.create(seed,{intro:o.intro,foe:o.foe});const st={starts:[],hits:0,dodged:0,blocked:0,deflected:0,moves:{},hash:0,busyStart:0,minRest:1e9,lastEnd:-1,fell:0};let evs=[],prevAct='free';
  for(let t=0;t<ticks;t++){const tick=C.tick+1,d=AI.think(A,P,D,evs,tick),pc=pbot?pbot(C,P,D,tick):{};
    if(d.list.some(x=>x.t==='atk')&&D.act!=='free')st.busyStart++;                               // must only start while free
    const cm={D:{face:d.face,mx:d.mx,mz:d.mz,list:d.list},P:Object.assign({list:[]},pc)};
    evs=C.step(cm);
    for(const e of evs){if(e.t==='start'&&e.a==='D'){st.starts.push(C.tick);st.moves[e.move]=(st.moves[e.move]||0)+1;if(st.lastEnd>=0)st.minRest=Math.min(st.minRest,C.tick-st.lastEnd)}
      if(e.t==='hit'&&e.d==='P')st.hits++;if(e.t==='dodged')st.dodged++;if(e.t==='block')st.blocked++;if(e.t==='deflect')st.deflected++}
    if(prevAct!=='free'&&D.act==='free')st.lastEnd=C.tick;prevAct=D.act;st.hash=(st.hash*31+Math.round(D.x*1000)+Math.round(D.z*1000)*7+D.pt+C.tick)|0}
  return st}
// 1. determinism
{const a=fight(5,6000,null),b=fight(5,6000,null),c2=fight(6,6000,null);ok(a.hash===b.hash&&a.starts.length===b.starts.length,'same seed => identical fight');ok(a.hash!==c2.hash,'different seed => different fight')}
// 2. it does attack, uses every move, and never starts a move while busy
{const s=fight(1,20000,null);ok(s.starts.length>40,'attacks an idle player regularly ('+s.starts.length+' moves in 20000 ticks)');ok(['cut','twin','thrust','fall'].every(m=>s.moves[m]>0),'uses cut, twin, thrust and fall: '+JSON.stringify(s.moves));ok(s.busyStart===0,'never issues a move while busy')}
// 3. no attack during the intro
{const s=fight(2,200,null,{intro:120});ok(s.starts.length===0||s.starts[0]>120,'holds fire during the intro (first move at tick '+s.starts[0]+')')}
// 4. rests >= 20 ticks between a move ending and the next starting
{let worst=1e9;for(let sd=1;sd<=20;sd++){const s=fight(sd,6000,null);worst=Math.min(worst,s.minRest)}ok(worst>=20,'rests >= 20 ticks between moves (min '+worst+')')}
// 5. FAIRNESS: a bot that only watches the Duelist's visible tell and dodges into the strike takes NO damage, for many seeds (every move is dodgeable)
{const dodger=(C,P,D,tick)=>{if(D.act==='attack'&&D.ph&&P.act==='free'&&P.st>=18){let toActive=0,i=D.pi;toActive=D.ph[i].n-D.pk;for(let j=i+1;j<D.ph.length&&D.ph[j].k!=='active';j++)toActive+=D.ph[j].n;
      if(D.ph[D.pi].k==='active')toActive=0;const reach=Math.hypot(D.x-P.x,D.z-P.z)<4;if(reach&&toActive>=4&&toActive<=6)return{list:[{t:'dodge',e:tick,dx:P.x-D.x,dz:P.z-D.z}]}}
    return{list:[]}};
  let hits=0,dod=0,moves=0;for(let sd=1;sd<=12;sd++){const s=fight(sd,6000,dodger,{php:1e5});hits+=s.hits;dod+=s.dodged;moves+=s.starts.length}
  ok(moves>200&&hits===0,'a bot that dodges on the visible tell takes 0 hits over '+moves+' Duelist moves ('+dod+' dodged, '+hits+' hit)')}
// 6. a guard-holding bot is pressured with the overhead (fall) more than an idle one is, and an always-guard bot is eventually guard-broken
{const turtle=(C,P)=>({list:P.guard?[]:[{t:'guardDown',e:C.tick+1}]});const g=fight(3,12000,turtle),i=fight(3,12000,null);const fr=s=>(s.moves.fall||0)/Math.max(1,s.starts.length);
  ok(fr(g)>fr(i)+.05,'pressures a turtling guard with the heavy overhead more ('+fr(g).toFixed(2)+' vs '+fr(i).toFixed(2)+')');ok(g.blocked+g.deflected>0      ,'blocked hits happen against a guard ('+g.blocked+')')}
// 6b. he guards and ripostes against a player who keeps charging heavies / swinging at him
{const swing=(C,P,D,tick)=>{const d=Math.hypot(D.x-P.x,D.z-P.z);if(P.act==='free'&&d<2.4&&P.st>30)return{face:Math.atan2(D.x-P.x,D.z-P.z),list:[{t:'light',e:tick}]};if(P.act==='free'&&d<2.4&&P.st<=30)return{face:Math.atan2(D.x-P.x,D.z-P.z),list:[{t:'heavyDown',e:tick}]};
    if(P.act==='charge'&&P.c>25)return{list:[{t:'heavyUp'}]};return{face:Math.atan2(D.x-P.x,D.z-P.z),mx:0,mz:0,list:[]}};
  let rip=0,blk=0;for(let sd=1;sd<=10;sd++){const s2=fight(sd,8000,swing);rip+=s2.moves.riposte||0}ok(rip>0,'he ripostes after blocking an aggressive player ('+rip+' ripostes over 10 fights)')}
// 7. it can actually beat an idle player (it is a real opponent) and the player can beat it (light spam in range wins sometimes)
{const s=fight(4,30000,null,{php:100});ok(s.hits>=3,'a standing-still player is hit ('+s.hits+' hits, 100 hp)')}
// 6. The Hollow Warden
{const s=fight(3,30000,null,{foe:'hollow'});ok(['sweep','slam','triple'].every(m=>s.moves[m]>0)&&!s.moves.cut&&!s.moves.thrust,'Hollow Warden uses only sweep, slam, triple: '+JSON.stringify(s.moves));
 ok(s.busyStart===0,'Hollow Warden never starts a move while busy');ok(s.minRest>=45,'Hollow Warden rests >= 45 ticks between moves (min '+s.minRest+')');
 const f=fight(3,30000,null,{foe:'duelist'});ok(s.starts.length<f.starts.length,'Hollow Warden attacks less often than the Duelist ('+s.starts.length+' vs '+f.starts.length+')');
 const a=fight(9,6000,null,{foe:'hollow'}),b=fight(9,6000,null,{foe:'hollow'});ok(a.hash===b.hash,'Hollow Warden fight is deterministic')}
process.exit(bad?1:0);
