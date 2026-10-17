// Foe roster + AI styles: every type/site is consistent, and each style (soldier / knight / dancer / beast) behaves like itself in the sim.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math,sstep:(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},WRD:{R:210,reach:234,x:0,z:0}};vm.createContext(c);
vm.runInContext(['data/warden','combat/Moves','combat/SwordHit','combat/Combos','combat/CombatCore','combat/DuelistAI','combat/Foes','combat/WardenMX'].map(n=>fs.readFileSync(R+'src/'+n+'.js','utf8')).join('\n')+';this.M=Moves;this.CC=CombatCore;this.AI=DuelistAI;this.F=Foes;this.W=WARDEN;this.X=WardenMX;this.WH=WardenH',c);
const {M,CC,AI,F,W,X}=c;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
// ---- roster / sites
for(const k in F.TYPES){const T=F.TYPES[k];ok(T.hp>0&&T.r>0&&AI.create(1,{foe:T.ai})&&X.ROLES[T.role],k+': hp/radius/AI style/clip role are defined');
  ok(T.body==='avatar'||(T.files||[T.file]).every(f=>fs.existsSync(R+'assets/warden/'+f+'.glb')),k+': body asset exists')}
for(const s of W.sites){ok(s.foes.length>0&&s.foes.every(f=>F.TYPES[f.t]),s.id+': foes are known types');ok(s.foes.every(f=>Math.hypot(f.dx,f.dz)<s.R-2),s.id+': foes start inside the ring')}
{let bossOk=true;for(const s of W.sites)for(const o of W.sites)if(s!==o&&Math.hypot(s.x-o.x,s.z-o.z)<s.R+o.R+6)bossOk=false;ok(bossOk,'no two sites overlap')}
ok(W.sites.every(s=>s.wall||[0,1,2,3,4,5,6,7].every(a=>Math.abs(c.WH(s.x+Math.sin(a)*s.R*.8,s.z+Math.cos(a)*s.R*.8)-s.y)<.35)),'every fight site is level ground (flattened to its y)');
ok(W.sites.filter(s=>F.TYPES[s.foes[0].t].boss).length>=4,'at least 4 boss sites');
// ---- AI styles vs a standing player
function run(style,seed,ticks,o){o=o||{};const C=CC.create({arena:{x:0,z:0,R:30}});const P=C.add('P',{x:0,z:-4,face:0,hp:1e5,team:'p'});const D=C.add('D',{x:0,z:0,face:Math.PI,hp:o.hp||1e5,team:'e'});D.r=.55;D.spd=1.3;
  const A=AI.create(seed,{foe:style,intro:20}),st={moves:{},guard:0,fx:0,bad:0,minRest:1e9,last:-1};let evs=[],pa='free';
  for(let t=0;t<ticks;t++){const d=AI.think(A,P,D,evs,C.tick+1);if(o.hurt&&t===5)D.hp=D.hpMax*.4;
    if(d.list.some(x=>x.t==='atk')&&D.act!=='free')st.bad++;
    evs=C.step({D:{face:d.face,mx:d.mx,mz:d.mz,list:d.list},P:{list:[],face:Math.atan2(D.x-P.x,D.z-P.z),mx:0,mz:0}});
    for(const e of evs){if(e.t==='start'&&e.a==='D'){st.moves[e.move]=(st.moves[e.move]||0)+1;if(st.last>=0)st.minRest=Math.min(st.minRest,C.tick-st.last)}if(e.t==='fx')st.fx++}
    if(D.guard)st.guard++;if(pa!=='free'&&D.act==='free')st.last=C.tick;pa=D.act;if(!isFinite(D.x+D.z))st.bad++}
  return st}
{const s=run('soldier',3,12000);ok(Object.keys(s.moves).every(m=>m==='cut'||m==='thrust')&&s.moves.cut>5,'soldier only swings cut/thrust: '+JSON.stringify(s.moves));ok(s.bad===0&&s.minRest>=20,'soldier: never starts while busy, rests >= 20 ticks')}
{const s=run('knight',4,20000);ok(s.guard>200,'knight raises his shield ('+s.guard+' guarded ticks)');ok(['cut','thrust','twin','fall'].every(m=>s.moves[m]>0),'knight uses his sword: '+JSON.stringify(s.moves));ok(s.bad===0&&s.minRest>=20,'knight: legal + rests');
  const q=run('knight',4,20000,{hurt:1});ok(q.moves.quake>0,'knight phase 2 adds the quake stomp ('+(q.moves.quake||0)+')')}
{const s=run('dancer',5,20000);ok((s.moves.orb||0)+(s.moves.bolt||0)>5&&s.fx>5,'dancer casts ('+s.fx+' effects)');ok((s.moves.cut||0)+(s.moves.twin||0)>0||s.moves.dash>0,'dancer also closes in: '+JSON.stringify(s.moves));ok(s.bad===0&&s.minRest>=20,'dancer: legal + rests')}
{const s=run('beast',6,20000,{hurt:1});ok(s.moves.quake>0&&s.moves.sweep>0,'beast uses roar-stomp and sweep: '+JSON.stringify(s.moves));ok(s.bad===0,'beast: legal')}
// determinism
{const a=run('knight',9,5000),b=run('knight',9,5000);ok(JSON.stringify(a)===JSON.stringify(b),'styles are deterministic')}
// bash cracks a guard in one blocked hit
{const C=CC.create({arena:{x:0,z:0,R:30}});const P=C.add('P',{x:0,z:0,face:0,hp:100});const D=C.add('D',{x:0,z:1.6,face:Math.PI,hp:100});
  C.step({P:{list:[{t:'guardDown',e:1}]}});for(let i=0;i<10;i++)C.step({});let broke=false;C.step({D:{list:[{t:'atk',m:'bash',hold:0,e:C.tick}]}});for(let i=0;i<60;i++){for(const e of C.step({}))if(e.t==='guardbreak')broke=true}
  ok(broke,'a blocked bash is a guard break')}
process.exit(bad?1:0);
