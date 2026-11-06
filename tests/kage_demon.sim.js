// Kage, the demon (Sekiro / Phantom Blade tempo): 19 new library-clip moves across four hp tiers, a long fight (1900 HP), perilous sweep / dives / grasp, chains that fire, every clip real
const fs=require('fs'),vm=require('vm');const ctx={console,Math};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/combat/Moves.js','utf8')+';this.Moves=Moves;',ctx);
vm.runInContext(fs.readFileSync('src/combat/DuelistAI.js','utf8')+';this.DuelistAI=DuelistAI;',ctx);const{DuelistAI,Moves}=ctx;
let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
const KZ=Object.keys(Moves).filter(k=>/^kz/.test(k));ok(KZ.length===19,'19 demon moves ('+KZ.length+')');
// fairness: tell >= 20 before every hit, recovery >= 20
for(const m of KZ){const M=Moves[m];let since=0;const tells=[];for(const p of M.phases){if(p.k==='active'){tells.push(since);since=0}else since+=p.n||0}
  ok(tells.every(x=>x>=20),m+' tells '+tells);const last=M.phases[M.phases.length-1];ok(last.k==='recovery'&&last.n>=20,m+' recovery')}
for(const m of['kzsweep','kzfflip','kzhjump','kzpow','kzgrab','kzgslam','kzstomp'])ok(Moves.PERILOUS.indexOf(m)>=0&&Moves[m].per===1,m+' is perilous');
// every clip the specs name exists in Kage's asset, and every move has a spec
const asset=JSON.parse(fs.readFileSync('assets/warden_mx_samurai.json','utf8')),names=new Set((Array.isArray(asset)?asset:asset.clips).map(c=>c.name));
const src=fs.readFileSync('src/combat/WardenMX.js','utf8');
for(const m of KZ){const r=new RegExp(m+":\\{c:'(kz_[a-z]+)'").exec(src);ok(r&&names.has(r[1]),m+' has a spec whose clip exists ('+(r&&r[1])+')')}
ok(/samurai:\{name:'Kage[^}]*hp:1900/.test(fs.readFileSync('src/combat/Foes.js','utf8')),'Kage has 1900 HP');
// the AI actually uses every one of them, tier by tier, and the early tiers do NOT use the late moves
const mkD=hp=>({id:'D',x:0,z:0,hp:hp,hpMax:1900,act:'free',guard:false,rm:1,face:0}),mkP=z=>({id:'P',x:0,z,act:'free',guard:false,hp:100,ph:null,pi:0});
function run(seed,hpf,N){const A=DuelistAI.create(seed,{foe:'samurai',kid:'samurai',intro:0});A.on=true;const D=mkD(1900*hpf),P=mkP(4);const seen={};const log=[];let until=0;
  for(let t=0;t<N;t++){if(t%240===0)P.z=1.3+(seed*37+t/240*53)%62/10;if(D.act==='attack'&&t>=until)D.act='free';const o=DuelistAI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){D.act='attack';until=t+80;seen[c.m]=1;log.push(c.m)}}return{seen,log}}
const T0={},T1={},T2={};
for(let s=1;s<=40;s++){Object.assign(T0,run(s,.95,9000).seen);Object.assign(T1,run(s+100,.65,9000).seen);Object.assign(T2,run(s+200,.4,9000).seen)}
const tier0=['kzdbl','kzrh','kzcart','kztflip','kzhurr'],tier1=['kzbflip','kzaerial','kzbutter','kzfflip','kzsfl','kzback'],tier2=['kzsweep','kzhspin','kzgcmb','kzpow','kzstomp','kzgrab','kzhjump','kzgslam'];
for(const m of tier0)ok(T0[m],'opening tier uses '+m);
for(const m of tier1)ok(T1[m],'tier 2 (below 75%) uses '+m);for(const m of tier2)ok(T2[m],'tier 3 (below 50%) uses '+m);
for(const m of tier1.concat(tier2))ok(!T0[m],'above 75% he does not use '+m);
for(const m of tier2)ok(!T1[m],'above 50% he does not use '+m);
// chains
{const all=[];for(let s=1;s<=60;s++)all.push(run(s+300,.15,12000).log);const has=(L,q)=>{for(let i=0;i+q.length<=L.length;i++)if(q.every((m,j)=>L[i+j]===m))return true;return false};
  ok(all.some(L=>has(L,['kzstomp','kzgcmb'])),'Quake Stomp flows into Demon Combo');
  const one=[];for(let s=1;s<=60;s++)one.push(run(s+500,.6,12000).log);ok(one.some(L=>has(L,['kzdbl','kzrh','kzbutter','kzsfl'])),'Demon Kicks chain fires');}
// the Veil Dancer shares the branch and never uses them
{let bad=0;for(let s=1;s<=10;s++){const A=DuelistAI.create(s,{foe:'veil',kid:'veil',intro:0});A.on=true;A.ph2=true;const D=mkD(500),P=mkP(2.4);let until=0;for(let t=0;t<5000;t++){if(D.act==='attack'&&t>=until)D.act='free';const o=DuelistAI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){D.act='attack';until=t+80;if(/^kz/.test(c.m))bad++}}}ok(bad===0,'the Veil Dancer never uses demon moves')}
console.log(n+' checks')
