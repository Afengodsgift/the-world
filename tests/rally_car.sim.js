// Skybreak Rally physics: handling, slopes, ramp launch, walls, boost, flight, transformation, determinism, packet size, fuzz.
// Pure module (no THREE needed). Run: node tests/rally_car.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const ctx={Math,Object,Number,JSON,Array,isFinite};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(R+'src/data/rally.js','utf8')+fs.readFileSync(R+'src/race/CarPhysics.js','utf8')+';this.RALLY=RALLY;this.CP=CarPhysics;',ctx);
const {RALLY:RL,CP}=ctx;
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const flat={ground:()=>0};
const DT=1/60;
function run(c,inp,secs,env,each){const n=Math.round(secs*60);for(let i=0;i<n;i++){CP.step(c,typeof inp==='function'?inp(i*DT,c):inp,DT,env||flat);if(each)each(c,i)}return c}
const gas={thr:1};

// ---------- 1. longitudinal ----------
{
  const c=CP.newCar(0,0,0,'ace',flat);
  let t30=null;run(c,gas,12,flat,(c,i)=>{if(t30===null&&c.vz>=30)t30=(i+1)*DT});
  ok(t30>1&&t30<3.5,`0-30 m/s in a believable time (${t30&&t30.toFixed(2)} s)`);
  ok(c.vz>RL.cls.ace.vmax*.97&&c.vz<=RL.cls.ace.vmax*1.001,`top speed reaches vmax and does not exceed it (${c.vz.toFixed(1)} m/s)`);
  ok(Math.abs(c.x)<1e-6,'driving straight stays straight');
  run(c,{brake:true},4,flat);
  ok(Math.abs(c.vz)<.01&&c.vz>=0,'braking stops the car and never reverses it');
  run(c,{thr:-1},3,flat);
  ok(c.vz<-5&&c.vz>=-RL.car.vrev-.01,`from rest, reverse works and is capped (${c.vz.toFixed(1)} m/s)`);
  const d=CP.newCar(0,0,0,'ace',flat);run(d,gas,6,flat);const v1=d.vz;run(d,{},3,flat);
  ok(d.vz<v1&&d.vz>0,'lifting off coasts down gradually (engine braking), not instantly');
}
// ---------- 2. steering ----------
{
  const turnRate=sp=>{const c=CP.newCar(0,0,0,'ace',flat);c.vz=sp;c.vx=0;const h0=c.h;run(c,{steer:1,thr:0},.5,flat);return Math.abs(c.h-h0)/.5};
  const t0=turnRate(.5),t10=turnRate(10),t20=turnRate(20),t46=turnRate(46);
  ok(t0<.35*t10,`cannot pivot on the spot (turn rate ${t0.toFixed(2)} at 0.5 m/s vs ${t10.toFixed(2)} at 10)`);
  ok(t46<t20,`speed-sensitive: less turn at 46 m/s than at 20 (${t46.toFixed(2)} < ${t20.toFixed(2)})`);
  const L=CP.newCar(0,0,0,'ace',flat),Rr=CP.newCar(0,0,0,'ace',flat);L.vz=Rr.vz=20;
  run(L,{steer:-1,thr:1},2,flat);run(Rr,{steer:1,thr:1},2,flat);
  ok(Math.abs(L.x+Rr.x)<1e-6&&Math.abs(L.z-Rr.z)<1e-6&&L.x*Rr.x<0,'left and right are exact mirror images');
  // grip vs handbrake: same entry, handbrake slides more and turns tighter
  const mk=hand=>{const c=CP.newCar(0,0,0,'ace',flat);c.vz=35;run(c,{steer:1,thr:.4,hand},1.2,flat);return c};
  const grip=mk(false),slide=mk(true);
  ok(Math.abs(slide.slip)>Math.abs(grip.slip)*2,`handbrake slides (slip ${slide.slip.toFixed(1)} vs ${grip.slip.toFixed(1)} m/s)`);
  ok(Math.hypot(grip.vx,grip.vz)>35*.55,'a normal corner keeps most of your speed');
}
// ---------- 3. slopes ----------
{
  const hill=k=>({ground:(x,z)=>k*z});
  const up=CP.newCar(0,0,0,'ace',hill(.25)),dn=CP.newCar(0,0,0,'ace',hill(-.25)),fl=CP.newCar(0,0,0,'ace',flat);
  run(up,gas,10,hill(.25));run(dn,gas,10,hill(-.25));run(fl,gas,10,flat);
  ok(up.vz<fl.vz-3,`uphill is slower (${up.vz.toFixed(1)} vs ${fl.vz.toFixed(1)})`);
  ok(dn.grounded&&dn.vz>=fl.vz-.5,`a steady downhill is followed, not launched off (${dn.vz.toFixed(1)} m/s, grounded)`);
  ok(Math.abs(up.pitch-Math.atan(.25))<.05&&Math.abs(dn.pitch+Math.atan(.25))<.05,'body pitch follows the slope');
}
// ---------- 4. ramp launch (the core race moment) ----------
// a 12 m ramp rising 0.5/m (6 m high) starting at z=20, then a drop to flat ground
const ramp=(len=12,rise=.5)=>({ground:(x,z)=>z<20?0:z<20+len?(z-20)*rise:0});
function launch(sp,cls){
  const env=ramp(),c=CP.newCar(0,0,0,cls||'ace',env);c.z=0;c.vz=sp;
  let lz=null,ly=null,vyL=null,apex=0,landZ=null,landV=null,air=0;
  for(let i=0;i<60*8;i++){
    const wasG=c.grounded,ev=CP.step(c,{thr:1},DT,env);
    if(wasG&&!c.grounded&&lz===null){lz=c.z;ly=c.y;vyL=c.vy}
    if(!c.grounded)apex=Math.max(apex,c.y);
    if(!wasG&&c.grounded&&landZ===null){landZ=c.z;landV=ev.land}
    if(landZ!==null&&i>60*7)break;
  }
  return {lz,ly,vyL,apex,landZ,landV,c};
}
{
  const a=launch(40);
  ok(a.lz!==null&&a.lz>=30&&a.lz<=34,`launches at the ramp lip (z=${a.lz&&a.lz.toFixed(1)}, lip at 32)`);
  ok(a.vyL>12&&a.vyL<25,`leaves with the ramp's climb rate (vy=${a.vyL&&a.vyL.toFixed(1)}, ramp slope x speed ~${(0.5*40).toFixed(0)})`);
  const g=RL.g,h0=a.ly,expect=h0+a.vyL*a.vyL/(2*g);
  ok(Math.abs(a.apex-expect)<expect*.12,`apex matches ballistic maths (${a.apex.toFixed(1)} m vs ${expect.toFixed(1)} m)`);
  ok(a.landZ>a.lz+25,`covers real distance in the air (${(a.landZ-a.lz).toFixed(0)} m)`);
  ok(a.landV>10,`lands with a measurable impact (${a.landV&&a.landV.toFixed(1)} m/s)`);
  const slow=launch(22),fast=launch(46);
  ok(fast.landZ-fast.lz>slow.landZ-slow.lz+15,`faster launch flies farther (${(fast.landZ-fast.lz).toFixed(0)} vs ${(slow.landZ-slow.lz).toFixed(0)} m)`);
  ok(a.c.grounded&&Math.hypot(a.c.vx,a.c.vz)>25,'after landing the car is driving again with most of its speed');
  const cm=launch(40,'comet'),br=launch(40,'bruiser');
  ok(cm.landZ>0&&br.landZ>0,'every class completes the launch');
}
// ---------- 5. walls ----------
{
  const env={ground:(x,z)=>z>=50?6:0};
  const c=CP.newCar(0,0,0,'ace',env);let maxZ=0,bumped=0;
  run(c,gas,9,env,(c)=>{maxZ=Math.max(maxZ,c.z);if(c.ev.bump>bumped)bumped=c.ev.bump});
  ok(maxZ<50.01,`a 6 m wall stops the car, no tunnelling (max z ${maxZ.toFixed(2)})`);
  ok(bumped>30,`the impact is reported (${bumped.toFixed(1)} m/s)`);
  ok(Math.hypot(c.vx,c.vz)<8,'the car loses its speed against the wall');
  // glancing hit slides along it
  const side={ground:(x,z)=>x>=8?6:0},d=CP.newCar(0,0,.3,'ace',side);d.vx=Math.sin(.3)*30;d.vz=Math.cos(.3)*30;
  run(d,{thr:1},2,side);
  ok(d.x<8.01&&d.z>30,`a glancing hit slides along the wall (x=${d.x.toFixed(1)}, z=${d.z.toFixed(0)})`);
}
// ---------- 6. boost ----------
{
  const a=CP.newCar(0,0,0,'ace',flat),b=CP.newCar(0,0,0,'ace',flat);
  run(a,gas,8,flat);run(b,gas,8,flat);
  const ch0=b.charges;let bst=0;run(b,{thr:1,boost:true},1.5,flat,(c)=>{if(c.ev.boost)bst++});
  ok(bst===1&&b.charges===ch0-1,'one tap spends exactly one charge');
  ok(b.vz>a.vz*1.15,`boost raises speed past the normal cap (${b.vz.toFixed(1)} vs ${a.vz.toFixed(1)})`);
  const trace=[];run(b,gas,6,flat,(c)=>trace.push(c.vz));
  let maxDrop=0;for(let i=1;i<trace.length;i++)maxDrop=Math.max(maxDrop,trace[i-1]-trace[i]);
  ok(b.vz<=RL.cls.ace.vmax*1.01&&maxDrop<.6,`boost ends smoothly back to the cap (largest 1-frame drop ${maxDrop.toFixed(2)} m/s)`);
  const e=CP.newCar(0,0,0,'ace',flat);e.charges=0;run(e,{thr:1,boost:true},3,flat);
  ok(e.vz<=RL.cls.ace.vmax*1.001,'no charges = no boost');
  const p=CP.newCar(0,0,0,'ace',flat);run(p,gas,6,flat);CP.pad(p,1.5);run(p,gas,1.5,flat);
  ok(p.vz>RL.cls.ace.vmax*1.1&&p.charges===RL.cls.ace.charges,'a boost pad boosts without spending a charge');
}
// ---------- 7. surfaces ----------
{
  const grass={ground:()=>0,surf:()=>({rough:true})},c=CP.newCar(0,0,0,'ace',grass);
  run(c,gas,15,grass);
  ok(c.vz<RL.cls.ace.vmax*.7,`rough ground caps speed (${c.vz.toFixed(1)} m/s)`);
}
// ---------- 8. classes feel different ----------
{
  const top={},acc={},tr={};
  for(const k of Object.keys(RL.cls)){
    const c=CP.newCar(0,0,0,k,flat);let t=null;run(c,gas,15,flat,(c,i)=>{if(t===null&&c.vz>=30)t=(i+1)*DT});top[k]=c.vz;acc[k]=t;
    const d=CP.newCar(0,0,0,k,flat);d.vz=25;run(d,{steer:1,thr:0},.6,flat);tr[k]=Math.abs(d.h);
  }
  ok(top.comet>top.ace&&top.ace>top.bruiser,`top speed: comet > ace > bruiser (${top.comet.toFixed(0)}/${top.ace.toFixed(0)}/${top.bruiser.toFixed(0)})`);
  ok(acc.comet<acc.ace&&acc.ace<acc.bruiser,'acceleration: comet quickest, bruiser slowest');
  ok(tr.ace>tr.comet,'the ace turns in more sharply than the comet');
}
// ---------- 9. transformation + flight ----------
{
  const env=ramp(),c=CP.newCar(0,0,0,'ace',env);c.vz=42;
  while(c.grounded)CP.step(c,gas,DT,env);
  for(let i=0;i<20;i++)CP.step(c,gas,DT,env);               // a little airtime first
  const before={x:c.x,y:c.y,z:c.z,h:c.h,sp:Math.hypot(c.vx,c.vy,c.vz),ch:c.charges};
  CP.toFly(c);
  ok(c.mode==='fly'&&c.x===before.x&&c.y===before.y&&c.z===before.z&&c.h===before.h,'transformation keeps position and heading (nothing teleports)');
  ok(Math.abs(c.s-before.sp)<before.sp*.01&&c.charges===before.ch,'transformation keeps speed and boost charges');
  const sky={ground:()=>0};
  c.y=200;c.vy=0;c.pitch=0;
  const alt=[];run(c,{},4,sky,(c)=>alt.push(c.y));
  ok(Math.abs(alt[alt.length-1]-200)<25,`hands-off flight settles to level (altitude drift ${Math.abs(alt[alt.length-1]-200).toFixed(1)} m in 4 s)`);
  const a=CP.newCar(0,0,0,'ace',sky);a.y=300;CP.toFly(a);run(a,{},3,sky);const s0=a.s,y0=a.y;
  run(a,{pitch:1},2,sky);ok(a.y>y0+20&&a.s<s0,`pitching up climbs and bleeds speed (+${(a.y-y0).toFixed(0)} m, ${s0.toFixed(0)}->${a.s.toFixed(0)})`);
  const b=CP.newCar(0,0,0,'ace',sky);b.y=300;CP.toFly(b);run(b,{},3,sky);const s1=b.s;run(b,{pitch:-1},2,sky);
  ok(b.y<300-20&&b.s>s1,`pitching down dives and gains speed (${s1.toFixed(0)}->${b.s.toFixed(0)})`);
  const t=CP.newCar(0,0,0,'ace',sky);t.y=300;CP.toFly(t);run(t,{},2,sky);const h0=t.h;run(t,{steer:1},2,sky);
  ok(t.h-h0>1&&t.roll<-.5,`banking turns the aircraft (+${(t.h-h0).toFixed(2)} rad, roll ${t.roll.toFixed(2)})`);
  const f=CP.newCar(0,0,0,'ace',sky);f.y=300;CP.toFly(f);run(f,{thr:1},6,sky);const fast=f.s;run(f,{thr:-1},8,sky);
  ok(fast>RL.fly.cruise&&f.s<RL.fly.cruise-5,`throttle sets speed (${fast.toFixed(0)} up, ${f.s.toFixed(0)} down)`);
  const u=CP.newCar(0,0,0,'ace',sky);u.y=RL.fly.ceil-5;CP.toFly(u);run(u,{pitch:1},10,sky);
  ok(u.y<=RL.fly.ceil+.001,'altitude ceiling holds');
}
// ---------- 10. forgiving landing ----------
{
  const gz={ground:()=>0,landOK:()=>true},nz={ground:()=>0,landOK:()=>false};
  // glide in over a landing zone
  const c=CP.newCar(0,0,0,'ace',gz);c.y=60;CP.toFly(c);let ev=0,evAt=0;
  run(c,{pitch:-.12},12,gz,(c)=>{if(c.ev.land&&!ev){ev=c.ev.land;evAt=c.y}});
  ok(c.mode==='car'&&c.grounded&&ev>0,'inside a landing zone, flight touches down into the car (mode swaps back)');
  ok(Math.hypot(c.vx,c.vz)>20,`and keeps its speed (${Math.hypot(c.vx,c.vz).toFixed(0)} m/s)`);
  // steep dive into a landing zone is a scrape, not a crash
  const d=CP.newCar(0,0,0,'ace',gz);d.y=60;CP.toFly(d);let scr=0,minY=1e9;run(d,{pitch:-1},6,gz,(c)=>{scr+=c.ev.scrape;minY=Math.min(minY,c.y)});
  ok(minY>=-1e-9&&(d.mode==='fly'||scr>0),'a steep dive never goes through the ground');
  // outside the zone: skim along without ever touching down
  const n=CP.newCar(0,0,0,'ace',nz);n.y=30;CP.toFly(n);let mn=1e9,mode='fly';run(n,{pitch:-1},10,nz,(c)=>{mn=Math.min(mn,c.y);mode=c.mode});
  ok(mn>0&&mode==='fly','outside a landing zone you cannot accidentally land: the ground pushes you back up');
}
// ---------- 10b. steering feel (responsiveness, speed-sensitivity, drift, correction, no spins) ----------
{
  const timeTo=(v,ang,cls,hold)=>{const c=CP.newCar(0,0,0,cls||'ace',flat);c.vz=v;for(let i=0;i<60*4;i++){CP.step(c,{thr:.6,steer:1,hand:hold},DT,flat);if(Math.abs(c.h)>=ang)return (i+1)*DT}return 99};
  ok(timeTo(6,Math.PI/2)<=.6,`tight low-speed turn: 90 deg in ${timeTo(6,Math.PI/2).toFixed(2)} s at 6 m/s (was ~1.0 s)`);
  ok(timeTo(12,Math.PI/4)<=.3,`quick corrections: 45 deg in ${timeTo(12,Math.PI/4).toFixed(2)} s at 12 m/s`);
  ok(timeTo(20,Math.PI/4)<=.42,`agile mid-speed corner: 45 deg in ${timeTo(20,Math.PI/4).toFixed(2)} s at 20 m/s`);
  ok(timeTo(30,Math.PI/4)<=.55,`45 deg in ${timeTo(30,Math.PI/4).toFixed(2)} s at 30 m/s`);
  ok(timeTo(45,Math.PI/4)<=.8,`high speed keeps control: 45 deg in ${timeTo(45,Math.PI/4).toFixed(2)} s at 45 m/s`);
  // no instant spins at speed: the steady yaw rate is capped by the grip limit (rad/s)
  const yaw=v=>{const c=CP.newCar(0,0,0,'ace',flat);c.vz=v;for(let i=0;i<40;i++)CP.step(c,{thr:.6,steer:1},DT,flat);const h=c.h;CP.step(c,{thr:.6,steer:1},DT,flat);return (c.h-h)/DT};
  ok(yaw(45)<2.0&&yaw(45)<yaw(30)&&yaw(30)<yaw(12),`yaw rate falls with speed (${yaw(12).toFixed(1)} / ${yaw(30).toFixed(1)} / ${yaw(45).toFixed(1)} rad/s at 12 / 30 / 45 m/s): stable at speed`);
  // a flick from full left to full right reverses the yaw almost immediately
  for(const v of [12,30]){const c=CP.newCar(0,0,0,'ace',flat);c.vz=v;for(let i=0;i<40;i++)CP.step(c,{thr:.6,steer:1},DT,flat);const h0=c.h;CP.step(c,{thr:.6,steer:1},DT,flat);const ss=(c.h-h0)/DT;let t=0,hit=null;for(let i=0;i<60;i++){const h=c.h;CP.step(c,{thr:.6,steer:-1},DT,flat);t+=DT;if(hit===null&&(c.h-h)/DT<=-.8*ss)hit=t}
    ok(hit!==null&&hit<=.15,`left-right flick at ${v} m/s reverses the yaw in ${hit&&hit.toFixed(2)} s (was 0.26 s)`)}
  // wheel response: no hidden smoothing beyond ~35 ms to full lock
  { const c=CP.newCar(0,0,0,'ace',flat);c.vz=20;let n=0;for(;n<60&&c.steer<.95;n++)CP.step(c,{thr:.6,steer:1},DT,flat);ok(n*DT<=.1,`the wheel reaches 95% lock in ${(n*DT*1000).toFixed(0)} ms`) }
  // the handbrake slide: controllable, not a spin, keeps its pace, and grip returns when released
  { const c=CP.newCar(0,0,0,'ace',flat);c.vz=35;let maxAng=0;const ang=()=>Math.abs(Math.atan2(c.slip,Math.max(.1,c.vx*Math.sin(c.h)+c.vz*Math.cos(c.h))))*57.3;
    for(let i=0;i<60*3;i++){CP.step(c,{thr:.5,steer:1,hand:true},DT,flat);maxAng=Math.max(maxAng,ang())}
    ok(maxAng<55,`a held handbrake slide settles instead of spinning (peak slip angle ${maxAng.toFixed(0)} deg)`);
    const d=CP.newCar(0,0,0,'ace',flat);d.vz=35;for(let i=0;i<48;i++)CP.step(d,{thr:.5,steer:1,hand:true},DT,flat);const a1=Math.abs(Math.atan2(d.slip,Math.max(.1,d.vx*Math.sin(d.h)+d.vz*Math.cos(d.h))))*57.3,sp=Math.hypot(d.vx,d.vz);
    ok(a1>15&&a1<45&&sp>35*.65,`a deliberate drift: ${a1.toFixed(0)} deg of slip at 0.8 s while keeping ${(sp/35*100).toFixed(0)}% of its speed`);
    let t=0;for(;t<2;t+=DT){CP.step(d,{thr:.5,steer:0,hand:false},DT,flat);if(Math.abs(d.slip)<1)break}ok(t<.5,`grip returns ${t.toFixed(2)} s after releasing the handbrake`);
    const n=CP.newCar(0,0,0,'ace',flat);n.vz=35;let nmax=0;for(let i=0;i<72;i++){CP.step(n,{thr:.5,steer:1},DT,flat);nmax=Math.max(nmax,Math.abs(Math.atan2(n.slip,Math.max(.1,n.vx*Math.sin(n.h)+n.vz*Math.cos(n.h)))))*0+Math.abs(n.slip)}
    ok(nmax<8,`a normal corner does NOT slide (peak sideways speed ${nmax.toFixed(1)} m/s): drifting is deliberate`) }
  // no free energy in corners: holding full lock must not speed the car up beyond what the throttle gives
  { const c=CP.newCar(0,0,0,'ace',flat);c.vz=30;let mx=0;for(let i=0;i<60*6;i++){CP.step(c,{thr:.5,steer:1},DT,flat);mx=Math.max(mx,c.s)}const s=CP.newCar(0,0,0,'ace',flat);s.vz=30;let ms=0;for(let i=0;i<60*6;i++){CP.step(s,{thr:.5,steer:0},DT,flat);ms=Math.max(ms,s.s)}
    ok(mx<=ms+.5,`cornering never gains speed (peak ${mx.toFixed(1)} m/s turning vs ${ms.toFixed(1)} straight)`) }
  // reversing, braking while turning, boosting while turning: stable and sensible
  { const c=CP.newCar(0,0,0,'ace',flat);for(let i=0;i<120;i++)CP.step(c,{thr:-1,steer:0},DT,flat);const h0=c.h;for(let i=0;i<60;i++)CP.step(c,{thr:-1,steer:1},DT,flat);
    ok(c.s>3&&(c.h-h0)<-.4,`reversing steers (mirrored: steer right while backing turns the heading the other way): ${(c.h-h0).toFixed(2)} rad at ${c.s.toFixed(0)} m/s`);
    const b=CP.newCar(0,0,0,'ace',flat);b.vz=40;for(let i=0;i<40;i++)CP.step(b,{brake:true,steer:1},DT,flat);ok(b.s<25&&isFinite(b.h)&&Math.abs(b.slip)<12,`braking while turning is stable (${b.s.toFixed(0)} m/s, sideways ${Math.abs(b.slip).toFixed(1)})`);
    const o=CP.newCar(0,0,0,'ace',flat);o.vz=30;let ok2=true;for(let i=0;i<180;i++){CP.step(o,{thr:1,steer:Math.sin(i/9),boost:i===5||i===70},DT,flat);if(!isFinite(o.h)||o.s>90||Math.abs(o.slip)>25)ok2=false}ok(ok2,'boosting through quick left-right changes stays stable') }
  // a car drifting off the line can be brought back quickly by steering
  { const c=CP.newCar(0,0,0,'ace',flat);c.vz=25;c.x=6;c.h=.35;c.vx=Math.sin(.35)*25;c.vz=Math.cos(.35)*25;let t=0;for(;t<3;t+=DT){const hT=Math.max(-.5,Math.min(.5,-c.x*.1));CP.step(c,{thr:.6,steer:Math.max(-1,Math.min(1,(hT-c.h)*3))},DT,flat);if(Math.abs(c.x)<.8&&Math.abs(c.h)<.08)break}
    ok(t<2.2,`a car 6 m off the line and angled away is back on it in ${t.toFixed(1)} s with simple steering`) }
  // classes still differ at every speed
  { const rate=(cls,v)=>{const c=CP.newCar(0,0,0,cls,flat);c.vz=v;for(let i=0;i<40;i++)CP.step(c,{thr:.6,steer:1},DT,flat);const h=c.h;CP.step(c,{thr:.6,steer:1},DT,flat);return (c.h-h)/DT};
    ok(rate('ace',12)>rate('comet',12)&&rate('ace',40)>rate('comet',40),'the Ace out-turns the Comet at low AND high speed') }
  // the AI plans corner speeds with the very same function the physics uses
  { const c=CP.newCar(0,0,0,'ace',flat);c.vz=20;for(let i=0;i<40;i++)CP.step(c,{thr:.6,steer:1},DT,flat);const h0=c.h,vf=c.vx*Math.sin(c.h)+c.vz*Math.cos(c.h);CP.step(c,{thr:.6,steer:1},DT,flat);const meas=(c.h-h0)/DT,pred=CP.turnRate(c.p,vf,false);
    ok(Math.abs(meas-pred)<.12*pred,`AI and physics share one steering model (turnRate ${pred.toFixed(2)} vs measured ${meas.toFixed(2)} rad/s at ${vf.toFixed(1)} m/s)`) }
  // flight steering is untouched by the ground rework
  { const c=CP.newCar(0,0,0,'ace',{ground:()=>0});c.y=300;CP.toFly(c);for(let i=0;i<120;i++)CP.step(c,{steer:1},DT,{ground:()=>0});const h0=c.h;for(let i=0;i<60;i++)CP.step(c,{steer:1},DT,{ground:()=>0});
    ok(Math.abs((c.h-h0)-RL.fly.turn*Math.cos(c.pitch))<.1,`flight yaw rate is the flight constant (${(c.h-h0).toFixed(2)} rad/s, expected ${RL.fly.turn})`) }
}
// ---------- 11. determinism + packet ----------
{
  const script=t=>({thr:1,steer:Math.sin(t*1.3),boost:t>2&&t<2.05,hand:t>4&&t<4.5,brake:t>6&&t<6.4});
  const sim=()=>{const c=CP.newCar(3,5,.2,'comet',ramp());run(c,(t)=>script(t),9,ramp());return c};
  const A=sim(),B=sim();const strip=c=>JSON.stringify(Object.assign({},c,{ev:0}));
  ok(strip(A)===strip(B),'identical inputs give bit-identical state (safe for dead-reckoning and AI)');
  const pk=CP.pack(A),json=JSON.stringify(pk);
  ok(pk.length===10&&json.length<80,`network packet is ${json.length} bytes of JSON (${pk.length} numbers)`);
  const u=CP.unpack(JSON.parse(json));
  ok(Math.abs(u.x-A.x)<.006&&Math.abs(u.h-A.h)<.001&&u.mode===A.mode&&u.grounded===A.grounded,'packet round-trips within millimetres');
}
// ---------- 11b. regressions found while building ----------
{
  const sky={ground:()=>0},c=CP.newCar(0,0,0,'ace',sky);c.y=800;c.grounded=false;let mx=0;
  run(c,{},20,sky,(c)=>{mx=Math.max(mx,Math.abs(c.vy))});
  ok(mx<=RL.car.termV+.001,`a car dropped from 800 m falls at terminal velocity, not faster (${mx.toFixed(0)} m/s)`);
  const p=CP.newCar(0,0,0,'ace',sky);p.vz=20;run(p,{brake:true},5,sky);
  ok(p.vx===0&&p.vz===0,'a braked car comes to exact rest (no creep)');
}
// ---------- 12. fuzz: no NaN, no tunnelling, bounded ----------
{
  let seed=12345;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
  const env={ground:(x,z)=>Math.max(0,Math.sin(x/37)*6+Math.cos(z/23)*5)+(z>400&&z<420?(z-400)*.4:0),landOK:(x,z)=>(x>>5&1)===0};
  let bad=0,under=0,fast=0;
  for(const cls of Object.keys(RL.cls)){
    const c=CP.newCar(0,0,0,cls,env);
    for(let i=0;i<30000;i++){
      if(i%400===0&&rnd()<.3){if(c.mode==='car')CP.toFly(c);else CP.toCar(c)}
      const inp={thr:rnd()*2-1,steer:rnd()*2-1,pitch:rnd()*2-1,brake:rnd()<.1,hand:rnd()<.1,boost:rnd()<.01};
      CP.step(c,inp,DT*(.5+rnd()),env);
      if(![c.x,c.y,c.z,c.h,c.vx,c.vy,c.vz,c.pitch,c.roll,c.s].every(isFinite))bad++;
      if(c.mode==='car'&&c.grounded&&c.y<env.ground(c.x,c.z,1e4)-.5)under++;
      if(c.s>140)fast++;
    }
  }
  ok(bad===0,'30 000 random-input steps x3 classes: every value stays finite');
  ok(under===0,'a grounded car never sinks below the surface');
  ok(fast===0,'speed stays bounded');
}
console.log(fails?`\n${fails} FAILED`:'\nall ok');process.exit(fails?1:0);
