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
  return{MOVE,SWEET,SCALE,POP,THRESH,dmFor,speed,stage,ring,inWindow}})();
if(typeof module!=='undefined')module.exports=Barrage;
