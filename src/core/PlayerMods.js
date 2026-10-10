// PlayerMods: lets an activity change HOW the player moves without writing to S (see DESIGN.md: new code never writes S).
// The main loop asks it twice per frame (index.html tickFrame): sprint(default) and speed().
//   PlayerMods.set({sprint:true|false (force it), speed:1.15 (multiplier on the world's walk 6 / sprint 12 m/s)})   PlayerMods.clear()
// Football uses it for its own pacing: no stick-driven sprint, a Sprint button, slower with the ball, a stun after a missed tackle.
const PlayerMods=(()=>{
  let m=null;
  return {
    set(o){m=o},
    clear(){m=null},
    sprint(d){return m&&m.sprint!==undefined?m.sprint:d},
    speed(){return m&&m.speed?m.speed:1},
    active:()=>!!m
  };
})();
