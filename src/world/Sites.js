// Sites: shared "find me a good flat spot" placement, used by Verbs (camps) and Vaults (two-player
// puzzles) so systems never overlap each other. Fully deterministic from the room seed using a
// PRIVATE rng stream per (tag,key): it never touches the world-gen rng, so adding a site type can
// never change where trees, shards or hunt sites are.
// Globals: H, solids, TOWN, KT, RING, OUT, BOARD, dash, srun, roomCode, hashSeed, mulberry.
const Sites=(()=>{
  const taken=[];const safe=f=>{try{return f()}catch(e){return false}};
  function ok(x,z,o){
    const h=H(x,z);if(h<.8||h>14)return false;
    for(const [dx,dz] of [[5,0],[-5,0],[0,5],[0,-5]])if(Math.abs(H(x+dx,z+dz)-h)>1.4)return false;
    if(Math.hypot(x-TOWN.x,z-TOWN.z)<48)return false;
    if(safe(()=>Math.abs(x-KT.x)<KT.hw+25&&Math.abs(z-KT.z)<KT.hh+25))return false;
    if(safe(()=>Math.hypot(x-RING.x,z-RING.z)<RING.R+15))return false;
    if(safe(()=>Math.hypot(x-OUT.x,z-OUT.z)<OUT.R+40))return false;
    if(safe(()=>Math.hypot(x-BOARD.x,z-BOARD.z)<20))return false;
    if(safe(()=>dash.start&&Math.hypot(x-dash.start.x,z-dash.start.z)<55))return false;
    if(safe(()=>srun.start&&Math.hypot(x-srun.start.x,z-srun.start.z)<30))return false;
    const fp=o.clear||5;
    for(const c of solids)if(Math.hypot(x-c.x,z-c.z)<c.r+fp)return false;
    for(const t of taken){const same=t.tag===o.tag&&t.name===o.name;if(Math.hypot(x-t.x,z-t.z)<Math.max(o.sep||40,t.r+fp,same?(o.sameSep||0):0))return false}
    return true;
  }
  // o: {tag,key,name,cx,cz,rmin,rmax,clear,sep,sameSep}
  function find(o){
    const rng=mulberry(hashSeed(roomCode+':site:'+o.tag+':'+o.key));
    for(let i=0;i<500;i++){
      const a=rng()*6.283,r=o.rmin+Math.sqrt(rng())*(o.rmax-o.rmin),x=o.cx+Math.cos(a)*r,z=o.cz+Math.sin(a)*r;
      if(!ok(x,z,o))continue;
      taken.push({x,z,r:o.clear||5,tag:o.tag,name:o.name});
      return {x,z,y:H(x,z),ry:rng()*6.283};
    }
    return null;
  }
  return {find,taken:()=>taken};
})();
