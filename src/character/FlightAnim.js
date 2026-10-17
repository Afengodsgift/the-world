// FlightAnim: the baked flight clips (assets/flight_anims.json, made by tools/retarget_flight.mjs from Mixamo Flying_Forward / Flying_Forward_Super / Levitate_Entrance / Levitate_Idle)
// on the game rig. FlightPose stays the controller (state, speed weights, springs, camera/FX hooks); this module only owns the four actions on an avatar's mixer:
//   hover  (wH) -> Levitate_Entrance once when the flight starts, then Levitate_Idle        cruise (wC) -> Flying_Forward        boost (wB) -> Flying_Forward_Super
// The forward clips are authored prone (body horizontal, head toward +Z: ~96 deg from vertical) and the levitation clips upright, so FlightPose tilts the model by
// (wanted lean - the lean already baked into the blended clips): flying straight up stands the prone pose up on its head, a dive tips it over.
// If the json is missing / not loaded yet, ready() is false and FlightPose falls back to its procedural pose.
// Globals used: THREE, sstep (utils/math.js), Blend (character/Blend.js).
const FlightAnim=(()=>{
  let D=null,asked=false,nextTry=0;
  const NAMES=['lev_in','lev_idle','fly_fwd','fly_super'];
  function load(url,force){
    if(asked||(!force&&Date.now()<nextTry))return;asked=true;
    fetch(url||'assets/flight_anims.json').then(r=>{if(!r.ok)throw new Error('flight_anims');return r.json()}).then(j=>{
      const clips={};for(const c of j.clips){const a=THREE.AnimationClip.parse(c);a.name=c.name;clips[c.name]=a}
      if(NAMES.every(n=>clips[n]&&j.meta[n]))D={clips,meta:j.meta};
    }).catch(()=>{asked=false;nextTry=Date.now()+5000});   // offline / not deployed yet: stay procedural, retry in 5 s
  }
  const ready=q=>{if(!asked)load();return !!D&&!!q.mixer};
  function bank(q){
    if(q.fa)return q.fa;
    const fa={};
    for(const n of NAMES){const a=q.mixer.clipAction(D.clips[n]),loop=D.meta[n].loop;a.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);a.clampWhenFinished=!loop;a.setEffectiveTimeScale(1);a.setEffectiveWeight(.0001);fa[n]=a}
    return q.fa=fa;
  }
  // flight just began: restart all four together (phases stay matched) and play the entrance
  function start(q){const fa=bank(q);for(const n of NAMES){fa[n].reset();fa[n].setEffectiveWeight(.0001);fa[n].play()}q.fai=0}
  // landed: stop them so a grounded avatar pays nothing for them
  function off(q){if(!q.fa)return;for(const n of NAMES)q.fa[n].stop();q.fai=undefined}
  // share of each clip in the pose (sums to 1): hover is split between the entrance (first ~2 s of a flight) and the idle
  function shares(q,f){
    if(q.fai===undefined)q.fai=99;
    const dIn=D.meta.lev_in.dur,bl=sstep(dIn-.45,dIn,q.fai);
    return {lev_in:f.wH*(1-bl),lev_idle:f.wH*bl,fly_fwd:f.wC,fly_super:f.wB};
  }
  const sum=(sh,key)=>{let s=0;for(const n of NAMES)s+=sh[n]*D.meta[n][key];return s};
  const lean=sh=>sum(sh,'lean');    // lean (rad from vertical) already baked into the blended clips
  const hips=sh=>sum(sh,'hipsY');   // pelvis height (game m): the pivot for tilting the body
  // set the action weights for the next mixer.update(): the flight layer's share is f.fw (it fades in/out with the flight state), the base clip takes the rest
  function drive(q,f,dt){
    const fa=bank(q),sh=shares(q,f);q.fai+=dt;
    const fw=Math.min(f.fw,.997),k=fw/(1-fw);
    for(const n of NAMES)fa[n].setEffectiveWeight(Math.max(.0001,sh[n]*k));
  }
  return {load,ready,start,off,shares,lean,hips,drive,get loaded(){return !!D}};
})();
