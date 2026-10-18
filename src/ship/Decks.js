// Decks: ships you can really STAND on, WALK on, climb and be carried by (pure logic: no THREE, no DOM, no network; tests/decks.sim.js).
//
// Why: the first sloop had three invisible walkable circles at one fixed height, so the raised stern deck (where the wheel is) swallowed you, the rails were not solid and not climbable,
// and a bigger ship would have needed more and more circles. Now every ship model has a baked HEIGHT GRID of its real walkable surface (tools/bake_decks.mjs -> src/data/decks.js: main deck,
// raised decks, stairs, rails, cabin walls, hatch, props...). The grid lives in the ship's own (tilted, moving) frame, so the same code serves any hull of any size.
//
//   - a cell is a FLOOR you can stand on when it is at most STEP above your feet (stairs / low edges walk up smoothly), a WALL when it is higher (bulwarks, cabins, a mast, a cannon);
//   - a wall between STEP and HOP above your feet (a rail, a gunwale, a crate, an enemy's side) is a LEDGE: walking INTO it while on the ground climbs you up onto it (a quick smooth mantle),
//     then you can walk along the rail or drop down the other side (that is how you board from a dock / the water's edge / another ship). Higher than that is a wall for good;
//   - your position is remembered in the ship's frame, so the ship carries you (translation, yaw, pitch, roll) and a jump or a hop keeps riding the deck;
//   - walls slide you along them (normal estimated from the grid) instead of sticking.
// Coordinates: SHIP SPACE = metres, origin at the keel centre, +Z = bow, +X = starboard-ish (same as Sailing.toWorld). World = pos + Ry(h) Rx(pitch) Rz(roll) p  (three.js 'YXZ').
// The game calls step() once per frame after the player has moved (index.html), and sets each ship's pose with setPose().
const Decks=(()=>{
  const STEP=.9,HOP=1.6,R=.36,CLIMB=.55,UP=7,UPC=4;          // metres: stair step you just walk up, highest ledge you can climb over, body radius, seconds a climb lasts, rise speeds (m/s)
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const decks=new Map(),cache={};
  // ---------- the baked grids ----------
  function grid(name){
    if(cache[name])return cache[name];
    const D=typeof DECKS!=='undefined'?DECKS:null,m=D&&D.models[name];if(!m)return null;
    const idx={};for(let i=0;i<D.sym.length;i++)idx[D.sym[i]]=i;
    const h=new Float32Array(m.nx*m.nz);for(let z=0;z<m.nz;z++){const r=m.rows[z];for(let x=0;x<m.nx;x++){const k=idx[r[x]];h[z*m.nx+x]=k>0?(k-1)/10:-1}}
    return cache[name]={cs:m.cs,x0:m.x0,z0:m.z0,nx:m.nx,nz:m.nz,h}}
  // ---------- a deck = one grid on one moving hull ----------
  // opt: {sc: model scale, grid: name | a grid object (tests)}
  function create(id,opt){
    const g=typeof opt.grid==='string'?grid(opt.grid):opt.grid;if(!g)return null;
    const d={id,sc:opt.sc||1,cs:g.cs,x0:g.x0,z0:g.z0,nx:g.nx,nz:g.nz,h:Float32Array.from(g.h),pose:{x:0,y:0,z:0,h:0,pitch:0,roll:0},M:null,rad2:0,solid:true,name:opt.name||id};
    // radius of everything that can be walked on (in metres) + margin: the cheap "is anybody near" test
    let r=0;for(let z=0;z<d.nz;z++)for(let x=0;x<d.nx;x++)if(d.h[z*d.nx+x]>=0){const mx=(d.x0+(x+.5)*d.cs)*d.sc,mz=(d.z0+(z+.5)*d.cs)*d.sc;r=Math.max(r,Math.hypot(mx,mz))}
    d.rad=r+3;d.rad2=d.rad*d.rad;setPose(d,{});return d}
  function add(id,opt){const d=create(id,opt);if(d)decks.set(id,d);return d}
  const remove=id=>decks.delete(id),get=id=>decks.get(id),all=()=>decks.values(),clear=()=>decks.clear();
  // the pose rotation matrix (YXZ) and its transpose, cached: world = pos + M p ; p = M^T (world - pos)
  function setPose(d,p){
    const q=d.pose;for(const k in p)q[k]=p[k];
    const cy=Math.cos(q.h),sy=Math.sin(q.h),cx=Math.cos(q.pitch),sx=Math.sin(q.pitch),cz=Math.cos(q.roll),sz=Math.sin(q.roll);
    // M = Ry * Rx * Rz
    const a=[cz,-sz,0,sz,cz,0,0,0,1];                                           // Rz
    const b=[1,0,0,0,cx,-sx,0,sx,cx];                                           // Rx
    const c=[cy,0,sy,0,1,0,-sy,0,cy];                                           // Ry
    const mul=(A,B)=>{const o=new Array(9);for(let i=0;i<3;i++)for(let j=0;j<3;j++)o[i*3+j]=A[i*3]*B[j]+A[i*3+1]*B[3+j]+A[i*3+2]*B[6+j];return o};
    d.M=mul(c,mul(b,a));return d}
  function toWorld(d,x,y,z,o){const M=d.M,p=d.pose;o=o||{};o.x=p.x+M[0]*x+M[1]*y+M[2]*z;o.y=p.y+M[3]*x+M[4]*y+M[5]*z;o.z=p.z+M[6]*x+M[7]*y+M[8]*z;return o}
  function toLocal(d,x,y,z,o){const M=d.M,p=d.pose,wx=x-p.x,wy=y-p.y,wz=z-p.z;o=o||{};o.x=M[0]*wx+M[3]*wy+M[6]*wz;o.y=M[1]*wx+M[4]*wy+M[7]*wz;o.z=M[2]*wx+M[5]*wy+M[8]*wz;return o}
  // ---------- the grid ----------
  // floor height (metres, ship space) under ship-space (x,z), or -1 where there is no hull (water / off the edge)
  function floor(d,x,z){
    const ix=Math.floor((x/d.sc-d.x0)/d.cs),iz=Math.floor((z/d.sc-d.z0)/d.cs);
    if(ix<0||iz<0||ix>=d.nx||iz>=d.nz)return -1;const v=d.h[iz*d.nx+ix];return v<0?-1:v*d.sc}
  // raise every cell under a circle (ship-space metres) to height hm (a cannon, a barrel, the wheel): they become solid, climbable props
  function stamp(d,x,z,r,hm){
    const s=d.sc*d.cs,ix0=Math.floor((x-r)/d.sc/d.cs-d.x0/d.cs),ix1=Math.floor((x+r)/d.sc/d.cs-d.x0/d.cs),iz0=Math.floor((z-r)/d.sc/d.cs-d.z0/d.cs),iz1=Math.floor((z+r)/d.sc/d.cs-d.z0/d.cs);
    for(let iz=iz0;iz<=iz1;iz++)for(let ix=ix0;ix<=ix1;ix++){if(ix<0||iz<0||ix>=d.nx||iz>=d.nz)continue;
      const cx=(d.x0+(ix+.5)*d.cs)*d.sc,cz=(d.z0+(iz+.5)*d.cs)*d.sc;if(Math.hypot(cx-x,cz-z)>r+s*.35)continue;
      const i=iz*d.nx+ix;if(d.h[i]>=0)d.h[i]=Math.max(d.h[i],hm/d.sc)}}
  // box version (ship space): centre, half sizes, rotation ry
  function stampBox(d,x,z,hw,hd,ry,hm){
    const c=Math.cos(ry||0),s=Math.sin(ry||0),r=Math.hypot(hw,hd)+d.sc*d.cs;
    const ix0=Math.floor((x-r)/d.sc/d.cs-d.x0/d.cs),ix1=Math.floor((x+r)/d.sc/d.cs-d.x0/d.cs),iz0=Math.floor((z-r)/d.sc/d.cs-d.z0/d.cs),iz1=Math.floor((z+r)/d.sc/d.cs-d.z0/d.cs);
    for(let iz=iz0;iz<=iz1;iz++)for(let ix=ix0;ix<=ix1;ix++){if(ix<0||iz<0||ix>=d.nx||iz>=d.nz)continue;
      const cx=(d.x0+(ix+.5)*d.cs)*d.sc-x,cz=(d.z0+(iz+.5)*d.cs)*d.sc-z,lx=c*cx-s*cz,lz=s*cx+c*cz;if(Math.abs(lx)>hw||Math.abs(lz)>hd)continue;
      const i=iz*d.nx+ix;if(d.h[i]>=0)d.h[i]=Math.max(d.h[i],hm/d.sc)}}
  // The baked grid has no rails: past the edge of a deck there is just void, so walking off the side dropped you in the sea. seal() raises a two-cell wall (wall metres tall,
  // taller than the mantle hop) in every void / far-below cell that touches a deck cell between lo and hi. Leaving the ship is then a choice (Ship.overboard), never an accident.
  function seal(d,lo,hi,wall,rings,gap){
    const N=d.nx,sc=d.sc;let cur=[];
    for(let iz=0;iz<d.nz;iz++)for(let ix=0;ix<N;ix++){const v=d.h[iz*N+ix];if(v<0)continue;const h=v*sc;if(h>=lo&&h<=hi)cur.push([ix,iz,h])}
    for(let r=0;r<(rings||2);r++){const next=[];
      for(const [ix,iz,h] of cur){
        const lim=h<=lo+.45?h-.45:lo-1.0;   // main-deck level: even a low ledge of hull beside it is walled; the raised stern / bow decks only wall true voids and big drops (their stairs and the main deck beside them stay open)
        for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){if(!a&&!b)continue;const x=ix+a,z=iz+b;if(x<0||z<0||x>=N||z>=d.nz)continue;const i=z*N+x,v=d.h[i];
          if(v<0||v*sc<lim){d.h[i]=(h+wall)/sc;next.push([x,z,h])}}}
      cur=next}
    // a gangway: a stretch of the side that is only a climbable rail (gap = {side,z0,z1,h}: side -1/+1, ship-space z range, rail height in metres)
    if(gap)for(let iz=0;iz<d.nz;iz++)for(let ix=0;ix<N;ix++){const x=(d.x0+(ix+.5)*d.cs)*sc,z=(d.z0+(iz+.5)*d.cs)*sc,i=iz*N+ix;
      if(x*gap.side>0&&z>=gap.z0&&z<=gap.z1&&d.h[i]*sc>=lo+gap.h+.4&&d.h[i]*sc<=lo+wall+.6)d.h[i]=(lo+.25+gap.h)/sc}}
  const RING=[[R,0],[-R,0],[0,R],[0,-R]];
  // is a body of radius R standing at (x,z) with its feet at ship-space height ly stopped by anything higher than ly+step?  returns the tallest blocking height (or 0)
  function wallAt(d,x,z,ly,step){
    let worst=0;const lim=ly+step;
    let f=floor(d,x,z);if(f>lim)worst=f;
    for(const [a,b] of RING){f=floor(d,x+a,z+b);if(f>lim&&f>worst)worst=f}
    return worst}
  // outward-pointing normal of the walls around (x,z) (unit, ship space) or null: from 8 probes just outside the body
  function wallNormal(d,x,z,ly,step){
    let nx=0,nz=0;const lim=ly+step,rr=R+.18;
    for(let k=0;k<8;k++){const a=k*Math.PI/4,dx=Math.cos(a),dz=Math.sin(a);if(floor(d,x+dx*rr,z+dz*rr)>lim){nx-=dx;nz-=dz}}
    const l=Math.hypot(nx,nz);return l>1e-6?{x:nx/l,z:nz/l}:null}
  // move from (ox,oz) (a free place) toward (nx,nz) at feet height ly; returns {x,z,hit} where hit = the tallest wall met (0 = none) and hop = a ledge that may be hopped
  function slide(d,ox,oz,nx,nz,ly,step){
    let w=wallAt(d,nx,nz,ly,step);if(!w)return {x:nx,z:nz,hit:0};
    const mx=nx-ox,mz=nz-oz,n=wallNormal(d,nx,nz,ly,step);
    if(n){const dot=mx*n.x+mz*n.z;if(dot<0){const sx=ox+mx-n.x*dot,sz=oz+mz-n.z*dot;if(!wallAt(d,sx,sz,ly,step))return {x:sx,z:sz,hit:w}}}
    if(!wallAt(d,nx,oz,ly,step))return {x:nx,z:oz,hit:w};
    if(!wallAt(d,ox,nz,ly,step))return {x:ox,z:nz,hit:w};
    return {x:ox,z:oz,hit:w}}
  // the nearest free spot (ship space) around (x,z): used when a hull sweeps into somebody
  function freeSpot(d,x,z,ly,step){
    if(!wallAt(d,x,z,ly,step))return {x,z};
    for(let r=.3;r<=2.4;r+=.3)for(let k=0;k<12;k++){const a=k*Math.PI/6,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;if(!wallAt(d,px,pz,ly,step))return {x:px,z:pz}}
    return null}
  // ---------- walking routes (crew AI, tests): breadth-first over the grid with the plain walking rules ----------
  // from / to: ship-space metres. Returns [{x,z},...] cell centres (4-connected, stairs included) or null when there is no way on foot. maxN bounds the search.
  function route(d,x0,z0,x1,z1,maxN){
    const N=d.nx,M=d.nz,sx=d.sc*d.cs,cx=i=>(d.x0+(i+.5)*d.cs)*d.sc,cz=i=>(d.z0+(i+.5)*d.cs)*d.sc;
    const gi=x=>Math.floor((x/d.sc-d.x0)/d.cs),gj=z=>Math.floor((z/d.sc-d.z0)/d.cs);
    const a=gi(x0),b=gj(z0),ga=gi(x1),gb=gj(z1);if(a<0||b<0||a>=N||b>=M||ga<0||gb<0||ga>=N||gb>=M)return null;
    const prev=new Int32Array(N*M).fill(-2),q=[b*N+a];prev[b*N+a]=-1;let found=-1,n=0;maxN=maxN||6000;
    for(let h=0;h<q.length&&n<maxN;h++,n++){const k=q[h],i=k%N,j=(k/N)|0;if(Math.abs(i-ga)<=1&&Math.abs(j-gb)<=1){found=k;break}
      const fy=floor(d,cx(i),cz(j));
      for(const [da,db] of [[1,0],[-1,0],[0,1],[0,-1]]){const I=i+da,J=j+db;if(I<0||J<0||I>=N||J>=M||prev[J*N+I]!==-2)continue;
        const X=cx(I),Z=cz(J),f=floor(d,X,Z);if(f<0||f-fy>STEP||wallAt(d,X,Z,fy,STEP))continue;prev[J*N+I]=k;q.push(J*N+I)}}
    if(found<0)return null;const path=[];for(let k=found;k>=0;k=prev[k])path.unshift({x:cx(k%N),z:cz((k/N)|0)});
    const out=[];for(let i=0;i<path.length;i+=2)out.push(path[i]);const L=path[path.length-1];if(out[out.length-1]!==L)out.push(L);return out}
  // ---------- the player ----------
  // S: the player state (x,y,z,vy,rot,...); (px,pz): where S was BEFORE this frame's own movement; o: {dt, grounded, moving, flying}.
  // Moves S horizontally (carry + collision) and returns the ground height the ship provides under S (or -Infinity when none). Remembers S._dk = {id,x,y,z,h} (ship-space spot).
  const _a={},_b={};
  function step(S,px,pz,o){
    const dt=o.dt||.016;let gy=-Infinity,chosen=null;
    if(S._climb>0)S._climb-=dt;
    for(const d of decks.values()){
      if(d.off){if(S._dk&&S._dk.id===d.id)S._dk=null;continue}                       // a sinking hull: nothing to stand on
      const q=d.pose;let carried=S._dk&&S._dk.id===d.id&&!o.flying;
      if(carried){toWorld(d,S._dk.x,S._dk.y,S._dk.z,_a);if(Math.hypot(_a.x-px,_a.z-pz)>4){S._dk=null;carried=false}}     // teleported away (map travel, respawn, a portal): do not drag the player back
      if(!carried){const dx=S.x-q.x,dz=S.z-q.z;if(dx*dx+dz*dz>d.rad2)continue}
      let bx=px,bz=pz;
      if(carried){bx=_a.x;bz=_a.z;S.rot+=wrap(q.h-S._dk.h)}
      const mvx=S.x-px,mvz=S.z-pz,tx=bx+mvx,tz=bz+mvz;
      const lo=toLocal(d,bx,S.y,bz,{});
      if(!o.flying){const fo=floor(d,lo.x,lo.z);if(fo>0&&fo>lo.y+STEP+1.5&&wallAt(d,lo.x,lo.z,lo.y,STEP)){toWorld(d,lo.x,fo,lo.z,_a);S.y=_a.y;S.vy=0}}   // somehow inside the hull (a fall through a gap, a hull sweeping over you): pop up onto the deck instead of being stuck in the planks
      const ol=toLocal(d,bx,S.y,bz,{}),nl=toLocal(d,tx,S.y,tz,{});          // feet height = the player's real height in the ship frame (ly)
      const ly=nl.y;let hopping=S._climb>0,step=hopping?HOP:STEP;
      // swept movement: in steps of at most 0.25 m so a fast swimmer / a slow frame can never jump through a thin rail
      const mxv=nl.x-ol.x,mzv=nl.z-ol.z,mlen=Math.hypot(mxv,mzv),ns=Math.max(1,Math.ceil(mlen/.25));let ex=ol.x,ez=ol.z;
      for(let i=1;i<=ns;i++){
        const tx2=ol.x+mxv*i/ns,tz2=ol.z+mzv*i/ns;let r=slide(d,ex,ez,tx2,tz2,ly,step);
        // a ledge in the way: climb onto it when walking on the ground into it (the get-over-the-rail move); only when walking INTO it, not when sliding along it
        if(r.hit&&!hopping&&o.grounded&&o.moving&&!o.flying&&!o.noClimb&&r.hit-ly<=HOP){
          const n=wallNormal(d,tx2,tz2,ly,STEP),mx=tx2-ex,mz=tz2-ez,m=Math.hypot(mx,mz);
          if(n&&m>1e-5&&(mx*n.x+mz*n.z)/m<-.45){S._climb=CLIMB;hopping=true;step=HOP;r=slide(d,ex,ez,tx2,tz2,ly,step)}}
        ex=r.x;ez=r.z}
      // a hull that sweeps into you: step to the nearest free spot (never a freeze inside a wall)
      if(wallAt(d,ex,ez,ly,hopping?HOP:STEP)&&wallAt(d,ol.x,ol.z,ly,hopping?HOP:STEP)){const f=freeSpot(d,ex,ez,ly,STEP);if(f){ex=f.x;ez=f.z}}
      // what is under me now
      const f0=floor(d,ex,ez);let sup=-1;
      if(f0>=0&&f0<=ly+step)sup=f0;
      else{for(const [a,b] of RING){const f=floor(d,ex+a,ez+b);if(f>=0&&f<=ly+step&&f>sup)sup=f}}      // standing on the very edge of a rail: a neighbour cell holds you
      toWorld(d,ex,ly,ez,_b);S.x=_b.x;S.z=_b.z;                           // the carried + collided position (walls also stop a swimmer against the hull)
      if(sup<0){if(carried)S._dk=null;continue}                         // off the edge / over the water: no ship under you
      toWorld(d,ex,sup,ez,_a);const sy=_a.y;
      const standing=S.y>=sy-.15||(o.grounded&&sy-S.y<=step);
      if(sy>gy&&standing)gy=sy;
      if(standing||(S.y-sy<2.4&&S.y-sy>-.5)){S._dk={id:d.id,x:ex,y:standing?sup:ly,z:ez,h:q.h};chosen=d}
      else if(carried)S._dk=null}
    if(!chosen&&S._dk&&!decks.has(S._dk.id))S._dk=null;
    // a smooth step up (stairs, a curb, a climb over the rail): never snap, rise at a limited speed
    if(gy>-Infinity&&gy>S.y&&gy-S.y>.05&&o.grounded)gy=Math.min(gy,S.y+Math.max(.1,(S._climb>0?UPC:UP)*dt));
    return gy}
  // pin a player to a ship-space spot (the helm): the next step() carries them from there
  function pin(S,d,x,z){const sup=floor(d,x,z);S._dk={id:d.id,x,y:Math.max(0,sup),z,h:d.pose.h};toWorld(d,x,Math.max(0,sup),z,_a);S.x=_a.x;S.z=_a.z;S.y=_a.y;S.vy=0;return _a.y}
  const standingOn=S=>S._dk?S._dk.id:null;
  const disable=(d,on)=>{if(d)d.off=!!on};
  return {seal,wallNormal,disable,STEP,HOP,R,grid,create,add,remove,get,all,clear,setPose,toWorld,toLocal,floor,stamp,stampBox,wallAt,slide,freeSpot,route,step,pin,standingOn,decks};
})();
