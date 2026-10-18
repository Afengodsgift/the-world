// WARDEN M1c: procedural sword pose layer on top of the baked clips (same technique as FlightPose / Outlaw.poseGun): after the mixer has run, aim the arm bones with the game's own aim().
// Axis-independent: every pose is a pair of direction vectors per arm in MODEL space (+x = character's left, +y up, +z forward). Dodge and hit reactions use the existing roll/hit clips (this layer fades out).
// Globals used: THREE, aim (index.html). Pure data + small maths otherwise; PlayerCombat decides which pose and when.
const WardenAnim=(()=>{
  const V=(x,y,z)=>new THREE.Vector3(x,y,z).normalize();
  // ru/rf = right upper arm / forearm direction, lu/lf = left. tw = body twist (rad, + = turn toward character's left), ln = lean forward (rad)
  const P={
    ready:{ru:V(-.25,-.9,.35),rf:V(-.1,.15,1),lu:V(.3,-.9,.3),lf:V(.1,-.2,1),tw:0,ln:.05},
    guard:{ru:V(-.45,-.35,.8),rf:V(-.05,1,.25),lu:V(.35,-.3,.85),lf:V(-.25,.6,.75),tw:-.15,ln:.06},
    lightA:{ru:V(-.8,.5,.1),rf:V(-.35,1,.1),lu:V(.4,-.8,.3),lf:V(.2,-.3,1),tw:-.55,ln:-.04},   // sword high behind the right shoulder
    lightB:{ru:V(.1,-.35,.95),rf:V(.75,-.25,.7),lu:V(.4,-.8,.4),lf:V(.3,-.3,1),tw:.6,ln:.12},   // follow-through across to the left, low
    chargeA:{ru:V(-.9,-.3,-.3),rf:V(-.4,.15,-1),lu:V(.4,-.8,.3),lf:V(.3,-.3,1),tw:-.7,ln:-.08},  // sword drawn back, low
    heavyA:{ru:V(-.25,.95,-.1),rf:V(0,1,-.35),lu:V(.35,.6,.1),lf:V(.1,1,-.2),tw:-.1,ln:-.18},    // overhead
    heavyB:{ru:V(0,-.45,1),rf:V(0,-.65,1),lu:V(.3,-.5,.8),lf:V(.1,-.6,1),tw:.1,ln:.3}            // slam forward and down
  };
  const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_t=new THREE.Vector3(),_mq=new THREE.Quaternion();
  const ease=u=>u<=0?0:u>=1?1:u*u*(3-2*u);
  function mix(a,b,u,o){o=o||{ru:new THREE.Vector3(),rf:new THREE.Vector3(),lu:new THREE.Vector3(),lf:new THREE.Vector3(),tw:0,ln:0};
    for(const k of['ru','rf','lu','lf'])o[k].copy(a[k]).lerp(b[k],u).normalize();o.tw=a.tw+(b.tw-a.tw)*u;o.ln=a.ln+(b.ln-a.ln)*u;return o}
  function copy(a,o){return mix(a,a,0,o)}
  // blend a bone's current direction (what the clip gave) toward the pose direction by w, then aim it
  function seg(b,c,dm,w){
    b.updateWorldMatrix(true,false);c.updateWorldMatrix(true,false);b.getWorldPosition(_a);c.getWorldPosition(_b);_b.sub(_a).normalize();
    _t.copy(dm).applyQuaternion(_mq);if(w<1)_b.lerp(_t,w);else _b.copy(_t);_b.normalize();aim(b,c,_b)}
  // q = me.userData, cur = smoothed pose, w = 0..1 stance weight
  function apply(q,cur,w){
    const B=q.bones;if(!B||!B.RightArm||w<.01)return;
    const m=q.model;m.rotation.y+=cur.tw*w;m.rotation.x+=cur.ln*w;m.updateMatrixWorld(true);m.getWorldQuaternion(_mq);
    seg(B.RightArm,B.RightForeArm,cur.ru,w);seg(B.RightForeArm,B.RightHand,cur.rf,w);
    seg(B.LeftArm,B.LeftForeArm,cur.lu,w);seg(B.LeftForeArm,B.LeftHand,cur.lf,w)}
  // which pose does the sim fighter want right now?  f = CombatCore fighter. Returns a keyframe pair + u (written into out).
  const _o={a:P.ready,b:P.ready,u:0,w:1};
  function target(f,gT){
    _o.w=1;_o.a=_o.b=P.ready;_o.u=0;
    if(f.act==='dodge'||f.act==='stun'||f.act==='dead'){_o.w=0;return _o}
    if(f.act==='charge'){_o.a=P.ready;_o.b=P.chargeA;_o.u=ease(f.c/14);return _o}
    if(f.act==='attack'&&f.ph&&f.ph[f.pi]){const k=f.ph[f.pi].k,n=f.ph[f.pi].n||1,u=Math.min(1,f.pk/n),id=f.mv&&f.mv.id;
      if(id==='heavy'){
        if(k==='startup'){_o.a=P.chargeA;_o.b=P.heavyA;_o.u=ease(u)}else if(k==='active'){_o.a=P.heavyA;_o.b=P.heavyB;_o.u=ease(u*1.5)}else{_o.a=P.heavyB;_o.b=P.ready;_o.u=ease(u)}
      }else{
        if(k==='startup'){_o.a=P.ready;_o.b=P.lightA;_o.u=ease(u)}else if(k==='active'){_o.a=P.lightA;_o.b=P.lightB;_o.u=ease(u*1.4)}else{_o.a=P.lightB;_o.b=P.ready;_o.u=ease(u)}}
      return _o}
    if(f.guard){_o.a=P.ready;_o.b=P.guard;_o.u=ease(gT/5);return _o}
    return _o}

  // ---------- REAL CLIPS (assets/warden_anims.json, baked by tools/retarget_ual.js from the Universal Animation Library + KayKit; ~320 KB, fetched once when the Warden Isles are built) ----------
  // Attack clips are SCRUBBED by the combat sim: each sim phase maps onto a slice of a clip pair (see MAP), so the visible blade lands exactly in the sim's active window,
  // a hit-stop freezes the picture, and a long Duelist tell is a long visible wind-up. One instance per avatar (player, Duelist); the parsed clips are shared.
  const PAIR={b:{a:'w_b',la:.53,b:'w_b_rec'},h:{a:'w_hook',la:.47,b:'w_hook_rec'},a:{a:'w_a',la:.43,b:'w_a_rec'}};   // a = clip, then its recovery clip appended after it (la = length of a)
  const MAP={   // move key -> per-phase [pair, u0, u1] in the order of Moves[...].phases (u = seconds along pair.a followed by pair.b)
    light_b:[['b',0,.25],['b',.25,.5],['b',.5,1.45]],
    light_h:[['h',0,.2],['h',.2,.4],['h',.4,1.05]],
    heavy:[['a',.43,.6],['a',.6,.88],['a',.88,1.4]],
    cinder:[['b',0,.25],['b',.25,.5],['b',.5,1.45]],armada:[['b',0,.25],['b',.25,.5],['b',.5,1.45]],meia:[['h',0,.2],['h',.2,.4],['h',.4,1.05]],
    cut:[['b',0,.25],['b',.25,.5],['b',.5,1.45]],
    fall:[['a',0,.43],['a',.43,.43],['a',.43,.6],['a',.6,.88],['a',.88,1.4]],
    thrust:[['h',0,.2],['h',.2,.4],['h',.4,.5],['h',.5,1.05]],
    dash:[['h',0,.2],['h',.2,.4],['h',.4,.5],['h',.5,1.05]],
    leap:[['a',0,.43],['a',.43,.6],['a',.6,.88],['a',.88,1.4]],
    orb:[['h',0,.2],['h',.2,.4],['h',.4,1.05]],bolt:[['h',0,.2],['h',.2,.4],['h',.4,1.05]],quake:[['a',0,.43],['a',.43,.6],['a',.6,1.4]],rain:[['a',0,.43],['a',.43,.6],['a',.6,1.4]],
    bash:[['h',0,.2],['h',.2,.4],['h',.4,1.05]],
    light2:[['h',0,.2],['h',.2,.4],['h',.4,1.05]],
    light3:[['a',.18,.43],['a',.43,.6],['a',.6,1.4]],
    advance:[['h',0,.2],['h',.2,.4],['h',.4,1.05]],
    evade:[['b',0,.25],['b',.25,.5],['b',.5,1.45]],
    rising:[['h',0,.2],['h',.2,.42],['h',.42,1.05]],
    sweep:[['b',0,.25],['b',.25,.5],['b',.5,1.45]],
    slam:[['a',0,.43],['a',.43,.43],['a',.43,.6],['a',.6,.88],['a',.88,1.4]],
    triple:[['b',0,.25],['b',.25,.5],['b',.5,.8],['h',.2,.4],['h',.4,.5],['a',.5,.75],['a',.75,1.4]],
    twin2:[['h',0,.2],['h',.2,.4],['h',.4,.5],['b',.2,.5],['b',.5,1.45]],
    twin:[['b',0,.25],['b',.25,.5],['b',.5,.8],['h',.2,.4],['h',.4,1.05]],
    riposte:[['h',0,.2],['h',.2,.42],['h',.42,1.05]]};
  const NAMES=['w_idle','w_arms','w_a','w_a_rec','w_b','w_b_rec','w_hook','w_hook_rec','w_block','w_back','w_sl','w_sr'];
  const DIRS=['w_back','w_sl','w_sr'];
  const SH={st:'none',clips:null,p:null};
  function fetchClips(){if(!SH.p)SH.p=fetch('assets/warden_anims.json').then(r=>r.json()).then(j=>{SH.clips={};for(const c of j){const ac=THREE.AnimationClip.parse(c);ac.name=c.name;SH.clips[c.name]=ac}SH.st='ready'}).catch(e=>{SH.st='failed';SH.p=null;throw e});return SH.p}
  const moveKey=(f,variant,alt)=>{const id=f.mv&&f.mv.id;return id==='light'?'light_b':(alt&&alt[id])||id};
  // one animation controller per avatar. q = avatar.userData (needs .mixer).
  function make(q){
    const I={st:'none',A:{},ws:{},blockT:0,sw:0,lastLight:-1e9,ready:()=>I.st==='ready',variant:'light_b'};
    fetchClips().then(()=>{for(const n of NAMES){const a=q.mixer.clipAction(SH.clips[n]);a.enabled=false;a.setEffectiveWeight(.0001);I.A[n]=a;I.ws[n]=0}I.st='ready'}).catch(()=>{I.st='failed'});
    // B and the hook alternate when chained within 1.3 s, otherwise start with B
    I.alt={};I.pickAlt=(id,r)=>{if(id==='cut')I.alt.cut=r<.5?'light_h':'light_b';else if(id==='twin')I.alt.twin=r<.5?'twin2':'twin'};I.nextLight=nowS=>{const v=nowS-I.lastLight<1.3&&I.sw===0?1:0;I.sw=v;I.lastLight=nowS;I.variant=v?'light_h':'light_b';return I.variant};
    // f = sim fighter, fr = elapsed fraction of the next tick (0..1), loco = {moving, vf, vs} (m/s along / left of his facing), dt = frame seconds, on = in a fight
    I.update=(f,fr,loco,dt,on)=>{
      if(I.st!=='ready')return false;const A=I.A,tgt={},tm={},tsc={};for(const n of NAMES)tgt[n]=0;
      const fight=on&&f.act!=='dead'&&f.act!=='dodge'&&f.act!=='stun';let arms=false;
      const place=(pr,u)=>{const P2=PAIR[pr];if(u<P2.la){tgt[P2.a]=1;tm[P2.a]=u}else{tgt[P2.b]=1;tm[P2.b]=Math.min(u-P2.la,A[P2.b].getClip().duration-.001)}};
      if(fight){
        if(f.act==='charge')place('a',.43*ease(f.c/16));
        else if(f.act==='attack'&&f.ph&&f.ph[f.pi]){const m=MAP[moveKey(f,I.variant,I.alt)],e=m&&m[f.pi];
          if(e){const n=f.ph[f.pi].n||1,p=Math.min(1,(f.pk+fr)/n);place(e[0],e[1]+(e[2]-e[1])*p)}}
        else if(f.guard&&f.act==='free'){tgt.w_block=1;I.blockT+=(.42-I.blockT)*Math.min(1,dt*14);tm.w_block=I.blockT}
        else if(loco&&loco.moving){
          const sp=Math.max(.01,Math.hypot(loco.vf,loco.vs)),bk=Math.max(0,-loco.vf)/sp,l=Math.max(0,loco.vs)/sp,r=Math.max(0,-loco.vs)/sp,k=bk+l+r;
          if(k>1e-3){const n=k>1?k:1;tgt.w_back=bk/n;tgt.w_sl=l/n;tgt.w_sr=r/n;tgt.w_back=Math.min(tgt.w_back,.9);tgt.w_sl=Math.min(tgt.w_sl,.9);tgt.w_sr=Math.min(tgt.w_sr,.9)}
          arms=true;I.blockT=0;const ts=Math.max(.5,Math.min(1.6,sp/3.2));for(const n of DIRS)tsc[n]=ts}
        else{tgt.w_idle=1;I.blockT=0}
      }
      if(!(f.guard&&f.act==='free')&&I.ws.w_block>.01){I.blockT=Math.min(1.2,Math.max(I.blockT,.42)+dt*2.2);tm.w_block=I.blockT}   // releasing: play the block clip out while its weight fades
      // smooth the weights; the direction clips are shares of the locomotion layer (forward is the game's own gait underneath), everything else is a share of the whole pose
      const k=1-Math.exp(-dt*22);let sum=0,dirSum=0;
      for(const n of NAMES){if(n==='w_arms')continue;const isD=DIRS.indexOf(n)>=0;I.ws[n]+=(tgt[n]-I.ws[n])*(isD?1-Math.exp(-dt*10):k);if(I.ws[n]<.01&&tgt[n]===0)I.ws[n]=0;if(isD)dirSum+=I.ws[n];else sum+=I.ws[n]}
      I.ws.w_arms+=((arms?1:0)-I.ws.w_arms)*(1-Math.exp(-dt*12));if(I.ws.w_arms<.01&&!arms)I.ws.w_arms=0;
      const tot=Math.min(1,sum),W=Blend.w(tot);let any=false;
      for(const n of NAMES){const a=A[n],r=I.ws[n];
        if(r<=0){if(a.enabled){a.enabled=false;a.setEffectiveWeight(.0001)}continue}
        let w;if(n==='w_arms')w=Blend.w(.86*r);else if(DIRS.indexOf(n)>=0)w=Blend.w(Math.min(.95,r));else w=sum>0?W*r/sum:0;
        any=true;if(!a.enabled){a.enabled=true;a.play();a.paused=tm[n]!==undefined}
        a.setEffectiveWeight(w||.0001);if(tm[n]!==undefined){a.paused=true;a.time=tm[n]}else{a.paused=false;if(tsc[n])a.setEffectiveTimeScale(tsc[n])}}
      if(any)q.mixer.update(0);   // re-evaluate the pose with the new weights/times right now (no one-frame lag)
      return any};
    I.off=()=>{for(const n of NAMES){const a=I.A[n];if(a&&a.enabled){a.enabled=false;a.setEffectiveWeight(.0001)}I.ws[n]=0}I.blockT=0};
    return I}
  return{POSES:P,mix,copy,apply,target,ease,Clips:{make,fetch:fetchClips,MAP,PAIR,shared:SH}}})();
