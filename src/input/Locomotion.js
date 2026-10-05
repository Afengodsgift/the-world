// Locomotion: ground / air / swim horizontal movement with acceleration (flight keeps its own inertia in tick()).
// Before: position += direction * speed * dt, i.e. instant start, instant stop, no momentum. Now the velocity eases toward the input target:
//   ground  quick pick-up, slightly quicker stop (feels responsive but physical)
//   air     momentum is mostly kept (a running jump carries), but you can still steer
//   swim    slow, floaty build-up and glide
// Rates are exponential (frame-rate independent). Teleports (map travel, respawn) are detected and reset the velocity.
// Tuning knobs: RATE below. Globals used: none (operates on the S object passed in).
const Locomotion=(()=>{
  const RATE={ground:{up:11,down:16},air:{up:9,down:2.2},swim:{up:3.5,down:2.8}};
  const MAXCARRY=24;                                   // speed carried over from flight so a boost landing skids but doesn't slide across the map
  function move(S,tx,tz,dt,mode){
    if(S._lx!==undefined&&Math.hypot(S.x-S._lx,S.z-S._lz)>2.5){S.gvx=S.gvz=0}          // teleported since last frame
    const r=RATE[mode]||RATE.ground,vx=S.gvx||0,vz=S.gvz||0;
    const k=1-Math.exp(-(Math.hypot(tx,tz)>Math.hypot(vx,vz)?r.up:r.down)*dt);
    S.gvx=vx+(tx-vx)*k;S.gvz=vz+(tz-vz)*k;
    if(!tx&&!tz&&Math.hypot(S.gvx,S.gvz)<.05)S.gvx=S.gvz=0;
    S.x+=S.gvx*dt;S.z+=S.gvz*dt;S._lx=S.x;S._lz=S.z;
  }
  // flight calls this each frame: remembers its velocity (capped) so leaving flight carries momentum, and marks the position as "ours"
  function carry(S){const m=Math.hypot(S.fvx||0,S.fvz||0),s=m>MAXCARRY?MAXCARRY/m:1;S.gvx=(S.fvx||0)*s;S.gvz=(S.fvz||0)*s;S._lx=S.x;S._lz=S.z}
  return {move,carry,RATE};
})();
