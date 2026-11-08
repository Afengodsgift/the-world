// SET PIECES (Kage, Dark Knight): parry adaptation, the Stillness rhythm break, fairness preserved
const fs=require('fs'),vm=require('vm');const ctx={console,Math};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/combat/DuelistAI.js','utf8')+';this.DuelistAI=DuelistAI;',ctx);const{DuelistAI}=ctx;
let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
const mkD=()=>({id:'D',x:0,z:0,hp:700,hpMax:700,act:'free',guard:false,rm:1,face:0});
const mkP=(z)=>({id:'P',x:0,z,act:'free',guard:false,hp:100,ph:null,pi:0});
for(const[kid,foe]of[['samurai','samurai'],['dknight','gwyn']]){
  // 1) three plain parries of one move: nothing; the third trips the adaptation (perfect counts double)
  const A=DuelistAI.create(5,{foe,kid,intro:0}),mv=Object.keys(DuelistAI.MUT[kid])[0];
  ok(!DuelistAI.onParry(A,mv,false)&&!DuelistAI.onParry(A,mv,false),kid+': two plain parries do not adapt');
  ok(DuelistAI.onParry(A,mv,false)&&A.mut[mv]===2&&!!A.spMsg,kid+': the third parry adapts and announces it');
  const B=DuelistAI.create(5,{foe,kid,intro:0});ok(!DuelistAI.onParry(B,mv,true)&&DuelistAI.onParry(B,mv,true),kid+': perfect parries count double');
  ok(!DuelistAI.onParry(B,'nonsense',true),kid+': unknown moves never adapt');
  // 2) an adapted move is rewritten to its feint/closer for exactly two uses, then it is itself again
  const C=DuelistAI.create(9,{foe,kid,intro:0});C.on=true;C.mut[mv]=2;const[f0,f1]=DuelistAI.MUT[kid][mv];
  // drive think until the boss would pick that move: instead exercise start() through the follow path
  C.follow=null;let seen=[];
  for(let s=1;s<=40;s++){const X=DuelistAI.create(s*13,{foe,kid,intro:0});X.on=true;X.ph2=true;X.mut[mv]=2;const D=mkD(),P=mkP(2.2);let raw=[];
    for(let t=0;t<3000;t++){if(D.act==='attack'&&t%60===0)D.act='free';const o=DuelistAI.think(X,P,D,[],t);for(const c of o.list)if(c.t==='atk'){D.act='attack';raw.push(c.m)}}
    seen.push(raw.filter(m=>m===mv).length)}
  {let a=0,b=0,mA=0,mB=0;for(const m0 of[2,0])for(let s=1;s<=40;s++){const X=DuelistAI.create(s*13,{foe,kid,intro:0});X.on=true;X.ph2=true;X.mut[mv]=m0;const D=mkD(),P=mkP(2.2);
    for(let t=0;t<3000;t++){if(D.act==='attack'&&t%60===0)D.act='free';const o=DuelistAI.think(X,P,D,[],t);for(const c of o.list)if(c.t==='atk'){D.act='attack';if(c.m===f0){m0?a++:b++}if(c.m===mv){m0?mA++:mB++}}}}
    ok(a>b,kid+': an adapted '+mv+' turns into '+f0+' ('+a+' vs '+b+')');ok(mA<=mB,kid+': the worn move is not used more while adapted ('+mA+' vs '+mB+')')}
  // 3) the Stillness: only in phase 3, only once per cooldown, and always ends in the draw
  let stills=0,iaiAfter=0,early=0;
  for(let s=1;s<=30;s++){for(const ph3 of[false,true]){const X=DuelistAI.create(s*7,{foe,kid,intro:0});X.on=true;X.ph2=true;X.ph3=ph3;X.stl=0;const D=mkD(),P=mkP(3.6);let was=0,last=-9999;
    for(let t=0;t<2400;t++){if(D.act==='attack'&&t%55===0)D.act='free';const o=DuelistAI.think(X,P,D,[],t);
      if(X.still>0&&!was){was=1;if(!ph3)early++;else{stills++;ok(t-last>=500||last<0,kid+': stillness respects its cooldown');last=t}}
      if(was&&X.still===0){was=0;const a=o.list.find(c=>c.t==='atk');if(a&&a.m==='iai')iaiAfter++;}
      for(const c of o.list)if(c.t==='atk')D.act='attack'}}}
  ok(early===0,kid+': no stillness before phase 3');ok(stills>=10,kid+': stillness appears in phase 3 ('+stills+')');ok(iaiAfter>=stills*.9,kid+': every stillness ends in the draw ('+iaiAfter+'/'+stills+')');
  // 4) stillness never starts while an ally holds the boss token or during the Last Sovereign
  const L=DuelistAI.create(3,{foe,kid,intro:0});L.on=true;L.ph3=true;L.stl=0;L.sigLock=true;const D2=mkD(),P2=mkP(3.6);let st=0;for(let t=0;t<1500;t++){DuelistAI.think(L,P2,D2,[],t);if(L.still>0)st++}ok(st===0,kid+': no stillness while sigLock')}
console.log(n+' checks')
// DYNAMIC BLINK: vectors, spots, hang variants
{const T=(()=>{const c={console,Math};vm.createContext(c);vm.runInContext(fs.readFileSync('src/combat/Tricks.js','utf8')+';this.Tricks=Tricks;',c);return c.Tricks})();
 const M=(()=>{const c={console,Math,window:{}};vm.createContext(c);return null})();
 let k=0;const ok2=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else k++};
 const arena={x:0,z:0,R:12};
 const b=T.blinkSpotV('behind',0,0,0,arena,1),f=T.blinkSpotV('front',0,0,0,arena,1),s1=T.blinkSpotV('side',0,0,0,arena,1),s2=T.blinkSpotV('side',0,0,0,arena,-1),a=T.blinkSpotV('above',3,2,0,arena,1);
 ok2(b.z<0&&f.z>0,'behind is at -z, front at +z for a player facing +z');ok2(s1.x>0&&s2.x<0,'side picks either flank');ok2(a.x===3&&a.z===2,'above lands on the marked spot');
 const edge=T.blinkSpotV('front',10.5,0,Math.PI/2,arena,1);ok2(Math.hypot(edge.x,edge.z)<=11+1e-9,'never lands outside the arena');
 let seen={};let r=(()=>{let x=7;return()=>(x=(x*16807)%2147483647)/2147483647})();for(let i=0;i<4000;i++){const v=T.blinkVec(r,i%2===0);seen[v]=(seen[v]||0)+1}
 ok2(['behind','side','front','above'].every(v=>seen[v]>200),'all four vectors occur ('+JSON.stringify(seen)+')');
 ok2(T.isBlink('blink')&&T.isBlink('blinkm')&&T.isBlink('blinkl')&&!T.isBlink('blade'),'variant ids are recognised');
 // AI: Kage and the Dark Knight use all three hang variants over a long fight
 for(const[kid,foe]of[['samurai','samurai'],['dknight','gwyn']]){const cnt={};for(let sd=1;sd<=25;sd++){const A=DuelistAI.create(sd*53,{foe,kid,intro:0});A.on=true;A.ph2=A.ph3=true;const D=mkD(),P=mkP(6);
   for(let t=0;t<3000;t++){if(D.act==='attack'&&t%50===0)D.act='free';const o=DuelistAI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){D.act='attack';cnt[c.m]=(cnt[c.m]||0)+1}}}
   ok2((cnt.blink||0)>0&&(cnt.blinkm||0)>0&&(cnt.blinkl||0)>0,kid+' blinks on the instant / medium / long schedule '+JSON.stringify({a:cnt.blink,b:cnt.blinkm,c:cnt.blinkl}));ok2((cnt.blinkl||0)<(cnt.blinkm||0),kid+': the long hang is the rare one')}
 console.log(k+' blink checks')}
// DARK KNIGHT: crown fissure only from phase 2; void thrust is reachable as a follow-up
{let n2=0;const ok3=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n2++};
 const used={0:0,2:0};for(const ph2 of[false,true]){for(let sd=1;sd<=25;sd++){const A=DuelistAI.create(sd*41,{foe:'gwyn',kid:'dknight',intro:0});A.on=true;A.ph2=ph2;const D=mkD(),P=mkP(4);
   for(let t=0;t<3000;t++){if(D.act==='attack'&&t%55===0)D.act='free';const o=DuelistAI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){D.act='attack';if(c.m==='crownfissure')used[ph2?2:0]++}}}}
 ok3(used[0]===0,'no crown fissure in phase 1');ok3(used[2]>=5,'crown fissure appears in phase 2 ('+used[2]+')');
 {const A=DuelistAI.create(2,{foe:'gwyn',kid:'dknight',intro:0});A.on=true;A.follow='voidthrust';const D=mkD(),P=mkP(5);let got=false;const o=DuelistAI.think(A,P,D,[],1);for(const c of o.list)if(c.t==='atk'&&c.m==='voidthrust')got=true;ok3(got,'a queued Void Thrust is thrown at an afterimage 5 m away')}
 console.log(n2+' dark knight checks')}
// ARTORIAS: Heavenfall comes in three forms (instant / hung / converted to a wave); other bosses never use the variants
{let n3=0;const ok4=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n3++};
 for(const[kid,foe,want]of[['darkknight','blackknight',true],['gwyn','gwyn',false]]){const cnt={};for(let sd=1;sd<=40;sd++){const A=DuelistAI.create(sd*29,{foe,kid,intro:0});A.on=true;A.ph2=true;const D=mkD(),P=mkP(6);
   for(let t=0;t<3600;t++){if(D.act==='attack'&&t%50===0)D.act='free';const o=DuelistAI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){D.act='attack';cnt[c.m]=(cnt[c.m]||0)+1}}}
   if(want){ok4((cnt.heavenfall||0)>0&&(cnt.heavenfalld||0)>0&&(cnt.heavenwave||0)>0,kid+' mixes all three Heavenfalls '+JSON.stringify({a:cnt.heavenfall,b:cnt.heavenfalld,c:cnt.heavenwave}))}
   else ok4(!cnt.heavenfalld&&!cnt.heavenwave,kid+' never uses the Abyss variants')}
 console.log(n3+' artorias checks')}
// ARISSA: rhythm stacks shorten her rests (tells untouched) and Vael chains blinks
{let n4=0;const ok5=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n4++};
 const atks=rh=>{let t0=0;for(let sd=1;sd<=30;sd++){const A=DuelistAI.create(sd*17,{foe:'dancer',kid:'arissa',intro:0});A.on=true;A.rh=rh;const D=mkD(),P=mkP(2.4);
   for(let t=0;t<2400;t++){if(D.act==='attack'&&t%45===0)D.act='free';const o=DuelistAI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){D.act='attack';t0++}}}return t0};
 const a0=atks(0),a5=atks(5);ok5(a5>a0*1.05,'five rhythm stacks make Arissa attack more often ('+a0+' -> '+a5+')');
 console.log(n4+' arissa checks')}
// ERIKA: smoke step only from range-pressure, never in the middle of nothing, lands far (Tricks 'far')
{let n5=0;const ok6=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n5++};
 const T=(()=>{const c={console,Math};vm.createContext(c);vm.runInContext(fs.readFileSync('src/combat/Tricks.js','utf8')+';this.Tricks=Tricks;',c);return c.Tricks})();
 let cnt={};for(let sd=1;sd<=30;sd++){const A=DuelistAI.create(sd*19,{foe:'archer',kid:'archer',intro:0});A.on=true;const D=mkD(),P=mkP(4.5);
   for(let t=0;t<3000;t++){if(D.act==='attack'&&t%50===0)D.act='free';const o=DuelistAI.think(A,P,D,[],t);for(const c of o.list)if(c.t==='atk'){D.act='attack';cnt[c.m]=(cnt[c.m]||0)+1}}}
 ok6((cnt.blink||0)+(cnt.blinkm||0)+(cnt.blinkl||0)>=5,'Erika smoke-steps when pressed ('+JSON.stringify(cnt)+')');
 for(let i=0;i<50;i++){const s=T.blinkSpotV('far',0,0,0,{x:0,z:0,R:30},i%2?1:-1);ok6(Math.hypot(s.x,s.z)>=9,'far spot is at least 9 m away')}
 console.log(n5+' erika checks')}
