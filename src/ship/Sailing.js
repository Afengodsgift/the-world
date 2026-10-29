// Sailing: the pure physics of the sloop. No rendering, no network, no globals except SHIP: so it is fully unit-testable.
//   - Wind blows TOWARD `dir` (radians, same convention as heading: forward = (sin h, cos h)). It veers slowly with time, identically on every
//     client for the same room and clock, and strengthens in storms.
//   - Sail efficiency is a polar curve of the angle between your heading and the way the wind blows (beta): running with the wind behind you is
//     decent (0.55), a beam reach is best (1.0), and sailing toward the wind is slow (0 head-to-wind). Trim (0..1) scales the sail.
//   - Every hull has its own parameters (sh.p: top speed, turn rate, probe points from its size), so the same physics drives your ship and every pirate.
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
  // hull probe points (ship space, metres) for a hull of half length hl and half beam hb
  const probes=(hl,hb)=>[[0,hl],[0,-hl],[-hb,0],[hb,0],[-hb*.85,hl*.5],[hb*.85,hl*.5],[-hb*.9,-hl*.5],[hb*.9,-hl*.5]];
  const DEF={vmax:SL.vmax,accel:SL.accel,coast:SL.coast,turn:SL.turn,turnV:SL.turnV,probe:probes(11.7,5.3)};
  // p: optional overrides {vmax, accel, coast, turn, turnV, hl, hb}
  const newShip=(x,z,h,p,hull)=>{p=p||{};const q=Object.assign({},DEF,p);if(p.hl&&p.hb)q.probe=probes(p.hl,p.hb);return {x,z,h:h||0,v:0,sail:.6,rud:0,hull:hull===undefined?C.hull:hull,roll:0,pitch:0,sunk:0,p:q}};
  // world position of a ship-space point
  const toWorld=(sh,px,pz,out)=>{const s=Math.sin(sh.h),c=Math.cos(sh.h);out=out||{x:0,z:0};out.x=sh.x+c*px+s*pz;out.z=sh.z-s*px+c*pz;return out};
  const toShip=(sh,x,z,out)=>{const s=Math.sin(sh.h),c=Math.cos(sh.h),dx=x-sh.x,dz=z-sh.z;out=out||{x:0,z:0};out.x=c*dx-s*dz;out.z=s*dx+c*dz;return out};
  // can a ship at (x,z) heading h float there? (every hull probe over deep enough water)
  function clear(x,z,h,Hf,probe){
    const s=Math.sin(h),c=Math.cos(h);
    for(const [px,pz] of (probe||DEF.probe)){if(Hf(x+c*px+s*pz,z-s*px+c*pz)>SL.shore)return false}
    return true;
  }
  // advance one step. inp: {rud:-1..1, trim:-1..1 (rate)}. env: {wind:{dir,s}, H:(x,z)=>height}. Returns the impact speed (0 if none).
  function step(sh,inp,dt,env){
    if(sh.sunk>0)return 0;
    const P=sh.p||DEF,pr=P.probe;
    sh.sail=clamp(sh.sail+(inp.trim||0)*dt*.5,0,1);
    sh.rud+=((inp.rud||0)-sh.rud)*Math.min(1,dt*3.2);
    const beta=Math.abs(wrap(env.wind.dir-sh.h)),tgt=P.vmax*sh.sail*Math.max(P.minEff||0,eff(beta))*env.wind.s*(.55+.45*Math.max(0,Math.min(1,(sh.hull===undefined?C.hull:sh.hull)/C.hull)));   // a battered ship is slower
    sh.v+=(tgt-sh.v)*(tgt>sh.v?P.accel:P.coast)*dt;
    const steer=Math.min(1,.2+sh.v*P.turnV);
    let nh=wrap(sh.h+sh.rud*P.turn*steer*dt);
    if(!clear(sh.x,sh.z,nh,env.H,pr))nh=sh.h;                               // cannot swing the stern onto the shore
    sh.h=nh;
    let nx=sh.x+Math.sin(sh.h)*sh.v*dt,nz=sh.z+Math.cos(sh.h)*sh.v*dt,bump=0;
    if(!clear(nx,nz,sh.h,env.H,pr)){                                         // hit the shallows: slide along whichever axis is still open
      if(clear(nx,sh.z,sh.h,env.H,pr))nz=sh.z;else if(clear(sh.x,nz,sh.h,env.H,pr))nx=sh.x;else{nx=sh.x;nz=sh.z}
      bump=Math.abs(sh.v);sh.v*=.3;
      if(bump>4)sh.hull=Math.max(0,sh.hull-(bump-3.5)*2);
    }
    sh.x=nx;sh.z=nz;
    const rt=clamp(Math.sin(wrap(env.wind.dir-sh.h))*sh.sail*sh.v*.005-sh.rud*sh.v*.004,-.07,.07);   // heel with the wind and in turns
    sh.roll+=(rt-sh.roll)*Math.min(1,dt*1.2);
    return bump;
  }
  return {wind,eff,newShip,step,clear,probes,toWorld,toShip,wrap};
})();
