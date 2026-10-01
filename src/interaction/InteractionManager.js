// Minimal interaction registry: replaces the old doUse()/nearP hardcoded if-chain.
// Activities register once; priority is registration order (first match wins),
// exactly matching the if/else-if chain it replaces — NOT distance-based. Two
// interactables (the plaza pillar and the treasure board) are close enough to
// overlap in practice, so order has always mattered here, not just in theory.
//
// check() and onUse() are closures, not snapshotted values — they read live game
// state (hunt.x/z, kart.padX, etc.) each time they're called, same as the original
// inline dd(...) calls did.
const Interaction=(()=>{
  const entries=[];
  let current=null;
  function register(id,label,check,onUse){entries.push({id,label,check,onUse})}
  function update(){
    let hit=null;
    for(const e of entries){if(e.check()){hit=e;break}}
    const id=hit?hit.id:null;
    if(id!==current){current=id;$('use').style.display=id?'block':'none';$('use').textContent=hit?hit.label:'Use'}
  }
  function use(){const e=entries.find(e=>e.id===current);if(e)e.onUse()}
  return {register,update,use,current:()=>current};
})();
