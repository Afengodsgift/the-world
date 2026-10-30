// Pilot: a lightweight driver for CarPhysics + Track. It produces the SAME input object a human produces ({thr,steer,brake,hand,boost,pitch}), so an AI
// racer is just a car stepped by CarPhysics with a Pilot instead of a stick: same handling, same limits, no teleporting, no speed cheats.
// Pure (no THREE/DOM/network). It is both the Phase-6 AI foundation and the test that proves a track is actually playable
// (tests/rally_track.sim.js drives the whole route with it).
//   ground: pure-pursuit on the road centreline, speed target from the curvature ahead (so it brakes for hairpins), a lane offset to dodge swinging
//           hazards (predicted from race time, the same pure function the hazards use), boost on straights.
//   air:    aims at the next ring (or the landing strip), banks to the bearing, pitches to the glide angle; the physics flares the touchdown.
// Skill profiles change speed fraction, cornering confidence, look-ahead, steering noise and whether it spends boost; none of them add power.
const Pilot=(()=>{
  const clamp=(v,a,b)=>v<a?a:v>b?b:v,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const SKILL={
    rookie:{v:.74,util:.6,aBrake:10,look:.55,noise:.10,boost:false,dodge:.6,cut:.12},
    steady:{v:.88,util:.72,aBrake:13,look:.5,noise:.05,boost:true,dodge:.85,cut:.45},
    expert:{v:.97,util:.85,aBrake:16,look:.45,noise:.02,boost:true,dodge:1,cut:.8},
  };
  function make(T,skill,seed){return {T,k:typeof skill==='string'?SKILL[skill]:skill||SKILL.steady,road:0,lane:0,laneT:0,rng:(seed||1)>>>0,noise:0,alt:null,dec:{}}}
  const rnd=p=>(p.rng=(p.rng*1664525+1013904223)>>>0)/4294967296;
  const _pr={},_a={},_b={};
  // the fastest the CAR can take a bend of radius R using only `util` of its steering: solves v / (turnRate(v) * util) = R with the physics' own
  // speed-sensitive turn rate (so it is exactly as hard on a Bruiser as on a Comet, and a rookie leaves more margin than an expert)
  function vCorner(P,R,util){let lo=3,hi=80;for(let i=0;i<16;i++){const v=(lo+hi)/2;if(v/Math.max(CarPhysics.turnRate(P,v,false)*util,1e-3)<=R)lo=v;else hi=v}return lo}

  // point `dist` metres ahead of (road,s); continues onto the next road (across a jump gap) when this one ends
  function ahead(T,ri,s,dist,out){
    let r=ri,x=s+dist;
    for(let guard=0;guard<8&&x>T.roads[r].len;guard++){
      const rd=T.roads[r];
      if(rd.join){x=rd.join.s+(x-rd.len);r=rd.join.road;continue}                                     // a shortcut flows back into its main road
      if(r<T.roads.length-1&&!T.roads[r+1].alt&&Math.hypot(T.roads[r+1].X[0]-rd.X[rd.m-1],T.roads[r+1].Z[0]-rd.Z[rd.m-1])<60){x-=rd.len;r++;continue}
      break}
    return T.at(r,x,out);
  }

  function drive(p,c,racer,t,dt,inp){
    inp=inp||{};inp.thr=0;inp.steer=0;inp.brake=false;inp.hand=false;inp.boost=false;inp.pitch=0;
    return c.mode==='fly'?fly(p,c,racer,inp):ground(p,c,racer,t,dt,inp);
  }

  function ground(p,c,racer,t,dt,inp){
    const T=p.T,k=p.k;
    if(!c.grounded){inp.thr=1;return inp}                       // airborne as a car (kicker): hold the line, nothing to steer
    const pr=T.project(c.x,c.z,_pr,p.road,p.alt==null);p.road=pr.road;
    // shortcuts: arriving at a fork, roll once (by skill) whether to take it; on the shortcut keep following it until we are back on a main road
    if(T.forks&&T.forks.length){
      if(p.alt==null){for(const f of T.forks){if(pr.road!==f.main)continue;const d=f.s-pr.s;if(d>-2&&d<24){if(p.dec[f.alt]===undefined)p.dec[f.alt]=rnd(p)<k.cut;if(p.dec[f.alt]){p.alt=f.alt;p.road=f.alt;T.project(c.x,c.z,_pr,p.road,false);break}}}}
      else if(pr.road!==p.alt)p.alt=null;
    }
    const v=Math.hypot(c.vx,c.vz),L=Math.max(9,v*k.look);
    // swinging hazards ahead on this road: of the candidate lanes, take the nearest one that every hammer ahead will be clear of when we get
    // there (hammer positions are a pure function of race time, so we can predict them; a +-0.2 s window covers our own timing error)
    let want=0;const hz=[];
    for(const h of T.hazards){if(h.road!==pr.road)continue;const ds=h.s-pr.s;if(ds>-3&&ds<18+v*1.8)hz.push(h,ds)}
    if(hz.length){
      const clear=T.roads[pr.road].W[pr.i]/2-2.6,LAN=[-clear,-clear/2,0,clear/2,clear],mg=.4+.4*k.dodge;let bestC=1e9;want=p.lane;
      for(const ln of LAN){let bad=false;
        for(let q=0;q<hz.length&&!bad;q+=2){const h=hz[q],ta=t+Math.max(0,hz[q+1])/Math.max(v,12);
          for(let w=-.2;w<=.21;w+=.1){if(Math.abs(Math.sin(6.2831853*(ta+w)/h.period+h.phase)*h.amp-ln)<h.r+1.65+mg){bad=true;break}}}
        const cost=Math.abs(ln-p.lane)+(bad?100:0);if(cost<bestC){bestC=cost;want=ln}}
    }
    p.lane+=(want-p.lane)*Math.min(1,dt*4.5);
    ahead(T,pr.road,pr.s,L,_a);ahead(T,pr.road,pr.s,L*2,_b);
    const tx=_a.x+(-_a.tz)*p.lane,tz=_a.z+_a.tx*p.lane;
    if(rnd(p)<dt*3)p.noise=(rnd(p)-.5)*2*k.noise;
    const err=wrap(Math.atan2(tx-c.x,tz-c.z)-c.h);
    inp.steer=clamp(err*2.4+p.noise,-1,1);
    // speed plan: scan the road ahead; each corner limits the speed there to what the car can corner at (vCorner), and braking can only shed so much speed over the
    // distance, so the allowed speed NOW is the minimum over the scan of sqrt(vCorner^2 + 2*aBrake*distance). Far-sighted braking, not a last-second panic.
    const top=RALLY.cls[c.cls].vmax*k.v;let vt=top*(c.boostT>0||c.padT>0?1.3:1),kap=0;
    const Dmax=Math.min(110,v*v/50+16);
    for(let d=4;d<=Dmax;d+=6){
      ahead(T,pr.road,pr.s,d-4,_a);ahead(T,pr.road,pr.s,d+4,_b);
      const kk=Math.abs(wrap(Math.atan2(_b.tx,_b.tz)-Math.atan2(_a.tx,_a.tz)))/8;if(d<20)kap=Math.max(kap,kk);
      if(kk>1e-4){const vc=vCorner(c.p,1/kk,k.util);vt=Math.min(vt,Math.sqrt(vc*vc+2*k.aBrake*d))}
    }
    if(hz.length)vt=Math.min(vt,24+6*k.dodge);                   // ease off near swinging hammers: a steady speed makes the arrival time (and so the gap) predictable
    // the last 50 m of a road that ends in a jump (the kicker, the launch ramp) are taken flat out; the corner before them is where we slow
    const rd=T.roads[pr.road],nearEnd=pr.road<T.roads.length-1&&!rd.join&&pr.s>rd.len-50;
    const vt2=nearEnd?(rd.lipV?Math.min(vt,rd.lipV*Math.min(1,k.v+.05)):top*1.3):vt;   // roads can name the speed their jump wants (rd.lipV); ramps are flat out
    inp.thr=clamp((vt2-v)*.5,-1,1);
    if(v>vt2+7)inp.brake=true;
    if(k.boost&&!nearEnd&&c.charges>0&&c.boostT<=0&&v>26&&kap<.003&&Math.abs(err)<.1&&Math.abs(p.lane)<1)inp.boost=true;
    return inp;
  }

  function fly(p,c,racer,inp){
    const T=p.T,g=T.gates[racer.next];let tx,ty,tz;
    if(g&&g.type==='air'){tx=g.x;ty=g.y;tz=g.z}
    else if(g){tx=g.x;tz=g.z;ty=T.ground(tx,tz,1e4)+2}                      // next is the touchdown gate: glide down to the strip
    else{inp.thr=.2;return inp}
    const dx=tx-c.x,dz=tz-c.z,hd=Math.hypot(dx,dz);
    inp.steer=clamp(wrap(Math.atan2(dx,dz)-c.h)*2,-1,1);
    const want=clamp(Math.atan2(ty-c.y,Math.max(hd,1)),-.7,.7);
    inp.pitch=clamp((want-c.pitch)*3,-1,1);
    inp.thr=.2;inp.boost=false;
    return inp;
  }
  return {make,drive,SKILL};
})();
