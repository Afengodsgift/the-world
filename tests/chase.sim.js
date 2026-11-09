// COPS & ROBBERS core (src/race/ChaseCore.js): layout determinism, loot/getaway/bust/slick/ram rules, and full AI-vs-AI rounds on the real car physics.
// Pure module. Run: node tests/chase.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const ctx={Math,Object,Number,JSON,Array,isFinite};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(R+'src/data/rally.js','utf8')+fs.readFileSync(R+'src/race/CarPhysics.js','utf8')+';this.CP=CarPhysics;',ctx);
const CP=ctx.CP,C=require('../src/race/ChaseCore.js');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const DT=1/30,flat={ground:()=>0};
const SPOTS=[];for(let i=0;i<14;i++){const a=i/14*6.283,r=300+(i%3)*350;SPOTS.push({x:Math.cos(a)*r,z:Math.sin(a)*r})}
// ---------- layout ----------
{
  const A=C.layout(7,SPOTS),B=C.layout(7,SPOTS),D=C.layout(8,SPOTS);
  ok(JSON.stringify(A)===JSON.stringify(B),'layout is deterministic from the seed');
  ok(JSON.stringify(A)!==JSON.stringify(D),'another seed gives another heist');
  let good=0;for(let s=1;s<=60;s++){const L=C.layout(s,SPOTS),ab=C.dist(L.A,L.B),bg=C.dist(L.B,L.G);if(ab>=300&&bg>=500&&ab<=1000&&bg<=1500)good++}
  ok(good>=55,'distances are in the designed band ('+good+'/60)');
  const L=C.layout(3,SPOTS);ok(Math.abs(C.dist(L.B,L.C)-C.CH.HEAD)<1e-6,'cop starts HEAD m from the loot');
  ok(C.layout(1,[{x:0,z:0}])===null,'too few spots gives null');
  const two=C.layout(1,SPOTS.slice(0,3));ok(two&&two.A&&two.B&&two.G,'minimal map still gives a heist');
}
// ---------- rules ----------
const P=(x,z)=>({x,z,vx:0,vz:0});
function fresh(){const L={A:{x:0,z:0},B:{x:500,z:0},G:{x:0,z:900},C:{x:-230,z:0},hRob:1,hCop:1};const r=C.newRound({seed:1,L});r.phase='grab';r.cd=0;return r}
{
  const r=C.newRound({seed:1,spots:SPOTS});ok(r.phase==='count'&&r.cd===3,'a round opens with a countdown');
  let go=false;for(let i=0;i<100&&r.phase==='count';i++){C.step(r,DT,P(0,0),P(100,0));if(r.ev.some(e=>e.k==='go'))go=true}ok(go&&r.phase==='grab','countdown ends in GO');
}
{
  const r=fresh();C.step(r,DT,P(100,0),P(-200,0));ok(r.phase==='grab'&&!r.carry,'far from the loot: nothing happens');
  C.step(r,DT,P(490,0),P(-200,0));ok(r.phase==='run'&&r.carry,'driving through the loot picks it up');
  ok(C.goal(r)===r.L.G,'after the grab the goal is the getaway');
  C.step(r,DT,P(5,890),P(-200,0));ok(r.phase==='over'&&r.result==='escape'&&r.pts.rob>=100&&r.pts.cop===0,'reaching the getaway wins the round');
  const q=fresh();C.step(q,DT,P(5,890),P(-200,0));ok(q.phase==='grab','the getaway does nothing before the loot is taken');
}
{
  const r=fresh();let t=0;while(r.phase!=='over'&&t<20){C.step(r,DT,P(100,0),P(110,0));t+=DT}
  ok(r.result==='bust'&&t>2.2&&t<3.4,'a cop glued to the robber busts him in about '+t.toFixed(1)+' s');
  ok(r.pts.cop>=80&&r.pts.rob===0,'bust scores for the cop');
  const q=fresh();for(let i=0;i<60;i++)C.step(q,DT,P(100,0),P(115,0));const m1=q.bust;for(let i=0;i<60;i++)C.step(q,DT,P(100,0),P(300,0));
  ok(m1>.3&&q.bust<m1,'the meter drains when the robber breaks away');
  const w=fresh();for(let i=0;i<400;i++)C.step(w,DT,P(100,0),P(100+C.CH.BUST_R+8,0));ok(w.phase==='grab'&&w.bust===0,'just outside the bust radius never fills it');
}
{
  const r=fresh();r.t=C.CH.T-.01;C.step(r,.05,P(100,0),P(400,0));ok(r.result==='time'&&r.pts.rob===C.CH.ptsDraw,'time out: both get the draw points');
  const q=fresh();q.carry=true;q.phase='run';q.t=C.CH.T-.01;C.step(q,.05,P(100,0),P(400,0));ok(q.pts.rob>C.CH.ptsDraw,'time out while holding the loot pays the robber more');
}
{
  const r=fresh();C.step(r,DT,P(100,0),P(300,0),{slick:true});ok(r.slicks.length===1&&r.slicksLeft===C.CH.SLICK.n-1,'robber drops oil');
  const s=r.slicks[0];C.step(r,DT,P(100,0),P(s.x,s.z));ok(r.copMul<1&&r.copT>0&&r.slicks.length===0,'cop driving over oil is slowed and the oil is used up');
  for(let i=0;i<3;i++)C.step(r,DT,P(100,0),P(300,0),{slick:true});ok(r.slicksLeft===0&&r.slicks.length<=2,'oil is limited');
  const t=fresh();t.slicks.push({id:9,x:0,z:0,life:.05});C.step(t,.1,P(300,0),P(-300,0));ok(t.slicks.length===0,'old oil dries up');
}
{
  const r=fresh();C.step(r,DT,P(100,0),P(105,0),{dash:true});ok(r.robMul<1&&r.robT>0&&r.bust>=C.CH.RAM.bust,'a dash into the robber slows him and spikes the meter');
  const b=r.bust;C.step(r,DT,P(100,0),P(105,0),{dash:true});ok(r.ev.every(e=>e.k!=='ram'),'the ram has a cooldown');
  const q=fresh();C.step(q,DT,P(100,0),P(160,0),{dash:true});ok(q.robMul===1,'a dash from far away does nothing');
}
{
  const car=CP.newCar(0,0,0,'ace',flat),st={rt:0};car.charges=0;let n=0;for(let i=0;i<30*40;i++)if(C.regen(car,st,DT,3))n++;ok(n===3&&car.charges===3,'boost charges regenerate one by one up to the max');
}
// ---------- full AI-vs-AI rounds on the real physics ----------
function arena(seed,rob,cop,diffR,diffC,opt){
  opt=opt||{};
  const r=C.newRound({seed,spots:SPOTS,role:'rob'}),L=r.L;
  const a=CP.newCar(L.A.x,L.A.z,L.hRob,rob,flat),b=CP.newCar(L.C.x,L.C.z,L.hCop,cop,flat);
  const ba=C.newBot(diffR,seed),bb=C.newBot(diffC,seed+1),sa={rt:0},sb={rt:0};
  let t=0,steps=0;
  while(r.phase!=='over'&&steps<30*140){
    const ia=C.drive(ba,a,'rob',r,b,flat,DT),ib=C.drive(bb,b,'cop',r,a,flat,DT);
    a.hitT=r.robT;a.hitSlow=r.robMul;a.pace=r.robPace;b.hitT=r.copT;b.hitSlow=r.copMul;b.pace=r.copPace;
    if(r.phase!=='count'){CP.step(a,ia,DT,flat);CP.step(b,ib,DT,flat);CP.collide(a,b)}
    C.regen(a,sa,DT);C.regen(b,sb,DT);
    C.step(r,DT,a,b,{slick:C.dropOil(ba,a,r,b),dash:C.wantsDash(b,r,a)});steps++;
  }
  return {r,a,b,steps};
}
{
  const o=arena(11,'comet','ace','steady','steady');
  ok(o.r.phase==='over'&&o.r.result,'an AI round always ends ('+o.r.result+' in '+o.r.t.toFixed(1)+' s)');
  let nan=false;for(const k of ['x','y','z','h','vx','vz'])if(!Number.isFinite(o.a[k])||!Number.isFinite(o.b[k]))nan=true;ok(!nan,'no NaN in the physics');
}
function tally(rob,cop,dr,dc,N){const res={escape:0,bust:0,time:0};let tt=0;for(let s=1;s<=N;s++){const o=arena(s,rob,cop,dr,dc);res[o.r.result||'time']++;tt+=o.r.t}return Object.assign(res,{avg:tt/N})}
{
  const T=tally('ace','ace','steady','steady',40);
  console.log('     steady ace vs steady ace:',JSON.stringify(T));
  ok(T.escape>=5&&T.bust>=5,'a fair fight: neither side wins every time (escapes '+T.escape+', busts '+T.bust+')');
  ok(T.avg>20&&T.avg<80,'rounds are short ('+T.avg.toFixed(0)+' s average)');
  const rk=tally('ace','ace','rookie','expert',20);console.log('     rookie robber vs expert cop:',JSON.stringify(rk));ok(rk.bust>=rk.escape,'an expert cop beats a rookie robber more often than not');
  const ex=tally('ace','ace','expert','rookie',20);console.log('     expert robber vs rookie cop:',JSON.stringify(ex));ok(ex.escape>=ex.bust,'an expert robber beats a rookie cop more often than not');
}
// determinism
{const a=arena(5,'ace','ace','steady','steady'),b=arena(5,'ace','ace','steady','steady');ok(a.r.result===b.r.result&&Math.abs(a.r.t-b.r.t)<1e-9&&a.a.x===b.a.x,'a round is fully deterministic')}
console.log(fails?'\n'+fails+' FAILED':'\nall chase tests passed');process.exit(fails?1:0);
