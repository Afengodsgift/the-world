// CameraRig: the single owner of the game camera.
//   orbit   (default)  third-person chase camera behind the avatar (what the game always had)
//   fps                eye-level first-person camera; own avatar hidden, Viewmodel draws arms + weapon
//   tps                over-the-shoulder shooter camera (the alternative to fps while a weapon is out)
// Flight reinforcement lives here too, applied on top of any mode:
//   FOV widens with speed (cruise a little, boost a lot), the camera banks into sharp turns, a controlled buffet at boost,
//   and in orbit the chase camera trails a little so the speed reads. Recoil adds a short, springy pitch/yaw kick.
// The camera ORIENTATION always comes from S.yaw / S.pitch (what the player drags), so aiming stays exactly where the crosshair is.
// Other systems talk to it only through the API at the bottom (setShooter, kick, pitchRange, neutralPitch ...).
// Globals used at runtime: S, camera, me, H, THREE, sstep.
const CameraRig=(()=>{
  const st={sInit:false,sy:0,sp:0,arm:1,dip:{x:0,v:0},view:'fps',shooter:false,fpsK:0,tpsK:0,ay:0,init:false,px:0,pz:0,vx:0,vz:0,spd:0,hd:0,turn:0,
            roll:{x:0,v:0},kp:{x:0,v:0},ky:{x:0,v:0},t:0,bob:0,eye:new THREE.Vector3(),eInit:false,prevFps:false,cruise:0,boost:0};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const _f=new THREE.Vector3(),_p=new THREE.Vector3(),_l=new THREE.Vector3(),_h=new THREE.Vector3(),_a=new THREE.Vector3(),_b=new THREE.Vector3();
  function spring(s,t,dt,w,z){const a=w*w*(t-s.x)-2*z*w*s.v;s.v+=a*dt;s.x+=s.v*dt}

  // eye position: upright = fixed eye height above the feet; flying = the actual head (follows lean, bob and banking)
  function eye(dt,fwd,out){
    const u=me.userData,fl=u.fl,fw=fl?fl.fw:0;
    out.set(S.x,st.ay+1.64,S.z);
    if(fw>.01&&fl&&u.bones&&u.bones.Head){
      me.updateMatrixWorld(true);u.bones.Head.getWorldPosition(_a);
      if(fl.he){fl.he.getWorldPosition(_b);_a.lerp(_b,.54)}else _a.y+=.27;   // centre of the head, ~eye height
      _a.addScaledVector(fwd,.1);out.lerp(_a,fw);
    }
    // smooth the eye's OFFSET from the avatar, never its world position: filtering a moving point makes it lag behind (0.8 m at 34 m/s)
    out.x-=S.x;out.y-=S.y;out.z-=S.z;
    if(!st.eInit){st.eye.copy(out);st.eInit=true}else st.eye.lerp(out,1-Math.exp(-34*dt));
    out.copy(st.eye);out.x+=S.x;out.y+=S.y;out.z+=S.z;
    if(S.grounded){st.bob+=dt*st.spd*.9;out.y+=Math.sin(st.bob*2)*.018*Math.min(1,st.spd/6)*(1-fw)}   // walking head bob
    return out;
  }

  // ---- obstruction helpers ----
  // walkable surface height at (x,z) for a camera at height y: terrain, or the floating island's top if we are above it
  function ground(x,z,y){let g=H(x,z);if(typeof SKY!=='undefined'&&typeof SKYG==='function'){const dx=x-SKY.x,dz=z-SKY.z;if(dx*dx+dz*dz<(SKY.R*2.8)**2){const sh=SKYG(dx,dz);if(sh>-1e8&&y>=sh-3)g=Math.max(g,sh)}}return g}
  const _near=[];
  // fraction (0.15..1) of the arm from target a to desired camera b that is free of ground and solid obstacles
  function armFree(a,b){
    const len=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);if(len<.01)return 1;
    _near.length=0;
    if(typeof solids!=='undefined')for(let i=0;i<solids.length&&_near.length<24;i++){const c=solids[i];     // thin trunks are ignored: only houses, rocks, props and the like
      if(c.r<1||c.noSide)continue;const dx=c.x-a.x,dz=c.z-a.z;if(dx*dx+dz*dz<(c.r+len+1)**2)_near.push(c)}
    const N=12;
    for(let i=1;i<=N;i++){const t=i/N,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,z=a.z+(b.z-a.z)*t;
      if(y<ground(x,z,a.y)+.55)return Math.max(.15,t-1.5/N);
      for(let k=0;k<_near.length;k++){const c=_near[k],dx=x-c.x,dz=z-c.z,top=c.h!==undefined?c.h:H(c.x,c.z)+9;
        if(dx*dx+dz*dz<(c.r+.25)**2&&y<top)return Math.max(.15,t-1.5/N)}}
    return 1;
  }

  function update(dt){
    st.t+=dt;
    if(!st.init){st.ay=S.y;st.px=S.x;st.pz=S.z;st.init=true}
    st.ay+=(S.y-st.ay)*(1-Math.exp(-6*dt*(typeof SpaceFlight!=='undefined'?SpaceFlight.moveMul(S.y):1)));   // follow height at the same *relative* lag at any climb speed

    // ---- motion estimate: smoothed horizontal velocity, speed and turn rate ----
    const di=Math.max(dt,.001),k=1-Math.exp(-7*dt);
    const dk=typeof Space!=='undefined'?Space.f.dark:0,mm=typeof SpaceFlight!=='undefined'?SpaceFlight.moveMulH(S.y):1;   // altitude: openness + normalised sideways speed
    st.vx+=((S.x-st.px)/di/mm-st.vx)*k;st.vz+=((S.z-st.pz)/di/mm-st.vz)*k;st.px=S.x;st.pz=S.z;
    st.spd=Math.hypot(st.vx,st.vz);
    if(st.spd>3){const h=Math.atan2(st.vx,st.vz);let d=h-st.hd;d=Math.atan2(Math.sin(d),Math.cos(d));st.turn+=(clamp(d/di,-4,4)-st.turn)*Math.min(1,dt*6);st.hd=h}
    else st.turn*=1-Math.min(1,dt*6);
    const fly=!!S.flying;
    st.cruise=fly?clamp(st.spd/34,0,1):0;st.boost=fly?sstep(40,66,st.spd):0;

    // ---- mode blends ----
    const wantFps=st.shooter&&st.view==='fps',wantTps=st.shooter&&st.view==='tps';
    if(wantFps&&!st.prevFps)S.pitch=.02;                                  // enter looking level, not down at the player
    if(!wantFps&&st.prevFps)S.pitch=.4;                                   // leave at the usual chase angle
    st.prevFps=wantFps;
    st.fpsK+=((wantFps?1:0)-st.fpsK)*(1-Math.exp(-10*dt));
    st.tpsK+=((wantTps?1:0)-st.tpsK)*(1-Math.exp(-8*dt));
    spring(st.kp,0,dt,18,.5);spring(st.ky,0,dt,18,.5);                    // recoil kick recovers by itself

    // ---- view direction (what the player is looking along) ----
    // third-person look is eased (removes touch-drag stepping); shooter views track the raw aim exactly so the crosshair stays true
    if(!st.sInit){st.sy=S.yaw;st.sp=S.pitch;st.sInit=true}
    const ks=1-Math.exp(-dt*(22+400*Math.max(st.fpsK,st.tpsK)));st.sy+=(S.yaw-st.sy)*ks;st.sp+=(S.pitch-st.sp)*ks;
    spring(st.dip,0,dt,14,.45);                                           // landing dip recovers by itself
    const yaw=st.sy+st.ky.x,pit=st.sp-st.kp.x;                            // positive S.pitch looks DOWN; kick lifts the muzzle
    const sY=Math.sin(yaw),cY=Math.cos(yaw),sP=Math.sin(pit),cP=Math.cos(pit);
    _f.set(-sY*cP,-sP,-cY*cP);

    // ---- orbit / shoulder camera ----
    const d=9+2.4*st.boost-5.4*st.tpsK+5*dk,sh=1.2*st.tpsK,shx=Math.cos(yaw)*sh,shz=-Math.sin(yaw)*sh;
    const lag=fly?Math.min(2.2,st.spd*.03):Math.min(.7,st.spd*.045),lx=st.spd>.1?-st.vx/st.spd*lag:0,lz=st.spd>.1?-st.vz/st.spd*lag:0;  // chase-cam trails at speed
    const ay=st.ay+1.6+.4*st.tpsK;
    _p.set(S.x+lx-_f.x*d+shx,ay-_f.y*d,S.z+lz-_f.z*d+shz);
    _l.set(S.x+shx,st.ay+1.4+.2*st.tpsK+st.dip.x*.6,S.z+shz);
    _p.y+=st.dip.x;
    _p.y=Math.max(_p.y,ground(_p.x,_p.z,_l.y)+.8);
    // obstruction: pull the camera in so it never ends up inside a house/rock or under the ground; snaps in fast, eases back out slowly
    const free=st.fpsK<.01?armFree(_l,_p):1;st.arm+=(free-st.arm)*(free<st.arm?1:1-Math.exp(-2.4*dt));
    if(st.arm<.999)_p.lerpVectors(_l,_p,st.arm);

    // ---- first-person: blend position to the eye, look straight along the view direction ----
    if(st.fpsK>.001){
      eye(dt,_f,_h);
      _p.lerp(_h,st.fpsK);
      _l.lerp(_b.copy(_h).addScaledVector(_f,10),st.fpsK);
    }else st.eInit=false;
    me.visible=st.fpsK<.55;                                               // own body is hidden in first person

    // ---- flight feel: banking, buffet ----
    spring(st.roll,clamp(-st.turn*.045*(st.cruise*.6+st.boost),-.14,.14)*(1-.35*st.fpsK),dt,5,.8);
    const buf=st.boost*(1-.5*st.fpsK)*(1-dk);
    if(buf>.02){_p.x+=(Math.sin(st.t*31)+Math.sin(st.t*47+1.3))*.012*buf;_p.y+=Math.sin(st.t*37+.4)*.012*buf}
    camera.position.copy(_p);camera.lookAt(_l);camera.rotateZ(st.roll.x);
    if(buf>.02)camera.rotateX(Math.sin(st.t*29)*.003*buf);

    // ---- FOV: speed widens it, first-person trims a little ----
    const gf=clamp((st.spd-5.5)/7,0,1);                                   // ground sprint: a touch wider
    const tf=(fly?66+14*st.cruise+18*st.boost*(1-.6*dk)+6*dk:(S.gboost>0?80:65+4.5*gf))-4*st.fpsK;
    if(Math.abs(camera.fov-tf)>.05){camera.fov+=(tf-camera.fov)*Math.min(1,dt*4.5);camera.updateProjectionMatrix()}
  }

  return {
    update,
    setShooter(b){st.shooter=!!b},                      // a weapon is out: use the shooter view (fps or tps)
    setView(v){st.view=v==='tps'?'tps':'fps'},
    toggleView(){st.view=st.view==='fps'?'tps':'fps';return st.view},
    view:()=>st.view,
    isFPS:()=>st.fpsK>.5,
    shooterActive:()=>st.shooter,
    pitchRange:()=>st.fpsK>.5||(st.shooter&&st.view==='fps')?[-1.45,1.45]:[.05,1.2],   // can look straight up/down in first person
    neutralPitch:()=>(st.fpsK>.5||(st.shooter&&st.view==='fps'))?0:.4,                  // the pitch that means "level" for flight climb/dive
    kick(p,y){st.kp.v+=p*40;st.ky.v+=(y||0)*40},
    land(imp){st.dip.v-=Math.min(4,Math.max(0,(imp-4)*.22))},   // landing impact: a short downward dip of the view (imp = fall speed in m/s)        // recoil impulse in radians of peak rotation
    speedFrac:()=>({cruise:st.cruise,boost:st.boost}),
    speed:()=>st.spd
  };
})();
