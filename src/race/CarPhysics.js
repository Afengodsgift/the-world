// CarPhysics: the pure physics of a Skybreak Rally vehicle. No rendering, no network, no globals except RALLY (data/rally.js), so it is
// fully unit-testable (tests/rally_car.sim.js) and the SAME code can drive the player, a remote ghost's dead-reckoning, and AI racers.
//
// One state object, two modes:
//   'car'  grounded arcade driving + ballistic air (ramps, crests, cliffs). Speed-sensitive steering, lateral grip, handbrake slides,
//          slope gravity, walls, boost. The car leaves the ground only where the surface falls away faster than it can follow (a ramp lip,
//          a cliff), so ordinary hills never launch you, but a ramp always does, with the climb rate of the ramp (what makes a jump read).
//   'fly'  arcade plane: bank to turn, pitch with auto-level, throttle sets speed, climbing bleeds speed / diving gains it, ground-effect
//          cushion, forgiving touch-down only inside a landing zone (env.landOK), scrape-and-bounce everywhere else.
// toFly()/toCar() keep position, heading and velocity, so a transformation never teleports or resets anything.
//
// env (supplied by the track / world layer):
//   ground(x,z,y) -> height of the highest surface at or below ~y (+ a small tolerance); lets bridges and decks work over terrain.
//   surf(x,z)     -> optional {rough:bool, grip:number} (grass/sand slow you; ice/oil would lower grip)
//   landOK(x,z)   -> optional; true inside a landing zone (default true everywhere)
//   g             -> optional gravity override
// inp: {thr:-1..1, steer:-1..1, brake, hand, boost, pitch:-1..1 (fly: +1 nose up)}
// Heading convention (see data/rally.js): forward = (sin h, cos h), lateral = (cos h, -sin h). pitch>0 nose up; roll>0 means the +lateral side is higher.
// step() returns a reused events object: {launch, land (impact m/s), bump (impact m/s), boost, scrape}.
const CarPhysics=(()=>{
  const R=RALLY,C=R.car,F=R.fly;
  const clamp=(v,a,b)=>v<a?a:v>b?b:v,sgn=v=>v<0?-1:1;
  const BIG=1e4,BL={nx:0,nz:0,pen:0};

  function newCar(x,z,h,cls,env,up){
    let base=R.cls[cls]||R.cls.ace;if(up&&R.garage)base=R.garage.tune(base,up);const p=Object.assign({},C,base);
    const y=env&&env.ground?env.ground(x,z,BIG):0;
    return {cls:R.cls[cls]?cls:'ace',p,mode:'car',x,y,z,h:h||0,vx:0,vy:0,vz:0,vyS:0,s:0,steer:0,pitch:0,roll:0,slip:0,grounded:true,air:0,
      boostT:0,padT:0,charges:p.charges,cool:0,hitT:0,hitSlow:1,shieldT:0,protT:0,ev:{launch:0,land:0,bump:0,boost:0,scrape:0}};
  }

  // ---------- steering: one model for the physics, the player and the AI ----------
  // Yaw rate (rad/s) at FULL lock for a car moving at `v` m/s. The wheel angle shrinks with speed (stability); the bicycle model turns that into a yaw rate
  // (tight and quick when slow, with a floor speed minV so crawling still turns, and a ramp so you cannot pivot while stopped); finally the grip-limited
  // lateral acceleration caps it (an arcade 4.5 g), so at speed the car turns less sharply instead of spinning. hand = handbrake held.
  function turnRate(P,v,hand){
    const a=v<0?-v:v,delta=P.d0/(1+Math.pow(a/P.vS,1.6));
    const w=Math.tan(delta)*Math.sqrt(a*a+P.minV*P.minV)/P.L*(a<2.5?a/2.5:1)*P.turn*(hand?P.handTurn:1);
    const cap=P.lat*P.turn*(hand?P.handLat:1)/(a>1?a:1);   // the class handling multiplier scales the grip limit too, so classes differ at speed as well
    return w<cap?w:cap;
  }

  // ---------- shared: boost ----------
  function boostTick(c,inp,dt,ev){
    if(inp.boost&&c.charges>0&&c.boostT<=0){c.charges--;c.boostT=c.p.boostT;ev.boost=1}
    if(c.boostT>0)c.boostT=Math.max(0,c.boostT-dt);
    if(c.padT>0)c.padT=Math.max(0,c.padT-dt);
    return c.boostT>0||c.padT>0;
  }
  // a boost pad / ring: refills the "pad" boost without spending a charge (the track layer calls this)
  function pad(c,secs){c.padT=Math.max(c.padT,secs||1.4)}

  // ---------- the ground / air car ----------
  function step(c,inp,dt,env){
    const ev=c.ev;ev.launch=ev.land=ev.bump=ev.boost=ev.scrape=0;
    if(!(dt>0))return ev;
    if(c.hitT>0)c.hitT=Math.max(0,c.hitT-dt);if(c.protT>0)c.protT=Math.max(0,c.protT-dt);if(c.shieldT>0)c.shieldT=Math.max(0,c.shieldT-dt);
    if(c.mode==='fly')return stepFly(c,inp,dt,env,ev);
    const P=c.p,g=env.g||R.g;
    // the wheel follows the stick almost directly (about 35 ms to full lock); it only relaxes a little slower when you let go. No other input smoothing exists.
    const st=clamp(inp.steer||0,-1,1),more=Math.abs(st)>Math.abs(c.steer)||st*c.steer<0;
    c.steer+=(st-c.steer)*Math.min(1,dt*(more?P.steerUp:P.steerDn));
    const boosting=boostTick(c,inp,dt,ev);
    const sf=env.surf?env.surf(c.x,c.z):null,rough=!!(sf&&sf.rough);
    const vmax=P.vmax*(boosting?P.boostMul:1)*(rough?P.offroad.vmax:1)*(c.hitT>0?c.hitSlow:1);   // a hit slows you for a moment (never a stop)
    if(c.grounded)driveGround(c,inp,dt,env,ev,P,g,sf,rough,vmax,boosting);
    else driveAir(c,dt,env,ev,P,g);
    c.s=Math.hypot(c.vx,c.vz,c.vy);
    return ev;
  }

  function driveGround(c,inp,dt,env,ev,P,g,sf,rough,vmax,boosting){
    let sh=Math.sin(c.h),ch=Math.cos(c.h);
    let vf=c.vx*sh+c.vz*ch;
    // steering: yaw rate from the shared model; reversing mirrors it
    const sideways=Math.abs(Math.atan2(c.vx*Math.cos(c.h)-c.vz*Math.sin(c.h),Math.max(Math.abs(vf),1)));   // slip angle going in (velocity vs heading)
    c.h+=c.steer*turnRate(P,vf,inp.hand)*(c.hitT>0?.75:1)*(vf<-.5?-1:1)*(1-clamp((sideways-.5)/.6,0,.85))*dt;   // yaw authority fades when already very sideways
    sh=Math.sin(c.h);ch=Math.cos(c.h);
    const lx=ch,lz=-sh;
    vf=c.vx*sh+c.vz*ch;let vl=c.vx*lx+c.vz*lz;
    // the four wheels sample the ground: pitch/roll for the body and the slope gravity
    const y=c.y,hl=P.hl,hb=P.hb;
    const gF=env.ground(c.x+sh*hl,c.z+ch*hl,y),gB=env.ground(c.x-sh*hl,c.z-ch*hl,y),gL=env.ground(c.x+lx*hb,c.z+lz*hb,y),gR=env.ground(c.x-lx*hb,c.z-lz*hb,y);
    const sF=(gF-gB)/(2*hl),sL=(gL-gR)/(2*hb);
    // longitudinal: throttle / brake / reverse / coast / drag / slope / boost / overspeed
    const thr=clamp(inp.thr||0,-1,1);let a=0;
    if(thr>0)a=vf<-.5?P.brake*thr:P.accel*thr*(1-Math.pow(clamp(vf/vmax,0,1),1.6));
    else if(thr<0)a=vf>.5?-P.brake*-thr:-P.rev*-thr*(1-clamp(-vf/P.vrev,0,1));
    else if(Math.abs(vf)>.05)a-=sgn(vf)*Math.min(P.coast,Math.abs(vf)/dt);
    if(inp.brake&&vf>.2)a-=P.brake*1.1;else if(inp.brake&&vf<-.2)a+=P.brake*1.1;
    if(inp.hand&&vf>.2)a-=7;
    if(boosting)a+=P.boostAccel*(1-Math.pow(clamp(vf/vmax,0,1),2));
    a-=vf*P.drag*(rough?P.offroad.drag:1);
    a-=g*P.slopeK*sF/Math.sqrt(1+sF*sF);                      // uphill slows, downhill speeds up
    if(vf>vmax)a-=(vf-vmax)*P.overspeed;                      // above the cap (boost ended, a landing) the excess bleeds off smoothly
    const vf0=vf;vf+=a*dt;
    if(vf0*vf<0&&thr<=0)vf=0;                                 // braking / coasting never flips into reverse by itself
    if(thr===0&&!boosting&&Math.abs(vf)<.05&&Math.abs(sF)<.08)vf=0;   // parked (on gentle ground) means parked, not creeping
    // lateral grip: the tyres scrub sideways speed (and a little forward speed with it); handbrake lets the tail out
    // tyre saturation: during a handbrake slide the grip returns as the slip angle grows (from ~17 deg, full by ~45 deg), so a slide settles around 30-40 deg
    // instead of spinning, and the car pulls straight again the moment you let go.
    const sa=Math.abs(Math.atan2(vl,Math.max(Math.abs(vf),1)));
    const gk=inp.hand?P.handGrip+clamp((sa-.3)*2.4,0,1-P.handGrip):1;
    const gr=P.grip*(rough?P.offroad.grip:1)*gk*(sf&&sf.grip!=null?sf.grip:1);
    const vl2=vl*Math.exp(-gr*dt),lost=Math.abs(vl)-Math.abs(vl2);
    if(lost>0){   // the tyres turn the velocity toward the heading. Kinetic energy is what is conserved: a fraction `keep` of the sideways energy becomes forward energy
      const keep=inp.hand?P.handKeep:P.slipKeep,e=vl*vl-vl2*vl2;   // (never more energy than was removed: no free speed in corners)
      vf=sgn(vf)*Math.sqrt(vf*vf+e*keep);
      vf-=sgn(vf)*Math.min(Math.abs(vf),lost*P.slipLoss*(inp.hand?P.handSlipLoss:1));
    }
    vl=vl2-g*.35*sL*dt;                                       // a banked surface slides you toward its low side
    c.slip=vl;
    c.vx=sh*vf+lx*vl;c.vz=ch*vf+lz*vl;
    // move
    const sx=c.vx*dt,sz=c.vz*dt,hsd=Math.hypot(sx,sz),lim=Math.max(P.stepUp,hsd*1.4);
    let nx=c.x+sx,nz=c.z+sz;
    if(env.block){   // solid scenery and terrain barriers: slide along them, never pass through (up to 2 overlaps resolved per step)
      for(let it=0;it<2;it++){
        if(!env.block(nx,nz,y,P.carR,c.vx,c.vz,BL))break;
        nx+=BL.nx*BL.pen;nz+=BL.nz*BL.pen;
        const vn=c.vx*BL.nx+c.vz*BL.nz;
        if(vn<0){c.vx-=vn*BL.nx*(1+P.rest);c.vz-=vn*BL.nz*(1+P.rest);ev.bump=Math.max(ev.bump,-vn);          // remove the speed INTO the obstacle (a little bounce), keep the sliding speed
          const k=P.blockKeep;c.vx*=k;c.vz*=k}
      }
    }
    let gy=env.ground(nx,nz,y);
    if(gy-y>lim){                                             // a wall, not a slope: slide along it if one axis is free, else stop dead
      const gx=env.ground(nx,c.z,y),gz=env.ground(c.x,nz,y),okx=gx-y<=lim,okz=gz-y<=lim,hs=Math.hypot(c.vx,c.vz);
      ev.bump=hs;
      if(okx&&!okz){nz=c.z;c.vz*=P.wallKeep;gy=gx}
      else if(okz&&!okx){nx=c.x;c.vx*=P.wallKeep;gy=gz}
      else{nx=c.x;nz=c.z;c.vx*=-.2;c.vz*=-.2;gy=env.ground(nx,nz,y)}
    }
    c.x=nx;c.z=nz;
    // vertical: follow the surface, or leave it with the surface's own climb rate (this is the ramp launch)
    if(y-gy>Math.max(.12,hsd*P.stickSlope)){
      c.grounded=false;c.vy=c.vyS;c.air=0;ev.launch=Math.max(1,c.vy);
      c.y=y+c.vy*dt;
    }else{
      c.vyS+=((gy-y)/dt-c.vyS)*Math.min(1,dt*30);c.vy=c.vyS;c.y=gy;
    }
    // body attitude follows the surface; the body leans outward in a turn
    const tp=Math.atan(sF),tr=Math.atan(sL)+c.steer*clamp(Math.abs(vf)/(P.vmax*.6),0,1)*.12,k=Math.min(1,dt*14);
    c.pitch+=(tp-c.pitch)*k;c.roll+=(tr-c.roll)*k;
  }

  function driveAir(c,dt,env,ev,P,g){
    c.air+=dt;c.vy=Math.max(-P.termV,c.vy-g*dt);
    const ad=Math.exp(-P.airDrag*dt);c.vx*=ad;c.vz*=ad;
    c.h+=c.steer*P.airYaw*dt;                                 // the body turns, the velocity does not
    const yb=c.y,px=c.x,pz=c.z;
    let nx=c.x+c.vx*dt,nz=c.z+c.vz*dt,ny=c.y+c.vy*dt;
    let gy=env.ground(nx,nz,ny+.5);
    if(gy-yb>Math.max(P.stepUp,Math.hypot(c.vx,c.vz)*dt*1.4)&&ny<gy){   // flew into a cliff / wall face
      ev.bump=Math.hypot(c.vx,c.vz);c.vx*=-.2;c.vz*=-.2;nx=px;nz=pz;gy=env.ground(nx,nz,ny+.5);
    }
    c.x=nx;c.z=nz;c.y=ny;
    if(c.y<=gy&&c.vy<=0){                                     // touch down
      const imp=-c.vy;ev.land=Math.max(.01,imp);c.y=gy;c.vy=0;c.vyS=0;c.grounded=true;
      if(imp>P.hardLand){const f=1-Math.min(.3,(imp-P.hardLand)*P.landLoss);c.vx*=f;c.vz*=f}
    }
    const hs=Math.hypot(c.vx,c.vz),k=Math.min(1,dt*3.5);
    c.pitch+=(Math.atan2(c.vy,hs)-c.pitch)*k;                 // the nose follows the trajectory
    c.roll+=(-c.steer*.25-c.roll)*k;
  }

  // ---------- flight ----------
  function stepFly(c,inp,dt,env,ev){
    const P=c.p,fk=.92+.08*(P.vmax/46);
    c.steer+=(clamp(inp.steer||0,-1,1)-c.steer)*Math.min(1,dt*F.rollRate);
    c.roll=-c.steer*F.rollMax;                                // bank into the turn (+lateral side down when steering toward it)
    const boosting=boostTick(c,inp,dt,ev);
    // pitch: stick sets a rate; no stick = auto-level (accessible: you cannot get stuck in a dive)
    const pi=clamp(inp.pitch||0,-1,1);
    if(pi!==0)c.pitch+=pi*F.pitchRate*dt;else c.pitch+=(0-c.pitch)*Math.min(1,F.level*dt);
    c.pitch=clamp(c.pitch,-F.pitchMax,F.pitchMax);
    // speed: throttle sets the target, climbing bleeds and diving gains
    const thr=clamp(inp.thr||0,-1,1);
    const hs=c.hitT>0?c.hitSlow:1,tgt=(thr>=0?F.cruise+(F.vmax-F.cruise)*thr:F.cruise+(F.cruise-F.vmin)*thr)*fk*(boosting?F.boostMul:1)*hs;
    c.s+=(tgt-c.s)*Math.min(1,F.speedRate*dt)-Math.sin(c.pitch)*F.gCouple*dt;
    c.s=clamp(c.s,F.vmin*.8,F.vmax*fk*F.boostMul);
    if(c.s<F.vstall)c.pitch-=(F.vstall-c.s)*.12*dt;           // slow: the nose sinks a little (never a spin)
    c.h+=c.steer*F.turn*Math.cos(c.pitch)*dt;
    const cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);
    c.vx=Math.sin(c.h)*cp*c.s;c.vz=Math.cos(c.h)*cp*c.s;c.vy=sp*c.s;
    c.x+=c.vx*dt;c.z+=c.vz*dt;c.y+=c.vy*dt;
    if(c.cool>0)c.cool-=dt;
    if(c.y>F.ceil){c.y=F.ceil;if(c.pitch>0)c.pitch*=.5}
    // ground interaction
    const gy=env.ground(c.x,c.z,c.y+F.soft),clr=c.y-gy,land=env.landOK?!!env.landOK(c.x,c.z):true;
    if(clr<=F.touch){
      if(land&&c.pitch>=F.safePitch){                         // a landing: becomes the car, keeping the ground speed
        ev.land=Math.max(.01,-c.vy);c.mode='car';c.grounded=true;c.y=gy;c.vy=0;c.vyS=0;c.air=0;c.pitch=0;c.roll=0;c.steer=0;
        const hs=Math.hypot(c.vx,c.vz),cap=P.vmax*P.boostMul*1.15;if(hs>cap){c.vx*=cap/hs;c.vz*=cap/hs}
        c.s=Math.hypot(c.vx,c.vz);
        return ev;
      }
      c.y=gy+F.touch+.1;c.pitch=Math.max(c.pitch,.22);        // a scrape: bounced back up, forgiving, with a small speed cost (rate limited)
      if(c.cool<=0){c.s*=.85;c.cool=.6;ev.scrape=1}
    }else if(clr<F.soft){
      const k=1-clr/F.soft;
      if(!land)c.pitch+=2.2*k*dt*(c.vy<0?1:0);                // ground effect: a gentle pull-up over terrain
      else if(c.pitch<-.12)c.pitch+=(-.12-c.pitch)*Math.min(1,1.6*k*dt*4);   // inside a landing zone: flare to a shallow glide instead
    }
    return ev;
  }

  // ---------- combat status ----------
  // A hit: brief disruption (speed cap `slow` for `t` seconds, 75% steering) and a horizontal knockback impulse along (nx,nz). Never a stop, never stacking:
  // a victim that is already disrupted keeps the longer of the two timers.
  function disrupt(c,t,slow,kb,nx,nz){
    c.hitT=Math.max(c.hitT,t);c.hitSlow=c.p&&c.p.hitEase?1-(1-slow)*c.p.hitEase:slow;
    if(kb){const l=Math.hypot(nx,nz)||1;c.vx+=nx/l*kb;c.vz+=nz/l*kb}
  }

  // ---------- transformation: nothing is reset ----------
  function toFly(c){
    if(c.mode==='fly')return c;
    const hs=Math.hypot(c.vx,c.vz);
    c.s=Math.hypot(hs,c.vy);if(hs>1)c.h=Math.atan2(c.vx,c.vz);
    c.pitch=clamp(Math.atan2(c.vy,hs),-F.pitchMax,F.pitchMax);c.roll=0;c.steer=0;c.grounded=false;c.mode='fly';return c;
  }
  function toCar(c){
    if(c.mode==='car')return c;
    c.mode='car';c.grounded=false;c.vyS=c.vy;c.air=0;c.steer=0;return c;
  }

  // ---------- network packet: a few numbers, sent a few times a second, dead-reckoned by the receiver ----------
  const q=(v,n)=>Math.round(v*n)/n;
  function pack(c){return [q(c.x,100),q(c.y,100),q(c.z,100),q(c.h,1000),q(c.pitch,1000),q(c.roll,1000),q(c.vx,100),q(c.vy,100),q(c.vz,100),(c.mode==='fly'?1:0)|(c.grounded?2:0)|(c.boostT>0||c.padT>0?4:0)|(c.shieldT>0?8:0)|(c.hitT>0?16:0)]}
  function unpack(a,o){o=o||{};o.x=a[0];o.y=a[1];o.z=a[2];o.h=a[3];o.pitch=a[4];o.roll=a[5];o.vx=a[6];o.vy=a[7];o.vz=a[8];
    o.mode=a[9]&1?'fly':'car';o.grounded=!!(a[9]&2);o.boosting=!!(a[9]&4);o.shield=!!(a[9]&8);o.hit=!!(a[9]&16);return o}

  // ---------- car vs car ----------
  // Two cars touch when their circles overlap (grounded or flying, at about the same height). Positions are pushed apart by the inverse-mass share and the closing
  // speed along the contact normal is exchanged with a little bounce (a heavy Bruiser shoves a light Comet aside), a touch of speed is scrubbed by the scrape.
  // o.moveA / o.moveB (default true): only move/impulse that car. A remote ghost is driven by its OWNER's phone, which runs the same maths on its own car, so each
  // phone applies its own half and the pair separates exactly once. Returns the closing speed (m/s) of a hit, 0 if they did not touch or were already parting.
  const CR=1.75,REST=.32;
  function collide(a,b,o){
    if(a===b||Math.abs(a.y-b.y)>2.4)return 0;
    const dx=b.x-a.x,dz=b.z-a.z,min=CR*2;let d2=dx*dx+dz*dz;if(d2>=min*min)return 0;
    let d=Math.sqrt(d2),nx,nz;if(d<1e-3){nx=Math.cos(a.h);nz=-Math.sin(a.h);d=0}else{nx=dx/d;nz=dz/d}   // exactly on top of each other: separate sideways
    const ma=a.p.mass||1,mb=b.p.mass||1,ia=1/ma,ib=1/mb,tot=ia+ib,mvA=!o||o.moveA!==false,mvB=!o||o.moveB!==false,pen=min-d;
    if(mvA){a.x-=nx*pen*ia/tot;a.z-=nz*pen*ia/tot}
    if(mvB){b.x+=nx*pen*ib/tot;b.z+=nz*pen*ib/tot}
    const vn=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;if(vn>=0)return .01;           // already moving apart: just separated
    const j=-(1+REST)*vn/tot;
    if(mvA){a.vx-=j*ia*nx;a.vz-=j*ia*nz;const k=1-Math.min(.12,-vn*.006);a.vx*=k;a.vz*=k}
    if(mvB){b.vx+=j*ib*nx;b.vz+=j*ib*nz;const k=1-Math.min(.12,-vn*.006);b.vx*=k;b.vz*=k}
    return -vn}

  return {newCar,step,toFly,toCar,pad,pack,unpack,turnRate,disrupt,collide,CR};
})();
