// Seeded: deterministic weighted pick from the room seed. Both clients compute the same result,
// so rewards never need to be sent over the network. Globals: roomCode, hashSeed, mulberry.
const Seeded=(()=>{
  function pick(table,key){
    const r=mulberry(hashSeed(roomCode+':loot:'+key)),tot=table.reduce((s,e)=>s+e.w,0);let t=r()*tot;
    for(const e of table){t-=e.w;if(t<=0)return e}
    return table[0];
  }
  return {pick};
})();
