// GunLoco: armed locomotion + death clips from the Mixamo "Pro Rifle Pack", baked onto the game's character by tools/retarget_mixamo.mjs -> assets/gun_anims.json
// (~680 KB, 140 KB gzipped, fetched once when Outlaw Isle is built; until it arrives, or if it fails, animateClips keeps the old gait + CombatPose leg twist).
//   a_idle           rifle-ready stance (idle aiming)
//   w_/r_/s_ + f fl l bl b br r fr   walk / run / sprint x 8 travel directions RELATIVE TO WHERE THE BODY FACES (strafing and backpedalling are real clips, not a twisted gait)
//   d_front d_front_hs d_back d_back_hs d_right d_crouch_hs   death falls (floor-snapped), chosen from where the killing shot came from
// The clips are in place (root motion removed by the baker); meta[name].spd is the speed (m/s, for a scale-1 avatar) at which the stance feet stay planted, so the clip is
// time-scaled to the avatar's real speed: no skating. Sector and gait switches have hysteresis, keep the stride phase, and crossfade, so there is no snapping or flicker.
// pick() is pure maths on the avatar's userData (tested in tests/gunloco.sim.js). Works for the local player, the partner and raiders: it only needs the avatar's position
// delta and heading. Globals at runtime: THREE, AURL.
const GunLoco=(()=>{
  let clips=null,meta=null,loading=null;
  const SECT=['f','fl','l','bl','b','br','r','fr'];            // sector k = travel direction k*45 deg from straight ahead, positive = toward the avatar's LEFT (+X)
  const GAIT=['','w','r','s'],ONCE={clamp:true};
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  // normalised speed (m/s / avatar scale) thresholds: [leave idle, walk->run, run->sprint] going up; each has its own lower value (hysteresis)
  const UP=[.5,2.1,4.5],DN=[.3,1.8,4.0],TS=[.6,2.6];
  function load(){
    if(!loading)loading=fetch(AURL+'gun_anims.json').then(r=>{if(!r.ok)throw new Error('gun_anims '+r.status);return r.json()}).then(j=>{
      const c={};for(const x of j.clips){const a=THREE.AnimationClip.parse(x);a.name=x.name;c[x.name]=a}meta=j.meta;clips=c;
    }).catch(e=>{console.warn('gun animations unavailable (old armed gait stays)',e);loading=null});   // retried the next time something asks
    return loading}
  const ready=()=>!!clips;
  const isLoco=n=>typeof n==='string'&&n.length>2&&n.charAt(1)==='_'&&'wrs'.indexOf(n.charAt(0))>=0;
  // the clip + action for a name on this avatar's mixer (cached on q.nact under the clip's own name); null while the pack is loading or the name is unknown
  function act(q,name){
    if(!clips||!clips[name]||!q||!q.mixer)return null;const A=q.nact;if(!A)return null;
    if(!A[name]){const a=q.mixer.clipAction(clips[name]);if(name.charAt(0)==='d'){a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=ONCE.clamp}A[name]=a}
    return A[name]}
  // sector index for a travel direction rel (rad, 0 = ahead, + = left), sticky: stays in the current sector until rel is 10 deg past its edge
  function sector(rel,cur){
    const k=((Math.round(rel/(Math.PI/4))%8)+8)%8;
    if(cur===undefined||cur<0||cur===k)return k;
    const d=Math.abs(wrap(rel-cur*Math.PI/4));return d<=Math.PI/8+.175?cur:k}
  // gait with hysteresis; vN = speed / avatar scale
  function gait(vN,cur){let g=cur||0;for(let i=0;i<3;i++){
    if(g===0&&vN>UP[0])g=1;else if(g===1&&vN<DN[0])g=0;else if(g===1&&vN>UP[1])g=2;else if(g===2&&vN<DN[1])g=1;else if(g===2&&vN>UP[2])g=3;else if(g===3&&vN<DN[2])g=2;else break}return g}
  // q = avatar userData (keeps q.glx/glz filtered travel, q.glG gait, q.glS sector). mdx/mdz = this frame's position delta, v = smoothed speed (m/s), fy = body heading,
  // sc = avatar scale. Returns {name,ts,fade}. A filtered travel direction (needs real, sustained speed) keeps network-smoothed or jittery positions from flipping sectors.
  function pick(q,dt,mdx,mdz,v,fy,sc){
    const k=1-Math.exp(-dt*9);q.glx=(q.glx||0)+((dt>0?mdx/dt:0)-(q.glx||0))*k;q.glz=(q.glz||0)+((dt>0?mdz/dt:0)-(q.glz||0))*k;
    const vN=v/(sc||1),g=gait(vN,q.glG),prev=q.glG||0;q.glG=g;
    if(g===0||Math.hypot(q.glx,q.glz)<.35){if(g===0)q.glS=undefined;return {name:'a_idle',ts:1,fade:g!==prev?.22:.2}}
    const s=sector(wrap(Math.atan2(q.glx,q.glz)-fy),q.glS),changed=s!==q.glS||g!==prev;q.glS=s;
    const name=GAIT[g]+'_'+SECT[s],sp=meta&&meta[name]?meta[name].spd:[0,1.2,2.5,3.6][g];
    return {name,ts:clamp(vN/Math.max(.3,sp),TS[0],TS[1]),fade:changed?.14:.14}}
  // which death fall for a kill: att = bearing of the shooter relative to the victim's facing (rad, 0 = in front, + = victim's left), head = headshot, crouch = behind cover
  function deathClip(att,head,crouch){
    const a=Math.abs(wrap(att));
    if(crouch&&head)return 'd_crouch_hs';
    if(head)return a<Math.PI/2?'d_front_hs':'d_back_hs';
    if(a<Math.PI*.3)return 'd_front';if(a>Math.PI*.7)return 'd_back';
    return wrap(att)<0?'d_right':(a<Math.PI/2?'d_front':'d_back')}   // no left-side clip in the pack: use the nearer of front/back
  return {load,ready,act,pick,sector,gait,isLoco,deathClip,wrap,SECT,meta:()=>meta,clip:n=>clips&&clips[n]};
})();
