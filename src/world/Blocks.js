// Blocks: solid BUILDINGS you can walk into and climb: axis-aligned wall boxes (with real door / window openings) and walkable floor rectangles (floors, stair steps, roofs, balconies).
// Pure logic (no THREE, no DOM; tests/blocks.sim.js). Used by:
//   - the player controller (index.html, after the circle `solids` loop): Blocks.push(S) slides you along walls, Blocks.floorAt(x,z,y) gives the surface under your feet (upper floors, stairs, roofs);
//   - the raiders (Outlaw.js) with the same two calls, so they can run indoors and up the stairs;
//   - bullets + line of sight: every box is ALSO a cover entry {x,z,r,x0,x1,z0,z1,y0,y1,wall:1} so HitZones.coverT / Outlaw.los / EnemyAI.sees see real walls, window gaps and roofs.
// Coordinates: world metres. A wall box blocks a body when it overlaps [feet + STEP .. feet + HEAD] vertically, so door sills and kerbs never stop you and a window sill (0.6 m+) does.
const Blocks=(()=>{
  const STEP=.55,HEAD=1.75,CELL=8;
  let boxes=[],floors=[],cover=[];const gb=new Map(),gf=new Map();
  const key=(i,j)=>i*73856093^j*19349663;
  function put(g,o){const i0=Math.floor(o.x0/CELL),i1=Math.floor(o.x1/CELL),j0=Math.floor(o.z0/CELL),j1=Math.floor(o.z1/CELL);for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){const k=key(i,j);let a=g.get(k);if(!a){a=[];g.set(k,a)}a.push(o)}}
  function clear(){boxes=[];floors=[];cover=[];gb.clear();gf.clear()}
  // a wall / solid block. tag: free label ('wall','parapet','post'...). Returns the cover entry (also pushed to Blocks.cover; Outlaw adds it to its own `cover` list).
  function box(o){
    const b={x0:Math.min(o.x0,o.x1),x1:Math.max(o.x0,o.x1),z0:Math.min(o.z0,o.z1),z1:Math.max(o.z0,o.z1),y0:o.y0,y1:o.y1,tag:o.tag||'wall'};if(b.x1-b.x0<.02||b.z1-b.z0<.02||b.y1-b.y0<.02)return null;
    b.x=(b.x0+b.x1)/2;b.z=(b.z0+b.z1)/2;b.r=Math.hypot(b.x1-b.x0,b.z1-b.z0)/2;b.y=b.y0;b.h=b.y1-b.y0;b.wall=1;b.blk=1;   // x,z,r,y,h: the fields the circle-cover code reads
    boxes.push(b);put(gb,b);cover.push(b);return b}
  // a surface you can stand on (top at y). Floors / roofs also stop bullets (a thin slab); stair steps (step:true) do not.
  function floor(o){
    const f={x0:Math.min(o.x0,o.x1),x1:Math.max(o.x0,o.x1),z0:Math.min(o.z0,o.z1),z1:Math.max(o.z0,o.z1),y:o.y,tag:o.tag||'floor'};
    floors.push(f);put(gf,f);
    if(o.solid!==false&&!o.step){const t=o.thick||.22,c={x0:f.x0,x1:f.x1,z0:f.z0,z1:f.z1,y0:f.y-t,y1:f.y,x:(f.x0+f.x1)/2,z:(f.z0+f.z1)/2,r:Math.hypot(f.x1-f.x0,f.z1-f.z0)/2,y:f.y-t,h:t,wall:1,slab:1};cover.push(c);f.cover=c}
    return f}
  function near(g,x,z,r){const out=[],i0=Math.floor((x-r)/CELL),i1=Math.floor((x+r)/CELL),j0=Math.floor((z-r)/CELL),j1=Math.floor((z+r)/CELL);
    for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){const a=g.get(key(i,j));if(a)for(const o of a)if(out.indexOf(o)<0)out.push(o)}return out}
  // slide a body (S.x,S.z,S.y feet) out of every wall box it overlaps. R = body radius. Returns how many boxes pushed it.
  function push(S,R){
    R=R===undefined?.4:R;let n=0;
    for(let it=0;it<2;it++){let moved=false;
      for(const b of near(gb,S.x,S.z,R+1)){
        if(S.y+HEAD<=b.y0||S.y+STEP>=b.y1)continue;
        const nx=Math.max(b.x0,Math.min(S.x,b.x1)),nz=Math.max(b.z0,Math.min(S.z,b.z1)),dx=S.x-nx,dz=S.z-nz,d=Math.hypot(dx,dz);
        if(d>1e-6){if(d<R){S.x=nx+dx/d*R;S.z=nz+dz/d*R;moved=true;n++}}
        else{ // centre inside the box: leave through the nearest face
          const l=S.x-b.x0,r=b.x1-S.x,f=S.z-b.z0,a=b.z1-S.z,m=Math.min(l,r,f,a);
          if(m===l)S.x=b.x0-R;else if(m===r)S.x=b.x1+R;else if(m===f)S.z=b.z0-R;else S.z=b.z1+R;moved=true;n++}}
      if(!moved)break}
    return n}
  // the highest surface under (x,z) that a body whose feet are at y can step onto (or -Infinity)
  function floorAt(x,z,y,step){
    step=step===undefined?STEP:step;let best=-Infinity;
    for(const f of near(gf,x,z,0))if(x>=f.x0&&x<=f.x1&&z>=f.z0&&z<=f.z1&&f.y<=y+step&&f.y>best)best=f.y;
    return best}
  // the lowest floor / roof right above (x,z) between y and y+h (rain shelter, ceilings), or Infinity
  function ceilAt(x,z,y,h){let best=Infinity;for(const f of near(gf,x,z,0))if(!f.step&&x>=f.x0&&x<=f.x1&&z>=f.z0&&z<=f.z1&&f.y>y+.3&&f.y<y+(h||3)&&f.y<best)best=f.y;return best}
  // segment (2D) vs a box footprint (used by the circle-based line-of-sight helpers); y ignored
  function segBox(ax,az,bx,bz,b){
    let t0=0,t1=1;const dx=bx-ax,dz=bz-az;
    for(const [p,q] of [[-dx,ax-b.x0],[dx,b.x1-ax],[-dz,az-b.z0],[dz,b.z1-az]]){
      if(Math.abs(p)<1e-9){if(q<0)return false}else{const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r}else{if(r<t0)return false;if(r<t1)t1=r}}}
    return t1>.02&&t0<1}
  // ray (origin o, unit direction d) vs a box: distance of first entry or null (a ray starting inside ignores the box, like the circles)
  function rayBox(o,d,b){
    let t0=0,t1=Infinity;
    for(const [oo,dd,lo,hi] of [[o.x,d.x,b.x0,b.x1],[o.y,d.y,b.y0,b.y1],[o.z,d.z,b.z0,b.z1]]){
      if(Math.abs(dd)<1e-9){if(oo<lo||oo>hi)return null}else{let a=(lo-oo)/dd,c=(hi-oo)/dd;if(a>c){const t=a;a=c;c=t}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)return null}}
    return t0>1e-4?t0:null}
  return {STEP,HEAD,clear,box,floor,push,floorAt,ceilAt,segBox,rayBox,get cover(){return cover},get boxes(){return boxes},get floors(){return floors}};
})();
