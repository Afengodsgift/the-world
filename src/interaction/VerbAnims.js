// VerbAnims: gameplay animations (hammer, pickaxe, dig2, saw, chopw, lockpick, fish, fix, push,
// pickup, useitem, cast, summon, raise) live in assets/verb_anims.json, separate from the emote
// menu in assets/emotes.json. They are registered into the game's existing EMO tables so
// playEmote()/emoStart()/the partner 'em' sync work unchanged, but they are NOT added to EMO.menu
// (they are verbs the world asks for, not buttons in the 😀 sheet). ~500 KB, fetched lazily.
// Existing clip names are never overwritten, so a future emotes.json that ships the same name wins.
const VerbAnims=(()=>{
  let p=null;
  function load(){
    if(p)return p;
    p=loadEmotes()                                   // make sure EMO exists/finished first so we never race its assignments
      .then(()=>fetch(AURL+'verb_anims.json')).then(r=>{if(!r.ok)throw new Error('verb_anims '+r.status);return r.json()})
      .then(j=>{
        for(const m of j.menu)if(!EMO.def[m.id])EMO.def[m.id]=m;
        for(const c of j.clips){if(EMO.clips[c.name])continue;const ac=THREE.AnimationClip.parse(c);ac.name=c.name;EMO.clips[c.name]=ac}
      })
      .catch(e=>{p=null;throw e});
    return p;
  }
  return {load,ready:()=>!!(p&&EMO.clips.hammer)};
})();
