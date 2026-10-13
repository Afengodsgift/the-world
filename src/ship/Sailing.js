// Sailing: the pure physics of the sloop. No rendering, no network, no globals except SHIP: so it is fully unit-testable.
//   - Wind blows TOWARD `dir` (radians, same convention as heading: forward = (sin h, cos h)). It veers slowly with time, identically on every
//     client for the same room and clock, and strengthens in storms.
//   - Sail efficiency is a polar curve of the angle between your heading and the way the wind blows (beta): running with the wind behind you is
//     decent (0.55), a beam reach is best (1.0), and sailing toward the wind is slow (0 head-to-wind). Trim (0..1) scales the sail.
//   - Steering needs way on (a ship barely turns at rest). The hull is sampled at several points: it cannot enter shallow water or land,
//     slides along the shore, and takes damage from hard impacts.
const Sailing=(()=>{
  const C=SHIP,SL=C.sailing;
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function wind(t,seed,storm){
    return {dir:wrap((seed||0)+.9*Math.sin(t/200)+.5*Math.sin(t/61+1.7)),
            s:C.wind.strength*(1+C.wind.storm*(storm||0))*(1+.12*Math.sin(t/17))};
  }
  function eff(beta){                                   // beta = |angle between heading and the direction the wind blows toward|, 0..PI
    if(beta<=Math.PI/2)return .55+.45*Math.sin(beta);
    const u=(beta-Math.PI/2)/(Math.PI/2);return Math.max(0,1-Math.pow(u,1.4));
  }
  const newShip=(x,z,h)=>({x,z,h:h||0,v:0,sail:.6,rud:0,hull:C.hull,roll:0,pitch:0,sunk:0});
  // world position of a ship-space point
  const toWorld=(sh,px,pz,out)=>{const s=Math.sin(sh.h),c=Math.cos(sh.h);out=out||{x:0,z:0};out.x=sh.x+c*px+s*pz;out.z=sh.z-s*px+c*pz;return out};
  const toShip=(sh,x,z,out)=>{const s=Math.sin(sh.h),c=Math.cos(sh.h),dx=x-sh.x,dz=z-sh.z;out=out||{x:0,z:0};out.x=c*dx-s*dz;out.z=s*dx+c*dz;return out};
  // can a ship at (x,z) heading h float there? (every hull probe over deep enough water)
  function clear(x,z,h,Hf){
    const s=Math.sin(h),c=Math.cos(h);
    for(const [px,pz] of SL.probe){if(Hf(x+c*px+s*pz,z-s*px+c*pz)>SL.shore)return false}
    return true;
  }
  // advance one step. inp: {rud:-1..1, trim:-1..1 (rate)}. env: {wind:{dir,s}, H:(x,z)=>height}. Returns the impact speed (0 if none).
  function step(sh,inp,dt,env){
    if(sh.sunk>0)return 0;
    sh.sail=clamp(sh.sail+(inp.trim||0)*dt*.5,0,1);
    sh.rud+=((inp.rud||0)-sh.rud)*Math.min(1,dt*3.2);
    const beta=Math.abs(wrap(env.wind.dir-sh.h)),tgt=SL.vmax*sh.sail*eff(beta)*env.wind.s;
    sh.v+=(tgt-sh.v)*(tgt>sh.v?SL.accel:SL.coast)*dt;
    const steer=Math.min(1,.2+sh.v*SL.turnV);
    let nh=wrap(sh.h+sh.rud*SL.turn*steer*dt);
    if(!clear(sh.x,sh.z,nh,env.H))nh=sh.h;                               // cannot swing the stern onto the shore
    sh.h=nh;
    let nx=sh.x+Math.sin(sh.h)*sh.v*dt,nz=sh.z+Math.cos(sh.h)*sh.v*dt,bump=0;
    if(!clear(nx,nz,sh.h,env.H)){                                         // hit the shallows: slide along whichever axis is still open
      if(clear(nx,sh.z,sh.h,env.H))nz=sh.z;else if(clear(sh.x,nz,sh.h,env.H))nx=sh.x;else{nx=sh.x;nz=sh.z}
      bump=Math.abs(sh.v);sh.v*=.3;
      if(bump>4)sh.hull=Math.max(0,sh.hull-(bump-3.5)*2);
    }
    sh.x=nx;sh.z=nz;
    const rt=clamp(Math.sin(wrap(env.wind.dir-sh.h))*sh.sail*sh.v*.014-sh.rud*sh.v*.012,-.3,.3);   // heel with the wind and in turns
    sh.roll+=(rt-sh.roll)*Math.min(1,dt*2);
    return bump;
  }
  return {wind,eff,newShip,step,clear,toWorld,toShip,wrap};
})();
