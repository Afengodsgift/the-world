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
  const st={bias:0,biasT:0,sInit:false,sy:0,sp:0,arm:1,dip:{x:0,v:0},view:'tps',shooter:false,zoom:1,zk:1,scopeFps:false,fpsK:0,tpsK:0,ay:0,init:false,px:0,pz:0,vx:0,vz:0,spd:0,hd:0,turn:0,
            roll:{x:0,v:0},kp:{x:0,v:0},ky:{x:0,v:0},t:0,bob:0,eye:new THREE.Vector3(),eInit:false,prevFps:false,cruise:0,boost:0,fw:0,py:0,vyn:0,prevTps:false,camD:9,shk:1,ship:null,shipK:0,eyeK:0,eyeV:new THREE.Vector3(),pr:null};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),TPS_P=[-.95,1.25];
  const _u=new THREE.Vector3(),_f=new THREE.Vector3(),_p=new THREE.Vector3(),_l=new THREE.Vector3(),_h=new THREE.Vector3(),_a=new THREE.Vector3(),_b=new THREE.Vector3();
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
  // Oriented boxes the shooter camera must not enter (buildings: a circle cannot cover a box's corners). Registered by islands via addBlocker(); empty = no effect anywhere else.
  // {x,z,hw,hd,ry,y0,top}: centre, half extents, yaw (three's Y rotation), bottom and top height.
  const blockers=[],_nb=[];
  const inBox=(b,x,y,z,m)=>{if(y>b.top+m||y<b.y0-m)return false;const dx=x-b.x,dz=z-b.z,lx=dx*b.c-dz*b.s,lz=dx*b.s+dz*b.c;return lx>-b.hw-m&&lx<b.hw+m&&lz>-b.hd-m&&lz<b.hd+m};
  const _near=[];
  // fraction (0.15..1) of the arm from target a to desired camera b that is free of ground and solid obstacles
  function armFree(a,b){
    const len=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);if(len<.01)return 1;
    _near.length=0;
    if(typeof solids!=='undefined')for(let i=0;i<solids.length&&_near.length<24;i++){const c=solids[i];     // thin trunks are ignored: only houses, rocks, props and the like
      if(c.r<1||c.noSide)continue;const dx=c.x-a.x,dz=c.z-a.z;if(dx*dx+dz*dz<(c.r+len+1)**2)_near.push(c)}
    _nb.length=0;for(let i=0;i<blockers.length;i++){const k=blockers[i],r=Math.hypot(k.hw,k.hd)+len+1,dx=k.x-a.x,dz=k.z-a.z;if(dx*dx+dz*dz<r*r)_nb.push(k)}
    const N=_nb.length?20:12;
    for(let i=1;i<=N;i++){const t=i/N,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,z=a.z+(b.z-a.z)*t;
      if(y<ground(x,z,a.y)+.55)return Math.max(.15,t-1.5/N);
      for(let k=0;k<_nb.length;k++)if(inBox(_nb[k],x,y,z,.4))return Math.max(.12,t-2/N);
      for(let k=0;k<_near.length;k++){const c=_near[k],dx=x-c.x,dz=z-c.z,top=c.h!==undefined?c.h:H(c.x,c.z)+9;
        if(dx*dx+dz*dz<(c.r+.25)**2&&y<top)return Math.max(.15,t-1.5/N)}}
    if(typeof Decks!=='undefined'&&Decks.rayBlock){const t=Decks.rayBlock(a.x,a.y,a.z,b.x,b.y,b.z);if(t<1)return Math.max(.2,t-1.2/N)}   // cabins / castles / masts of any ship you stand on
    return 1;
  }

  // how much of the shoulder offset (sx,sz from the head at height y) is free of buildings / props: the pivot must never be pushed into a wall by standing flush against it
  function sideFree(x,y,z,sx,sz){
    for(let k=0;k<blockers.length;k++){const b=blockers[k];for(let i=1;i<=4;i++){const t=i/4;if(inBox(b,x+sx*t,y,z+sz*t,.45))return Math.max(0,(i-1)/4-.05)}}
    if(typeof solids!=='undefined')for(let k=0;k<solids.length;k++){const c=solids[k];if(c.r<1||c.noSide)continue;const top=c.h!==undefined?c.h:H(c.x,c.z)+9;if(y>=top)continue;
      for(let i=1;i<=4;i++){const t=i/4,dx=x+sx*t-c.x,dz=z+sz*t-c.z;if(dx*dx+dz*dz<(c.r+.45)**2)return Math.max(0,(i-1)/4-.05)}}
    return 1}
  function update(dt){
    st.t+=dt;
    if(!st.init){st.ay=S.y;st.py=S.y;st.px=S.x;st.pz=S.z;st.init=true}
    st.fw+=((S.flying?1:0)-st.fw)*(1-Math.exp(-8*dt));                    // 0 on the ground .. 1 flying: every flight-camera change below is blended by this
    const rr0=Math.hypot(S.x,S.z),ymm=typeof SpaceFlight!=='undefined'?SpaceFlight.moveMul(S.y,rr0):1;
    st.ay+=(S.y-st.ay)*(1-Math.exp(-(6+70*st.fw)*dt*ymm));   // height follow: soft on the ground (hides landing steps), stiff in flight so a fast climb keeps the character framed (lag = v/k)

    // ---- motion estimate: smoothed horizontal velocity, speed and turn rate ----
    const di=Math.max(dt,.001),k=1-Math.exp(-7*dt);
    const dk=typeof Space!=='undefined'?Space.f.dark:0,mm=typeof SpaceFlight!=='undefined'?SpaceFlight.moveMulH(S.y,rr0):1;   // altitude: openness + normalised sideways speed
    st.vx+=((S.x-st.px)/di/mm-st.vx)*k;st.vz+=((S.z-st.pz)/di/mm-st.vz)*k;st.px=S.x;st.pz=S.z;
    st.spd=Math.hypot(st.vx,st.vz);
    st.vyn+=(((S.y-st.py)/di/ymm)-st.vyn)*k;st.py=S.y;                   // smoothed vertical speed (normalised like the horizontal one)
    const sp3=Math.hypot(st.spd,st.vyn);                                  // total flight speed: straight up is as fast as straight ahead
    if(st.spd>3){const h=Math.atan2(st.vx,st.vz);let d=h-st.hd;d=Math.atan2(Math.sin(d),Math.cos(d));st.turn+=(clamp(d/di,-4,4)-st.turn)*Math.min(1,dt*6);st.hd=h}
    else st.turn*=1-Math.min(1,dt*6);
    const fly=!!S.flying;
    st.cruise=fly?clamp(sp3/34,0,1):0;st.boost=fly?sstep(40,66,sp3):0;

    // ---- mode blends ----
    const wantFps=st.shooter&&(st.view==='fps'||st.scopeFps),wantTps=st.shooter&&st.view==='tps'&&!st.scopeFps;
    // Pitch is only reset when entering / leaving the shooter views. Switching between first person, shoulder view and the sniper lens KEEPS the aim: the old code reset it on
    // every switch (to 0.4 = looking down), so scoping or pressing the view button threw your aim at the floor.
    {const sh=wantFps||wantTps,psh=st.prevFps||st.prevTps;
     if(sh&&!psh)S.pitch=wantFps?.02:.12;                                 // entering from the chase camera: start near level so the targets are in front of you
     else if(!sh&&psh)S.pitch=.4;                                         // leaving: the usual chase angle
     st.prevFps=wantFps;st.prevTps=wantTps}
    st.fpsK+=((wantFps?1:0)-st.fpsK)*(1-Math.exp(-10*dt));
    st.tpsK+=((wantTps?1:0)-st.tpsK)*(1-Math.exp(-8*dt));
    st.bias+=(st.biasT-st.bias)*(1-Math.exp(-3*dt));                        // extra orbit distance (e.g. aboard a ship)
    spring(st.kp,0,dt,18,.5);spring(st.ky,0,dt,18,.5);                    // recoil kick recovers by itself

    // ---- view direction (what the player is looking along) ----
    // third-person look is eased (removes touch-drag stepping); shooter views track the raw aim exactly so the crosshair stays true
    {const pr=st.eyeK>.3&&st.pr?st.pr:(st.fpsK>.5||(st.shooter&&st.view==='fps'))?[-1.45,1.45]:st.shooter&&!S.flying?TPS_P:(S.flying?[-1.35,1.5]:[.05,1.2]);   // shoulder view: the SAME range pitchRange() gives the drag (it used to be clamped to >= .05 here, so you could never aim above the horizon in third person)
    S.pitch=Math.max(pr[0],Math.min(pr[1],S.pitch))}   // landing from a steep look-up: ease back into the chase range
    if(!st.sInit){st.sy=S.yaw;st.sp=S.pitch;st.sInit=true}
    const ks=1-Math.exp(-dt*(22+400*Math.max(st.fpsK,st.tpsK)));st.sy+=Math.atan2(Math.sin(S.yaw-st.sy),Math.cos(S.yaw-st.sy))*ks;st.sp+=(S.pitch-st.sp)*ks;
    spring(st.dip,0,dt,14,.45);                                           // landing dip recovers by itself
    const yaw=st.sy+st.ky.x,pit=st.sp-st.kp.x;                            // positive S.pitch looks DOWN; kick lifts the muzzle
    const sY=Math.sin(yaw),cY=Math.cos(yaw),sP=Math.sin(pit),cP=Math.cos(pit);
    _f.set(-sY*cP,-sP,-cY*cP);

    // ---- orbit / shoulder camera ----
    // Flight camera (blended by fe, so the ground camera is untouched): a close chase camera, tighter than walking, that pulls in further as you look up
    // (the sky ahead matters, not the view of your feet), pivots about the chest, and is raised along the camera's own up axis so the character sits low
    // in the frame with the space you're heading into above it (Cinemachine's 'vertical arm'). Trails slightly along the full 3D velocity.
    const fe=st.fw*(1-st.tpsK)*(1-st.fpsK),el=clamp(-pit,-1.2,1.2);       // el > 0 = looking up
    const dGround=9+2.4*st.boost-4.9*st.tpsK+5*dk;
    const bvw=typeof Boost!=='undefined'?Boost.view:{charge:0,burst:0};                                   // charged boost: move in while charging, pull back on the burst
    const dFly=Math.max(2.6,4.6+1.0*st.boost+1.0*dk-(el>0?1.2*el/1.2:.6*el/1.2)-1.1*bvw.charge+1.4*bvw.burst);       // 3.4 m looking straight up .. 5.2 m looking down at the world (walking is 9 m)
    const d=dGround+(dFly-dGround)*fe+st.bias*(1-st.fpsK);
    // ship camera (Ship.js feeds setShip): a long, high boom swung around the vessel instead of the avatar: aboard it widens the view a lot, at the helm it frames the whole ship + the sea ahead
    st.shipK+=(((st.ship&&!st.shooter)?1:0)-st.shipK)*(1-Math.exp(-2.6*dt));const sk=st.shipK,sh0=st.ship||{x:S.x,y:S.y,z:S.z,d:d,pk:0};
    const dd=d+(sh0.d-d)*sk,mix=sk*sh0.pk;
    if(st.tpsK>.01){const hy=st.ay+1.6,tk=sideFree(S.x,hy,S.z,Math.cos(yaw),-Math.sin(yaw));st.shk+=(tk-st.shk)*(tk<st.shk?1:1-Math.exp(-4*dt))}else st.shk=1;   // shoulder offset shrinks against walls (snaps in, eases out)
    const sh=1.0*st.tpsK*st.shk,shx=Math.cos(yaw)*sh,shz=-Math.sin(yaw)*sh;
    const lagG=Math.min(.7,st.spd*.045)*(1-.85*st.tpsK),lagF=Math.min(.6,sp3*.008),lag=lagG+(lagF-lagG)*fe;
    const lx=st.spd>.1?-st.vx/st.spd*lag*(1-fe):0,lz=st.spd>.1?-st.vz/st.spd*lag*(1-fe):0;   // ground: horizontal trail (unchanged)
    const ay=st.ay+1.6+.4*st.tpsK;
    _p.set(S.x+lx-_f.x*d+shx,ay-_f.y*d,S.z+lz-_f.z*d+shz);
    _l.set(S.x+shx,st.ay+1.4+.2*st.tpsK+st.dip.x*.6,S.z+shz);
    if(sk>.001){const qx=(sh0.x-S.x)*mix,qz=(sh0.z-S.z)*mix,qy=(sh0.y-st.ay)*mix;_l.x+=qx;_l.z+=qz;_l.y+=qy;_p.x+=qx-_f.x*(dd-d);_p.z+=qz-_f.z*(dd-d);_p.y+=qy-_f.y*(dd-d)+(sh0.lift===undefined?3:sh0.lift)*sk}   // pivot toward the ship, boom longer, a little higher
    if(fe>.001){
      if(sp3>.5){const kk=-lag*fe/sp3;_p.x+=st.vx*kk;_p.y+=st.vyn*kk;_p.z+=st.vz*kk}               // flight trail along the 3D velocity
      _u.set(0,1,0).addScaledVector(_f,-_f.y).normalize();                                          // camera 'up' (world up made perpendicular to the view)
      const h=d*fe*(.14+.14*Math.max(0,el)/1.2);_p.addScaledVector(_u,h);_l.addScaledVector(_u,h);  // raise camera + target together: same view direction, character lower in frame
    }
    _p.y+=st.dip.x;
    {const gm=ground(_p.x,_p.z,_l.y)+.8;if(_p.y<gm)_p.y+=(gm-_p.y)*(1-st.tpsK)}   // chase camera: lift it off the ground; shoulder view: do NOT bend the view direction, armFree() pulls the camera in along the line of sight instead
    // obstruction: pull the camera in so it never ends up inside a house/rock or under the ground; snaps in fast, eases back out slowly
    let free=st.fpsK<.01?armFree(_l,_p):1;free+=(1-free)*Math.min(1,sk*1.6)*(st.ship&&st.ship.block?0:1);st.arm+=(free-st.arm)*(free<st.arm?1:1-Math.exp(-(2.4+2.2*st.tpsK)*dt));
    if(st.arm<.999)_p.lerpVectors(_l,_p,st.arm);

    // ---- first-person: blend position to the eye, look straight along the view direction ----
    if(st.fpsK>.001){
      eye(dt,_f,_h);
      _p.lerp(_h,st.fpsK);
      _l.lerp(_b.copy(_h).addScaledVector(_f,10),st.fpsK);
    }else st.eInit=false;
    {const ev=st.ship&&st.ship.eye;if(ev){st.eyeV.set(ev.x,ev.y,ev.z);st.pr=st.ship.pr||[-.9,.9]}
     st.eyeK+=((ev&&!st.shooter?1:0)-st.eyeK)*(1-Math.exp(-5*dt));
     if(st.eyeK>.002){_p.lerp(st.eyeV,st.eyeK);_b.copy(st.eyeV).addScaledVector(_f,12);_l.lerp(_b,st.eyeK)}}   // a ship's eye anchor (captain's view, a gunner's view): the camera sits ON the anchor and looks along the drag direction
    if(sk>.001&&st.eyeK<.5&&_p.y<2.2)_p.y=2.2+(_p.y-2.2)*.0;   // never under the waves
    st.camD=st.arm*d;me.visible=st.fpsK<.55&&st.eyeK<.5&&!(st.tpsK>.3&&st.camD<1.0);                                               // own body is hidden in first person

    // ---- flight feel: banking, buffet ----
    spring(st.roll,clamp(-st.turn*.045*(st.cruise*.6+st.boost),-.14,.14)*(1-.35*st.fpsK),dt,5,.8);
    const buf=st.boost*(1-.5*st.fpsK)*(1-dk);
    if(buf>.02){_p.x+=(Math.sin(st.t*31)+Math.sin(st.t*47+1.3))*.012*buf;_p.y+=Math.sin(st.t*37+.4)*.012*buf}
    if(st.shakeA>.002){const a=st.shakeA;_p.x+=(Math.sin(st.t*53)+Math.sin(st.t*91+1.1))*.09*a;_p.y+=Math.sin(st.t*67+.4)*.09*a;_p.z+=(Math.sin(st.t*47+2.1))*.09*a;st.shakeA*=Math.exp(-5.5*dt)}else st.shakeA=0;   // hit / recoil shake (CameraRig.shake)
    camera.position.copy(_p);camera.lookAt(_l);camera.rotateZ(st.roll.x);
    if(buf>.02)camera.rotateX(Math.sin(st.t*29)*.003*buf);

    // ---- FOV: speed widens it, first-person trims a little ----
    const gf=clamp((st.spd-5.5)/7,0,1);                                   // ground sprint: a touch wider
    st.zk+=(st.zoom-st.zk)*(1-Math.exp(-11*dt));   // scope zoom eases in/out
    let tf=(fly?Math.min(90,66+10*st.cruise+13*st.boost*(1-.6*dk)+4*dk+7*(typeof Boost!=='undefined'?Boost.view.burst:0)-4*(typeof Boost!=='undefined'?Boost.view.charge:0)):(S.gboost>0?80:65+4.5*gf))-4*st.fpsK+3*st.tpsK+5*st.shipK;   // combat camera is a touch wider; the ship camera wider still
    if(st.zk>1.002)tf=Scope.fov(tf,st.zk);
    if(Math.abs(camera.fov-tf)>.05){camera.fov+=(tf-camera.fov)*Math.min(1,dt*((st.zk>1.002||st.zoom>1)?12:4.5));camera.updateProjectionMatrix()}
  }

  return {
    update,
    shake(a){st.shakeA=Math.min(1.6,Math.max(st.shakeA||0,a||0))},          // 0..1.6: a short camera shudder that dies away (ship hits, cannon recoil)
    addBlocker(b){const k={x:b.x,z:b.z,hw:b.hw,hd:b.hd,y0:b.y0,top:b.top,c:Math.cos(b.ry||0),s:Math.sin(b.ry||0)};blockers.push(k);return k},clearBlockers(){blockers.length=0},blockerCount:()=>blockers.length,inBox,
    setShooter(b){st.shooter=!!b},                      // a weapon is out: use the shooter view (fps or tps)
    setBias(m){st.biasT=m||0},
    setShip(o){st.ship=o||null},                            // {x,y,z,d,pk}: swing the orbit camera around a ship (pivot blend pk 0..1, boom length d); null = back to the avatar
    shipK:()=>st.shipK,                          // pull the orbit camera back by m metres (smoothly), e.g. when aboard a ship
    setZoom(z,fps){st.zoom=Math.max(1,z||1);st.scopeFps=!!fps&&st.zoom>1},   // scope: zoom factor, and force first person for the sniper lens view
    zoom:()=>st.zk,
    setView(v){st.view=v==='tps'?'tps':'fps'},
    toggleView(){st.view=st.view==='fps'?'tps':'fps';return st.view},
    view:()=>st.view,
    isFPS:()=>st.fpsK>.5,
    eyeK:()=>st.eyeK,
    shooterActive:()=>st.shooter,
    pitchRange:()=>st.eyeK>.3&&st.pr?st.pr:st.fpsK>.5||(st.shooter&&(st.view==='fps'||st.scopeFps))?[-1.45,1.45]:st.shooter?TPS_P:(S.flying?[-1.35,1.5]:S.dv?[-.75,1.2]:[.05,1.2]),   // first person: straight up/down; flying in third person: look well above/below the horizon too (to climb straight up)
    neutralPitch:()=>(st.fpsK>.5||(st.shooter&&(st.view==='fps'||st.scopeFps)))?0:.4,                  // the pitch that means "level" for flight climb/dive
    kick(p,y){st.kp.v+=p*40;st.ky.v+=(y||0)*40},
    land(imp){st.dip.v-=Math.min(4,Math.max(0,(imp-4)*.22))},   // landing impact: a short downward dip of the view (imp = fall speed in m/s)        // recoil impulse in radians of peak rotation
    speedFrac:()=>{const b=typeof Boost!=='undefined'?Boost.view:null;return {cruise:st.cruise,boost:b?Math.min(1.3,st.boost+b.burst*.6):st.boost,charge:b?b.charge:0}},
    speed:()=>st.spd
  };
})();
