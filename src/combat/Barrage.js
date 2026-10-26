// WARDEN: Phantom Barrage - pure numbers for the boss set piece (no THREE / DOM). The boss pulls you to the arena centre, two phantom copies of it appear, all three strike at once in BULLET TIME,
// and a "tap Dodge" ring counts down to the sweet spot. A real dodge (its invulnerability frames) beats all three; a miss lets all three land for about half your health (never lethal).
const Barrage=(()=>{
  const MOVE='thrust',            // the strike every attacker uses (windup 14 + lunge 10, active at tick 24)
    SWEET=19,                     // tick (since the strike command) at which a dodge started now covers the hit window best
    SCALE=.25,                    // bullet-time speed of the whole fight
    POP=1.1,                      // real seconds of "they appear" before the strike
    THRESH=[.65,.3];              // boss health fractions that trigger the 1st / 2nd barrage
  // total damage of a missed barrage: half of max health, but never more than 90% of what you have left, split over the three hits
  function dmFor(hpMax,hp,moveDmg,n){const total=Math.min(hpMax*.5,Math.max(0,hp-1)*.9);return total/(n||3)/moveDmg}
  // sim speed against ticks since the strike: normal for the first few ticks (you SEE them lunge out), easing into bullet time, held until after the hits, then easing back out
  function speed(tk,done){if(done)return Math.min(1,SCALE+(1-SCALE)*Math.min(1,done));const u=Math.min(1,Math.max(0,(tk-3)/7));return 1+(SCALE-1)*u*u*(3-2*u)}
  // which barrage stage (0 none, 1, 2) a boss at this health fraction is entitled to
  function stage(frac){return frac<=THRESH[1]?2:frac<=THRESH[0]?1:0}
  // ring progress for the prompt: 0 = just appeared (big), 1 = the sweet spot (small); result of a tap at a given tick
  const ring=tk=>Math.min(1.4,Math.max(0,tk/SWEET));
  const inWindow=tk=>tk>=SWEET-6&&tk<=SWEET+7;     // the ring turns green here (matches the invulnerability overlap with the active ticks 24..29)
  // Input time stamps. The fight runs on its own clock (vt) that crawls at `tsc` x real time in bullet time. A tap is stamped by the browser in REAL time, so it must be converted into that clock:
  // vt (where the sim is as of the last frame) + the real time since that frame x the current speed. Stamping with raw real time put every tap in the sim's future during slow motion, so it sat in
  // the queue and fired when the clock caught up (and, as the lag never closes, every later tap was late too).
  function stamp(ts,vl,vt,tsc){if(!vl||typeof ts!=='number')return vt;let d=ts-vl;if(!(d>-1000&&d<1000))d=0;return Math.max(0,vt+Math.max(-120,Math.min(40,d))*(tsc>0?tsc:1))}
  // ---- co-op ----
  // Solo: the boss + 2 phantoms all strike YOU. Co-op: the boss + 3 phantoms, two for each player (host 'h' / guest 'g'); the players stand side by side so the lunges are not the same line.
  // Each client judges ONLY its own player (the same rule as the rest of the co-op model); the boss reward is shared and the host applies it.
  const plan=co=>co?{off:[0,.7,-.7,1.5],roles:'hggh'}:{off:[0,.95,-.95],roles:'hhh'};
  const slot=(role,a0,co)=>{const o=co?(role==='h'?-1.5:1.5):0;return{dx:Math.cos(a0)*o,dz:-Math.sin(a0)*o}};
  const count=(roles,r)=>roles.split('').filter(c=>c===r).length;
  const reward=co=>co?.5:1;     // share of the boss reward ONE perfect dodge earns (two perfect dodges in co-op = the full solo reward)
  return{plan,slot,count,reward,stamp,MOVE,SWEET,SCALE,POP,THRESH,dmFor,speed,stage,ring,inWindow}})();
if(typeof module!=='undefined')module.exports=Barrage;
