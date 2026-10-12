// CombatAnims: combat clips baked from the Universal Animation Library (Quaternius, CC0) onto the character with tools/retarget_combat.js -> assets/combat_anims.json (317 KB,
// loaded once when Outlaw Isle is built): cidle (pistol-ready idle stance), death (floor-snapped fall), headhit (head reaction), crouch / crouchwalk / roll (ready for cover work).
// act(q,name) adds the clip to a character's mixer on demand (q = avatar userData) and returns the action, or null while the clips are still loading (callers fall back).
const CombatAnims=(()=>{
  let clips=null,loading=null;
  const ONCE={headhit:{clamp:false},death:{clamp:true},roll:{clamp:false}};
  function load(){
    if(!loading)loading=fetch(AURL+'combat_anims.json').then(r=>{if(!r.ok)throw new Error('combat_anims '+r.status);return r.json()}).then(a=>{
      clips={};for(const c of a){const ac=THREE.AnimationClip.parse(c);ac.name=c.name;clips[c.name]=ac}
    }).catch(e=>{console.warn('combat anims unavailable',e);loading=null});   // retried the next time something asks
    return loading}
  function act(q,name){
    if(!clips||!clips[name]||!q||!q.mixer)return null;const A=q.nact||(q.nact={});
    if(!A['_c_'+name]){const a=q.mixer.clipAction(clips[name]);const o=ONCE[name];if(o){a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=o.clamp}A['_c_'+name]=a}
    return A['_c_'+name]}
  return {load,act,ready:()=>!!clips,clip:n=>clips&&clips[n]};
})();
