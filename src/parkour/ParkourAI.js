// PARKOUR AI: a runner brain. It follows the course waypoints and presses the same buttons a player would (jump / slide / flip) through ParkourCore.step.
// skill 0..1: higher = cleaner timing, better line, fewer falls. rng is injected so tests are deterministic.
const ParkourAI=(()=>{
  function create(skill,rng){return{wi:0,skill,rng,held:0,trick:-1,flipAt:0,done:{},stuck:0,lastD:0,lateX:0,miss:0,speedK:.9+skill*.1}}
  const ang=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  // one decision: returns the input for this frame
  function think(W,course,B,ai,dt){
    const wps=course.wps,inp={mx:0,mz:0,jump:false,jumpHeld:false,slide:false,trick:false,walk:false};
    while(ai.wi<wps.length-1){const w=wps[ai.wi],d=Math.hypot(w.x-B.x,w.z-B.z);
      const nx=wps[ai.wi+1],seg=Math.hypot(nx.x-w.x,nz(nx,w)),along=((B.x-w.x)*(nx.x-w.x)+(B.z-w.z)*(nx.z-w.z))/(seg||1);
      if(w.act&&!ai.done[ai.wi]&&d>w.r*1.5&&along>seg*.6){ai.done[ai.wi]=1;ai.wi++;continue}   // overshot an action point (a missed jump): move on
      if(!w.act&&(d<w.r||along>seg*.92)){ai.wi++;continue}
      if(w.act&&ai.done[ai.wi]){ai.wi++;continue}
      break}
    // stuck (pinned against something with no speed): go back to the last action point and take another run at it
    if(B.mode==='ground'&&B.spd<1.5&&ai.wi<wps.length-1){ai.stuck+=dt;if(ai.stuck>.9){ai.stuck=0;let k=ai.wi;while(k>0&&!wps[k].act)k--;for(let i=k;i<wps.length;i++)delete ai.done[i];ai.wi=Math.max(0,k-1);ai.miss=0;ai.held=0}}else ai.stuck=0;
    const w=wps[Math.min(ai.wi,wps.length-1)];
    // steer straight at the waypoint (a little lateral wobble for low skill)
    let tx=w.x-B.x,tz=w.z-B.z;const d=Math.hypot(tx,tz)||1;tx/=d;tz/=d;
    const wob=(1-ai.skill)*.12*Math.sin(B.t*3+ai.rng()*0);inp.mx=tx*Math.cos(wob)-tz*Math.sin(wob);inp.mz=tx*Math.sin(wob)+tz*Math.cos(wob);
    // hold the run speed a touch lower for weaker runners
    if(ai.speedK<1){const lim=ParkourCore.maxRun(B)*ai.speedK;if(B.spd>lim&&B.mode==='ground'){inp.mx*=.55;inp.mz*=.55}}
    // timed actions
    if(w.act&&!ai.done[ai.wi]&&d<(w.ar||1.2)+B.spd*.04&&(B.mode==='ground'||w.act==='flip'||B.mode==='slide')){
      ai.done[ai.wi]=1;
      if(ai.rng()>.78+ai.skill*.2&&w.act!=='flip'){ai.miss=.14+ai.rng()*.2;ai.pend=w.act}   // fumbles: late press
      else fire(ai,w.act,inp)}
    if(ai.miss>0){ai.miss-=dt;if(ai.miss<=0)fire(ai,ai.pend||'jump',inp)}
    if(ai.held>0){ai.held-=dt;inp.jumpHeld=true}
    if(ai.trick>=0){ai.trick-=dt;if(ai.trick<=0&&B.mode==='air'){inp.trick=true;ai.trick=-1}}
    // reactive wall-up: a tall block dead ahead while running
    if(B.mode==='ground'&&B.spd>5&&!inp.jump){const h=Math.atan2(B.vx,B.vz),r=ParkourCore.ray(W,B.x,B.z,Math.sin(h),Math.cos(h),B.spd*.2+1.2,B.y+.6);
      if(r){const rel=r.top-B.y;if(rel>1.62&&rel<3.7&&r.t<B.spd*.2+1.0){inp.jump=true;inp.jumpHeld=true}}}
    return inp}
  const nz=(a,b)=>a.z-b.z;
  function fire(ai,act,inp){
    if(act==='jump'){inp.jump=true;inp.jumpHeld=true;ai.held=.38}
    else if(act==='slide')inp.slide=true;
    else if(act==='flip'){inp.jump=true;inp.jumpHeld=true;ai.held=.3;ai.trick=.2}}
  return{create,think}})();
