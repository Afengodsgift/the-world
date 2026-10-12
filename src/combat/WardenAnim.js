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

  // ---------- REAL CLIPS (assets/warden_anims.json, baked from the Universal Animation Library by tools/retarget_ual.js, loaded when you enter the arena) ----------
  // Attack clips are SCRUBBED by the combat sim: the clip time is a piecewise-linear function of the sim tick (knots below), so the visible cut lands exactly on the sim's active window
  // and a hit-stop freezes the picture. Layers are blended with the game's own base layer by per-clip weights (Blend.w), the same way emote overlays are.
  const SEQ={   // k = [simTick, clipSeconds] knots over the concatenated pair a + b. light: 10 startup / 4 active / 16 recovery ticks; heavy: 14 / 5 / 30
    light_b:{a:'w_b',la:.53,b:'w_b_rec',k:[[0,0],[10,.25],[14,.5],[30,1.45]]},
    light_h:{a:'w_hook',la:.47,b:'w_hook_rec',k:[[0,0],[10,.2],[14,.4],[30,1.05]]},
    heavy:{a:'w_a',la:.43,b:'w_a_rec',k:[[0,.43],[14,.6],[19,.88],[49,1.4]]}};
  const NAMES=['w_idle','w_idle_up','w_a','w_a_rec','w_b','w_b_rec','w_hook','w_hook_rec','w_block'];
  const CL={st:'none',A:{},ws:{},blockT:0,sw:0,lastLight:-1e9};   // st: none|loading|ready|failed
  function knot(k,t){if(t<=k[0][0])return k[0][1];for(let i=1;i<k.length;i++)if(t<=k[i][0]){const a=k[i-1],b=k[i],f=(t-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*f}return k[k.length-1][1]}
  function load(q){
    if(CL.st!=='none'||!q.mixer)return;CL.st='loading';
    fetch('assets/warden_anims.json').then(r=>r.json()).then(j=>{for(const c of j){if(NAMES.indexOf(c.name)<0)continue;const ac=THREE.AnimationClip.parse(c);ac.name=c.name;const a=q.mixer.clipAction(ac);a.enabled=false;a.setEffectiveWeight(.0001);CL.A[c.name]=a;CL.ws[c.name]=0}
      CL.st='ready'}).catch(()=>{CL.st='failed'})}
  const ready=()=>CL.st==='ready';
  // choose the sequence for the next light attack: B and the hook alternate when chained within 1.3 s, otherwise start with B
  function nextLight(nowS){const v=nowS-CL.lastLight<1.3&&CL.sw===0?1:0;CL.sw=v;CL.lastLight=nowS;return v?'light_h':'light_b'}
  // f = sim fighter, seqName = current light variant, fr = fraction of the next tick already elapsed (0..1), moving = player is walking, dt = frame seconds
  function update(q,f,seqName,fr,moving,dt,on){
    if(!ready())return false;const A=CL.A,tgt={},tm={};for(const n of NAMES)tgt[n]=0;
    let fight=on&&f.act!=='dead'&&f.act!=='dodge'&&f.act!=='stun';
    const place=(sq,u)=>{if(u<sq.la){tgt[sq.a]=1;tm[sq.a]=u}else{tgt[sq.b]=1;tm[sq.b]=Math.min(u-sq.la,A[sq.b].getClip().duration-.001)}};
    if(fight){
      if(f.act==='charge'){const sq=SEQ.heavy;place(sq,sq.la*ease(f.c/16))}
      else if(f.act==='attack'&&f.ph&&f.ph[f.pi]){let t=f.pk+fr;for(let i=0;i<f.pi;i++)t+=f.ph[i].n;const sq=f.mv&&f.mv.id==='heavy'?SEQ.heavy:SEQ[seqName]||SEQ.light_b;place(sq,knot(sq.k,t))}
      else if(f.guard&&f.act==='free'){tgt.w_block=1;CL.blockT+=(.42-CL.blockT)*Math.min(1,dt*14);tm.w_block=CL.blockT}
      else{tgt[moving?'w_idle_up':'w_idle']=1;CL.blockT=0}
    }
    if(!(f.guard&&f.act==='free')&&CL.ws.w_block>.01){CL.blockT=Math.min(1.2,Math.max(CL.blockT,.42)+dt*2.2);tm.w_block=CL.blockT}   // releasing: play the block clip out while its weight fades
    let sum=0;const k=1-Math.exp(-dt*22);
    for(const n of NAMES){CL.ws[n]+=(tgt[n]-CL.ws[n])*k;if(CL.ws[n]<.01&&tgt[n]===0)CL.ws[n]=0;sum+=CL.ws[n]}
    const tot=Math.min(1,sum),W=Blend.w(tot);let any=false;
    for(const n of NAMES){const a=A[n],r=CL.ws[n];
      if(r<=0){if(a.enabled){a.enabled=false;a.setEffectiveWeight(.0001)}continue}
      any=true;if(!a.enabled){a.enabled=true;a.play();if(n!=='w_idle'&&n!=='w_idle_up'){a.paused=true}}
      a.setEffectiveWeight(W*r/sum||.0001);if(tm[n]!==undefined){a.paused=true;a.time=tm[n]}}
    if(any)q.mixer.update(0);   // re-evaluate the pose with the new weights/times right now (no one-frame lag)
    return any}
  function off(){for(const n of NAMES){const a=CL.A[n];if(a&&a.enabled){a.enabled=false;a.setEffectiveWeight(.0001)}CL.ws[n]=0}CL.blockT=0}
  return{POSES:P,mix,copy,apply,target,ease,Clips:{load,ready,update,off,nextLight,SEQ,state:CL}}})();
