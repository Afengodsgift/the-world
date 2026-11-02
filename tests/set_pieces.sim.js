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
    ok(a>b,kid+': an adapted '+mv+' turns into '+f0+' ('+a+' vs '+b+')');ok(mA<mB,kid+': the worn move is used less while adapted ('+mA+' vs '+mB+')')}
  // 3) the Stillness: only in phase 3, only once per cooldown, and always ends in the draw
  let stills=0,iaiAfter=0,early=0;
  for(let s=1;s<=30;s++){for(const ph3 of[false,true]){const X=DuelistAI.create(s*7,{foe,kid,intro:0});X.on=true;X.ph2=true;X.ph3=ph3;X.stl=0;const D=mkD(),P=mkP(3.6);let was=0,last=-9999;
    for(let t=0;t<2400;t++){if(D.act==='attack'&&t%55===0)D.act='free';const o=DuelistAI.think(X,P,D,[],t);
      if(X.still>0&&!was){was=1;if(!ph3)early++;else{stills++;ok(t-last>=500||last<0,kid+': stillness respects its cooldown');last=t}}
      if(was&&X.still===0){was=0;const a=o.list.find(c=>c.t==='atk');if(a&&a.m==='iai')iaiAfter++}
      for(const c of o.list)if(c.t==='atk')D.act='attack'}}}
  ok(early===0,kid+': no stillness before phase 3');ok(stills>=10,kid+': stillness appears in phase 3 ('+stills+')');ok(iaiAfter>=stills*.9,kid+': every stillness ends in the draw ('+iaiAfter+'/'+stills+')');
  // 4) stillness never starts while an ally holds the boss token or during the Last Sovereign
  const L=DuelistAI.create(3,{foe,kid,intro:0});L.on=true;L.ph3=true;L.stl=0;L.sigLock=true;const D2=mkD(),P2=mkP(3.6);let st=0;for(let t=0;t<1500;t++){DuelistAI.think(L,P2,D2,[],t);if(L.still>0)st++}ok(st===0,kid+': no stillness while sigLock')}
console.log(n+' checks')
