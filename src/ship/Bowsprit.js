// Bowsprit: the pointy stick at the front of the galleon is walkable (Decks.plank, data/ship.js `sprit`): walk out along it and stand at the tip.
// (No effects or prompts: it is just somewhere to stand.) atTip() tells you when you are at the end of it.
const Bowsprit=(()=>{
  const C=SHIP;
  function atTip(){
    if(typeof S==='undefined'||!S._dk||S._dk.id!=='ship'||S.flying)return false;
    const sp=(C.cls[C.player]||{}).sprit;if(!sp)return false;
    return S._dk.z>=sp.tip&&Math.abs(S._dk.x)<sp.hw+.3}
  // out on the stick (past the bow rail)? the ship camera then comes in close so you can frame yourself for screenshots
  function onSprit(){
    if(typeof S==='undefined'||!S._dk||S._dk.id!=='ship'||S.flying)return false;
    const sp=(C.cls[C.player]||{}).sprit;return !!sp&&S._dk.z>=sp.z0+.8&&Math.abs(S._dk.x)<sp.hw+.4}
  return {build(){},atTip,onSprit};
})();
