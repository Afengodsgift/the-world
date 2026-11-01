// Track: the pure data/geometry side of a Skybreak Rally route. No THREE, no DOM, no network (like CarPhysics), so it is unit-testable
// (tests/rally_track.sim.js) and the same object serves the player's car, remote ghosts, the AI pilot and the host's race referee.
//
// A track is DATA (src/data/tracks.js): roads (smooth centrelines with width / height-above-terrain per control point), ordered gates
// (ground checkpoints sit on a road, aerial rings float), boost pads, swinging hazards, landing zones, a start grid. Authoring on a smooth
// centreline (not grid pieces) gives real sweeping bends, hairpins, bridges and ramps on the islands' actual terrain; kit pieces (ramps, boost
// pad, hammer, banners, trees) are visual props placed on top by the renderer.
//
// The drivable surface is analytic: surface(x,z,y) = the highest road deck at or below ~y, else (shoulder blend, then) terrain. It plugs straight
// into CarPhysics as env.ground. Gaps between roads are real gaps (a road simply ends at a ramp lip and the next one starts on the far side).
//
// build(def, {H}) with H(x,z)=terrain height (the game's global H). Road height at a point = max(H+0.08, 0.45) + dy, so a road never sinks into
// the sea, and dy>0 makes causeways / bridges / ramps.
const Track=(()=>{
  const STEP=2,CELL=16,TOL=1.4;
  const clamp=(v,a,b)=>v<a?a:v>b?b:v,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

  // ---- centripetal Catmull-Rom (stable with very uneven control-point spacing) ----
  function crPoint(p0,p1,p2,p3,t,out){
    const d=(a,b)=>Math.pow(Math.hypot(b[0]-a[0],b[1]-a[1])+1e-6,.5);
    const t0=0,t1=t0+d(p0,p1),t2=t1+d(p1,p2),t3=t2+d(p2,p3),u=t1+(t2-t1)*t;
    const L=(a,b,ta,tb)=>[a[0]+(b[0]-a[0])*((u-ta)/(tb-ta)),a[1]+(b[1]-a[1])*((u-ta)/(tb-ta))];
    const A1=L(p0,p1,t0,t1),A2=L(p1,p2,t1,t2),A3=L(p2,p3,t2,t3),B1=L(A1,A2,t0,t2),B2=L(A2,A3,t1,t3),C=L(B1,B2,t1,t2);
    out[0]=C[0];out[1]=C[1];return out;
  }

  function buildRoad(rd,env){
    const [ox,oz]=rd.o||[0,0],P=rd.pts.map(p=>({x:ox+p[0],z:oz+p[1],dy:p[2]||0,w:p[3]||rd.w||16}));
    const n=P.length,at=i=>P[clamp(i,0,n-1)];
    // dense polyline through the control points (x,z by centripetal Catmull-Rom); remember which dense index each control point is
    const dx=[],dz=[],dseg=[],dt=[],ctl=[];const tmp=[0,0],SUB=24;
    for(let i=0;i<n-1;i++){
      const a=at(i-1),b=at(i),c=at(i+1),d=at(i+2);ctl.push(dx.length);
      for(let k=0;k<SUB;k++){const t=k/SUB;
        // endpoints are duplicated by at(): mirror them so the end tangent is not zero-length
        const pa=i===0?[2*b.x-c.x,2*b.z-c.z]:[a.x,a.z],pd=i===n-2?[2*c.x-b.x,2*c.z-b.z]:[d.x,d.z];
        crPoint(pa,[b.x,b.z],[c.x,c.z],pd,t,tmp);dx.push(tmp[0]);dz.push(tmp[1]);dseg.push(i);dt.push(t)}
    }
    ctl.push(dx.length);dx.push(P[n-1].x);dz.push(P[n-1].z);dseg.push(n-2);dt.push(1);
    const cum0=[0];for(let i=1;i<dx.length;i++)cum0.push(cum0[i-1]+Math.hypot(dx[i]-dx[i-1],dz[i]-dz[i-1]));
    // height above terrain: monotone cubic (Fritsch-Carlson) over ARCLENGTH. Slope-continuous (a ramp is a ramp, not a staircase of smoothsteps),
    // never overshoots a plateau (no dip before a kicker), and the end slope is the last segment's slope, so a lip keeps its climb rate.
    const cs0=ctl.map(k=>cum0[k]),hh=[],del=[];for(let i=0;i<n-1;i++){hh.push(Math.max(1e-6,cs0[i+1]-cs0[i]));del.push((P[i+1].dy-P[i].dy)/hh[i])}
    const mt=new Array(n).fill(0);
    if(n>1){mt[0]=del[0];mt[n-1]=del[n-2]}
    for(let i=1;i<n-1;i++){if(del[i-1]*del[i]>0){const w1=2*hh[i]+hh[i-1],w2=hh[i]+2*hh[i-1];mt[i]=(w1+w2)/(w1/del[i-1]+w2/del[i])}}
    const hermite=(i,sv)=>{const h=hh[i],u=(sv-cs0[i])/h,u2=u*u,u3=u2*u;
      return (2*u3-3*u2+1)*P[i].dy+(u3-2*u2+u)*h*mt[i]+(-2*u3+3*u2)*P[i+1].dy+(u3-u2)*h*mt[i+1]};
    const ddy=dx.map((_,j)=>hermite(dseg[j],cum0[j])),dw=dx.map((_,j)=>{const i=dseg[j],e=dt[j]*dt[j]*(3-2*dt[j]);return j===dx.length-1?P[n-1].w:P[i].w+(P[i+1].w-P[i].w)*e});
    // arclength of the dense points, then resample every STEP metres
    const cum=cum0;
    const len=cum[cum.length-1],m=Math.max(2,Math.ceil(len/STEP)+1),X=new Float32Array(m),Z=new Float32Array(m),Y=new Float32Array(m),W=new Float32Array(m),S=new Float32Array(m),TX=new Float32Array(m),TZ=new Float32Array(m);
    let j=0;
    for(let i=0;i<m;i++){
      const s=Math.min(len,i*len/(m-1));while(j<cum.length-2&&cum[j+1]<s)j++;
      const f=cum[j+1]>cum[j]?(s-cum[j])/(cum[j+1]-cum[j]):0;
      X[i]=dx[j]+(dx[j+1]-dx[j])*f;Z[i]=dz[j]+(dz[j+1]-dz[j])*f;W[i]=dw[j]+(dw[j+1]-dw[j])*f;S[i]=s;
      const dd=ddy[j]+(ddy[j+1]-ddy[j])*f;
      // sub (underwater) roads: dy is an ABSOLUTE height (negative = below sea level). The deck follows the beach and the seabed down (never inside the ground) until it
      // reaches that depth, then runs level through the water: a tunnel on the seabed.
      Y[i]=rd.sub?Math.max(env.H(X[i],Z[i])+.08,dd):Math.max(env.H(X[i],Z[i])+.08,.45)+dd;
    }
    for(let i=0;i<m;i++){const a=Math.max(0,i-1),b=Math.min(m-1,i+1),tx=X[b]-X[a],tz=Z[b]-Z[a],l=Math.hypot(tx,tz)||1;TX[i]=tx/l;TZ[i]=tz/l}
    const cs=ctl.map(k=>cum[k]); // arclength of each control point (gates / pads / hazards reference control points)
    return {id:rd.id,m,X,Z,Y,W,S,TX,TZ,len,cs,sh:rd.shoulder==null?5:rd.shoulder,lipV:rd.lipV||0,alt:!!rd.alt,sub:!!rd.sub,openR:rd.openR||0,joinDef:rd.join||null,join:null};
  }

  function build(def,env){
    const T={def,id:def.id,name:def.name,H:env.H,roads:def.roads.map(r=>buildRoad(r,env)),gates:[],pads:[],hazards:[],landing:def.landing||[],landingTarget:def.landingTarget||null,grid:null};
    const byId={};T.roads.forEach((r,i)=>byId[r.id]=i);T.roadIndex=byId;
    // arclength of control point p (fractions allowed: p:1.5 is halfway between control points 1 and 2)
    const sOf=(r,p)=>{const i=Math.min(r.cs.length-1,Math.floor(p)),j=Math.min(r.cs.length-1,i+1);return r.cs[i]+(r.cs[j]-r.cs[i])*(p-i)};
    // spatial hash of road segments, each inserted into every cell its (half-width + shoulder) footprint touches
    const hash=new Map(),key=(cx,cz)=>cx*73856093^cz*19349663;
    T.roads.forEach((r,ri)=>{for(let i=0;i<r.m-1;i++){
      const hw=Math.max(r.W[i],r.W[i+1])/2+r.sh+1,x0=Math.min(r.X[i],r.X[i+1])-hw,x1=Math.max(r.X[i],r.X[i+1])+hw,z0=Math.min(r.Z[i],r.Z[i+1])-hw,z1=Math.max(r.Z[i],r.Z[i+1])+hw;
      for(let cx=Math.floor(x0/CELL);cx<=Math.floor(x1/CELL);cx++)for(let cz=Math.floor(z0/CELL);cz<=Math.floor(z1/CELL);cz++){
        const k=key(cx,cz);let a=hash.get(k);if(!a){a=[];hash.set(k,a)}a.push(ri,i)}}});
    T._hash=hash;T._key=key;

    // ---- queries ----
    // Highest deck at or below yRef+TOL under (x,z); NaN if none. out (optional) receives {onRoad,road,i,d}.
    T.deck=(x,z,yRef,out)=>{
      const a=hash.get(key(Math.floor(x/CELL),Math.floor(z/CELL)));let best=NaN,onRoad=false;
      if(a)for(let q=0;q<a.length;q+=2){
        const r=T.roads[a[q]],i=a[q+1],ax=r.X[i],az=r.Z[i],ex=r.X[i+1]-ax,ez=r.Z[i+1]-az,l2=ex*ex+ez*ez||1,rx=x-ax,rz=z-az;
        // u = how far along this segment the point projects. Strict at the two ends of a road (the lip is exactly where the deck stops);
        // inside a road the strips overlap by half a segment so bends have no sliver gaps. Distance is the LATERAL distance to the segment's
        // line (never the distance to a point further along the road, which would read as "on the road" at a different height).
        const u=(rx*ex+rz*ez)/l2;
        if(u<-.5||u>1.5||(i===0&&u<0)||(i===r.m-2&&u>1))continue;
        const dl=Math.abs(rx*-ez+rz*ex)/Math.sqrt(l2),t=u<0?0:u>1?1:u,w=(r.W[i]+(r.W[i+1]-r.W[i])*t)/2;
        if(dl>w+r.sh)continue;
        const y=r.Y[i]+(r.Y[i+1]-r.Y[i])*t;let h;
        if(dl<=w)h=y;else{const k=(dl-w)/r.sh;h=y*(1-k)+env.H(x,z)*k}
        if(h<=yRef+TOL&&!(h<=best)){best=h;onRoad=dl<=w;if(out){out.road=a[q];out.i=i;out.d=dl;out.onRoad=onRoad}}
      }
      if(out)out.onRoad=onRoad&&!isNaN(best);
      return best;
    };
    // is (x,z) over an underwater (sub) road? (the sea rescue and the underwater visuals ask this)
    T.subAt=(x,z)=>{const a=hash.get(key(Math.floor(x/CELL),Math.floor(z/CELL)));if(a)for(let q=0;q<a.length;q+=2){const r=T.roads[a[q]];if(!r.sub)continue;const i=a[q+1];if(Math.hypot(x-r.X[i],z-r.Z[i])<r.W[i]/2+r.sh+2)return true}return false};
    T.ground=(x,z,y)=>{const d=T.deck(x,z,y,null);return d===d?d:env.H(x,z)};
    const _o={};
    T.surf=(x,z)=>{T.deck(x,z,1e4,_o);return _o.onRoad?ROAD:ROUGH};
    T.landOK=(x,z)=>{for(const L of T.landing){if(Math.hypot(x-L.x,z-L.z)<=L.r)return true}return false};
    // nearest road sample (for AI, progress, off-track detection). hint = road index to prefer.
    T.project=(x,z,out,hintRoad,skipAlt)=>{
      out=out||{};let bd=1e18;
      for(let ri=0;ri<T.roads.length;ri++){const r=T.roads[ri];if(skipAlt&&r.alt&&ri!==hintRoad)continue;
        for(let i=0;i<r.m;i+=1){const dx=x-r.X[i],dz=z-r.Z[i],dd=dx*dx+dz*dz-(ri===hintRoad?400:0);if(dd<bd){bd=dd;out.road=ri;out.i=i}}}
      const r=T.roads[out.road],i=out.i;out.s=r.S[i];out.x=r.X[i];out.y=r.Y[i];out.z=r.Z[i];out.tx=r.TX[i];out.tz=r.TZ[i];out.w=r.W[i];
      out.d=(x-r.X[i])*-r.TZ[i]+(z-r.Z[i])*r.TX[i];out.dist=Math.hypot(x-r.X[i],z-r.Z[i]);return out;
    };
    // point on a road at arclength s (clamped), with tangent
    T.at=(ri,s,out)=>{
      out=out||{};const r=T.roads[ri];s=clamp(s,0,r.len);let i=Math.min(r.m-2,Math.floor(s/r.len*(r.m-1)));
      while(i>0&&r.S[i]>s)i--;while(i<r.m-2&&r.S[i+1]<s)i++;
      const f=(s-r.S[i])/((r.S[i+1]-r.S[i])||1);
      out.x=r.X[i]+(r.X[i+1]-r.X[i])*f;out.z=r.Z[i]+(r.Z[i+1]-r.Z[i])*f;out.y=r.Y[i]+(r.Y[i+1]-r.Y[i])*f;out.w=r.W[i]+(r.W[i+1]-r.W[i])*f;
      let tx=r.TX[i]+(r.TX[i+1]-r.TX[i])*f,tz=r.TZ[i]+(r.TZ[i+1]-r.TZ[i])*f;const l=Math.hypot(tx,tz)||1;out.tx=tx/l;out.tz=tz/l;return out;
    };
    // ---- GUARD WALLS: wherever the ground drops away beside a deck (mountain flanks, bridges, ramps), that edge is a solid wall for a grounded car, so you can
    // never drive off the side and fall down the mountain. Flags per road sample (GP: the +normal side, GM: the other); near the ends of a shortcut road the
    // main road's walls are removed so the cut can always be entered and left. Airborne cars are never blocked (the physics only asks while grounded). ----
    const GUARD_DROP=1.0,GO={nx:0,nz:0,pen:0};
    for(const r of T.roads){
      r.GP=new Uint8Array(r.m);r.GM=new Uint8Array(r.m);
      for(let i=0;i<r.m;i++){const nx=-r.TZ[i],nz=r.TX[i],e=r.W[i]/2+1.2;
        if(r.Y[i]-env.H(r.X[i]+nx*e,r.Z[i]+nz*e)>GUARD_DROP)r.GP[i]=1;
        if(r.Y[i]-env.H(r.X[i]-nx*e,r.Z[i]-nz*e)>GUARD_DROP)r.GM[i]=1}
      if(r.sub)for(let i=0;i<r.m;i++)if(r.Y[i]<-.8){r.GP[i]=1;r.GM[i]=1}   // the underwater road is a walled tube: you cannot drift off the deck into the open sea
      const a=r.GP.slice(),b=r.GM.slice();for(let i=0;i<r.m;i++)for(let k=-3;k<=3;k++){const j=i+k;if(j>=0&&j<r.m){if(a[j])r.GP[i]=1;if(b[j])r.GM[i]=1}}
    }
    for(const al of T.roads){if(!al.alt)continue;for(const ei of [0,al.m-1]){const ex=al.X[ei],ez=al.Z[ei];
      for(const r of T.roads){if(r.alt&&!(r===al&&al.openR))continue;for(let i=0;i<r.m;i++)if(Math.hypot(r.X[i]-ex,r.Z[i]-ez)<(al.openR||45)){r.GP[i]=0;r.GM[i]=0}}}}   // (an alt road also opens its OWN ends, so a car can drive on and off it)
    const guard=(x,z,y,r,out)=>{
      const a=hash.get(key(Math.floor(x/CELL),Math.floor(z/CELL)));if(!a)return false;let best=0;
      for(let q=0;q<a.length;q+=2){
        const rd=T.roads[a[q]],i=a[q+1];if(!rd.GP)continue;
        const ax=rd.X[i],az=rd.Z[i],ex=rd.X[i+1]-ax,ez=rd.Z[i+1]-az,l2=ex*ex+ez*ez||1,rx=x-ax,rz=z-az,u=(rx*ex+rz*ez)/l2;
        if(u<0||u>1)continue;
        const len=Math.sqrt(l2),l=(rx*-ez+rz*ex)/len,w=(rd.W[i]+(rd.W[i+1]-rd.W[i])*u)/2,yy=rd.Y[i]+(rd.Y[i+1]-rd.Y[i])*u;
        if(Math.abs(y-yy)>2.5)continue;
        const side=l>0?1:-1;if(!(side>0?(rd.GP[i]||rd.GP[i+1]):(rd.GM[i]||rd.GM[i+1])))continue;
        const pen=Math.min(3,Math.abs(l)-(w+.6-r));
        if(pen>best){best=pen;out.nx=-side*(-ez/len);out.nz=-side*(ex/len);out.pen=pen}
      }
      return best>0;
    };
    const _p={};
    // ---- gates ----
    (def.gates||[]).forEach((g,gi)=>{
      let G;
      if(g.road!=null){ // ground gate on a road, at control point p
        const ri=byId[g.road],r=T.roads[ri];T.at(ri,sOf(r,g.p),_p);
        G={x:_p.x,y:_p.y,z:_p.z,nx:_p.tx,nz:_p.tz,r:g.r||(_p.w/2+4),loose:g.loose||1.5,mode:g.mode||'car',type:'ground',road:ri,s:sOf(r,g.p),k:g.k||'gate'};
      }else{ // aerial ring: explicit position + heading
        G={x:g.x,y:g.y,z:g.z,nx:Math.sin(g.h),nz:Math.cos(g.h),r:g.r||16,loose:g.loose||2.2,mode:g.mode||'fly',type:'air',k:g.k||'ring',boost:g.boost!==false};
      }
      G.i=gi;G.finish=!!g.finish;G.opt=!!g.opt;T.gates.push(G);
    });
    // ---- ALTERNATE ROUTES. An alt road (road.alt) is a shortcut: it leaves a main road at control point fork.at and rejoins road.join = {road, p}. The main route's gates inside the
    // fork are `opt` gates: they may be skipped, as a group, by crossing a later gate (the merge). Bonus rings (def.bonus) are NOT in the gate chain: fly through one and you get a
    // boost, once per race. T.forks lists the shortcuts so the AI and the HUD can use them. ----
    T.hasAlt=T.roads.some(r=>r.alt);
    T.roads.forEach(r=>{if(r.joinDef){const jr=byId[r.joinDef.road];r.join={road:jr,s:sOf(T.roads[jr],r.joinDef.p)}}});
    T.forks=[];
    (def.forks||[]).forEach(f=>{const mi=byId[f.road],ai=byId[f.alt];T.at(mi,sOf(T.roads[mi],f.at),_p);T.forks.push({main:mi,alt:ai,s:sOf(T.roads[mi],f.at),x:_p.x,z:_p.z,tx:_p.tx,tz:_p.tz,w:_p.w,name:f.name||'SHORTCUT',len:T.roads[ai].len,ai:f.ai==null?.5:f.ai})});
    T.bonus=(def.bonus||[]).map((b,i)=>({x:b.x,y:b.y,z:b.z,nx:Math.sin(b.h),nz:Math.cos(b.h),r:b.r||14,i,secs:b.secs||2.2,name:b.name||'HIGH LINE'}));
    (def.pads||[]).forEach(p=>{const ri=byId[p.road],r=T.roads[ri];T.at(ri,sOf(r,p.p),_p);
      T.pads.push({x:_p.x,y:_p.y,z:_p.z,tx:_p.tx,tz:_p.tz,hl:(p.len||14)/2,hw:(p.w||8)/2,lat:p.lat||0})});
    (def.hazards||[]).forEach(h=>{const ri=byId[h.road],r=T.roads[ri];T.at(ri,sOf(r,h.p),_p);
      T.hazards.push({k:h.k||'hammer',x:_p.x,y:_p.y,z:_p.z,tx:_p.tx,tz:_p.tz,amp:h.amp||5.5,period:h.period||3.1,phase:h.phase||0,r:h.r||2,road:ri,s:sOf(r,h.p)})});

    // ---- item boxes: rows across a road (lat = lateral offsets in metres) or free positions in the sky ----
    T.itemBoxes=[];
    (def.items||[]).forEach(it=>{
      if(it.road!=null){const ri=byId[it.road],r=T.roads[ri];T.at(ri,sOf(r,it.p),_p);for(const lat of (it.lat||[0]))T.itemBoxes.push({x:_p.x+(-_p.tz)*lat,z:_p.z+_p.tx*lat,y:_p.y+1.3,air:false})}
      else T.itemBoxes.push({x:it.x,y:it.y,z:it.z,air:true});
    });
    // ---- solid scenery + terrain barriers (the physics asks env.block every frame while grounded) ----
    // Solids are the game's own circles {x,z,r,h?,noSide?} (trunks, boulders, structures: the same list the avatar collides with). They go in a spatial hash
    // (rebuilt from scratch on setSolids, so reloading an island never duplicates anything). A solid with a top height h can be driven OVER by a car whose
    // wheels are above it; noSide solids are moving platforms and never block. Beyond that, OFF-ROAD terrain blocks a car that is driving INTO it:
    //   - mountain flanks steeper than SLOPE_MAX (the car may still slide or drive down them, and is never pushed uphill),
    //   - the island's edge: terrain below SEA_MIN (10 cm above the waterline: the car stops on dry sand) is the sea (a car approaching it stops; roads / ramps / airborne cars are untouched).
    const SC=16,sh=new Map(),SLOPE_MAX=.45,SEA_MIN=.1;let nSol=0;
    T.setSolids=(arr)=>{
      sh.clear();nSol=0;if(!arr)return;
      // only solids near a road matter at race scale: within 420 m of any road sample, or the car can reach them
      const pts=[];for(const r of T.roads)for(let i=0;i<r.m;i+=12)pts.push(r.X[i],r.Z[i]);
      for(const c of arr){if(c.noSide||!(c.r>0))continue;let near=false;for(let i=0;i<pts.length&&!near;i+=2){const dx=c.x-pts[i],dz=c.z-pts[i+1];if(dx*dx+dz*dz<420*420)near=true}if(!near)continue;
        const k=key(Math.floor(c.x/SC),Math.floor(c.z/SC));let a=sh.get(k);if(!a){a=[];sh.set(k,a)}a.push(c);nSol++}
    };
    T.solidCount=()=>nSol;
    // solid scenery only (no terrain rules): for projectiles. A low solid can be flown over (y above its top).
    T.solidHit=(x,y,z,r)=>{if(!nSol)return false;const cx=Math.floor(x/SC),cz=Math.floor(z/SC);
      for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const g=sh.get(key(cx+a,cz+b));if(g)for(const c of g){const dx=x-c.x,dz=z-c.z,R=c.r+r;if(dx*dx+dz*dz<R*R&&!(c.h&&y>=c.h))return true}}return false};
    const gr={x:0,z:0};
    const grad=(x,z)=>{const e=1.5,hx=env.H(x+e,z)-env.H(x-e,z),hz=env.H(x,z+e)-env.H(x,z-e);gr.x=hx/(2*e);gr.z=hz/(2*e);return gr};
    // Is a grounded car (centre x,z, wheel height y, radius r) overlapping something solid? Fills out {nx,nz,pen} (unit normal pointing OUT of the obstacle).
    // vx,vz = its velocity (used so a car sliding down a slope / away from an edge is never pushed or stuck).
    T.block=(x,z,y,r,vx,vz,out)=>{
      let best=0,bx=0,bz=0;
      if(nSol){
        const cx=Math.floor(x/SC),cz=Math.floor(z/SC);
        for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const g=sh.get(key(cx+a,cz+b));if(g)for(const c of g){
          const dx=x-c.x,dz=z-c.z,R=c.r+r,d2=dx*dx+dz*dz;if(d2>=R*R)continue;
          if(c.h&&y>=c.h-.3)continue;                                   // driving over the top of a low block / platform
          const d=Math.sqrt(d2)||1e-4,pen=R-d;if(pen>best){best=pen;bx=dx/d;bz=dz/d}}}
      }
      if(best===0&&guard(x,z,y,r,GO)){best=GO.pen;bx=GO.nx;bz=GO.nz}   // guard wall at a drop-off edge
      // terrain barriers only where there is no road deck, so roads, ramps, bridges and the shoulder blend are never blocked
      if(best===0){
        const d0=T.deck(x,z,y+TOL,null);
        if(d0!==d0){
          const h=env.H(x,z);
          if(h<SEA_MIN){const g=grad(x,z),gl=Math.hypot(g.x,g.z)||1e-4;if(vx*g.x+vz*g.z<0){best=.01;bx=g.x/gl;bz=g.z/gl}}   // heading seaward: the wall faces inland (tiny push: the barrier cancels the velocity INTO it, it must not shove the car around)
          else{const g=grad(x,z),gl=Math.hypot(g.x,g.z);if(gl>SLOPE_MAX&&vx*g.x+vz*g.z>0){best=.01;bx=-g.x/gl;bz=-g.z/gl}}  // heading up a too-steep flank: the wall faces downhill
        }
      }
      if(best>0){out.nx=bx;out.nz=bz;out.pen=best;return true}
      return false;
    };
    // ---- boost pads ----
    T.padAt=(x,y,z)=>{for(let i=0;i<T.pads.length;i++){const p=T.pads[i];if(Math.abs(y-p.y)>3)continue;
      const dx=x-p.x,dz=z-p.z,a=dx*p.tx+dz*p.tz,l=dx*-p.tz+dz*p.tx-p.lat;if(Math.abs(a)<=p.hl&&Math.abs(l)<=p.hw)return i}return -1};
    // ---- hazards: a pure function of race time, so every client agrees with zero network traffic ----
    T.hazardPos=(h,t,out)=>{out=out||{};const l=h.amp*Math.sin(6.2831853*t/h.period+h.phase);out.x=h.x+(-h.tz)*l;out.z=h.z+h.tx*l;out.y=h.y;out.lat=l;return out};
    const _h={};
    T.hitHazard=(x,y,z,t,carR)=>{for(let i=0;i<T.hazards.length;i++){const h=T.hazards[i];if(Math.abs(y-h.y)>3.5)continue;
      T.hazardPos(h,t,_h);if(Math.hypot(x-_h.x,z-_h.z)<h.r+carR)return i}return -1};

    // ---- start grid: two abreast, rows behind the start gate (gate 0) ----
    T.gridSlots=(n)=>{
      const g=T.gates[0],out=[],lane=3.5,row=7.5;
      for(let k=0;k<n;k++){
        const rw=Math.floor(k/2),side=k%2?1:-1,back=6+rw*row+(k%2?3:0);
        const ri=g.road,s=g.s-back;let px,pz,py,tx,tz;
        if(s>=0){T.at(ri,s,_p);px=_p.x;pz=_p.z;py=_p.y;tx=_p.tx;tz=_p.tz}
        else{T.at(ri,0,_p);px=_p.x+_p.tx*s;pz=_p.z+_p.tz*s;py=_p.y;tx=_p.tx;tz=_p.tz}
        out.push({x:px+(-tz)*lane*side,z:pz+tx*lane*side,y:py,h:Math.atan2(tx,tz),slot:k});
      }
      return out;
    };
    // ---- recovery: back to the last gate passed, in the vehicle mode that gate leaves you in ----
    T.respawn=(racer,out)=>{
      out=out||{};const k=racer.passed-1;
      if(k<0){const s=T.gridSlots(1)[0];out.x=s.x;out.y=s.y;out.z=s.z;out.h=s.h;out.mode='car';out.speed=0;return out}
      const g=T.gates[k];out.x=g.x;out.z=g.z;out.h=Math.atan2(g.nx,g.nz);out.mode=g.mode;
      out.y=g.y;out.speed=g.mode==='fly'?RALLY.fly.cruise:22;   // the lip gate is a ground gate that leaves you FLYING: mode, not type, decides
      return out;
    };
    return T;
  }
  const ROAD={rough:false},ROUGH={rough:true};

  // ---------------- racer progress (one per competitor; the host runs the same code to validate) ----------------
  function racer(){return {bz:[],alt:false,gT:0,next:0,passed:0,splits:[],sk:[],perfect:0,finished:false,finishT:0,px:NaN,py:0,pz:0,stuckT:0,lostT:0,rec:0,ev:{gate:-1,perfect:false,mode:null,finish:false,t:0}}}
  // Called every frame with the new position. A gate counts when the segment prev->cur crosses its plane FORWARD inside its radius (so no
  // tunnelling at 100+ m/s, no backwards passes, strictly in order). Within `loose`*r counts too (a near miss still progresses) but is not 'perfect'.
  function advance(T,r,x,y,z,t){
    const ev=r.ev;ev.gate=-1;ev.perfect=false;ev.mode=null;ev.finish=false;ev.skipped=0;ev.cut=false;ev.bonus=-1;
    if(r.finished){r.px=x;r.py=y;r.pz=z;return ev}
    if(r.px===r.px){
      // does the segment prev->cur cross gate g's plane forward, inside its (loose) radius? returns 0 no, 1 near miss, 2 perfect
      const cross=g=>{
        const d0=(r.px-g.x)*g.nx+(r.pz-g.z)*g.nz,d1=(x-g.x)*g.nx+(z-g.z)*g.nz;if(!(d0<0&&d1>=0))return 0;
        const f=d0/(d0-d1),dist=Math.hypot(r.px+(x-r.px)*f-g.x,r.py+(y-r.py)*f-g.y,r.pz+(z-r.pz)*f-g.z);
        return dist<=g.r?2:dist<=g.r*(g.loose||1.5)?1:0;
      };
      const g=T.gates[r.next];
      if(g){
        let q=cross(g),take=0,skip=0;
        if(q)take=1;
        else if(g.opt){ // a fork: the main route's own gates are optional. Crossing a LATER gate of the fork (up to and including the merge) takes the shortcut: all gates before it count as passed
          for(let k=r.next+1;k<T.gates.length;k++){const gk=T.gates[k];if(q=cross(gk)){take=1;skip=k-r.next;ev.cut=true;break}if(!gk.opt)break}
        }else{ // skip tolerance: an ordinary gate or ring missed by a few metres does not end your race if you pass the NEXT gate (never the start, lips, touchdowns or finish)
          const g2=T.gates[r.next+1];
          if(g2&&(g.k==='gate'||g.k==='ring')&&(q=cross(g2))){take=1;skip=1}
        }
        if(take){
          for(let k=0;k<skip;k++){r.splits.push(t);r.sk.push(1);r.passed++;r.next++;ev.skipped++}
          const gi=T.gates[r.next];
          ev.gate=gi.i;ev.perfect=q===2&&skip===0;ev.mode=gi.mode;ev.finish=gi.finish;ev.t=t;
          r.splits.push(t);r.sk.push(0);r.passed++;r.next++;r.gT=0;if(ev.perfect)r.perfect++;
          if(gi.finish||r.next>=T.gates.length){r.finished=true;r.finishT=t;ev.finish=true}
        }
      }
      // bonus rings: off the gate chain, once each per race
      if(T.bonus&&T.bonus.length&&!r.finished)for(const b of T.bonus){if(r.bz.indexOf(b.i)>=0)continue;if(cross(b)){r.bz.push(b.i);ev.bonus=b.i;break}}
      if(T.hasAlt)r.alt=y<T.ground(x,z,y+1.5)+3&&T.roads[T.project(x,z,_pj,-1).road].alt&&_pj.dist<T.roads[_pj.road].W[_pj.i]*.9;   // on a shortcut road right now (used for navigation and rank)
    }
    r.px=x;r.py=y;r.pz=z;return ev;
  }
  const _pj={};
  // the gate to steer at: while you are ON a shortcut, the optional gates of the main route are not your target, the merge gate is
  function navGate(T,r){
    let k=r.next;const g=T.gates[k];if(!g||!g.opt||!r.alt)return g;
    while(k<T.gates.length-1&&T.gates[k].opt)k++;return T.gates[k]}
  // ranking key: gates passed first, then (closer to the next gate) is ahead; finishers by time
  function score(T,r,x,y,z){
    if(r.finished)return 1e9-r.finishT;
    const g=navGate(T,r);let p=r.passed;if(g&&g!==T.gates[r.next])p+=g.i-r.next;   // on a shortcut you are already "through" the main route's optional gates
    return p*1e5-(g?Math.hypot(x-g.x,y-g.y,z-g.z):0);
  }
  // host-side plausibility: minimum possible time between gate i-1 and i (straight line at an absolute top speed). Not tamper-proof (no server
  // authority) but rejects teleports / impossible splits in a friends game.
  function minTime(T,i){
    const g=T.gates[i],p=i>0?T.gates[i-1]:null;if(!p)return 0;
    const top=g.type==='air'||p.type==='air'?RALLY.fly.vmax*RALLY.fly.boostMul*1.05:RALLY.cls.comet.vmax*RALLY.cls.comet.boostMul*1.05+30;
    return Math.max(0,(Math.hypot(g.x-p.x,g.y-p.y,g.z-p.z)-g.r*g.loose-p.r*p.loose)/top);
  }
  function plausible(T,r){for(let i=1;i<r.splits.length;i++){if(r.sk&&(r.sk[i-1]||r.sk[i]))continue;if(r.splits[i]-r.splits[i-1]<minTime(T,i)-.25)return false}return true}   // a skipped gate shares its time with the next one, so it is exempt
  // does this racer need rescuing? ('water': a grounded car in the sea; 'stuck': barely moving for 3 s; 'lost': far from every road for 5 s, or no gate for 25 s)
  function needsRecovery(T,r,c,dt){
    r.gT+=dt;if(r.alt)r.gT=Math.min(r.gT,12);if(r.gT>25&&!r.finished){r.gT=0;return 'lost'}     // no gate for 25 s (fell onto the wrong lap, wandered off): rescue to the last gate
    if(c.grounded&&c.mode==='car'){
      if(c.y<-.8){const d=T.deck(c.x,c.z,c.y+1.2,null);if(!(d===d&&c.y-d<1.2&&T.subAt(c.x,c.z)))return 'water'}   // in the sea = rescue, unless you are on an underwater road
      r.stuckT=Math.hypot(c.vx,c.vz)<1.5?r.stuckT+dt:0;if(r.stuckT>3){r.stuckT=0;return 'stuck'}
      const p=T.project(c.x,c.z,null,-1);r.lostT=p.dist>70?r.lostT+dt:0;if(r.lostT>5){r.lostT=0;return 'lost'}
    }else{r.stuckT=0;r.lostT=0;if(c.mode==='car'&&c.y<-6)return 'water'}
    return null;
  }

  return {build,racer,advance,score,navGate,minTime,plausible,needsRecovery,wrap};
})();
