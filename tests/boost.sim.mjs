// Boost: the charged-boost state machine (brake, compress, RELEASE). Pure logic: no THREE needed.
import fs from 'fs';
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
const load=()=>new Function(fs.readFileSync(new URL('../src/movement/Boost.js',import.meta.url),'utf8')+';return Boost')();
const mk=(dt=1/60)=>{const B=load(),S={flying:true,boost:false,hurt:0},t={now:0};
  const run=(secs)=>{for(let i=0;i<Math.round(secs/dt);i++){B.update(S,dt);t.now+=dt}};
  return {B,S,run,hold:(secs)=>{B.press();run(secs)},rel:()=>B.release(S),mode:()=>B.state.mode};};

// 1) tap = the original toggle, never a charge
{const g=mk();g.hold(.1);g.rel();ok(g.S.boost===true&&g.mode()==='ready','quick tap toggles the old continuous boost (unchanged behaviour)');
 g.hold(.1);g.rel();ok(g.S.boost===false,'another tap turns it off')}
// 2) hold charges; speed brakes but never to zero (steerable)
{const g=mk();g.hold(.18+.05);ok(g.mode()==='charging','holding past the tap time starts charging');
 g.run(.5);const m1=g.B.speedMul();g.run(.6);const m2=g.B.speedMul();
 ok(m1<1&&m2<m1&&m2>=g.B.CFG.brake-1e-9&&m2>.3,'charging brakes the flight speed ('+m1.toFixed(2)+' -> '+m2.toFixed(2)+' of normal) but never to a standstill');
 ok(g.B.view.charge>0&&g.B.view.charge<=1,'charge builds 0..1 for the camera/pose/audio/HUD ('+g.B.view.charge.toFixed(2)+')')}
// 3) early release cancels without a burst
{const g=mk();g.hold(.18+.1);const c=g.B.state.charge;g.rel();ok(c<g.B.CFG.minCharge&&g.mode()==='ready'&&g.B.state.ev===0,'releasing before the minimum charge cancels: no burst, back to ready')}
// 4) burst: peak well above boost, sharp rise, tapers, then recovery, then ready
{const g=mk();g.hold(.18+g.B.CFG.chargeT*.5);const ch=g.B.state.charge;g.rel();
 ok(g.mode()==='burst'&&g.B.state.ev===1,'releasing with enough charge fires the burst');
 const peakMin=g.B.state.peak;ok(peakMin>=2&&peakMin<3.2,'half charge peaks at '+peakMin.toFixed(2)+'x boost (= '+(peakMin*70).toFixed(0)+' m/s)');
 let maxM=0,tMax=0,t=0;const mul=[];for(let i=0;i<180;i++){g.B.update(g.S,1/60);t+=1/60;const m=g.B.speedMul();mul.push(m);if(m>maxM){maxM=m;tMax=t}if(g.mode()==='recover')break}
 ok(maxM>=peakMin*.97&&tMax<.2,'peak reached within '+tMax.toFixed(2)+' s of release ('+maxM.toFixed(2)+'x): a sharp launch');
 let after=false,dec=true;for(let i=mul.indexOf(maxM);i<mul.length-1;i++){if(mul[i+1]>mul[i]+1e-9)dec=false}
 ok(dec&&mul[mul.length-1]<1.2,'then it tapers smoothly back toward normal (no abrupt stop)');
 ok(g.B.holdsBoost()&&g.B.view.burst>0,'recovery still counts as boosting (camera/FOV ease back instead of snapping)');
 g.run(g.B.CFG.recover+.05);ok(g.mode()==='ready'||g.B.state.cd>0,'recovery ends and the ability returns')}
// 5) full charge: bigger and longer; fires itself; cannot get stuck
{const g=mk();g.B.press();g.run(.18+g.B.CFG.chargeT+g.B.CFG.fullHold+.1);ok(g.mode()==='burst'&&g.B.state.launch>.99,'held at full charge it fires by itself (you cannot get stuck charging)');
 const peakFull=g.B.state.peak,dur=g.B.state.dur;ok(peakFull>=3.19&&dur>=1.1,'full charge: '+peakFull.toFixed(1)+'x (='+(peakFull*70).toFixed(0)+' m/s) for '+dur.toFixed(2)+' s');
 g.run(3);ok(g.mode()!=='charging'&&g.B.state.ev===1,'still holding the button after an auto-fire does NOT start charging again (must let go first)');
 g.rel();g.run(.5);g.hold(.18+.1);ok(g.mode()==='charging','after letting go, charging is available again')}
{const g=mk();g.B.CFG.fullHold=99;g.B.press();g.run(g.B.CFG.maxHold+.1);ok(g.B.state.ev===1,'maxHold is a hard cap even if the charge never reaches full')}
// 6) interruptions
{const g=mk();g.hold(.6);g.S.flying=false;g.run(.02);ok(g.mode()==='ready'&&g.B.view.charge===0,'landing / entering water cancels a charge');
 const h=mk();h.hold(.6);h.S.hurt=.5;h.run(.02);ok(h.mode()==='ready','a hard hit cancels a charge');
 const k=mk();k.hold(.6);k.S.hurt=.1;k.run(.1);ok(k.mode()==='charging','a light hit does not');
 const b=mk();b.hold(.18+.6);b.rel();b.S.flying=false;b.run(.02);ok(b.mode()==='ready'&&b.B.speedMul()===1,'landing during a burst resets it too')}
// 7) cooldown / spam: tapping the button around a burst cannot cheese anything
{const g=mk();g.hold(.18+.6);g.rel();g.run(g.B.state.dur+g.B.CFG.recover+.01);
 g.hold(.18+.3);ok(g.mode()==='ready'||g.B.state.cd>0||g.mode()==='charging','after a burst there is only a short cooldown ('+g.B.CFG.cooldown+' s)');
 const h=mk();h.hold(.18+.7);h.rel();h.B.press();h.run(.3);ok(h.mode()!=='charging','you cannot start a new charge in the middle of a burst')}
// 8) forward drive and rates
{const g=mk();g.hold(.18+.7);g.rel();ok(g.B.driving()&&g.B.upRate(4)===g.B.CFG.upRate,'during the burst you are driven forward and accelerate hard');
 g.run(2);ok(!g.B.driving()&&g.B.upRate(4)===4,'afterwards flight returns to normal rates');
 const c=mk();c.hold(.5);ok(c.B.downRate(3.2)===c.B.CFG.brakeRate&&!c.B.driving(),'while charging you brake harder than a normal glide-out and are not driven')}
// 9) frame-rate independence: same hold, 30 / 60 / 144 fps give the same result
{const res=[30,60,144].map(f=>{const g=mk(1/f);g.hold(.18+.7);const c=g.B.state.charge;g.rel();g.run(.2);return {c,m:g.B.speedMul(),mode:g.mode()}});
 ok(res.every(r=>Math.abs(r.c-res[0].c)<.03&&r.mode==='burst')&&Math.abs(res[0].m-res[2].m)<.15,'results match at 30/60/144 fps (charge '+res.map(r=>r.c.toFixed(2)).join(' / ')+')')}
// 10) the view never allocates and stays in range through a whole cycle
{const g=mk();const v=g.B.view;let inR=true;g.B.press();for(let i=0;i<600;i++){g.B.update(g.S,1/60);if(i===100)g.B.release(g.S);if(i===200){g.B.press()}if(i===330)g.B.release(g.S);
  if(!(v.charge>=0&&v.charge<=1&&v.burst>=0&&v.burst<=1))inR=false}
 ok(inR&&g.B.view===v,'charge and burst stay within 0..1 through repeated cycles, and the view object is reused')}
// 11) not flying: nothing happens except the tap toggle (swim/ground behaviour untouched)
{const g=mk();g.S.flying=false;g.hold(1);ok(g.mode()==='ready'&&g.B.speedMul()===1,'on the ground a long hold never charges (the swim dive button is handled elsewhere)')}
console.log(bad?bad+' failed':'boost ok');process.exit(bad?1:0);
