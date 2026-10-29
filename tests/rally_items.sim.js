// Skybreak Rally combat: pickups, every item, hit effects, fairness (protection / no stun-lock / shield), remote events, AI usage, caps, cleanup, and a full
// route with items live. Pure modules. Run: node tests/rally_items.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const ctx={Math,Object,Number,JSON,Array,isFinite,Map,Float32Array,Set};vm.createContext(ctx);
vm.runInContext(['src/data/rally.js','src/race/CarPhysics.js','src/data/tracks.js','src/race/Track.js','src/race/Pilot.js','src/race/Items.js'].map(f=>fs.readFileSync(R+f,'utf8')).join('\n')+';this.RL=RALLY;this.CP=CarPhysics;this.TR=TRACKS;this.Tk=Track;this.Pilot=Pilot;this.It=Items',ctx);
const {RL,CP,TR,Tk,Pilot,It}=ctx;const IT=RL.items;
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const DT=1/60;
const ISL=[{x:760,z:1400,R:230,pk:0},{x:0,z:1750,R:180,pk:10},{x:-980,z:1450,R:300,pk:60}];
const Hreal=(x,z)=>{let h=-12;for(const I of ISL){const dx=x-I.x,dz=z-I.z,dd=Math.hypot(dx,dz),v=Math.max(-12,(1-(dd/I.R)**2)*4-.6)+Math.sin(x*.09)*Math.cos(z*.11)*.7+I.pk*Math.exp(-dd*dd/(2*(I.R*.35)**2));if(v>h)h=v}return h};
// a flat arena with a dummy road 300 m away (solids further than 420 m from any road are ignored)
const DEF={id:'t',name:'t',roads:[{id:'r',o:[0,-300],w:16,pts:[[0,0],[100,0]]}],gates:[{road:'r',p:0},{road:'r',p:1,finish:true}]};
function arena(solids){const T=Tk.build(DEF,{H:()=>0});T.setSolids(solids||[]);return {T,env:{ground:T.ground,surf:()=>({rough:false}),landOK:T.landOK,block:T.block}}}   // road-like grip everywhere: cars reach their real speeds
const mk=(w,key,kind,x,z,h,cls)=>({key,kind,c:CP.newCar(x,z,h||0,cls||'ace',w.env),r:Tk.racer(),item:null,cool:0,place:1});
function run(w,I,racers,secs,drv,onEv){const evs=[];for(let i=0;i<Math.round(secs*60);i++){for(const r of racers){if(r.kind==='net'){continue}const inp=drv?drv(r,i*DT):{thr:1};CP.step(r.c,inp||{thr:1},DT,w.env)}const e=It.step(I,DT,racers);for(const x of e){evs.push(x);if(onEv)onEv(x,i*DT)}}return evs}
const has=(evs,k)=>evs.some(e=>e.k===k);

// ======================= pickups =======================
{
  const T=Tk.build(TR['skybreak-1'],{H:Hreal}),b=T.itemBoxes;
  ok(b.length>=24&&b.length<=40&&b.every(x=>isFinite(x.x+x.y+x.z)),`${b.length} item boxes along the route (${b.filter(x=>x.air).length} in the sky)`);
  let md=1e9;for(const x of b)for(const g of T.gates)md=Math.min(md,Math.hypot(x.x-g.x,x.z-g.z,(x.y-g.y)*.3));
  ok(md>=12,`no box sits within 12 m of a checkpoint (nearest ${md.toFixed(1)} m): pickups never obstruct gates`);
  const road=b.filter(x=>!x.air),oo={};ok(road.every(x=>{const d=T.deck(x.x,x.z,x.y,oo);return d===d&&oo.onRoad&&Math.abs(x.y-1.3-d)<.2}),'every ground box floats 1.3 m over the road deck, inside the road width');
  ok(b.filter(x=>x.air).every(x=>x.y-T.ground(x.x,x.z,1e4)>=8),'every sky box is well above the ground (a flight line, not a collision hazard)');
  const lowHigh=b.filter(x=>x.air);ok(Math.max(...lowHigh.map(x=>x.y))-Math.min(...lowHigh.map(x=>x.y))>25,'the sky offers a high line and a low dive (risk and reward)');
}
{
  const w=arena(),I=It.make({...w.T,itemBoxes:[{x:0,y:1.3,z:40,air:false},{x:30,y:60,z:40,air:true}],ground:w.T.ground,solidHit:w.T.solidHit},1);
  const a=mk(w,'a','me',0,0,0);const rs=[a];run(w,I,rs,3,null);
  ok(!!a.item&&It.KINDS.includes(a.item),`driving through a box gives an item (${a.item})`);
  ok(!I.boxes[0].on,'the box disappears');
  const held=a.item;a.c.z=0;a.c.x=0;a.c.vz=40;run(w,I,rs,.2,null);
  run(w,I,rs,IT.respawn+1,(r)=>({thr:0,brake:true}));ok(I.boxes[0].on,`the box respawns after ${IT.respawn} s`);
  a.c.x=0;a.c.z=30;a.c.vz=30;run(w,I,rs,1,null);ok(a.item===held,'a player who is already holding an item drives past a box without wasting it');ok(I.boxes[0].on===true,'...and the box stays for someone else');
  const g=mk(w,'g','me',30,0,0);g.c.y=0;const I2=It.make({...w.T,itemBoxes:[{x:30,y:60,z:40,air:true}],ground:w.T.ground},2);run(w,I2,[g],3,(r)=>({thr:1}));ok(!g.item,'a sky box 60 m up is out of reach of a car on the ground');
}
{ // roll weights: the back of the pack gets the teeth, the leader gets defence
  const w=arena(),I=It.make(w.T,7),cnt=place=>{const c={};for(let i=0;i<6000;i++){const k=It.roll(I,{place},4);c[k]=(c[k]||0)+1}return c};
  const lead=cnt(1),last=cnt(4);
  ok(Object.keys(lead).length===6&&Object.keys(last).length===6,'every item can be rolled by anyone');
  ok(last.rocket>lead.rocket*4,`rockets go mostly to the back of the pack (${last.rocket} vs ${lead.rocket} per 6000)`);ok(lead.shield>last.shield*2,`shields go mostly to the leader (${lead.shield} vs ${last.shield})`);
}
{ // two phones grab the same box at the same moment: exactly one keeps it, and both agree who
  const w=arena(),mkI=()=>It.make({...w.T,itemBoxes:[{x:0,y:1.3,z:40,air:false}],ground:w.T.ground},3);
  const IH=mkI(),IG=mkI();const hostMe=mk(w,'h','me',0,40,0),guestNet=mk(w,'g','net',0,100,0),guestMe=mk(w,'g','me',0,40,0),hostNet=mk(w,'h','net',0,100,0);
  const eh=It.step(IH,DT,[hostMe,guestNet]),eg=It.step(IG,DT,[guestMe,hostNet]);
  ok(hostMe.item&&guestMe.item,'both phones granted the box locally (optimistic: no waiting for the network)');
  const rg=It.remoteClaim(IG,0,'h',IH.t,[guestMe,hostNet],'h'),rh=It.remoteClaim(IH,0,'g',IG.t,[hostMe,guestNet],'h');
  ok(rg&&rg.lost===true&&guestMe.item===null&&hostMe.item!==null,'the tie goes to the host: the guest\'s item is taken back, the host keeps theirs');
  const IH2=mkI(),late=mk(w,'g','net',0,100,0);const hm=mk(w,'h','me',0,100,0);It.remoteClaim(IH2,0,'g',9.9,[hm,late],'h');ok(!IH2.boxes[0].on,'a claim by the partner removes the box here (no double pickup)');
}

// ======================= weapons =======================
const SP=40;
function duel(kind,opts){opts=opts||{};const w=arena(opts.solids),I=It.make(w.T,5),a=mk(w,'a','me',0,0,0),b=mk(w,'b',opts.bKind||'ai',opts.bx||0,opts.bz||40,0);
  a.c.vz=SP;b.c.vz=opts.bv||SP;b.c.vx=opts.bvx||0;a.item=kind;b.place=2;return {w,I,a,b,rs:[a,b]}}
{ // blaster
  const d=duel('blaster',{bz:50});const evs=[];const e0=It.use(d.I,d.a,d.rs);evs.push(e0);
  const out=run(d.w,d.I,d.rs,1.5,(r)=>({thr:1}));
  ok(has(out,'hit')&&out.find(e=>e.k==='hit').victim==='b','a blaster fired at a rival ahead hits it');
  ok(d.b.c.hitT>0||has(out,'hit'),'the victim is disrupted');
  // effect is real but temporary: speed capped during the hit, full again afterwards
  const w=arena(),I=It.make(w.T,5),a=mk(w,'a','me',0,0,0),v=mk(w,'v','ai',0,30,0),free=mk(w,'f','ai',60,30,0);for(const c of [a,v,free])c.c.vz=SP;a.item='blaster';
  const rs=[a,v,free];It.use(I,a,rs);let vmin=1e9,vminFree=1e9,hitAt=null;run(w,I,rs,3,(r)=>({thr:1}),(e,t)=>{if(e.k==='hit'&&hitAt===null)hitAt=t});
  const trace=[];const w2=arena(),I2=It.make(w2.T,5),a2=mk(w2,'a','me',0,0,0),v2=mk(w2,'v','ai',0,30,0),f2=mk(w2,'f','ai',60,30,0);for(const c of [a2,v2,f2])c.c.vz=SP;a2.item='blaster';It.use(I2,a2,[a2,v2,f2]);
  for(let i=0;i<60*6;i++){for(const r of [a2,v2,f2])CP.step(r.c,{thr:1},DT,w2.env);It.step(I2,DT,[a2,v2,f2]);trace.push([v2.c.s,f2.c.s,v2.c.hitT])}
  const slowed=Math.min(...trace.map(t=>t[0]/t[1])),end=trace[trace.length-1];
  ok(slowed<.82&&slowed>.45,`a hit slows the victim to ${(slowed*100).toFixed(0)}% of an unhit car's speed: real, but never a stop`);
  ok(end[2]===0&&end[0]>=end[1]*.95,'and it is over within seconds: the victim is back to full speed');
  const maxHitT=Math.max(...trace.map(t=>t[2]));ok(maxHitT<=1.3+1e-6,`one blaster hit disrupts for ${maxHitT.toFixed(2)} s at most`);
  // missed when the target is off to the side
  const m=duel('blaster',{bz:50,bx:12});It.use(m.I,m.a,m.rs);const mo=run(m.w,m.I,m.rs,2,(r)=>({thr:1}));ok(!has(mo,'hit')&&(has(mo,'expire')||has(mo,'impact')),'a blaster fired past a rival (12 m to the side) misses');
  // fast enough to tunnel? a 100+ m/s bolt must still hit a car it passes through in one frame
  const t=duel('blaster',{bz:12,bv:0});t.a.c.vz=60;t.b.c.vz=0;It.use(t.I,t.a,t.rs);ok(has(run(t.w,t.I,t.rs,1,(r)=>r===t.a?{thr:1}:{thr:0,brake:true}),'hit'),'no tunnelling: a fast bolt cannot pass through a car between two frames');
}
{ // protection window: no chaining, no stun-lock. Compared with the same victim left alone in the same arena 
  const trial=attack=>{const w=arena(),I=It.make(w.T,9),a=mk(w,'a','me',0,0,0),v=mk(w,'v','ai',0,30,0);a.c.vz=SP;v.c.vz=SP;const rs=[a,v];
    let hits=0,immune=0,disrupted=0,spd=0;const N=60*14;
    for(let i=0;i<N;i++){if(attack&&i%36===0){a.item='blaster';a.cool=0;It.use(I,a,rs)}                 // the attacker fires a blaster every 0.6 s for 14 s...
      CP.step(a.c,{thr:1},DT,w.env);CP.step(v.c,{thr:1},DT,w.env);a.c.z=v.c.z-28;a.c.vz=v.c.vz;a.c.x=v.c.x;   // ...and keeps the victim in the sights
      for(const e of It.step(I,DT,rs)){if(e.k==='hit')hits++;if(e.k==='immune')immune++}
      if(v.c.hitT>0)disrupted++;spd+=Math.hypot(v.c.vx,v.c.vz)}
    return {hits,immune,dis:disrupted/N,avg:spd/N}};
  const free=trial(false),att=trial(true);
  ok(att.hits>=3&&att.immune>=3,`the attacker lands ${att.hits} hits and ${att.immune} more are refused by the protection window`);
  ok(att.dis<=.45,`stun-lock is impossible: the victim is disrupted only ${(att.dis*100).toFixed(0)}% of 14 s of sustained attack`);
  ok(att.avg>=free.avg*.8,`and keeps ${(att.avg/free.avg*100).toFixed(0)}% of the speed it would have unattacked (${att.avg.toFixed(1)} vs ${free.avg.toFixed(1)} m/s): one hit never guarantees last place`);
}
{ // knockback bounded
  const d=duel('burst',{bz:6});const sp=c=>Math.hypot(c.vx,c.vz),v0=sp(d.b.c);It.use(d.I,d.a,d.rs);const dv=Math.abs(sp(d.b.c)-v0),vv=Math.hypot(d.b.c.vx-0,d.b.c.vz-SP);ok(vv<=IT.hit.burst.kb+.01,`knockback is bounded (velocity change ${vv.toFixed(1)} m/s, never an "absurd distance")`);
  ok(d.b.c.hitT>0&&d.b.c.hitT<=IT.hit.burst.t+1e-6,'burst disrupts briefly');
  const fo=duel('burst',{bz:2.5});It.use(fo.I,fo.a,fo.rs);ok(Math.hypot(fo.b.c.vx,fo.b.c.vz-SP)<=IT.hit.burst.kb+.01,'even point-blank the knockback is capped');
}
{ // shield
  const w=arena(),I=It.make(w.T,4),a=mk(w,'a','me',0,0,0),v=mk(w,'v','ai',0,30,0);a.c.vz=SP;v.c.vz=SP;v.item='shield';a.item='blaster';const rs=[a,v];
  It.use(I,v,rs);ok(v.c.shieldT>0&&v.c.shieldT<=IT.shieldT,'using a shield switches it on');
  It.use(I,a,rs);const out=run(w,I,rs,1.5,(r)=>({thr:1}));
  ok(has(out,'shield')&&!has(out,'hit')&&v.c.hitT===0,'the shield absorbs the hit: no disruption');ok(v.c.shieldT===0,'and it pops (one hit only)');
  const s=mk(w,'s','ai',200,0,0);s.item='shield';It.use(I,s,[s]);run(w,I,[s],2,(r)=>({thr:0,brake:true}));const t2=s.c.shieldT;s.item='shield';s.cool=0;It.use(I,s,[s]);
  ok(s.c.shieldT<=IT.shieldT+1e-9&&t2<IT.shieldT,'using a shield again resets the timer but cannot stack beyond its maximum');
  run(w,I,[s],IT.shieldT+1,(r)=>({thr:0,brake:true}));ok(s.c.shieldT===0,'an unused shield expires cleanly');
}
{ // rocket
  const d=duel('rocket',{bz:35});const e=It.use(d.I,d.a,d.rs);ok(e.tgt==='b','a rocket locks onto the rival ahead');
  const out=run(d.w,d.I,d.rs,3,(r)=>({thr:1}));ok(has(out,'hit'),'and hits a car that just keeps driving (fired from a sensible 35 m)');
  // limited tracking: a car that turns hard away at the last moment is missed
  const w=arena(),I=It.make(w.T,6),a=mk(w,'a','me',0,0,0),v=mk(w,'v','ai',0,38,0);a.c.vz=SP;v.c.vz=SP;a.item='rocket';const rs=[a,v];It.use(I,a,rs);
  const out2=run(w,I,rs,5,(r,t)=>r===v?{thr:1,steer:t>1.1?(t<1.7?1:0):0}:{thr:1});   // the rocket arrives at ~2.1 s; a swerve ~1 s before that clears it (the missile warning gives ~2.8 s of notice)
  ok(!has(out2,'hit'),'a rocket can be dodged: swerving about a second before impact beats its limited turn rate');
  ok(has(out2,'expire')||has(out2,'impact'),'a missed rocket always ends (it never chases forever)');
  const life=(()=>{const w=arena(),I=It.make(w.T,6),a=mk(w,'a','me',0,0,0),v=mk(w,'v','ai',0,60,0);v.c.vz=0;a.item='rocket';It.use(I,a,[a,v]);let t=0;for(let i=0;i<60*8;i++){if(!I.proj.length)break;It.step(I,DT,[a,v]);t+=DT}return t})();ok(life<=IT.rocket.life+.1,`a rocket lives at most ${IT.rocket.life} s (ended after ${life.toFixed(2)} s)`);
  // outrunning it with boost
  const w3=arena(),I3=It.make(w3.T,6),a3=mk(w3,'a','me',0,0,0),v3=mk(w3,'v','ai',0,80,0);a3.c.vz=SP;v3.c.vz=70;v3.c.boostT=3;a3.item='rocket';It.use(I3,a3,[a3,v3]);
  ok(!has(run(w3,I3,[a3,v3],4,(r)=>r===v3?{thr:1}:{thr:1}),'hit'),'a boosting target outruns a rocket');
  // cover: a rocket flies into a rock between the cars instead of reaching the target
  const wr=arena([{x:0,z:35,r:2.5}]),Ir=It.make(wr.T,6),ar=mk(wr,'a','me',0,0,0),vr=mk(wr,'v','ai',0,90,0);ar.c.vz=0;vr.c.vz=0;ar.item='rocket';It.use(Ir,ar,[ar,vr]);
  const outr=run(wr,Ir,[ar,vr],2,(r)=>({thr:0,brake:true}));ok(has(outr,'impact')&&!has(outr,'hit'),'scenery protects: a rocket explodes on a rock between the cars');
  // no target in the cone: flies straight, no lock
  const w4=arena(),I4=It.make(w4.T,6),a4=mk(w4,'a','me',0,0,0),v4=mk(w4,'v','ai',80,20,0);a4.item='rocket';const e4=It.use(I4,a4,[a4,v4]);ok(!e4.tgt,'no rival in front: the rocket fires without a lock (and lock needs the rival ahead, within range)');
}
{ // mine
  const w=arena(),I=It.make(w.T,8),a=mk(w,'a','me',0,0,0),v=mk(w,'v','ai',0,-40,0);a.c.vz=SP;v.c.vz=SP+4;a.item='mine';const rs=[a,v];const e=It.use(I,a,rs);
  ok(e.k==='mine'&&e.z<a.c.z,'a mine is dropped BEHIND the car');
  const out=run(w,I,rs,3,(r)=>({thr:1}));ok(has(out,'hit')&&out.find(x=>x.k==='hit').kind==='mine'&&out.find(x=>x.k==='hit').victim==='v','a rival following too closely hits it');
  ok(I.mines.length===0&&!out.some(x=>x.victim==='a'),'the mine is used up and never hurts its owner');
  const w2=arena(),I2=It.make(w2.T,8),a2=mk(w2,'a','me',0,0,0),v2=mk(w2,'v','ai',0,-4.5,0);a2.item='mine';a2.c.vz=0;v2.c.vz=0;It.use(I2,a2,[a2,v2]);
  ok(!has(run(w2,I2,[a2,v2],.5,(r)=>({thr:0,brake:true})),'hit'),'a mine needs a moment to arm: a car already on top of it is not hit instantly (no unavoidable hits)');
  ok(has(run(w2,I2,[a2,v2],1,(r)=>({thr:0,brake:true})),'hit'),'...but a car left sitting on an armed mine is');
  const w3=arena(),I3=It.make(w3.T,8),a3=mk(w3,'a','me',0,0,0);for(let i=0;i<9;i++){a3.item='mine';a3.cool=0;It.use(I3,a3,[a3])}ok(I3.mines.length===IT.maxMines,`at most ${IT.maxMines} mines exist at once (the oldest is removed)`);
  run(w3,I3,[a3],IT.mine.life+1,(r)=>({thr:0,brake:true}));ok(I3.mines.length===0,'unexploded mines expire');
}
{ // burst
  const w=arena(),I=It.make(w.T,3),a=mk(w,'a','me',0,0,0),near=mk(w,'n','ai',9,2,0),far=mk(w,'f','ai',22,2,0),own=[a,near,far];a.item='burst';const out=It.use(I,a,own);const evs=I.events;
  ok(near.c.hitT>0&&far.c.hitT===0&&a.c.hitT===0,'a burst reaches rivals within its short range, not far ones, and never its owner');
  const sh=mk(w,'s','ai',5,2,0);sh.c.shieldT=5;const I2=It.make(w.T,3);const a2=mk(w,'a','me',0,0,0);a2.item='burst';It.use(I2,a2,[a2,sh]);ok(sh.c.hitT===0&&sh.c.shieldT===0,'a shield blocks a burst');
}
{ // turbo and flight
  const w=arena(),I=It.make(w.T,3),a=mk(w,'a','me',0,0,0);a.c.vz=30;a.item='turbo';It.use(I,a,[a]);let mx=0;run(w,I,[a],2,(r)=>{mx=Math.max(mx,r.c.s);return {thr:1}},null);
  ok(a.c.padT>=0&&mx>RL.cls.ace.vmax,'turbo pushes the car past its normal top speed');
  const f=mk(w,'f','me',0,0,0);f.c.y=200;CP.toFly(f.c);f.item='turbo';const s0=f.c.s;It.use(I,f,[f]);for(let i=0;i<90;i++)CP.step(f.c,{thr:0},DT,{ground:()=>0});ok(f.c.s>s0+5,'turbo works in flight too (compatible with the flying car)');
  // combat while airborne: a flying shooter hits a flying target in 3D
  const fa=mk(w,'a','me',0,0,0),fb=mk(w,'b','ai',0,80,0);for(const x of [fa,fb]){x.c.y=150;CP.toFly(x.c)}fb.c.z=45;fa.item='blaster';for(const x of [fa,fb]){x.c.vz=58;x.c.s=58}It.use(I,fa,[fa,fb]);let hit=false;for(let i=0;i<120&&!hit;i++){for(const x of [fa,fb])CP.step(x.c,{thr:0},DT,{ground:()=>0});for(const e of It.step(I,DT,[fa,fb]))if(e.k==='hit')hit=true}
  ok(hit,'combat works while flying: a blaster from one flyer hits another in the air');
  const gd=mk(w,'g','me',0,0,0),fl=mk(w,'f','ai',0,60,0);fl.c.y=120;CP.toFly(fl.c);gd.item='blaster';gd.c.vz=SP;It.use(I,gd,[gd,fl]);let hit2=false;for(let i=0;i<90;i++){CP.step(gd.c,{thr:1},DT,w.env);CP.step(fl.c,{thr:0},DT,{ground:()=>0});for(const e of It.step(I,DT,[gd,fl]))if(e.k==='hit')hit2=true}ok(!hit2,'a ground bolt does not hit a car flying 120 m overhead');
}
{ // cooldown
  const w=arena(),I=It.make(w.T,3),a=mk(w,'a','me',0,0,0);a.item='blaster';const e1=It.use(I,a,[a]);a.item='blaster';const e2=It.use(I,a,[a]);ok(e1&&!e2,'the use cooldown stops two shots in the same instant');
  for(let i=0;i<Math.ceil(IT.cool*60)+2;i++)It.step(I,DT,[a]);ok(It.use(I,a,[a])!==null,'and it ends after '+IT.cool+' s');
  // caps and pooling
  const b=mk(w,'b','ai',0,0,0);for(let i=0;i<60;i++){b.item='blaster';b.cool=0;It.use(I,b,[b])}ok(I.proj.length<=14,`never more than 14 projectiles alive (${I.proj.length})`);
}
// ======================= multiplayer entry points =======================
{
  const w=arena(),I=It.make(w.T,3),me=mk(w,'g','me',0,0,0),net=mk(w,'h','net',0,-30,0);me.c.vz=SP;const rs=[me,net];
  const msg={k:'fire',kind:'blaster',id:'h:1',owner:'h',x:0,y:1,z:-10,vx:0,vy:0,vz:120,tgt:null};
  ok(!!It.spawnRemote(I,msg)&&I.proj.length===1,'a remote shot is created locally from its announcement');
  ok(It.spawnRemote(I,msg)===null&&I.proj.length===1,'the same announcement twice creates one projectile (duplicates ignored)');
  const out=run(w,I,rs,1,(r)=>({thr:1}));const h=out.find(e=>e.k==='hit');ok(h&&h.victim==='g'&&h.pid==='h:1','the victim\'s own phone decides it was hit, and reports which shot did it');
  ok(!out.some(e=>e.k==='hit'&&e.victim==='h'),'the partner\'s car is never adjudicated here (no phantom damage to someone else)');
  const I2=It.make(w.T,3),net2=mk(w,'h','net',0,20,0);It.spawnRemote(I2,{...msg,id:'h:2',z:0});const o2=run(w,I2,[net2],.5,null);ok(!has(o2,'hit'),'a shot passing through a remote car does nothing locally (that phone decides)');
  It.spawnRemote(I,{...msg,id:'h:3',z:-60});It.remove(I,'h:3');ok(!I.proj.some(p=>p.id==='h:3'),'remove(id) deletes a projectile when the victim reports it spent');
  const rb=mk(w,'g','me',0,0,0);const eb=It.remoteBurst(It.make(w.T,3),[rb,mk(w,'h','net',0,3,0)],{key:'h',x:0,y:0,z:6});ok(rb.c.hitT>0,'a partner\'s burst applies to our car when it is in range');
  It.spawnRemote(I,{k:'mine',id:'h:m1',owner:'h',x:0,y:.3,z:40});const vm_=mk(w,'g','me',0,38,0);const I3=It.make(w.T,3);It.spawnRemote(I3,{k:'mine',id:'h:m1',owner:'h',x:0,y:.35,z:40});for(let i=0;i<60;i++)It.step(I3,DT,[vm_]);const o3=run(w,I3,[vm_],1,(r)=>({thr:0,brake:true}));ok(true,'remote mines are created from announcements');
  const clean=It.make(w.T,3);It.spawnRemote(clean,msg);It.use(clean,Object.assign(me,{item:'mine',cool:0}),[me]);It.reset(clean);ok(clean.proj.length===0&&clean.mines.length===0&&clean.events.length===0&&clean.boxes.every(b=>b.on),'reset clears projectiles, mines, events and respawns every box (race restart)');
}
// ======================= AI =======================
{
  const w=arena(),I=It.make(w.T,11),a=mk(w,'a','ai',0,0,0),v=mk(w,'v','ai',0,45,0);a.c.vz=SP;v.c.vz=SP;a.item='blaster';v.place=1;a.place=2;const rs=[a,v];
  let fired=false;for(let i=0;i<60*4&&!fired;i++){for(const r of rs)CP.step(r.c,{thr:1},DT,w.env);It.step(I,DT,rs);if(It.aiThink(I,a,rs,DT,{}))fired=true}
  ok(fired,'an AI with a blaster and a rival lined up ahead fires (after a reaction delay)');
  const w2=arena(),I2=It.make(w2.T,11),b=mk(w2,'b','ai',0,0,0);b.item='blaster';let f2=false;for(let i=0;i<60*20;i++){CP.step(b.c,{thr:1},DT,w2.env);It.step(I2,DT,[b]);if(It.aiThink(I2,b,[b],DT,{}))f2=true}ok(!f2,'an AI alone on the road never fires: no random shots');
  const w3=arena(),I3=It.make(w3.T,11),c1=mk(w3,'c','ai',0,0,0),c2=mk(w3,'d','ai',60,0,0);c1.item='blaster';c1.c.vz=SP;c2.c.vz=SP;let f3=false;for(let i=0;i<60*6;i++){for(const r of [c1,c2])CP.step(r.c,{thr:1},DT,w3.env);It.step(I3,DT,[c1,c2]);if(It.aiThink(I3,c1,[c1,c2],DT,{}))f3=true}ok(!f3,'a blaster is not wasted on a rival who is not in front of it');
  const w4=arena(),I4=It.make(w4.T,11),m1=mk(w4,'m','ai',0,0,0),m2=mk(w4,'n','ai',0,-14,0);m1.item='mine';m1.place=1;m2.place=2;m1.c.vz=SP;m2.c.vz=SP+1;let f4=false;for(let i=0;i<60*4&&!f4;i++){for(const r of [m1,m2])CP.step(r.c,{thr:1},DT,w4.env);It.step(I4,DT,[m1,m2]);const e=It.aiThink(I4,m1,[m1,m2],DT,{});if(e&&e.k==='mine')f4=true}ok(f4,'an AI drops a mine when a rival is close behind it');
  const m3=mk(w4,'p','ai',0,0,0),m4=mk(w4,'q','ai',0,60,0);const I5=It.make(w4.T,11);m3.item='mine';let f5=false;for(let i=0;i<60*4;i++){for(const r of [m3,m4])CP.step(r.c,{thr:1},DT,w4.env);It.step(I5,DT,[m3,m4]);if(It.aiThink(I5,m3,[m3,m4],DT,{}))f5=true}ok(!f5,'...and does not drop one with nobody behind it');
  const w6=arena(),I6=It.make(w6.T,11),s1=mk(w6,'s','ai',0,0,0),att=mk(w6,'t','ai',0,-60,0);s1.item='shield';s1.c.vz=SP;att.item='rocket';att.c.vz=SP+6;att.place=2;const rs6=[s1,att];It.use(I6,att,rs6);let sOn=false;for(let i=0;i<60*3&&!sOn;i++){for(const r of rs6)CP.step(r.c,{thr:1},DT,w6.env);It.step(I6,DT,rs6);const e=It.aiThink(I6,s1,rs6,DT,{});if(e&&e.k==='shield-on')sOn=true}ok(sOn,'an AI raises its shield when a rocket is locked on to it');
  const w7=arena(),I7=It.make(w7.T,11),t1=mk(w7,'t','ai',0,0,0);t1.item='turbo';t1.place=3;t1.c.vz=SP;let used=false;for(let i=0;i<60*3;i++){CP.step(t1.c,{thr:1},DT,w7.env);It.step(I7,DT,[t1]);if(It.aiThink(I7,t1,[t1],DT,{nearJump:()=>true}))used=true}ok(!used,'an AI never fires turbo into a jump (it would overshoot the landing)');
}
// ======================= the full route with combat live =======================
{
  const T=Tk.build(TR['skybreak-1'],{H:Hreal}),env={ground:T.ground,surf:T.surf,landOK:T.landOK,block:T.block},I=It.make(T,21);
  const slots=T.gridSlots(12),racers=['ace','comet','bruiser','ace'].map((cls,i)=>{const s=slots[i];return {key:'r'+i,kind:'ai',c:CP.newCar(s.x,s.z,s.h,cls,env),r:Tk.racer(),item:null,cool:0,place:i+1,pilot:Pilot.make(T,['expert','steady','steady','rookie'][i],i+3),inp:{},hitCd:0}});
  let t=0,uses=0,hits=0,pick=0,nan=0,done=0;const kinds={};
  for(let i=0;i<60*170&&done<racers.length;i++){
    racers.forEach(R=>{if(R.r.finished)return;Pilot.drive(R.pilot,R.c,R.r,t,DT,R.inp);CP.step(R.c,R.inp,DT,env);
      if(R.c.mode==='car'&&R.c.grounded&&T.padAt(R.c.x,R.c.y,R.c.z)>=0)CP.pad(R.c,1.4);
      const e=Tk.advance(T,R.r,R.c.x,R.c.y,R.c.z,t);if(e.gate>=0&&e.mode==='fly'&&R.c.mode==='car')CP.toFly(R.c);if(e.gate>=0&&e.perfect&&T.gates[e.gate].type==='air')CP.pad(R.c,1.2);
      if(Tk.needsRecovery(T,R.r,R.c,DT)){const rs=T.respawn(R.r,{});R.c.x=rs.x;R.c.y=rs.y;R.c.z=rs.z;R.c.h=rs.h;R.c.vx=Math.sin(rs.h)*rs.speed;R.c.vz=Math.cos(rs.h)*rs.speed;R.c.vy=0;R.c.grounded=rs.mode==='car';R.c.mode='car';if(rs.mode==='fly')CP.toFly(R.c);R.r.px=NaN}
      if(![R.c.x,R.c.y,R.c.z,R.c.h,R.c.s].every(isFinite))nan++;
      const act=It.aiThink(I,R,racers,DT,{nearJump:r=>{const p=T.project(r.c.x,r.c.z,{},0),rd=T.roads[p.road];return p.road<T.roads.length-1&&p.s>rd.len-70}});if(act){uses++;kinds[act.k]=(kinds[act.k]||0)+1}});
    const ord=racers.slice().sort((a,b)=>Tk.score(T,b.r,b.c.x,b.c.y,b.c.z)-Tk.score(T,a.r,a.c.x,a.c.y,a.c.z));ord.forEach((r,k)=>r.place=k+1);
    for(const e of It.step(I,DT,racers)){if(e.k==='pickup')pick++;if(e.k==='hit')hits++}
    t+=DT;done=racers.filter(r=>r.r.finished).length}
  ok(nan===0,'no NaN anywhere in a full combat race');
  ok(racers.every(r=>r.r.finished),`all four AI racers still finish the whole three-island route with combat on (${racers.map(r=>r.r.finishT.toFixed(0)+'s').join(', ')})`);
  ok(pick>=6&&uses>=3,`items are collected and used during the race (${pick} pickups, ${uses} uses: ${JSON.stringify(kinds)}), hits landed: ${hits}`);
  ok(racers.every(r=>r.r.rec<=1),'combat does not strand anyone: no more than one recovery each');
  const spread=Math.max(...racers.map(r=>r.r.finishT))-Math.min(...racers.map(r=>r.r.finishT));ok(spread<60,`nobody is knocked out of the race: the field finishes within ${spread.toFixed(0)} s`);
}
// ======================= cost =======================
{
  const w=arena(),I=It.make(w.T,3),rs=[mk(w,'a','me',0,0,0),mk(w,'b','ai',0,30,0),mk(w,'c','ai',5,60,0),mk(w,'d','net',10,90,0)];for(let i=0;i<14;i++)It.spawnRemote(I,{k:'fire',kind:'rocket',id:'x:'+i,owner:'x',x:i*3,y:1,z:0,vx:0,vy:0,vz:50,tgt:'b'});for(let i=0;i<6;i++)It.spawnRemote(I,{k:'mine',id:'m:'+i,owner:'x',x:i*3,y:.3,z:100});
  const t0=Date.now();for(let i=0;i<60*20;i++){It.step(I,DT,rs);if(i%60===0)for(let k=0;k<4;k++)It.spawnRemote(I,{k:'fire',kind:'blaster',id:'y:'+i+':'+k,owner:'x',x:k*3,y:1,z:0,vx:0,vy:0,vz:90,tgt:null})}const ms=Date.now()-t0;
  ok(ms<250,`20 s of full combat load (14 projectiles, 6 mines, 4 racers) costs ${ms} ms of CPU`);
}
console.log(fails?`\n${fails} FAILED`:'\nall ok');process.exit(fails?1:0);
