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
  return{POSES:P,mix,copy,apply,target,ease}})();
