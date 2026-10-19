// Bowsprit: the pointy stick at the front of the galleon is walkable (Decks.plank, data/ship.js `sprit`): walk out along it and stand at the tip.
// (No effects or prompts: it is just somewhere to stand.) atTip() tells you when you are at the end of it.
const Bowsprit=(()=>{
  const C=SHIP;
  function atTip(){
    if(typeof S==='undefined'||!S._dk||S._dk.id!=='ship'||S.flying)return false;
    const sp=(C.cls[C.player]||{}).sprit;if(!sp)return false;
    return S._dk.z>=sp.tip&&Math.abs(S._dk.x)<sp.hw+.3}
  return {build(){},atTip};
})();
