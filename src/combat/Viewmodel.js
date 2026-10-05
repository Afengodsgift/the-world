// Viewmodel: the first-person arms + weapon.
//   - Rendered as a second pass with its own camera (fixed FOV 58) after the world and a depth clear, so the gun never clips
//     into walls and never stretches when the flight FOV widens.
//   - RIGID to the camera (the "good vs bad aiming" reference): the pose never blends between aim animations. The whole rig
//     just moves with the view; life comes from layered, springy offsets: look sway, walk bob, flight float, boost "carry"
//     pose, recoil, reload dip, equip raise.
//   - Composition is defined in screen (NDC) terms so it stays small, low and off the crosshair on any aspect ratio (phones
//     are portrait!). Hands grip points are found from the gun model's own geometry.
//   - Arms are stylised sleeves + hands built from primitives (no skeleton to fight): they run from below-and-behind the camera
//     to the grip / foregrip.
// API: setWeapon(i,len), update(dt,{vis,reload}), render(renderer,mainCamera), kick(strength), muzzleWorld(mainCamera,out)
// Globals used at runtime: THREE, S, me, Outlaw.loadGun.
const Viewmodel=(()=>{
  const vs=new THREE.Scene(),vc=new THREE.PerspectiveCamera(58,1,.03,30);
  vs.add(vc,new THREE.HemisphereLight(0xffffff,0x6a7a99,1.2));
  const dl=new THREE.DirectionalLight(0xffffff,1.1);dl.position.set(.6,1,.5);vs.add(dl);
  const rig=new THREE.Group(),gun=new THREE.Group();vs.add(rig);rig.add(gun);
  const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.85});
  const skin=mat('#e3b08c'),sleeve=mat('#262833'),cuff=mat('#d9dbe3');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function mkArm(){
    const g=new THREE.Group(),s=new THREE.Mesh(new THREE.CylinderGeometry(.03,.047,1,14),sleeve),c=new THREE.Mesh(new THREE.CylinderGeometry(.036,.036,.05,14),cuff),h=new THREE.Mesh(new THREE.SphereGeometry(.05,14,12),skin);
    h.scale.set(.8,.75,1.25);for(const o of [s,c,h]){o.frustumCulled=false;g.add(o)}g.userData={s,c,h};g.visible=false;return g}
  const armR=mkArm(),armL=mkArm();rig.add(armR,armL);
  // muzzle flash (additive sprite)
  const fc=document.createElement('canvas');fc.width=fc.height=64;{const x=fc.getContext('2d'),g=x.createRadialGradient(32,32,2,32,32,30);g.addColorStop(0,'rgba(255,250,210,1)');g.addColorStop(.35,'rgba(255,190,80,.8)');g.addColorStop(1,'rgba(255,120,20,0)');x.fillStyle=g;x.fillRect(0,0,64,64)}
  const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(fc),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));flash.visible=false;rig.add(flash);

  const A={wi:-1,tok:0,model:null,s:.45,len:.5,two:false,grip:new THREE.Vector3(0,-.1,.19),fore:new THREE.Vector3(0,-.1,-.22)};
  const M={rec:{x:0,v:0},sx:{x:0,v:0},sy:{x:0,v:0},bob:0,eq:0,t:0,pyaw:null,ppit:null,px:null,pz:null,spd:0,flash:0,vis:false,side:1,reload:-1};
  const V=()=>new THREE.Vector3();const _t=V(),_a=V(),_b=V(),_d=V(),_y=new THREE.Vector3(0,1,0),_q=new THREE.Quaternion();
  const E=new THREE.Euler();
  function spring(s,t,dt,w,z){const a=w*w*(t-s.x)-2*z*w*s.v;s.v+=a*dt;s.x+=s.v*dt}

  // ---- weapon model + grip points from its geometry (model is unit length, centred, muzzle toward -Z) ----
  function analyze(m){
    m.updateMatrixWorld(true);const v=V();let rMin=1e9,rMax=-1e9,fMin=1e9,yMin=1e9,yMax=-1e9;
    m.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;
      for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);yMin=Math.min(yMin,v.y);yMax=Math.max(yMax,v.y);
        if(v.z>.02&&v.z<.34){rMin=Math.min(rMin,v.y);rMax=Math.max(rMax,v.y)}
        if(v.z<-.08&&v.z>-.36)fMin=Math.min(fMin,v.y)}});
    A.grip.set(0,rMax>rMin?rMin+.42*(rMax-rMin):-.1,.19);
    A.fore.set(0,fMin<1e8?fMin-.03:-.1,-.22);A.h=Math.max(.05,yMax-yMin);                       // model height in unit-length terms
  }
  async function setWeapon(i,len){
    A.wi=i;const tok=++A.tok;
    for(const c of [...gun.children])gun.remove(c);A.model=null;armR.visible=armL.visible=false;
    if(i<0||typeof Outlaw==='undefined')return;
    const src=await Outlaw.loadGun(i);if(!src||A.tok!==tok)return;
    const m=src.clone(true);m.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.castShadow=false}});
    analyze(m);A.len=len;A.s=Math.min(clamp(.28+.30*len,.34,.62),.15/A.h);A.two=len>=.7;m.scale.setScalar(A.s);gun.add(m);A.model=m;M.eq=0;armR.visible=true;armL.visible=true;
  }

  // ---- place a sleeve + hand between two points (rig-local) ----
  function limb(arm,from,to){
    const u=arm.userData;_d.copy(to).sub(from);const L=_d.length()||1e-3;_d.divideScalar(L);_q.setFromUnitVectors(_y,_d);
    u.s.position.copy(from).addScaledVector(_d,L/2);u.s.quaternion.copy(_q);u.s.scale.set(1,L,1);
    u.c.position.copy(to).addScaledVector(_d,-.03);u.c.quaternion.copy(_q);
    u.h.position.copy(to).addScaledVector(_d,.035);u.h.quaternion.copy(_q);
  }
  const ndc=(nx,ny,depth,out)=>{const th=Math.tan(vc.fov*Math.PI/360);return out.set(nx*th*vc.aspect*depth,ny*th*depth,-depth)};

  function update(dt,ctx){
    M.vis=!!(ctx&&ctx.vis);M.reload=ctx&&ctx.reload!==undefined?ctx.reload:-1;
    if(ctx&&ctx.wi!==undefined&&ctx.wi!==A.wi)setWeapon(ctx.wi,ctx.len||.5);
    if(!M.vis||!A.model){return}
    M.t+=dt;M.eq=Math.min(1,M.eq+dt*3.2);
    const asp=window.innerWidth/Math.max(1,window.innerHeight);if(Math.abs(vc.aspect-asp)>1e-4){vc.aspect=asp;vc.updateProjectionMatrix()}
    // ---- composition: grip anchor in NDC (small, low, right of the crosshair) ----
    const nx=clamp(.34-.13*asp,.14,.34),two=A.two,sc=A.s*clamp(.62+.4*asp,.78,1);   // phones are portrait: shrink and tuck in so the weapon stays small
    A.sc=sc;A.model.scale.setScalar(sc);
    ndc(two?nx*1.05:nx*.9,two?-.55:-.47,two?.46:.48,_a);                   // right-hand grip position
    gun.position.copy(_a).addScaledVector(A.grip,-sc);gun.rotation.set(0,Math.atan2(_a.x,14),0);   // muzzle points toward the crosshair at ~14 m
    gun.updateMatrixWorld(false);
    // hands
    _b.copy(A.fore).multiplyScalar(sc).applyEuler(gun.rotation).add(gun.position);                 // foregrip (long guns)
    const end=_t.copy(_a).add(_d.set(0,-.012,.05));
    limb(armR,V().copy(end).add(_d.set(.16,-.44,.34)),end);
    if(two)limb(armL,V().copy(_b).add(_d.set(-.2,-.42,.34)),_b);
    else{const l=V().copy(_a).add(_d.set(-.034,-.026,.04));limb(armL,V().copy(l).add(_d.set(-.12,-.44,.32)),l)}

    // ---- layered motion ----
    const di=Math.max(dt,.001);
    const yaw=S.yaw,pit=S.pitch;if(M.pyaw===null){M.pyaw=yaw;M.ppit=pit;M.px=S.x;M.pz=S.z}
    const dyaw=Math.atan2(Math.sin(yaw-M.pyaw),Math.cos(yaw-M.pyaw))/di,dpit=(pit-M.ppit)/di;M.pyaw=yaw;M.ppit=pit;
    M.spd+=(Math.hypot(S.x-M.px,S.z-M.pz)/di-M.spd)*Math.min(1,dt*8);M.px=S.x;M.pz=S.z;
    spring(M.sx,clamp(dyaw*.014,-.11,.11),dt,14,.7);spring(M.sy,clamp(-dpit*.011,-.08,.08),dt,14,.7);   // the gun lags behind turning
    spring(M.rec,0,dt,22,.42);
    let px=M.sx.x*.12,py=M.sy.x*.1,pz=0,rx=M.sy.x,ry=M.sx.x,rz=0;
    const fl=me.userData.fl,fly=!!(S.flying&&fl);
    if(fly){const wH=fl.wH,wB=fl.wB;
      py+=Math.sin(M.t*1.6)*.005*wH+Math.sin(M.t*1.2)*.003;                                           // hover float
      py-=.05*wB;rx-=.2*wB;rz+=.07*wB;pz+=.02*wB;                                                      // boost: gun carried lower and angled
    }else{const g=S.grounded?Math.min(1,M.spd/7):0;M.bob+=di*M.spd*.85;px+=Math.sin(M.bob)*.006*g;py-=Math.abs(Math.sin(M.bob))*.008*g}
    pz+=M.rec.x*.045;rx+=M.rec.x*.11;ry+=M.rec.x*.016*M.side;rz+=M.rec.x*.02*M.side;                   // recoil
    if(M.reload>=0){const e=Math.sin(clamp(M.reload,0,1)*Math.PI);py-=.17*e;rx-=.45*e;rz+=.3*e;px+=Math.sin(M.reload*38)*.004*e}
    const q=1-Math.pow(1-M.eq,3);py-=.34*(1-q);rx-=.5*(1-q);                                           // equip: raise from below
    rig.position.set(px,py,pz);rig.rotation.set(rx,ry,rz);
    // muzzle flash
    M.flash=Math.max(0,M.flash-dt);
    if(M.flash>0){const s=.1+Math.random()*.08;flash.visible=true;flash.scale.set(s,s,1);flash.material.opacity=Math.min(1,M.flash/.04);
      flash.position.copy(gun.position).add(_d.set(0,0,-.5*sc-.03).applyEuler(gun.rotation))}
    else flash.visible=false;
  }

  function render(renderer,main){
    if(!M.vis||!A.model)return;
    if(vc.aspect!==main.aspect){vc.aspect=main.aspect;vc.updateProjectionMatrix()}
    const ac=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();renderer.render(vs,vc);renderer.autoClear=ac;
  }
  function kick(strength){M.rec.v+=(strength||1)*30;M.flash=.05;M.side=Math.random()<.5?-1:1}
  // world-space point a little in front of the main camera where the viewmodel's muzzle appears on screen (tracer origin)
  function muzzleWorld(main,out){
    out=out||V();
    if(!A.model){return out.copy(main.position)}
    rig.updateMatrixWorld(true);_t.set(0,0,-.5*(A.sc||A.s));gun.localToWorld(_t);
    _t.project(vc);_a.set(_t.x,_t.y,.5).unproject(main).sub(main.position).normalize();
    return out.copy(main.position).addScaledVector(_a,.7);
  }
  return {update,render,setWeapon,kick,muzzleWorld,scene:vs,camera:vc,state:M,anchor:A};
})();
