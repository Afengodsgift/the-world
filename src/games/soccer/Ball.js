// SocBall: the ball. Pure physics on a plain state object {x,y,z,vx,vy,vz} (y = height of the ball's CENTRE above the pitch surface),
// so it runs identically on the host and in tests. Possession (control, dribble, first touch, tackle) joins it in the next commit.
// Globals: PITCH, SOCCER.
const SocBall=(()=>{
  const C=SOCCER,P=PITCH,BR=C.ball;
  function phys(b,dt){
    const r=BR.r;
    b.vy+=BR.g*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
    if(b.y<=r){b.y=r;if(b.vy<-1.4)b.vy=-b.vy*BR.bounce;else b.vy=0;const k=Math.exp(-BR.roll*dt);b.vx*=k;b.vz*=k}
    else{const k=Math.exp(-BR.air*dt);b.vx*=k;b.vz*=k}
    const rx=b.x-P.x,rz=b.z-P.z,mh=C.goalW/2,passes=Math.abs(rz)<mh-r*.4&&b.y<C.goalH-r*.4;   // does the ball fit through the goal mouth?
    if(Math.abs(rx)<=C.hw){
      if(Math.abs(rz)>C.hh-r){b.z=P.z+Math.sign(rz)*(C.hh-r);b.vz=-b.vz*BR.wall}                // side walls
      if(Math.abs(rx)>C.hw-r&&!passes){b.x=P.x+Math.sign(rx)*(C.hw-r);b.vx=-b.vx*BR.wall}        // end walls (except the goal mouth)
    }else{                                                                                       // inside the net
      if(Math.abs(rz)>mh-r){b.z=P.z+Math.sign(rz)*(mh-r);b.vz=-b.vz*BR.wall*.5}
      if(b.y>C.goalH-r){b.y=C.goalH-r;if(b.vy>0)b.vy=-b.vy*.3}
      if(Math.abs(rx)>C.hw+C.goalD-r){b.x=P.x+Math.sign(rx)*(C.hw+C.goalD-r);b.vx*=-.25}
    }
    const sp=Math.hypot(b.vx,b.vz);if(sp>BR.maxSpeed){b.vx*=BR.maxSpeed/sp;b.vz*=BR.maxSpeed/sp}
  }
  // running into the ball pushes it ahead of you
  function touches(b,pl){
    const dx=b.x-pl.x,dz=b.z-pl.z,d=Math.hypot(dx,dz)||1e-3;
    if(d>BR.r+C.touch.reach||pl.alt>1.6||b.y>1.5||pl.t.cd>0)return;
    const nx=dx/d,nz=dz/d,ps=Math.hypot(pl.vx,pl.vz),into=ps>.5?Math.max(0,(pl.vx*nx+pl.vz*nz)/ps):0;
    const push=Math.max(C.touch.minPush,ps*C.touch.carry*(.4+.6*into));
    b.vx=nx*push+pl.vx*.35;b.vz=nz*push+pl.vz*.35;if(b.vy<1)b.vy=.8;
    b.x=pl.x+nx*(BR.r+C.touch.reach+.02);b.z=pl.z+nz*(BR.r+C.touch.reach+.02);pl.t.cd=C.touch.cd;
  }
  return {phys,touches};
})();
