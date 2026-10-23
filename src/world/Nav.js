// Nav: walkable-grid pathfinding INSIDE and ON the town's buildings (doors, rooms, stairs, balconies, roofs) so raiders can follow you indoors, climb to a rooftop post or
// a window and come back down. Pure logic over Blocks (no THREE / DOM; tests/nav.sim.js). Open ground outside is NOT gridded: raiders cross it the way they always did
// (straight + around cover) and hand over to Nav at a building's door ("entry").
//   Nav.setup(plans)                    plans from WestTown.buildTown / WestTown.plan (needs P.x,P.z,P.W,P.D,P.q,P.y0,P.roofY,P.nav,P.posts)
//   Nav.at(x,z,y,pad)                   the building whose footprint (+pad metres) holds that point, or null; Nav.inside(...) = enclosed rooms only (no porch / outside stair)
//   Nav.entry(b)                        {x,y,z} on the street side of the door
//   Nav.path(b,from,to)                 [{x,z,y},...] walkable waypoints (start excluded) or null
//   Nav.postPath(b,post)                cached path from the entry to one of the plan's posts
// Grid: 0.5 m cells, several surfaces per cell (ground floor, 2nd floor, roof, every stair step), edges up to one step high, bodies need R = 0.38 m of clearance.
const Nav=(()=>{
  const RES=.5,SRES=1,R=.46,STEP=.6,MAXN=14000;
  let list=[],street=null;
  function mk(P){
    const odd=P.q%2,ix=(odd?P.D:P.W)/2,iz=(odd?P.W:P.D)/2,pad=3.4;
    return {id:P.id,P,x:P.x,z:P.z,ix,iz,x0:P.x-ix-pad,x1:P.x+ix+pad,z0:P.z-iz-pad,z1:P.z+iz+pad,nodes:new Map(),cache:new Map(),ground:P.y0,res:RES}}
  function setup(plans,opt){list=plans.map(mk);street=null;const sol=(opt&&opt.solids)||[];
    // the town's STREETS: one coarse (1 m) ground-level grid over the main town so raiders walk around buildings instead of into them
    const town=plans.filter(P=>!P.out);if(town.length){let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const b of list)if(!b.P.out){x0=Math.min(x0,b.x0);x1=Math.max(x1,b.x1);z0=Math.min(z0,b.z0);z1=Math.max(z1,b.z1)}
      street={id:'street',P:null,x0:x0-4,x1:x1+4,z0:z0-4,z1:z1+4,nodes:new Map(),cache:new Map(),ground:town[0].y0,res:SRES,street:1,sol:sol.filter(c=>c.r>=.5&&c.x>x0-4&&c.x<x1+4&&c.z>z0-4&&c.z<z1+4)}}}
    function surf(b,i,j){   // the surfaces of cell (i,j): [{x,z,y,ok}]
    const k0=i*2048+j;let a=b.nodes.get(k0);if(a)return a;
    const x=b.x0+(i+.5)*b.res,z=b.z0+(j+.5)*b.res;let ys=Blocks.surfacesAt(x,z);
    if(b.street)ys=ys.filter(y=>y<b.ground+.6);   // ground level only (no roofs / upper floors)
    if(!ys.length||ys[0]>b.ground+.3)ys.unshift(b.ground);
    let free=true;
    if(b.street){for(const q of list){if(!q.P.out&&x>q.P.x-q.ix-.2&&x<q.P.x+q.ix+.2&&z>q.P.z-q.iz-.2&&z<q.P.z+q.iz+.2){free=false;break}}   // the street never leads through a building
      if(free)for(const c of b.sol)if(Math.hypot(x-c.x,z-c.z)<c.r+R){free=false;break}}      // nor through carts, troughs, crates
    a=ys.map(y=>({x,z,y,i,j,ok:free&&Blocks.fits(x,z,y,R)}));b.nodes.set(k0,a);return a}
  const dim=b=>[Math.ceil((b.x1-b.x0)/b.res),Math.ceil((b.z1-b.z0)/b.res)];
  function cellOf(b,x,z){return [Math.floor((x-b.x0)/b.res),Math.floor((z-b.z0)/b.res)]}
  function nearest(b,p,maxD){let best=null,bd=1e9;const [ci,cj]=cellOf(b,p.x,p.z),[ni,nj]=dim(b),r=Math.ceil((maxD||1.6)/b.res);
    for(let i=ci-r;i<=ci+r;i++)for(let j=cj-r;j<=cj+r;j++){if(i<0||j<0||i>=ni||j>=nj)continue;
      for(const n of surf(b,i,j)){if(!n.ok||Math.abs(n.y-p.y)>.7)continue;const d=Math.hypot(n.x-p.x,n.z-p.z)+Math.abs(n.y-p.y)*2;if(d<bd){bd=d;best=n}}}
    return best}
  function neigh(b,n,out0){if(n.nb)return n.nb;const out=[];const [ni,nj]=dim(b);
    for(let di=-1;di<=1;di++)for(let dj=-1;dj<=1;dj++){if(!di&&!dj)continue;const i=n.i+di,j=n.j+dj;if(i<0||j<0||i>=ni||j>=nj)continue;
      const diag=di&&dj;
      for(const m of surf(b,i,j)){if(!m.ok)continue;const dy=m.y-n.y;
        if(dy>STEP||dy<-STEP){   // a 0.5 m cell can skip a whole stair step (they are 0.47 m deep): allow it when a step really lies between the two cells
          if(diag||dy>1.05||dy<-1.05)continue;const lo=Math.min(n.y,m.y)+.08,hi=Math.max(n.y,m.y)-.08;let between=false;
          for(const f of [1/3,2/3]){for(const y of Blocks.surfacesAt(n.x+(m.x-n.x)*f,n.z+(m.z-n.z)*f))if(y>lo&&y<hi)between=true}
          if(!between)continue}
        // no corner cutting: both orthogonal neighbours must be walkable at about the same height
        if(diag){let o1=false,o2=false;for(const q of surf(b,n.i+di,n.j))if(q.ok&&Math.abs(q.y-n.y)<=STEP)o1=true;for(const q of surf(b,n.i,n.j+dj))if(q.ok&&Math.abs(q.y-n.y)<=STEP)o2=true;if(!o1||!o2)continue}
        if(!Blocks.fits((n.x+m.x)/2,(n.z+m.z)/2,Math.max(n.y,m.y),R))continue;
        out.push(m)}}
    n.nb=out;return out}
  // A*: from / to are world points {x,z,y}; returns waypoints or null
  function path(b,from,to){
    const s=nearest(b,from,2),g=nearest(b,to,2);if(!s||!g)return null;if(s===g)return [{x:g.x,z:g.z,y:g.y}];
    const came=new Map(),gs=new Map([[s,0]]),closed=new Set(),heap=[[0,s]];let it=0;
    const h=n=>Math.hypot(n.x-g.x,n.z-g.z)+Math.abs(n.y-g.y)*1.5;
    const push=(f,n)=>{heap.push([f,n]);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p}};
    const pop=()=>{const t=heap[0],l=heap.pop();if(heap.length){heap[0]=l;let i=0;for(;;){let a=i*2+1,c=a+1,m=i;if(a<heap.length&&heap[a][0]<heap[m][0])m=a;if(c<heap.length&&heap[c][0]<heap[m][0])m=c;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m}}return t[1]};
    while(heap.length&&it++<MAXN){
      const c=pop();if(closed.has(c))continue;
      if(c===g){const out=[];let n=c;while(n&&n!==s){out.push(n);n=came.get(n)}out.reverse();return smooth(b,s,out)}
      closed.add(c);
      for(const m of neigh(b,c)){if(closed.has(m))continue;const t=gs.get(c)+Math.hypot(m.x-c.x,m.z-c.z)+Math.abs(m.y-c.y)*.5;
        if(gs.has(m)&&t>=gs.get(m))continue;came.set(m,c);gs.set(m,t);push(t+h(m),m)}}
    return null}
  // string-pull: drop waypoints on a straight, flat, clear run
  function smooth(b,s,nodes){
    const pts=[s,...nodes],out=[];let a=0;
    while(a<pts.length-1){let far=a+1;
      for(let c=pts.length-1;c>a+1;c--){if(straight(pts,a,c,b)){far=c;break}}
      const q=pts[far],st=Blocks.stepAt(q.x,q.z,q.y);   // on a stair step: aim for the middle of the step, so the next step is always under the feet (cells are not aligned with the steps)
      out.push(st?{x:(st.x0+st.x1)/2,z:(st.z0+st.z1)/2,y:q.y}:{x:q.x,z:q.z,y:q.y});a=far}
    return out}
  function straight(pts,a,c,b0){const A=pts[a],C=pts[c];for(let k=a;k<=c;k++)if(Math.abs(pts[k].y-A.y)>.02)return false;
    const L=Math.hypot(C.x-A.x,C.z-A.z),n=Math.ceil(L/.3);for(let i=1;i<n;i++){const t=i/n;const x=A.x+(C.x-A.x)*t,z=A.z+(C.z-A.z)*t;if(!Blocks.fits(x,z,A.y,R+.06))return false;
      if(A.y>b0.ground+.01){const f=Blocks.floorAt(x,z,A.y+.05,.1);if(f<A.y-.06)return false}}return true}
  // walk on the street: waypoints from (x,z) to the door entry of building b (outside), or null (off the street grid / no way)
  function streetPath(from,to){if(!street)return null;const cl=p=>({x:Math.max(street.x0+.6,Math.min(street.x1-.6,p.x)),z:Math.max(street.z0+.6,Math.min(street.z1-.6,p.z))});
    const a=cl(from),g=cl(to);return path(street,{x:a.x,z:a.z,y:street.ground},{x:g.x,z:g.z,y:street.ground})}
  function entry(b){const n=b.P.nav.find(q=>q.id===b.id+':door:out');if(n)return {x:n.x,z:n.z,y:n.y};const d=b.P.door;const w=b.P.toWorld(d.lx,d.lz+2.4);return {x:w.x,z:w.z,y:b.ground}}
  function postPath(b,post){const k=post.x.toFixed(2)+','+post.z.toFixed(2)+','+post.y.toFixed(2);if(b.cache.has(k))return b.cache.get(k);
    const p=path(b,entry(b),{x:post.x,z:post.z,y:post.y});b.cache.set(k,p);return p}
  const inBox=(b,x,z,px0,pz0,px1,pz1)=>x>=px0&&x<=px1&&z>=pz0&&z<=pz1;
  function at(x,z,y,pad){pad=pad===undefined?3.4:pad;for(const b of list){const e=pad-3.4;if(!inBox(b,x,z,b.x0-e,b.z0-e,b.x1+e,b.z1+e))continue;if(y!==undefined&&(y<b.ground-1.2||y>b.P.roofY+4))continue;return b}return null}
  function inside(x,z,y){for(const b of list){if(!inBox(b,x,z,b.P.x-b.ix+.1,b.P.z-b.iz+.1,b.P.x+b.ix-.1,b.P.z+b.iz-.1))continue;if(y!==undefined&&(y<b.ground-1.2||y>b.P.roofY+4))continue;return b}return null}
  return {setup,streetPath,at,inside,entry,path,postPath,nearest,get list(){return list},RES,R};
})();
