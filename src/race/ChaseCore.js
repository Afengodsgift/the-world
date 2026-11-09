// COPS & ROBBERS rules + AI driver. Pure module (no THREE, no DOM, no net): node-testable (tests/chase.sim.js).
// One ROBBER and one COP drive hover-cars across the whole world (CarPhysics, skimming land AND sea). The robber grabs the LOOT, then must reach the
// GETAWAY before the clock runs out; the cop wins by BUSTING (staying close until the bust meter fills). The car physics is NOT here: the controller
// owns the cars and tells the core where they are; the core answers with phase, meter, slowdowns and events. The AI produces the same input object a
// human does ({thr,steer,brake,hand,boost}) so a bot and a player are interchangeable on either side.
const ChaseCore=(()=>{
  const CH={
    T:90,                  // round clock (s) once the lights go green
    CD:3,                  // countdown (s)
    LOOT_R:15,GET_R:17,    // pickup radius of the loot / the getaway (m)
    BUST_R:24,BUST_T:3.1,  // cop must stay within BUST_R for about BUST_T seconds (the meter drains at BUST_DECAY when you break away)
    BUST_DECAY:.55,CLOSE_BONUS:.5,
    CARRY:.95,             // the robber's pace while he holds the loot
    CATCH:.09,CATCH_D0:60,CATCH_D1:360, // the cop's catch-up pace bonus (up to +9%) when he is far behind: pursuits close, they do not stall
    HEAD:260,              // the cop starts this far from the loot (m), toward the getaway
    SLICK:{n:2,life:9,r:7,slow:.42,t:1.7},   // oil: the robber drops up to n; the cop slows to `slow` for `t` seconds when he drives over one
    RAM:{r:8.5,cd:4.5,t:1.3,slow:.55,bust:.28},  // the cop's shoulder charge (needs boost active): slows the robber, adds meter
    REGEN:11,              // seconds for a spent boost charge to come back
    HINT_T:2.5,            // the cop's radar refreshes this often while the robber runs EMPTY; once the loot is taken it is live
    ptsRob:100,ptsCop:80,ptsDraw:30,
  };
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  function rng(s){let a=s>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

  // spots: [{x,z}] candidate points on dry land (the controller scans the terrain). Deterministic from the seed so both phones agree with no handshake.
  function layout(seed,spots){
    const q=rng(seed*2654435761+17),n=spots.length;if(n<3)return null;
    let best=null;
    for(let tries=0;tries<80;tries++){
      const A=spots[(q()*n)|0],B=spots[(q()*n)|0],G=spots[(q()*n)|0];
      const ab=dist(A,B),bg=dist(B,G),ag=dist(A,G);
      const relax=tries/80;     // very sparse maps: accept anything distinct eventually
      if(ab<300*(1-relax)||ab>1000+relax*2000||bg<500*(1-relax)||bg>1500+relax*2500||ag<260*(1-relax))continue;
      best={A:{x:A.x,z:A.z},B:{x:B.x,z:B.z},G:{x:G.x,z:G.z}};break;
    }
    if(!best){const A=spots[0],B=spots[1%n],G=spots[2%n];best={A:{x:A.x,z:A.z},B:{x:B.x,z:B.z},G:{x:G.x,z:G.z}}}
    // the cop starts HEAD m from the loot, on the side toward the getaway: he is already between the robber and the prize, so the grab is contested
    let dx=best.G.x-best.B.x,dz=best.G.z-best.B.z;const d=Math.hypot(dx,dz)||1;dx/=d;dz/=d;
    best.C={x:best.B.x+dx*CH.HEAD,z:best.B.z+dz*CH.HEAD};
    best.hRob=Math.atan2(best.B.x-best.A.x,best.B.z-best.A.z);
    best.hCop=Math.atan2(best.B.x-best.C.x,best.B.z-best.C.z);
    return best;
  }

  function newRound(o){
    const L=o.L||layout(o.seed||1,o.spots);
    return {seed:o.seed|0,L,role:o.role||'rob',phase:'count',cd:CH.CD,t:0,left:CH.T,carry:false,bust:0,
      slicks:[],slicksLeft:CH.SLICK.n,ramCd:0,robT:0,robMul:1,copT:0,copMul:1,hintT:0,hint:null,
      robRt:0,copRt:0,robPace:1,copPace:1,ev:[],result:null,pts:{rob:0,cop:0},minD:1e9,uid:1};
  }
  const emit=(r,k,x)=>{r.ev.push(Object.assign({k},x||null))};

  // the robber's current goal (what the arrow points at)
  function goal(r){return r.carry?r.L.G:r.L.B}

  // act: {slick:bool (robber), dash:bool (the cop is boosting this tick)}. rob/cop: {x,z,vx,vz}.
  function step(r,dt,rob,cop,act){
    r.ev.length=0;if(r.phase==='over')return r;
    act=act||{};
    if(r.phase==='count'){r.cd-=dt;if(r.cd<=0){r.phase='grab';r.cd=0;emit(r,'go')}else{const s=Math.ceil(r.cd);if(s!==r._cs){r._cs=s;emit(r,'tick',{n:s})}}return r}
    r.t+=dt;r.left=Math.max(0,CH.T-r.t);
    if(r.robT>0){r.robT-=dt;if(r.robT<=0)r.robMul=1}
    if(r.copT>0){r.copT-=dt;if(r.copT<=0)r.copMul=1}
    if(r.ramCd>0)r.ramCd-=dt;
    for(let i=r.slicks.length-1;i>=0;i--){r.slicks[i].life-=dt;if(r.slicks[i].life<=0)r.slicks.splice(i,1)}
    const d=dist(rob,cop);if(d<r.minD)r.minD=d;
    r.copPace=1+CH.CATCH*clamp((d-CH.CATCH_D0)/(CH.CATCH_D1-CH.CATCH_D0),0,1);r.robPace=r.carry?CH.CARRY:1;
    // ---- loot / getaway ----
    if(r.phase==='grab'&&dist(rob,r.L.B)<=CH.LOOT_R){r.phase='run';r.carry=true;emit(r,'loot')}
    if(r.phase==='run'&&dist(rob,r.L.G)<=CH.GET_R){r.phase='over';r.result='escape';r.pts.rob=CH.ptsRob+Math.round(r.left*2);r.pts.cop=0;emit(r,'escape');return r}
    // ---- oil ----
    if(act.slick&&r.slicksLeft>0){r.slicksLeft--;r.slicks.push({id:r.uid++,x:rob.x-(rob.vx||0)*.12,z:rob.z-(rob.vz||0)*.12,life:CH.SLICK.life});emit(r,'slick')}
    for(let i=0;i<r.slicks.length;i++){const s=r.slicks[i];
      if(Math.hypot(cop.x-s.x,cop.z-s.z)<CH.SLICK.r){r.copMul=CH.SLICK.slow;r.copT=CH.SLICK.t;r.slicks.splice(i,1);emit(r,'spin',{x:s.x,z:s.z});break}}
    // ---- shoulder charge ----
    if(act.dash&&r.ramCd<=0&&d<CH.RAM.r){r.ramCd=CH.RAM.cd;r.robMul=CH.RAM.slow;r.robT=CH.RAM.t;r.bust=Math.min(1,r.bust+CH.RAM.bust);emit(r,'ram')}
    // ---- bust meter: faster when you are right on him ----
    if(d<=CH.BUST_R){r.bust+=dt/CH.BUST_T*(1+CH.CLOSE_BONUS*(1-d/CH.BUST_R))}else r.bust-=dt*CH.BUST_DECAY/CH.BUST_T*3;
    r.bust=clamp(r.bust,0,1);
    if(r.bust>=1){r.phase='over';r.result='bust';r.pts.cop=CH.ptsCop+Math.round(r.left*1.5);r.pts.rob=r.carry?12:0;emit(r,'bust');return r}
    // ---- the cop's radar: stale while the robber is empty-handed, live once he holds the loot ----
    r.hintT-=dt;if(r.hintT<=0||r.carry){r.hintT=CH.HINT_T;r.hint={x:rob.x,z:rob.z}}
    // ---- the clock ----
    if(r.left<=0){r.phase='over';r.result='time';r.pts.rob=r.carry?CH.ptsDraw*2:CH.ptsDraw;r.pts.cop=CH.ptsDraw;emit(r,'time')}
    return r;
  }

  // a spent boost charge comes back after REGEN seconds (cars have 3-4). st: {rt}. Returns true on a refill.
  function regen(car,st,dt,max){
    max=max||car.p.charges;if(car.charges>=max){st.rt=0;return false}
    st.rt+=dt;if(st.rt>=CH.REGEN){st.rt=0;car.charges++;return true}return false;
  }

  // ---------------------------------------------------------------- AI driver ----------------------------------------------------------------
  const SKILL={rookie:{thr:.86,err:.22,react:.35,boost:.5,aim:.8},steady:{thr:.96,err:.1,react:.18,boost:.8,aim:1},expert:{thr:1,err:.03,react:.08,boost:1,aim:1.15}};
  const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a};
  function newBot(skill,seed){return {sk:SKILL[skill]||SKILL.steady,q:rng((seed|0)*97+5),stuck:0,rev:0,revS:1,bt:0,sl:0,wob:0,wobT:0,lastS:[]}}

  // car: a CarPhysics car. role 'rob'|'cop'. other: {x,z,vx,vz} (the opposing car). env.ground for terrain probing (cliffs / peaks).
  function drive(bot,car,role,r,other,env,dt){
    const sk=bot.sk,inp={thr:sk.thr,steer:0,brake:false,hand:false,boost:false};
    if(r.phase==='count')return {thr:0,steer:0,brake:true,hand:false,boost:false};
    // reverse out of a jam
    if(bot.rev>0){bot.rev-=dt;inp.thr=-1;inp.steer=bot.revS;return inp}
    const sp=Math.hypot(car.vx,car.vz);
    if(sp<2.5&&r.phase!=='over'){bot.stuck+=dt;if(bot.stuck>.9){bot.stuck=0;bot.rev=.8;bot.revS=bot.q()<.5?-1:1}}else bot.stuck=0;
    let tx,tz;
    if(role==='cop'){
      // intercept: aim where the robber will be, a little ahead (lead grows with distance, capped); the radar is stale until the loot is taken
      const tgt=r.carry||!r.hint?{x:other.x,z:other.z,vx:other.vx||0,vz:other.vz||0}:{x:r.hint.x,z:r.hint.z,vx:0,vz:0};
      const dd=Math.hypot(tgt.x-car.x,tgt.z-car.z),lead=clamp(dd/Math.max(sp,25),0,2.2)*sk.aim;
      tx=tgt.x+(tgt.vx||0)*lead;tz=tgt.z+(tgt.vz||0)*lead;
    }else{
      const g=goal(r);tx=g.x;tz=g.z;
      // run for the goal, bending away from the cop when he is close
      const dx=other.x-car.x,dz=other.z-car.z,dc=Math.hypot(dx,dz),gx=tx-car.x,gz=tz-car.z,gd=Math.hypot(gx,gz)||1;
      if(dc<170&&gd>40){const k=clamp((170-dc)/170,0,1)*1.15,ax=-dx/(dc||1),az=-dz/(dc||1);tx=car.x+(gx/gd+ax*k)*300;tz=car.z+(gz/gd+az*k)*300}
    }
    let want=Math.atan2(tx-car.x,tz-car.z);
    // terrain probes: a peak / cliff ahead pushes the heading toward the freer side
    if(env&&env.ground&&sp>6){
      const look=clamp(sp*.9,14,48),rise=a=>env.ground(car.x+Math.sin(a)*look,car.z+Math.cos(a)*look,car.y+3)-car.y;
      const f=rise(car.h);
      if(f>2.2){const l=rise(car.h-.7),rr=rise(car.h+.7);want=car.h+(l<rr?-1:1)*clamp(f/4,.5,1.3)}
    }
    // human-ish wobble so bots do not move on rails
    bot.wobT-=dt;if(bot.wobT<=0){bot.wobT=.4+bot.q()*.8;bot.wob=(bot.q()-.5)*2*sk.err}
    const er=wrap(want+bot.wob-car.h);
    inp.steer=clamp(er*2.6,-1,1);
    const ae=Math.abs(er);
    if(ae>1.1&&sp>22){inp.brake=true;inp.thr=.2}else if(ae>.7&&sp>34)inp.thr=.5;
    if(ae>.5&&ae<1.3&&sp>30&&role==='rob')inp.hand=false;
    // boost: robber when the cop is within reach, or in a straight run; cop when he is closing in aligned
    bot.bt-=dt;
    if(bot.bt<=0&&car.charges>0&&ae<.25){
      const dc=Math.hypot(other.x-car.x,other.z-car.z);
      const use=role==='rob'?(dc<80||(r.carry&&Math.hypot(tx-car.x,tz-car.z)>500&&bot.q()<.02*sk.boost)):(dc<150&&dc>12&&bot.q()<.35*sk.boost);
      if(use){inp.boost=true;bot.bt=1.2+bot.q()}
    }
    return inp;
  }
  // should the robber bot drop oil now? (cop close behind him)
  function dropOil(bot,car,r,cop){
    if(r.slicksLeft<=0||r.phase==='count'||r.phase==='over')return false;
    const dx=cop.x-car.x,dz=cop.z-car.z,d=Math.hypot(dx,dz),back=-(dx*Math.sin(car.h)+dz*Math.cos(car.h))/(d||1);   // <0: cop is behind
    bot.sl-=0;if(d<42&&d>10&&back<-.3&&bot.q()<.12)return true;return false;
  }
  // should the cop bot ram (dash with a boost active)?
  const wantsDash=(car,r,rob)=>car.boostT>0&&Math.hypot(rob.x-car.x,rob.z-car.z)<CH.RAM.r+1;

  const API={CH,rng,layout,newRound,step,goal,regen,newBot,drive,dropOil,wantsDash,SKILL,dist};
  if(typeof module!=='undefined')module.exports=API;
  return API;
})();
