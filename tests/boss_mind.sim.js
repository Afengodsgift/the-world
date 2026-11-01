// BOSS COMBAT STANDARD: bosses read repeated habits, but never every time, never twice in a row, and forget once they have answered
const fs=require('fs'),vm=require('vm');const ctx={console,Math};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/combat/DuelistAI.js','utf8')+';this.DuelistAI=DuelistAI;',ctx);const{DuelistAI}=ctx;
let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
const mkD=()=>({id:'D',x:0,z:0,hp:700,hpMax:700,act:'free',guard:false,rm:1,face:0});
const mkP=(z,o)=>Object.assign({id:'P',x:0,z,act:'free',guard:false,hp:100,ph:null,pi:0},o||{});
// a player who dodges backwards over and over; returns what the boss did, tick by tick
function run(kid,foe,seed,pat,ticks){const A=DuelistAI.create(seed,{foe,kid,intro:1});A.on=true;const D=mkD(),P=mkP(3.4),reads=[],moves=[];let z=3.4;
  for(let t=0;t<ticks;t++){const ph=t%80;   // 80-tick cycle: stand 60, dodge 14 (moving away/in/sideways), stand
    if(pat==='back'){P.act=ph>=60&&ph<74?'dodge':'free';if(ph===60)z=3.4;if(ph>=60&&ph<74)z+=.12}
    else if(pat==='side'){P.act=ph>=60&&ph<74?'dodge':'free'}
    else if(pat==='none')P.act='free';
    P.z=z;const o=DuelistAI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){moves.push([t,c.m]);D.act='free'}
    if(A.readMsg){reads.push([t,A.readMsg]);A.readMsg=null}}
  return{reads,moves}}
for(const[kid,foe]of[['samurai','samurai'],['dknight','gwyn'],['darkknight','blackknight'],['gwyn','gwyn'],['gdn','gdn']]){
  let seen=0,any=0;for(let s=1;s<=8;s++){const r=run(kid,foe,s*977,'back',4000);if(r.reads.length)any++;seen+=r.reads.filter(x=>x[1]==='back').length;
    for(let i=1;i<r.reads.length;i++)ok(r.reads[i][0]-r.reads[i-1][0]>=280,kid+': reads are spaced >=280 ticks apart (room to experiment)')}
  ok(any>=5,kid+' reads a repeated back-dodge in most runs ('+any+'/8)');
  const r=run(kid,foe,12345,'back',4000);ok(r.reads.length<=Math.floor(4000/280),kid+' does not read every time');
  const q=run(kid,foe,12345,'none',4000);ok(q.reads.length===0,kid+' reads nothing from a player with no habits')}
{const A=DuelistAI.create(1,{foe:'samurai',kid:'samurai',intro:1});ok(DuelistAI.MIND.samurai.back[0]==='blink'&&DuelistAI.MIND.samurai.back[1]==='iai','Kage answers a back-dodge with a gap-closing draw');
 ok(Object.keys(DuelistAI.MIND).length>=6,'six bosses have a mind')}
console.log(n+' checks')
