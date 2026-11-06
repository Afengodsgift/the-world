// Kage's second arsenal: real-sword clips, tougher body, choreographed chains that actually fire (and in order), every move fair
const fs=require('fs'),vm=require('vm');const ctx={console,Math};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/combat/Moves.js','utf8')+';this.Moves=Moves;',ctx);
vm.runInContext(fs.readFileSync('src/combat/DuelistAI.js','utf8')+';this.DuelistAI=DuelistAI;',ctx);const{DuelistAI,Moves}=ctx;
let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
const NEW=['kslide','crow','cyclone','splitter','tengu','reversemoon','kindle','thrustslash'];
for(const m of NEW){const M=Moves[m];ok(M&&M.who==='D','move '+m+' exists');if(!M)continue;
  let t=0,first=true,worst=999;for(const p of M.phases){if(p.k==='active'){worst=Math.min(worst,t);t=0}else t+=p.n||0}   // ticks of tell before each active window
  const act=M.phases.map((p,i)=>p.k==='active'?i:-1).filter(i=>i>=0);let acc=0;const tells=[];let since=0;for(const p of M.phases){if(p.k==='active'){tells.push(since);since=0}else since+=p.n||0}
  ok(tells.every(x=>x>=20),m+': every hit has a tell >= 20 ticks ('+tells+')');
  const last=M.phases[M.phases.length-1];ok(last.k==='recovery'&&last.n>=20,m+': recovery >= 20')}
ok(Moves.PERILOUS.indexOf('splitter')>=0&&Moves.PERILOUS.indexOf('crow')>=0,'Heaven-Splitter and Falling Crow are perilous');
ok(Moves.reversemoon.phases.some(p=>p.move<0),'Reverse Moon moves him backwards');
const F=fs.readFileSync('src/combat/Foes.js','utf8');ok(/samurai:\{name:'Kage[^}]*hp:1900/.test(F),'Kage has 1900 HP (a long fight)');
// chains fire in order across many seeds
const mkD=()=>({id:'D',x:0,z:0,hp:1000,hpMax:1050,act:'free',guard:false,rm:1,face:0}),mkP=z=>({id:'P',x:0,z,act:'free',guard:false,hp:100,ph:null,pi:0});
function run(seed,dist,ph3){const A=DuelistAI.create(seed,{foe:'samurai',kid:'samurai',intro:0});A.on=true;A.ph2=true;A.ph3=!!ph3;const D=mkD(),P=mkP(dist);if(ph3)D.hp=D.hpMax*.2;const log=[];let until=0;
  for(let t=0;t<9000;t++){if(D.act==='attack'&&t>=until)D.act='free';const o=DuelistAI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){D.act='attack';until=t+70;log.push(c.m);if(c.m==='kslide'||c.m==='crow'||c.m==='reversemoon')P.z=c.m==='reversemoon'?2.6:2.2;else if(!['thrustslash','cyclone','splitter','silentsev','iai'].includes(c.m)&&dist>4)P.z=dist}}return log}
const seen={};const has=(L,q)=>{for(let i=0;i+q.length<=L.length;i++)if(q.every((m,j)=>L[i+j]===m))return true;return false};
for(let s=1;s<=30;s++){for(const[d,p3]of[[6,false],[2.2,false],[2.2,true],[6,true]]){const L=run(s*7,d,p3);for(const m of L)seen[m]=1;
  if(has(L,['kslide','cyclone']))seen.c1=1;if(has(L,['crow','thrustslash','splitter']))seen.c2=1;if(has(L,['tengu','reversemoon','iai']))seen.c3=1;if(has(L,['kindle','cyclone','splitter','silentsev']))seen.c4=1}}
for(const m of NEW)ok(seen[m],'Kage actually uses '+m);
ok(seen.c1,'chain Shadow Rush (slide -> cyclone) fires');ok(seen.c2,'chain Crow Song (crow -> thrust-slash -> splitter) fires');ok(seen.c3,'chain Tengu Wheel fires');ok(seen.c4,'chain Nightfall (phase 3) fires');
// the Veil Dancer shares his AI branch but never uses the new moves (she has no clips for them)
{let bad=0;for(let s=1;s<=10;s++){const A=DuelistAI.create(s,{foe:'veil',kid:'veil',intro:0});A.on=true;A.ph2=true;const D=mkD(),P=mkP(2.4);let until=0;for(let t=0;t<5000;t++){if(D.act==='attack'&&t>=until)D.act='free';const o=DuelistAI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){D.act='attack';until=t+70;if(NEW.indexOf(c.m)>=0)bad++}}}ok(bad===0,'the Veil Dancer never uses Kage-only moves ('+bad+')')}
console.log(n+' checks')
