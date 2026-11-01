// WARDEN: BARE HANDS (Sifu-style hand-to-hand). Pure data + tiny helpers for the sim (no THREE/DOM) plus a procedural body-pose layer (FistsPose, needs THREE + aim()) that runs when THREE exists.
// It is a weapon type ("Bare Hands", equipped at the Ember Shrine) that plugs into the same deterministic CombatCore as the swords: a fighter with `fs` set resolves Light/Heavy through Fists.Combos instead of Combos.
//   LIGHT STRINGS  jab > cross > hook > knee > spin kick. Each hit can be cancelled into the next in its recovery, into Heavy for a branch finisher, or into a dodge.
//   BRANCHES       Heavy after jab/cross/step/dash/counter = UPPERCUT (big posture damage); after hook/knee/spin = ROUNDHOUSE; a tap from neutral charges the POWER STRIKE (hold for more).
//   CONTEXT        Forward+Light = lunging STEP punch; Light from far away = flying-knee DASH; Light right after a dodge = COUNTER (the avoid-and-punish); Guard+Light = PUSH KICK (posture crusher);
//                  Jump+Light = DROP KICK; Guard+Heavy = THROW (a grab: ignores guard and parry, but a dodge beats it).
//   TAKEDOWN       Heavy against a foe whose posture is broken (stagger) = a cinematic finisher for huge damage (+ a little health back, see PlayerCombat).
// All numbers are final ticks at 60 Hz (the sword TEMPO scaling is NOT applied to these). Every move has a start-up, an active window and a recovery, like the sword moves, and fits the same event shapes.
const Fists=(()=>{
  const ph=(k,n,o)=>Object.assign({k,n},o||{});
  const M={
    // ---- the light string (chain index 1..5; 5 = finished) ----
    jab:{id:'jab',who:'P',chain:1,stam:5,dmg:7,pdmg:9,hs:3,stun:14,kb:.25,reach:1.9,w:.12,phases:[ph('startup',5),ph('active',3,{seg:0,a0:.3,a1:-.3}),ph('recovery',7)],cancel:{light:2,heavy:3,dodge:4,guard:5}},
    cross:{id:'cross',who:'P',chain:2,stam:6,dmg:9,pdmg:11,hs:3,stun:16,kb:.4,reach:2.0,w:.12,phases:[ph('startup',5),ph('active',3,{seg:0,a0:.3,a1:-.3}),ph('recovery',8)],cancel:{light:2,heavy:3,dodge:4,guard:5}},
    hook:{id:'hook',who:'P',chain:3,stam:7,dmg:11,pdmg:14,hs:4,stun:18,kb:.55,reach:2.0,w:.13,phases:[ph('startup',7),ph('active',3,{seg:0,a0:1.0,a1:-1.0}),ph('recovery',10)],cancel:{light:3,heavy:4,dodge:5}},
    knee:{id:'knee',who:'P',chain:4,stam:8,dmg:13,pdmg:16,hs:4,stun:20,kb:.7,reach:1.9,w:.13,phases:[ph('startup',7,{move:.5}),ph('active',3,{seg:0,a0:.4,a1:-.4}),ph('recovery',11)],cancel:{light:3,heavy:4,dodge:6}},
    spin:{id:'spin',who:'P',chain:5,stam:12,dmg:20,pdmg:26,hs:7,stun:26,kb:1.5,reach:2.5,w:.14,phases:[ph('startup',10),ph('active',4,{seg:0,a0:1.4,a1:-1.4}),ph('recovery',18)],cancel:{dodge:8}},
    // ---- heavy branches ----
    upper:{id:'upper',who:'P',chain:0,stam:12,dmg:18,pdmg:30,hs:6,stun:26,kb:1.0,reach:1.9,w:.13,phases:[ph('startup',9,{move:.5}),ph('active',4,{seg:0,a0:.5,a1:-.5}),ph('recovery',18)],cancel:{dodge:8}},
    round:{id:'round',who:'P',chain:0,stam:13,dmg:22,pdmg:28,hs:7,stun:26,kb:1.4,reach:2.6,w:.14,phases:[ph('startup',11),ph('active',4,{seg:0,a0:1.3,a1:-1.3}),ph('recovery',20)],cancel:{dodge:9}},
    power:{id:'power',who:'P',stam:16,dmg:28,pdmg:36,hs:8,stun:28,kb:1.5,reach:2.2,w:.14,chargeMin:18,chargeMax:45,phases:[ph('startup',12,{move:.9}),ph('active',5,{seg:0,a0:.5,a1:-.5}),ph('recovery',24)]},
    // ---- context moves ----
    step:{id:'step',who:'P',chain:2,stam:7,dmg:10,pdmg:12,hs:3,stun:16,kb:.5,reach:2.3,w:.12,phases:[ph('startup',6,{move:1.2}),ph('active',3,{seg:0,a0:.3,a1:-.3}),ph('recovery',10)],cancel:{light:3,heavy:4,dodge:5}},
    dash:{id:'dash',who:'P',chain:2,stam:9,dmg:12,pdmg:14,hs:4,stun:18,kb:.8,reach:2.3,w:.13,phases:[ph('startup',6,{move:4.0}),ph('active',4,{seg:0,a0:.4,a1:-.4}),ph('recovery',16)],cancel:{light:4,heavy:5,dodge:7}},
    counter:{id:'counter',who:'P',chain:2,stam:6,dmg:14,pdmg:22,hs:5,stun:20,kb:.6,reach:2.1,w:.13,phases:[ph('startup',4),ph('active',3,{seg:0,a0:.4,a1:-.4}),ph('recovery',10)],cancel:{light:2,heavy:3,dodge:4}},
    push:{id:'push',who:'P',chain:0,stam:8,dmg:4,pdmg:44,hs:5,stun:30,kb:2.0,reach:2.1,w:.15,phases:[ph('startup',7),ph('active',3,{seg:0,a0:.4,a1:-.4}),ph('recovery',14)],cancel:{dodge:8,guard:6}},
    drop:{id:'drop',who:'P',chain:0,stam:14,dmg:28,pdmg:40,hs:7,stun:30,kb:1.3,reach:2.7,w:.2,phases:[ph('startup',8),ph('active',5,{seg:0,a0:.7,a1:-.7}),ph('recovery',24)]},
    // ---- grabs: gr = ignores guard and parry (a dodge still beats them). The takedown needs a foe in stagger ----
    throw:{id:'throw',who:'P',chain:0,stam:14,dmg:22,pdmg:42,hs:8,stun:40,kb:2.3,reach:1.7,w:.2,gr:true,phases:[ph('startup',8),ph('active',3,{seg:0,a0:.4,a1:-.4}),ph('recovery',24)]},
    take:{id:'take',who:'P',chain:0,stam:0,dmg:22,pdmg:0,hs:14,stun:60,kb:1.6,reach:2.6,w:.3,gr:true,phases:[ph('startup',12,{move:1.0}),ph('active',3,{seg:0,a0:.5,a1:-.5}),ph('recovery',30)]}
  };
  const IDS=Object.keys(M);
  const CHAIN_GAP=30,EVADE_GAP=18,STRING=['jab','cross','hook','knee','spin'];
  // the Light resolver: same contract as Combos.light (ctx: {from,air,guard,adv,far,chain,sinceDodge}) -> a move id from M
  function light(ctx){
    const f=ctx.from;
    if(ctx.air&&!f)return 'drop';
    if(ctx.guard&&!f)return 'push';
    if(f){const nx={jab:'cross',cross:'hook',hook:'knee',knee:'spin',step:'hook',dash:'cross',counter:'hook'}[f];return nx||'jab'}
    if(ctx.far)return 'dash';
    if(ctx.adv)return 'step';
    if(ctx.sinceDodge<=EVADE_GAP)return 'counter';
    if(ctx.chain>=1&&ctx.chain<5)return STRING[ctx.chain];
    return 'jab'}
  // Heavy tapped inside a string's cancel window: the branch finisher. null = no branch (the Heavy starts charging as usual)
  function heavy(ctx){const f=ctx.from;return f==='jab'||f==='cross'||f==='step'||f==='dash'||f==='counter'?'upper':f==='hook'||f==='knee'||f==='spin'?'round':null}
  // install into Moves (the table the sim reads); safe to call twice
  function install(MV){if(!MV)return;for(const k of IDS)MV[k]=M[k]}
  if(typeof Moves!=='undefined')install(Moves);
  const Combos={light,heavy,CHAIN_GAP,EVADE_GAP,IDS:['drop','push','jab','cross','hook','knee','spin','upper','round','step','dash','counter']};
  // takedown geometry: a staggered foe in front of you, close enough
  const TAKE_RANGE=3.0,THROW_RANGE=2.2;

  // ======================================================== body poses (visual only) ========================================================
  // Each pose is a direction per limb segment in MODEL space (+x = the character's LEFT, +y up, +z forward): arms ru/rf lu/lf, legs rt/rs lt/ls (thigh/shin), tw = torso twist (rad, + = toward the left),
  // ln = lean forward (rad), lw = how much the legs are driven (0 = leave the clip's legs). Poses are right-handed; `mir` makes the left-handed copy.
  const G=[[-.35,-.75,.35],[.15,.85,.5],[.35,-.7,.5],[-.15,.85,.55]];   // guard hands: ru rf lu lf
  const mk=(o)=>Object.assign({ru:G[0],rf:G[1],lu:G[2],lf:G[3],rt:[-.04,-1,.05],rs:[0,-1,.02],lt:[.04,-1,.05],ls:[0,-1,.02],tw:0,ln:0,lw:0},o);
  const POSE={
    guard:mk({tw:-.15,ln:.08}),
    // the right hand (cross / overhand / hook) and its wind-ups
    crossA:mk({ru:[-.55,-.45,.1],rf:[.1,.7,.7],tw:-.4,ln:.05}),crossI:mk({ru:[-.08,.05,1],rf:[-.04,.05,1],tw:.55,ln:.15}),
    hookA:mk({ru:[-.98,.05,-.1],rf:[-.1,.1,1],tw:-.55,ln:.05}),hookI:mk({ru:[-.3,0,.95],rf:[.95,.1,.2],tw:.8,ln:.12}),
    upA:mk({ru:[-.3,-.95,.1],rf:[-.1,-.55,.8],tw:-.35,ln:.18}),upI:mk({ru:[-.15,.25,.95],rf:[0,.95,.35],tw:.4,ln:-.08}),
    powA:mk({ru:[-.3,.9,-.3],rf:[0,1,-.4],tw:-.65,ln:-.15}),powI:mk({ru:[-.1,-.1,1],rf:[0,-.45,1],tw:.75,ln:.35}),
    // kicks and knees (lw = 1: the legs are posed)
    kneeA:mk({lw:1,tw:-.1,ln:.1}),kneeI:mk({lw:1,rt:[0,.55,.85],rs:[0,-.85,.3],ln:.18,tw:.15}),
    flyA:mk({lw:1,ln:.2}),flyI:mk({lw:1,rt:[0,.6,.8],rs:[0,-.8,.35],lt:[.05,-.4,.8],ls:[0,-.9,.1],ln:.4,ru:[-.5,.5,.5],lu:[.5,.5,.5]}),
    roundA:mk({lw:1,tw:-.45,ln:.05,rt:[-.2,-.7,.35],rs:[-.1,-1,.1]}),roundI:mk({lw:1,rt:[.55,.45,.7],rs:[.85,.25,.45],tw:.9,ln:-.12}),
    spinA:mk({lw:1,tw:-1.6,ln:.1,rt:[0,-.9,.1],rs:[0,-1,0]}),spinI:mk({lw:1,tw:-3.1,ln:.35,rt:[0,.2,-1],rs:[0,.1,-1]}),
    pushA:mk({lw:1,rt:[0,.5,.8],rs:[0,-.9,.3],tw:0,ln:0}),pushI:mk({lw:1,rt:[0,.25,1],rs:[0,.1,1],ln:-.22}),
    dropA:mk({lw:1,ln:.3,rt:[0,.3,.9],rs:[0,-.2,1]}),dropI:mk({lw:1,rt:[0,.15,1],rs:[0,.05,1],lt:[.05,.1,1],ls:[0,-.1,1],ln:.5,ru:[-.6,.3,.6],lu:[.6,.3,.6]}),
    grabA:mk({ru:[-.35,.1,.95],rf:[-.1,.1,1],lu:[.35,.1,.95],lf:[.1,.1,1],tw:0,ln:.15}),
    throwI:mk({ru:[-.7,.65,.1],rf:[-.2,.7,.6],lu:[.5,.2,.8],lf:[.2,.1,1],tw:1.0,ln:.3}),
    takeA:mk({ru:[-.98,.05,-.05],rf:[-.1,.2,.95],tw:-.6,ln:.1}),takeI:mk({lw:1,ru:[-.2,-.1,1],rf:[.95,-.1,.3],rt:[0,.5,.85],rs:[0,-.85,.3],tw:.95,ln:.25}),
    block:mk({ru:[-.3,.3,.8],rf:[.35,.9,.2],lu:[.3,.3,.8],lf:[-.35,.9,.2],tw:0,ln:.1})
  };
  const mir=p=>{const f=v=>[-v[0],v[1],v[2]];return Object.assign({},p,{ru:f(p.lu),rf:f(p.lf),lu:f(p.ru),lf:f(p.rf),rt:f(p.lt),rs:f(p.ls),lt:f(p.rt),ls:f(p.rs),tw:-p.tw})};
  // move id -> {a: wind-up pose, i: impact pose, m: mirrored (left-handed)}. Moves not listed (Flow skills etc.) borrow a family below.
  const SPEC={
    jab:{a:'crossA',i:'crossI',m:1},cross:{a:'crossA',i:'crossI'},hook:{a:'hookA',i:'hookI',m:1},knee:{a:'kneeA',i:'kneeI'},spin:{a:'spinA',i:'spinI'},
    upper:{a:'upA',i:'upI'},round:{a:'roundA',i:'roundI'},power:{a:'powA',i:'powI'},step:{a:'crossA',i:'crossI'},dash:{a:'flyA',i:'flyI'},counter:{a:'crossA',i:'crossI'},
    push:{a:'pushA',i:'pushI'},drop:{a:'dropA',i:'dropI'},throw:{a:'grabA',i:'throwI'},take:{a:'takeA',i:'takeI'}};
  const BORROW={light:'jab',light2:'cross',light3:'hook',advance:'step',rush:'dash',evade:'counter',plunge:'drop',rising:'upper',heavy:'power',shove:'push',lunge:'step',whirl:'spin',cinder:'round',armada:'spin',meia:'round',martelo:'drop',rasteira:'round'};
  const specOf=id=>SPEC[id]||SPEC[BORROW[id]]||SPEC.jab;
  const ease=u=>u<=0?0:u>=1?1:u*u*(3-2*u);
  // which pose pair is this fighter in right now? f = a CombatCore fighter. Returns {a,b,u,w} with pose NAMES (+ mirror flags) so the caller can mix them
  function target(f,gT,out){
    out=out||{};out.w=.9;out.am=out.bm=false;out.a=out.b='guard';out.u=0;
    if(f.act==='dodge'||f.act==='stun'||f.act==='dead'){out.w=0;return out}
    if(f.act==='charge'){const s=SPEC.power;out.a='guard';out.b=s.a;out.u=ease(f.c/14);return out}
    if(f.act==='attack'&&f.ph&&f.ph[f.pi]){const k=f.ph[f.pi].k,n=f.ph[f.pi].n||1,u=Math.min(1,f.pk/n),s=specOf(f.mv&&f.mv.id),mr=!!s.m;
      if(k==='startup'){out.a='guard';out.b=s.a;out.bm=mr;out.u=ease(u)}
      else if(k==='active'){out.a=s.a;out.b=s.i;out.am=out.bm=mr;out.u=ease(Math.min(1,u*1.6))}
      else{out.a=s.i;out.b='guard';out.am=mr;out.u=ease(u)}
      out.w=1;return out}
    if(f.guard){out.a='guard';out.b='block';out.u=ease(gT/5);return out}
    return out}
  // ---- the THREE layer: aims arm and leg bones with the game's own aim(b,child,dir). q = avatar.userData (needs .bones/.model) ----
  let V=null;
  const vec=a=>new THREE.Vector3(a[0],a[1],a[2]).normalize();
  function pose(n,m){const p=POSE[n]||POSE.guard;return m?mir(p):p}
  function mixInto(cur,a,am,b,bm,u){const A=pose(a,am),B=pose(b,bm);
    for(const k of['ru','rf','lu','lf','rt','rs','lt','ls'])for(let i=0;i<3;i++)cur[k][i]=A[k][i]+(B[k][i]-A[k][i])*u;
    for(const k of['tw','ln','lw'])cur[k]=A[k]+(B[k]-A[k])*u;return cur}
  const newCur=()=>{const c=JSON.parse(JSON.stringify(POSE.guard));return c};
  function apply(q,cur,w){
    if(typeof THREE==='undefined'||typeof aim!=='function'||w<.01)return;
    const B=q.bones;if(!B||!B.RightArm||!q.model)return;
    if(!V){V={a:new THREE.Vector3(),b:new THREE.Vector3(),t:new THREE.Vector3(),q:new THREE.Quaternion(),d:new THREE.Vector3()}}
    const m=q.model;m.rotation.y+=cur.tw*w;m.rotation.x+=cur.ln*w;m.updateMatrixWorld(true);m.getWorldQuaternion(V.q);
    const seg=(b,c,dm,ww)=>{if(!b||!c)return;b.updateWorldMatrix(true,false);c.updateWorldMatrix(true,false);b.getWorldPosition(V.a);c.getWorldPosition(V.b);V.b.sub(V.a).normalize();
      V.t.set(dm[0],dm[1],dm[2]).normalize().applyQuaternion(V.q);if(ww<1)V.b.lerp(V.t,ww);else V.b.copy(V.t);V.b.normalize();aim(b,c,V.b)};
    seg(B.RightArm,B.RightForeArm,cur.ru,w);seg(B.RightForeArm,B.RightHand,cur.rf,w);seg(B.LeftArm,B.LeftForeArm,cur.lu,w);seg(B.LeftForeArm,B.LeftHand,cur.lf,w);
    const lw=Math.min(1,cur.lw)*w;if(lw>.02){seg(B.RightUpLeg,B.RightLeg,cur.rt,lw);seg(B.RightLeg,B.RightFoot,cur.rs,lw);seg(B.LeftUpLeg,B.LeftLeg,cur.lt,lw);seg(B.LeftLeg,B.LeftFoot,cur.ls,lw)}}
  function lerpTo(cur,tg,k){for(const n of['ru','rf','lu','lf','rt','rs','lt','ls'])for(let i=0;i<3;i++)cur[n][i]+=(tg[n][i]-cur[n][i])*k;for(const n of['tw','ln','lw'])cur[n]+=(tg[n]-cur[n])*k;return cur}
  const Pose={POSE,SPEC,BORROW,specOf,target,ease,mir,newCur,mixInto,lerpTo,apply};
  return{M,IDS,STRING,Combos,light,heavy,install,CHAIN_GAP,EVADE_GAP,TAKE_RANGE,THROW_RANGE,Pose}})();
if(typeof module!=='undefined')module.exports=Fists;
