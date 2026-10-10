// SocPlay: what a player DOES with the ball: pick a pass target and work out pass / shot velocities. Pure functions of plain entities
// ({id,team,x,z,vx,vz,face,sprinting}), so the same code serves humans now and AI teammates later. Globals: SOCCER, PITCH.
const SocPlay=(()=>{
  const C=SOCCER,P=PITCH,KK=C.kick,PS=C.pass,SH=C.shoot;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const aimAngle=(pl,aim)=>aim?Math.atan2(aim.x,aim.z):pl.face;           // aim = unit {x,z} from the stick, else where you face

  // the teammate inside the cone around your aim whose angle and distance suit a pass best (null if nobody is there)
  function passTarget(pl,roster,aim){
    const a=aimAngle(pl,aim);let best=null,bs=1e9;
    for(const r of roster){
      if(r.team!==pl.team||r.id===pl.id)continue;
      const dx=r.x-pl.x,dz=r.z-pl.z,d=Math.hypot(dx,dz);
      if(d<PS.minRange||d>PS.range)continue;
      const ang=Math.abs(wrap(Math.atan2(dx,dz)-a));if(ang>PS.cone)continue;
      const score=ang/PS.cone+Math.abs(d-14)/28;if(score<bs){bs=score;best=r}
    }
    return best;
  }
  // pass: arrives at a controllable speed, led into the space a running teammate is heading to; with no teammate it is a plain ground ball
  function passVel(pl,roster,power,aim){
    const tgt=passTarget(pl,roster,aim),a=aimAngle(pl,aim);
    if(tgt){
      const dx=tgt.x-pl.x,dz=tgt.z-pl.z,d=Math.hypot(dx,dz),sp=clamp(PS.minSp+d*PS.k,PS.minSp,PS.maxSp)*(.85+.3*power);
      const t=d/sp*PS.lead,lx=tgt.x+tgt.vx*t-pl.x,lz=tgt.z+tgt.vz*t-pl.z,ld=Math.hypot(lx,lz)||1;
      return {v:[lx/ld*sp,clamp(.6+d*.05,.6,2),lz/ld*sp],target:tgt.id};
    }
    const sp=PS.minSp+1+(PS.maxSp-PS.minSp-1)*power;
    return {v:[Math.sin(a)*sp,1,Math.cos(a)*sp],target:null};
  }
  // shot: aim help toward the goal you attack, power from the hold, and an aim error that grows when sprinting
  function shootVel(pl,goalX,power,aim,rng){
    let a=aimAngle(pl,aim);const d=wrap(Math.atan2(goalX-pl.x,P.z-pl.z)-a);
    if(Math.abs(d)<KK.assist)a+=d*.6;
    const err=(pl.sprinting?SH.errSprint:SH.errStand)*(.7+.6*power);a+=(rng()-.5)*2*err;
    const sp=KK.tap+(KK.full-KK.tap)*power,lf=KK.loft+(KK.loftFull-KK.loft)*power;
    return [Math.sin(a)*sp,lf,Math.cos(a)*sp];
  }
  return {passTarget,passVel,shootVel};
})();
