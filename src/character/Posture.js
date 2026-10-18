// Posture: the stock clips were authored for the stock CHIBI (huge head, short limbs). Their stance - head/neck leaning forward 12-15 deg in idle (up to ~47 in a sprint),
// the lower spine at ~9 deg against ~2 for the chest (an S-curve: pelvis tilted, back arched), arms hanging 20 deg out with the forearm folded in - is cute on a chibi
// but on a realistic body (assets/chars: Crypto, Medea, Eve, Cool Guy - flagged q.real) it reads as hunched shoulders, a pushed-out chest, a pushed-in back and C-shaped arms.
// ground() runs right after the mixer (and hipFix) for idle/walk/jog/sprint and only eases those poses toward a natural stance. It never changes the stock characters.
// Works in avatar space (+Y up, +Z forward, +X his left) with the game's own aim(); everything is derived from the clip's pose each frame, so there is no state and no drift.
// Globals used: THREE, aim (index.html).
const Posture=(()=>{
  const OK={idle:1,walk:1,jog:1,sprint:1};
  const K={ head:.15, neck:.25, lumbar:.10, armOut:.45, armFwd:.55, foreOut:.40, foreFwd:.45 };   // fraction of the clip's deviation that is kept
  const _gq=new THREE.Quaternion(),_gi=new THREE.Quaternion(),_p=new THREE.Vector3(),_c=new THREE.Vector3(),_v=new THREE.Vector3(),_w=new THREE.Vector3();
  const _Qp=new THREE.Quaternion(),_Rw=new THREE.Quaternion(),_Qn=new THREE.Quaternion(),_Par=new THREE.Quaternion(),_Fix=new THREE.Quaternion(),_ax=new THREE.Vector3(1,0,0);
  function sync(g){g.updateWorldMatrix(true,false);g.getWorldQuaternion(_gq);_gi.copy(_gq).invert()}
  // direction b->c in avatar space
  function dir(b,c,out){b.getWorldPosition(_p);c.getWorldPosition(_c);return out.copy(_c).sub(_p).applyQuaternion(_gi).normalize()}
  const lean=v=>Math.atan2(v.z,v.y);                     // sagittal angle from vertical, + = forward
  function setLean(v,a){const r=Math.hypot(v.y,v.z);v.set(v.x,r*Math.cos(a),r*Math.sin(a));return v.normalize()}
  const aimTo=(b,c,v)=>aim(b,c,_w.copy(v).applyQuaternion(_gq));
  function ground(g,q){
    if(!q.real||!OK[q.cur]||q.hold||q.gdn)return;
    const B=q.bones;if(!B||!B.Hips||!B.Spine||!B.Chest||!B.UpperChest||!B.Neck||!B.Head)return;
    sync(g);
    // ---- the clip's pose, measured before touching anything ----
    const vHS=new THREE.Vector3(),vSU=new THREE.Vector3(),vUN=new THREE.Vector3(),vNH=new THREE.Vector3();
    dir(B.Hips,B.Spine,vHS);dir(B.Spine,B.UpperChest,vSU);dir(B.UpperChest,B.Neck,vUN);dir(B.Neck,B.Head,vNH);
    const aHS=lean(vHS),tau=lean(vSU),aUN=lean(vUN),aNH=lean(vNH);   // tau = how far the chest leans (a sprint leans a lot: that is natural and stays)
    const arms=[];
    if(B.LeftArm&&B.LeftForeArm&&B.LeftHand&&B.RightArm&&B.RightForeArm&&B.RightHand)for(const n of ['Left','Right']){
      const u=dir(B[n+'Arm'],B[n+'ForeArm'],new THREE.Vector3()),f=dir(B[n+'ForeArm'],B[n+'Hand'],new THREE.Vector3());
      arms.push({n,u,f,hang:u.y<-.75&&f.y<-.5});          // only arms that hang (idle / walk): swinging jog/sprint arms and anything raised are left alone
    }
    // ---- 1. lower back: tilt the pelvis upright, keeping the spine and both legs exactly where the clip had them ----
    const dl=(aHS>tau?tau+K.lumbar*(aHS-tau):aHS)-aHS;
    if(dl<-.002){
      B.Hips.getWorldQuaternion(_Qp);
      _Rw.setFromAxisAngle(_ax,dl).premultiply(_gq).multiply(_gi);        // a rotation about the avatar's X axis, as a world rotation
      _Qn.copy(_Rw).multiply(_Qp);                                        // Hips world rotation after the tilt
      B.Hips.parent.getWorldQuaternion(_Par).invert();B.Hips.quaternion.copy(_Par.multiply(_Qn));
      _Fix.copy(_Qn).invert().multiply(_Qp);                              // premultiplying a direct child by this keeps its WORLD rotation unchanged
      for(const n of ['Spine','LeftUpLeg','RightUpLeg'])if(B[n])B[n].quaternion.premultiply(_Fix);
      B.Hips.updateMatrixWorld(true);
    }
    // ---- 2. neck and head: follow the chest instead of thrusting forward ----
    const nUN=aUN>tau?tau+K.neck*(aUN-tau):aUN,nNH=aNH>tau?tau+K.head*(aNH-tau):aNH;
    if(nUN<aUN-.002||nNH<aNH-.002){
      aimTo(B.UpperChest,B.Neck,setLean(dir(B.UpperChest,B.Neck,_v),nUN));
      aimTo(B.Neck,B.Head,setLean(dir(B.Neck,B.Head,_v),nNH));
    }
    // ---- 3. arms that hang: less splay, less folded-in forearm ----
    for(const a of arms)if(a.hang){
      const n=a.n;sync(g);
      const u=a.u.clone();u.x*=K.armOut;u.z*=K.armFwd;u.normalize();
      const f=a.f.clone();f.x*=K.foreOut;f.z*=K.foreFwd;f.normalize();
      aimTo(B[n+'Arm'],B[n+'ForeArm'],u);aimTo(B[n+'ForeArm'],B[n+'Hand'],f);
    }
  }
  return {ground,K};
})();
