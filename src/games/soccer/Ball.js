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

  // ---------- possession ----------
  // FREE -> (first touch) -> CONTROLLED -> (pass / shot / tackle / lost) -> FREE. The ball never "sticks": a controlled ball is held AHEAD of its owner by a
  // spring, close when walking (tight dribble) and loose when sprinting. A little stride rhythm pushes it further out and back, and that is the window
  // a tackle can exploit. Entities are {id,team,x,z,vx,vz,face,alt,sprinting,t:{lock,stun,tcd}} so humans and (later) AI use the same code.
  const K=C.ctrl,F1=C.first,TK=C.tackle;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const dirOf=pl=>({x:Math.sin(pl.face),z:Math.cos(pl.face)});
  function carryDist(b,pl){
    const sp=Math.hypot(pl.vx,pl.vz),f=clamp((sp-4.5)/5,0,1),base=K.dist+(K.distSprint-K.dist)*Math.max(f,pl.sprinting&&sp>3?1:0);
    return base*(1+K.rhythm*Math.sin((b.ownT||0)*14)*Math.min(1,sp/6));                  // ~2.2 strides a second
  }
  const dist=(b,pl)=>Math.hypot(b.x-pl.x,b.z-pl.z);
  function exposure(b,pl){return clamp((dist(b,pl)-K.dist)/(K.distSprint-K.dist),0,1)}   // 0 = ball tucked at the feet, 1 = hanging out in front
  function canControl(b,pl){return !b.owner&&pl.t.lock<=0&&pl.t.stun<=0&&pl.alt<K.airMax&&b.y<1.3&&dist(b,pl)<=BR.r+K.reach}
  function take(b,pl){b.owner=pl.id;b.ownT=0}
  function control(b,pl,rng){                               // returns 'clean' | 'bad'
    const bs=Math.hypot(b.vx,b.vz);                          // difficulty comes from how fast the BALL is travelling, not from how fast you run:
    if(bs<=F1.minSpeed){take(b,pl);return 'clean'}           // a slow or stationary ball is simply taken, even at a sprint
    const pv=Math.hypot(pl.vx,pl.vz),ux=pv>1?pl.vx/pv:Math.sin(pl.face),uz=pv>1?pl.vz/pv:Math.cos(pl.face);
    const align=bs>.1?(ux*b.vx+uz*b.vz)/bs:0;                // +1 running the way the ball travels (taking it with you), -1 running into it
    const q=1-(bs-F1.minSpeed)/(K.maxRel-F1.minSpeed)*.85+.25*align+(rng()-.5)*.25;
    if(q>=.45){take(b,pl);return 'clean'}
    const nx=b.x-pl.x,nz=b.z-pl.z,d=Math.hypot(nx,nz)||1,side=(rng()-.5)*2*F1.err;   // a bad touch: it squirts away and nobody owns it for a moment
    b.vx=b.vx*F1.bounce+(nx/d)*3-(nz/d)*side*3;b.vz=b.vz*F1.bounce+(nz/d)*3+(nx/d)*side*3;if(b.vy<1)b.vy=1.2;
    pl.t.lock=F1.lock;return 'bad';
  }
  function carry(b,pl,dt){                                  // hold the ball ahead of the owner; Ball.phys still applies walls, goals and nets
    const d=carryDist(b,pl),dir=dirOf(pl),tx=pl.x+dir.x*d,tz=pl.z+dir.z*d;
    b.vx=(tx-b.x)*K.spring+pl.vx*.9;b.vz=(tz-b.z)*K.spring+pl.vz*.9;
    if(b.y<=BR.r+.05)b.vy=0;
    b.ownT=(b.ownT||0)+dt;
  }
  const stillOwned=(b,pl)=>dist(b,pl)<=K.loseDist&&pl.alt<K.airMax&&b.y<1.6;
  function tackle(b,att,owner,rng){                         // returns {hit,why?,p?}; timing matters: a tucked ball is hard to win
    if(!owner||att.t.tcd>0)return {hit:false,why:'cooldown'};
    const dx=owner.x-att.x,dz=owner.z-att.z,d=Math.hypot(dx,dz);
    if(d>TK.reach)return {hit:false,why:'far'};
    let ang=Math.atan2(dx,dz)-att.face;ang=Math.atan2(Math.sin(ang),Math.cos(ang));
    if(Math.abs(ang)>TK.cone)return {hit:false,why:'angle'};
    const p=clamp(TK.base+exposure(b,owner)*TK.expose+(att.sprinting?TK.sprint:0),.05,.95);
    if(rng()<p){                                            // won it: the ball rolls loose toward the tackler, the old owner can't re-take it for a beat
      const bx=att.x-b.x,bz=att.z-b.z,bd=Math.hypot(bx,bz)||1,lat=(rng()-.5)*1.6;
      b.owner=null;b.vx=(bx/bd)*TK.knock-(bz/bd)*lat+owner.vx*.3;b.vz=(bz/bd)*TK.knock+(bx/bd)*lat+owner.vz*.3;b.vy=1.2;
      owner.t.lock=TK.victimLock;att.t.tcd=TK.cd;return {hit:true,p};
    }
    att.t.tcd=TK.missCd;att.t.stun=TK.stun;return {hit:false,why:'miss',p};
  }
  return {phys,touches,canControl,control,carry,stillOwned,exposure,tackle,carryDist};
})();
