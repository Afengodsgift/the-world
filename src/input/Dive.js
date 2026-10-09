// Dive: vertical swimming. At the surface, HOLD dive (button / C key) to sink; release and you float back up; Jump kicks you upward.
// Pure state update on the player object S so it can be unit-tested (tests/dive.sim.js). The tick() in index.html calls step() just before the
// normal gravity/ground code and skips that code while S.dv is true (see index.html).
//   S.dv  = true while submerged (below the surface). S.y is then the player's depth (surface = -1).
// Knobs: DOWN (sink speed), UP (float-up speed), KICK (jump kick), MAXD (deepest point), MINSEABED (don't dive in shallows).
const Dive=(()=>{
  const SURF=-1,MAXD=-22,DOWN=-4.2,UP=2.8,KICK=5.2,MINSEABED=-2.4;
  // o: {wat: over sea, seabed: terrain height under the player (negative = underwater), down: dive held, kick: jump pressed this frame}
  // returns true while submerged
  function step(S,dt,o){
    if(!S.dv){
      if(o.wat&&S.grounded&&!S.flying&&o.down&&o.seabed<MINSEABED){S.dv=true;S.vy=-1.2}
      else return false;
    }
    const floor=Math.max(o.seabed+.45,MAXD);
    if(!o.wat||S.flying||floor>=SURF-.05){S.dv=false;if(S.y<SURF)S.y=SURF;S.vy=0;return false}     // swam into the shallows / left the sea: stand up
    S.vy+=((o.down?DOWN:UP)-S.vy)*Math.min(1,dt*3.5);
    if(o.kick&&S.vy<KICK)S.vy=KICK;
    S.y+=S.vy*dt;
    if(S.y<floor){S.y=floor;if(S.vy<0)S.vy=0}
    if(S.y>=SURF){S.y=SURF;S.vy=0;S.dv=false;return false}
    return true;
  }
  return {step,SURF,MAXD};
})();
