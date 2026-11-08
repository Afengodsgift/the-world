// THE DEEP core: PURE rules and simulation for the deep-sea dive (no THREE, no DOM, no network). You pilot a one-person submersible down a trench basin: an oxygen
// clock, a hull, a battery (lamp, boost, harpoon, sonar), a crush-depth rating, loot (wreck chests, a temple relic, vent crystals, glints), creatures (jellyfish,
// anglerfish) and a giant squid ("the Kraken") guarding the Abyssal Pearl at the bottom. Surface alive and you keep everything; black out and you keep 40%.
// The whole world is DETERMINISTIC from a seed (layout + every creature path), so two divers using the same seed see the same trench with no network sync
// (each diver keeps their own hull / loot / kills). Rendering, input, HUD and sounds live in DeepWorld.js / Deep.js. Run under node for tests/deep.sim.js.
//
// Local frame: metres, seconds. x/z are metres from the dive centre, y = 0 is the top of the dive ("the twilight gate"), deeper is negative. Depth shown to the
// player = 30 - y metres. Heading h: forward = (sin h, cos h); stick x>0 turns right (h decreases). Pitch p>0 = nose up.
const DeepCore=(()=>{
  const R=124,TOP=0,SURF=-3,DEPTH0=30;
  const SUB={vmax:11,vboost:18,rev:.5,acc:3.4,turn:1.25,vv:5.4,vvAcc:3.2,r:2.1,hull:100,o2:300,bat:100,rating:250,ratingStep:42,hitInv:.6,hitStun:.7};
  const HARP={speed:46,range:52,cd:.85,dmg:3,cost:2,r:.9};
  const COST={lamp:.55,boost:9,ping:6,pingT:3.2};
  const AIR={r:7,o2:16,bat:9};
  const VENT={r:8,dmg:4.5};
  const JELLY={hp:2,r:1.8,dmg:7,stun:1.1,value:5};
  const ANG={hp:8,r:2.3,dmg:14,speed:8.6,aggroLamp:36,aggroDark:17,cd:1.7,give:9,value:30};
  const KR={hp:72,r:7.5,aggro:62,tele:1.15,swipe:{reach:24,cone:.9,dmg:20},charge:{speed:15,t:1.3,dmg:26},inkT:4.2,cd:1.9,pearl:800,value:400};
  const smooth=(a,b,x)=>{x=Math.max(0,Math.min(1,(x-a)/(b-a)));return x*x*(3-2*x)};
  const cl=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t,wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a};
  function rng(s){let a=s>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
  // the basin: a bowl with a shelf at the rim, ridges, and a deep centre (the Kraken's pit). Pure function of (x,z): used by the sim AND the mesh
  function floorY(x,z){
    const r=Math.hypot(x,z),bowl=smooth(R*1.02,R*.12,r),pit=smooth(34,0,r);
    let y=-56-248*bowl-70*pit;
    y+=Math.sin(x*.075+z*.04)*7*bowl+Math.cos(z*.09-x*.05)*5*bowl+Math.sin((x+z)*.21)*1.6+Math.cos((x-z)*.17)*1.2;
    y+=22*smooth(R*.9,R*1.1,r);                       // the rim rises into a wall
    return y}
  const depthOf=y=>DEPTH0-y;
  // ---- layout (deterministic from the seed)
  function layout(seed){
    const q=rng(seed*7919+13),L={wrecks:[],vents:[],air:[],glints:[],jelly:[],angler:[],relic:null,bones:null};
    const ang0=q()*6.28;
    for(let i=0;i<3;i++){const a=ang0+i*2.09+(q()-.5)*.5,r=58+q()*28,x=Math.cos(a)*r,z=Math.sin(a)*r;L.wrecks.push({x,z,y:floorY(x,z)+1.2,h:q()*6.28,v:[120,160,210][i],kind:i})}
    {const a=ang0+1+q()*1.2,r=38+q()*10,x=Math.cos(a)*r,z=Math.sin(a)*r;L.relic={x,z,y:floorY(x,z)+2.4,v:360,h:a}}
    for(let i=0;i<5;i++){const a=i*1.26+q()*.5,r=14+q()*22,x=Math.cos(a)*r,z=Math.sin(a)*r;L.vents.push({x,z,y:floorY(x,z),v:45})}
    for(let i=0;i<4;i++){const a=i*1.57+.7+q()*.5,r=40+q()*50,x=Math.cos(a)*r,z=Math.sin(a)*r;L.air.push({x,z,y:floorY(x,z)+10+q()*40})}
    for(let i=0;i<16;i++){const a=q()*6.28,r=20+q()*86,x=Math.cos(a)*r,z=Math.sin(a)*r;L.glints.push({x,z,y:floorY(x,z)+1.4+q()*2,v:14+Math.floor(q()*10)})}
    for(let i=0;i<26;i++){const a=q()*6.28,r=8+q()*104,x=Math.cos(a)*r,z=Math.sin(a)*r,f=floorY(x,z);L.jelly.push({ax:x,az:z,ay:lerp(-20,f+12,q()),rad:3+q()*7,sp:.25+q()*.35,ph:q()*6.28})}
    for(let i=0;i<7;i++){const a=i*.9+q()*.5,r=24+q()*54,x=Math.cos(a)*r,z=Math.sin(a)*r;L.angler.push({ax:x,az:z,ay:Math.min(-130,Math.max(floorY(x,z)+8+q()*18,-330))})}
    {const a=q()*6.28,r=60+q()*16,x=Math.cos(a)*r,z=Math.sin(a)*r;L.bones={x,z,y:floorY(x,z),h:a}}
    L.kraken={x:0,z:0,y:floorY(0,0)+34};return L}
  // ---- a run
  function newRun(o){
    o=o||{};const seed=o.seed|0||1,up=o.up||{},L=layout(seed);
    const run={seed,t:0,state:'dive',L,rnd:rng(seed*131+7),up:{o2:up.o2|0,hull:up.hull|0,bat:up.bat|0,rating:up.rating|0,harp:up.harp|0},
      x:Math.cos(L.relic.h+3.14)*R*.8,z:Math.sin(L.relic.h+3.14)*R*.8,y:-8,h:0,p:0,v:0,vy:0,
      o2:0,o2max:0,hull:0,hullMax:0,bat:0,batMax:0,ratingY:0,lamp:true,stun:0,inv:0,ink:0,cd:0,pingT:0,pings:[],heat:0,press:0,air:0,
      got:{},loot:[],value:0,kills:{jelly:0,angler:0,kraken:0},maxDepth:0,shots:0,hits:0,taken:0,ev:[],proj:[],pend:[],
      jelly:L.jelly.map((j,i)=>({i,dead:0,x:j.ax,y:j.ay,z:j.az,hp:JELLY.hp,cd:0})),
      angler:L.angler.map((a,i)=>({i,dead:0,x:a.ax,y:a.ay,z:a.az,hp:ANG.hp,st:'idle',cd:0,t:0,hy:0,vx:0,vz:0,vy:0,h:0})),
      kraken:{dead:0,hp:KR.hp,x:L.kraken.x+18,y:L.kraken.y,z:L.kraken.z,h:0,st:'lurk',t:0,cd:1.5,tx:0,ty:0,tz:0,dir:0,seen:0,phase:1}};
    run.o2max=run.o2=SUB.o2+run.up.o2*45;run.hullMax=run.hull=SUB.hull+run.up.hull*22;run.batMax=run.bat=SUB.bat+run.up.bat*30;run.ratingY=-(SUB.rating+run.up.rating*SUB.ratingStep);
    run.pickups=[];for(const w of L.wrecks)run.pickups.push({id:'w'+w.kind,k:'chest',x:w.x,y:w.y+1.6,z:w.z,v:w.v});
    run.pickups.push({id:'relic',k:'relic',x:L.relic.x,y:L.relic.y,z:L.relic.z,v:L.relic.v});
    L.vents.forEach((v,i)=>run.pickups.push({id:'c'+i,k:'crystal',x:v.x+3.4,y:v.y+1.2,z:v.z,v:v.v}));
    L.glints.forEach((g,i)=>run.pickups.push({id:'g'+i,k:'coin',x:g.x,y:g.y,z:g.z,v:g.v}));
    return run}
  const ev=(run,e)=>{if(run.ev.length<64)run.ev.push(e)};
  const jellyPos=(L,j,t)=>{const c=L.jelly[j.i];j.x=c.ax+Math.cos(t*c.sp+c.ph)*c.rad;j.z=c.az+Math.sin(t*c.sp*.9+c.ph)*c.rad;j.y=Math.max(c.ay+Math.sin(t*.55+c.ph*2)*6,floorY(j.x,j.z)+3)};
  function hurt(run,d,why,stun){
    if(run.inv>0||run.state!=='dive')return false;run.hull-=d;run.taken+=d;run.inv=SUB.hitInv;if(stun)run.stun=Math.max(run.stun,stun);ev(run,{k:'hurt',d,why});
    if(run.hull<=0){run.hull=0;lose(run,'hull')}return true}
  function lose(run,why){if(run.state!=='dive')return;run.state='lost';run.why=why;ev(run,{k:'lost',why})}
  function surface(run){if(run.state!=='dive')return;run.state='surfaced';ev(run,{k:'surfaced'})}
  function addLoot(run,p){if(run.got[p.id])return;run.got[p.id]=1;run.value+=p.v;run.loot.push({id:p.id,k:p.k,v:p.v});ev(run,{k:'loot',id:p.id,kind:p.k,v:p.v})}
  function fire(run){
    if(run.cd>0||run.bat<HARP.cost||run.stun>.4)return false;run.cd=HARP.cd*(1-.06*run.up.harp);run.bat-=HARP.cost;run.shots++;
    const cp=Math.cos(run.p),dx=Math.sin(run.h)*cp,dz=Math.cos(run.h)*cp,dy=Math.sin(run.p);
    run.proj.push({x:run.x+dx*2.4,y:run.y+dy*2.4,z:run.z+dz*2.4,dx,dy,dz,life:HARP.range/HARP.speed});ev(run,{k:'fire'});return true}
  const harpDmg=run=>HARP.dmg*(1+.2*run.up.harp);
  function sonar(run){
    if(run.bat<COST.ping||run.pingT>1)return false;run.bat-=COST.ping;run.pingT=COST.pingT;
    const a=run.pickups.filter(p=>!run.got[p.id]).map(p=>({id:p.id,k:p.k,v:p.v,d:Math.hypot(p.x-run.x,p.y-run.y,p.z-run.z),b:wrap(Math.atan2(p.x-run.x,p.z-run.z)-run.h),dy:p.y-run.y})).sort((a,b)=>a.d-b.d);
    run.pings=a.slice(0,3);ev(run,{k:'ping'});return true}
  function killC(run,kind,x,y,z,val){run.kills[kind]++;run.value+=val;ev(run,{k:'kill',kind,x,y,z,v:val})}
  function step(run,dt,inp){
    if(run.state!=='dive')return run;inp=inp||{};dt=Math.min(dt,.05);run.t+=dt;
    const stun=run.stun>0,gain=stun?.25:1,ix=cl(inp.ix||0,-1,1)*gain,iy=cl(inp.iy||0,-1,1)*gain;
    run.stun=Math.max(0,run.stun-dt);run.inv=Math.max(0,run.inv-dt);run.cd=Math.max(0,run.cd-dt);run.ink=Math.max(0,run.ink-dt);run.pingT=Math.max(0,run.pingT-dt);
    // ---- the sub
    run.h=wrap(run.h-ix*SUB.turn*dt);
    const boost=!!inp.boost&&run.bat>1&&iy>.2&&!stun,vt=iy>=0?iy*(boost?SUB.vboost:SUB.vmax):iy*SUB.vmax*SUB.rev;
    run.v+=(vt-run.v)*Math.min(1,dt*SUB.acc);
    const vyT=((inp.up?1:0)-(inp.down?1:0))*SUB.vv*gain;run.vy+=(vyT-run.vy)*Math.min(1,dt*SUB.vvAcc);
    run.x+=Math.sin(run.h)*run.v*dt;run.z+=Math.cos(run.h)*run.v*dt;run.y+=run.vy*dt;
    run.p+=(cl(run.vy/SUB.vv*.5,-.5,.5)-run.p)*Math.min(1,dt*3);
    const rr=Math.hypot(run.x,run.z);if(rr>R-4){const k=(R-4)/rr;run.x*=k;run.z*=k;run.v*=.6}
    const fl=floorY(run.x,run.z)+SUB.r+.4;if(run.y<fl){run.y=fl;if(run.vy<0)run.vy=0;if(run.v>SUB.vmax*.8)run.v*=.9}
    if(run.y>SURF){surface(run);return run}
    if(run.y>-14&&run.v<-1){}   // (reversing near the top is fine)
    run.maxDepth=Math.max(run.maxDepth,depthOf(run.y));
    // ---- resources
    run.o2-=dt;if(boost)run.bat-=COST.boost*dt;
    run.lamp=inp.lamp===undefined?run.lamp:!!inp.lamp;if(run.lamp)run.bat-=COST.lamp*dt;
    if(run.bat<=0){run.bat=0;run.lamp=false}
    run.air=0;for(const a of run.L.air){if(Math.hypot(a.x-run.x,a.y-run.y,a.z-run.z)<AIR.r){run.air=1;run.o2=Math.min(run.o2max,run.o2+AIR.o2*dt);run.bat=Math.min(run.batMax,run.bat+AIR.bat*dt)}}
    run.press=0;if(run.y<run.ratingY){run.press=(run.ratingY-run.y)/30;run.hull-=(2.5+run.press*2)*dt;run.taken+=(2.5+run.press*2)*dt;if(run.hull<=0){run.hull=0;lose(run,'crush');return run}}
    run.heat=0;for(const v of run.L.vents){if(run.y<v.y+16&&Math.hypot(v.x-run.x,v.z-run.z)<VENT.r){run.heat=1;run.hull-=VENT.dmg*dt;run.taken+=VENT.dmg*dt;if(run.hull<=0){run.hull=0;lose(run,'heat');return run}}}
    if(run.o2<=0){run.o2=0;lose(run,'o2');return run}
    // ---- gear
    if(inp.fire)fire(run);if(inp.ping)sonar(run);
    // ---- pickups
    for(const p of run.pickups){if(run.got[p.id])continue;if(Math.hypot(p.x-run.x,p.y-run.y,p.z-run.z)<4.6)addLoot(run,p)}
    // ---- harpoons
    for(let i=run.proj.length-1;i>=0;i--){const s=run.proj[i];s.x+=s.dx*HARP.speed*dt;s.y+=s.dy*HARP.speed*dt;s.z+=s.dz*HARP.speed*dt;s.life-=dt;let used=s.life<=0||s.y<floorY(s.x,s.z);
      if(!used){for(const j of run.jelly){if(j.dead)continue;if(Math.hypot(s.x-j.x,s.y-j.y,s.z-j.z)<JELLY.r+HARP.r){j.hp-=harpDmg(run);run.hits++;ev(run,{k:'hit',x:j.x,y:j.y,z:j.z});if(j.hp<=0){j.dead=1;killC(run,'jelly',j.x,j.y,j.z,JELLY.value)}used=true;break}}}
      if(!used){for(const a of run.angler){if(a.dead)continue;if(Math.hypot(s.x-a.x,s.y-a.y,s.z-a.z)<ANG.r+HARP.r){a.hp-=harpDmg(run);run.hits++;a.st=a.st==='idle'?'charge':a.st;a.t=0;ev(run,{k:'hit',x:a.x,y:a.y,z:a.z});if(a.hp<=0){a.dead=1;killC(run,'angler',a.x,a.y,a.z,ANG.value)}used=true;break}}}
      if(!used){const k=run.kraken;if(!k.dead&&Math.hypot(s.x-k.x,s.y-k.y,s.z-k.z)<KR.r+HARP.r){k.hp-=harpDmg(run);run.hits++;k.seen=1;ev(run,{k:'hit',x:s.x,y:s.y,z:s.z,boss:1});
        if(k.hp<=0){k.dead=1;killC(run,'kraken',k.x,k.y,k.z,KR.value);run.pickups.push({id:'pearl',k:'pearl',x:k.x,y:Math.max(k.y-10,floorY(k.x,k.z)+3),z:k.z,v:KR.pearl});ev(run,{k:'krakenDead'})}used=true}}
      if(used)run.proj.splice(i,1)}
    // ---- creatures
    for(const j of run.jelly){if(j.dead)continue;jellyPos(run.L,j,run.t);j.cd=Math.max(0,j.cd-dt);
      if(j.cd<=0&&Math.hypot(j.x-run.x,j.y-run.y,j.z-run.z)<JELLY.r+SUB.r){j.cd=1.2;hurt(run,JELLY.dmg,'jelly',JELLY.stun)}}
    for(const a of run.angler){if(a.dead)continue;a.cd=Math.max(0,a.cd-dt);a.t+=dt;const ca=run.L.angler[a.i],dx=run.x-a.x,dy=run.y-a.y,dz=run.z-a.z,d=Math.hypot(dx,dy,dz);
      const aggro=(run.lamp?ANG.aggroLamp:ANG.aggroDark)*(run.ink>0?.6:1);
      if(a.st==='idle'){a.hy=Math.sin(run.t*.6+a.i)*2;a.x=ca.ax+Math.cos(run.t*.3+a.i)*3;a.z=ca.az+Math.sin(run.t*.3+a.i)*3;a.y=ca.ay+a.hy;if(d<aggro&&run.y<-110){a.st='charge';a.t=0;ev(run,{k:'angler',x:a.x,y:a.y,z:a.z})}}
      else if(a.st==='charge'){const sp=ANG.speed*(d<8?1.15:1);a.x+=dx/d*sp*dt;a.y+=dy/d*sp*dt;a.z+=dz/d*sp*dt;a.h=Math.atan2(dx,dz);
        if(d<SUB.r+ANG.r&&a.cd<=0){if(hurt(run,ANG.dmg,'angler',.35)){}a.cd=ANG.cd;a.st='retreat';a.t=0;ev(run,{k:'bite',x:a.x,y:a.y,z:a.z})}
        else if(a.t>ANG.give||d>aggro*2){a.st='retreat';a.t=0}}
      else{const ax=ca.ax-a.x,ay=ca.ay-a.y,az=ca.az-a.z,ad=Math.hypot(ax,ay,az)||1;a.x+=ax/ad*5*dt;a.y+=ay/ad*5*dt;a.z+=az/ad*5*dt;if(ad<4||a.t>6){a.st='idle';a.t=0}}
      a.y=Math.max(a.y,floorY(a.x,a.z)+2)}
    krakenStep(run,dt);
    return run}
  function krakenStep(run,dt){
    const k=run.kraken;if(k.dead)return;k.t+=dt;k.cd=Math.max(0,k.cd-dt);
    const dx=run.x-k.x,dy=run.y-k.y,dz=run.z-k.z,d=Math.hypot(dx,dy,dz),fy=floorY(k.x,k.z)+10;
    if(k.st==='lurk'){const a=run.t*.18;k.x=Math.cos(a)*20;k.z=Math.sin(a)*20;k.y=run.L.kraken.y+Math.sin(run.t*.4)*4;k.h=Math.atan2(dx,dz);
      if(d<KR.aggro){k.st='idle';k.t=0;k.seen=1;ev(run,{k:'krakenWake'})}}
    else if(k.st==='idle'){k.h=wrap(k.h+wrap(Math.atan2(dx,dz)-k.h)*Math.min(1,dt*2));const hold=d>26?3.4:d<14?-3:0;k.x+=Math.sin(k.h)*hold*dt;k.z+=Math.cos(k.h)*hold*dt;k.y+=(clamp2(run.y,fy,run.L.kraken.y+30)-k.y)*Math.min(1,dt*.8);
      if(d>KR.aggro*1.6){k.st='lurk';k.t=0}
      else if(k.cd<=0){const hp=k.hp/KR.hp,r=run.rnd();k.phase=hp<.55?2:1;
        if(k.phase===2&&r<.3){k.st='ink';k.t=0;ev(run,{k:'krakenInk'})}
        else if(r<.62&&d<KR.swipe.reach+8){k.st='teleS';k.t=0;ev(run,{k:'krakenTele',a:'swipe'})}
        else{k.st='teleC';k.t=0;k.tx=run.x;k.ty=run.y;k.tz=run.z;ev(run,{k:'krakenTele',a:'charge'})}}}
    else if(k.st==='ink'){if(k.t<.5)run.ink=Math.max(run.ink,KR.inkT);if(k.t>1.1){k.st='idle';k.t=0;k.cd=KR.cd}}
    else if(k.st==='teleS'){k.h=wrap(k.h+wrap(Math.atan2(dx,dz)-k.h)*Math.min(1,dt*3));if(k.t>=KR.tele){const ang=Math.abs(wrap(Math.atan2(dx,dz)-k.h));
        if(d<KR.swipe.reach+SUB.r&&ang<KR.swipe.cone){hurt(run,KR.swipe.dmg,'kraken',.9);run.v=-6}ev(run,{k:'krakenSwipe'});k.st='idle';k.t=0;k.cd=KR.cd}}
    else if(k.st==='teleC'){k.h=Math.atan2(k.tx-k.x,k.tz-k.z);if(k.t>=KR.tele){k.st='charge';k.t=0;const l=Math.hypot(k.tx-k.x,k.ty-k.y,k.tz-k.z)||1;k.dx=(k.tx-k.x)/l;k.dy=(k.ty-k.y)/l;k.dz=(k.tz-k.z)/l}}
    else if(k.st==='charge'){k.x+=k.dx*KR.charge.speed*dt;k.y+=k.dy*KR.charge.speed*dt;k.z+=k.dz*KR.charge.speed*dt;const rr=Math.hypot(k.x,k.z);if(rr>R-14){const s=(R-14)/rr;k.x*=s;k.z*=s}k.y=Math.max(k.y,floorY(k.x,k.z)+8);
      if(Math.hypot(run.x-k.x,run.y-k.y,run.z-k.z)<KR.r+SUB.r){hurt(run,KR.charge.dmg,'kraken',1);k.st='idle';k.t=0;k.cd=KR.cd+.6}else if(k.t>KR.charge.t){k.st='idle';k.t=0;k.cd=KR.cd}}
  }
  const clamp2=(v,a,b)=>v<a?a:v>b?b:v;
  function payout(run){
    const dep=Math.max(0,run.maxDepth-60)*.35,total=run.value+dep,k=run.state==='surfaced'?1:run.state==='lost'?.4:0;
    return{coins:Math.round(total*k),total:Math.round(total),kept:k,depth:Math.round(run.maxDepth),loot:run.loot.length,kills:run.kills}}
  // sub shop: level costs (coins), all permanent
  const UPG=[{k:'hull',n:'Reinforced hull',d:'+22 hull per level',base:140},{k:'o2',n:'Oxygen tank',d:'+45 s of air per level',base:120},{k:'bat',n:'Battery bank',d:'+30 battery per level',base:110},
    {k:'rating',n:'Depth rating',d:'+42 m crush depth per level',base:200},{k:'harp',n:'Harpoon gun',d:'+20% damage, faster reload per level',base:160}],MAXL=5;
  const upCost=(k,l)=>{const u=UPG.find(x=>x.k===k);return u?Math.round(u.base*Math.pow(1.7,l)):0};
  const objective=run=>{const left=run.pickups.filter(p=>!run.got[p.id]);const k=run.kraken;
    return k.dead?(run.got.pearl?'Pearl taken. Head for the surface.':'The Kraken is dead. Take the Abyssal Pearl.'):run.y>run.ratingY&&run.t<12?'Dive down. Gold glints mark loot.':left.length?'Loot left: '+left.length+(k.seen?' · The Kraken is awake':''):'All loot taken. The Kraken still guards the Pearl.'};
  const API={R,TOP,SURF,SUB,HARP,COST,AIR,VENT,JELLY,ANG,KR,UPG,MAXL,floorY,depthOf,layout,newRun,step,fire,sonar,hurt,surface,lose,payout,upCost,objective,jellyPos,harpDmg,rng};
  if(typeof module!=='undefined')module.exports=API;
  return API;
})();
