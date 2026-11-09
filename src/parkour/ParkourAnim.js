// PARKOUR ANIM: plays the baked Mixamo parkour clips (assets/parkour_anims.json for chibis, avatars/<id>/parkour.json for full avatars) from a ParkourCore body's state.
//   plan(B,ev)  PURE: which clip + time scale a body should be playing (null = let the normal gait play). Tested in tests/parkour_anim.sim.js.
//   act(q,name) the mixer action for a clip on an avatar's mixer (null while the pack is still loading); animateClips (index.html) reads q.pk / q.pkts / q.pkf
//   drive(q,B)  sets q.pk / q.pkts for this frame from the body (and starts the download the first time)
// Globals at runtime: THREE, AURL, AvatarKit.
const ParkourAnim=(()=>{
  let clips=null,loading=null;
  const cl=(v,a,b)=>v<a?a:v>b?b:v,DUR={pk_vaultL:1.05,pk_vaultH:1.1,pk_wallup:1.7,pk_wallrun:.9,pk_wallkick:1.4,pk_slide:1.45,pk_hang:3,pk_mantle:1.1,pk_roll:1.1,pk_flipF:1,pk_flipT:1.3,pk_flipB:1.5,pk_jump:.85,pk_fall:2,pk_stumble:1.2};
  const LOOP={pk_hang:1,pk_fall:1};
  // short timed moves that outlast the state they start in (a kick off a wall, a wall-jump): B.pkT / B.pkN set by note()
  function note(B,ev){for(const e of ev){if(e==='wallkick'){B.pkN='pk_wallkick';B.pkT=.8}else if(e==='walljump'){B.pkN='pk_jump';B.pkT=.5}else if(e==='jump'&&B.spd>7.5){B.pkN='pk_jump';B.pkT=.55}else if(e==='flip'){B.flipV=B.flipK==='front'?(Math.random()<.4?'pk_flipT':'pk_flipF'):'pk_flipB'}}}
  function plan(B,dt){
    if(B.pkT>0){B.pkT-=dt||0;if(B.pkT>0&&B.mode==='air'&&!B.flip)return{name:B.pkN,ts:cl(DUR[B.pkN]/.7,.8,1.6),f:.06}}
    switch(B.mode){
      case'vault':return{name:B.vk==='low'?'pk_vaultL':'pk_vaultH',ts:cl(DUR[B.vk==='low'?'pk_vaultL':'pk_vaultH']/B.vdur,.8,2.6),f:.06};
      case'wallup':return{name:'pk_wallup',ts:cl(DUR.pk_wallup/B.wdur,.8,2.4),f:.08};
      case'wallrun':return{name:'pk_wallrun',ts:.75,f:.1};
      case'slide':return{name:'pk_slide',ts:1.5,f:.08};
      case'ledge':return{name:'pk_hang',ts:1,f:.1};
      case'mantle':return{name:'pk_mantle',ts:DUR.pk_mantle/.62,f:.08};
      case'roll':return{name:'pk_roll',ts:DUR.pk_roll/.52,f:.06};
      case'air':if(B.flip){const n=B.flipV||'pk_flipF';return{name:n,ts:cl(DUR[n]/.75,.9,2),f:.05}}
        if(B.vy<-6)return{name:'pk_fall',ts:1,f:.15};return null;
      case'ground':if(B.stumble>0)return{name:'pk_stumble',ts:1,f:.05};return null}
    return null}
  function load(){if(!loading)loading=fetch(AURL+'parkour_anims.json').then(r=>{if(!r.ok)throw new Error('parkour_anims '+r.status);return r.json()}).then(j=>{const c={};for(const x of j){const a=THREE.AnimationClip.parse(x);a.name=x.name;c[x.name]=a}clips=c}).catch(e=>{console.warn('parkour animations unavailable (normal gait stays)',e);loading=null});return loading}
  const AV=q=>q&&q.av&&typeof AvatarKit!=='undefined'?AvatarKit.setOf(q):null;
  const tab=q=>{const S=AV(q);if(!S)return clips;if(!S.parkour)AvatarKit.more(S.id,'parkour').catch(()=>{});return S.parkour};
  const ready=q=>{const S=AV(q);if(S){if(!S.parkour)AvatarKit.more(S.id,'parkour').catch(()=>{});return !!S.parkour}if(!clips)load();return !!clips};
  function act(q,name){
    const T=q&&tab(q);if(!T||!T[name]||!q.mixer)return null;const A=q.nact;if(!A)return null;
    if(!A[name]){const a=q.mixer.clipAction(T[name]);if(!LOOP[name]){a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true}A[name]=a}
    return A[name]}
  // per frame: q = avatar userData
  function drive(q,B,dt){
    if(!ready(q)){q.pk=null;return}
    const p=plan(B,dt);if(!p){q.pk=null;return}
    q.pk=p.name;q.pkts=p.ts;q.pkf=p.f}
  return{plan,note,act,drive,ready,load,DUR}})();
