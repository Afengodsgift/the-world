// FlightPose: procedural superhero flight for any avatar (you, your partner, NPCs).
//
// Design (from the Superman references):
//   HOVER   upright, arms away from the body with soft bends, legs together with pointed toes, slow breathing float.
//   CRUISE  near-horizontal with a head-up arch: one arm leads, the other is folded (fist at the ribs), legs together, one knee bent.
//   BOOST   steeper lean, both arms driven forward, head tucked in line, legs long: a spear silhouette.
// The three poses are blended by smoothed speed (so hover -> takeoff -> cruise -> boost and back are continuous, never a swap).
// Body pitch/roll are damped springs: they overshoot a little on takeoff (anticipation) and flare back when braking.
//
// It runs AFTER the baked clip's mixer.update() and overrides spine, head, arms, legs and the body's pitch about the hips.
// Inputs per frame: speed (m/s, smoothed), yawRate (rad/s). Vertical speed is measured from the avatar's own position.
// Globals used at runtime: THREE, aim() (index.html), sstep (utils/math.js).
const FlightPose=(()=>{
  const HIP=.62;                                   // hip height (m): the pivot the body pitches about
  const CRUISE=34,BOOST=70;                        // game flight speeds (m/s), for reference
  const _qb=new THREE.Quaternion(),_qg=new THREE.Quaternion(),_v=new THREE.Vector3();
  const N=(x,y,z)=>new THREE.Vector3(x,y,z).normalize();

  // ---- pose tables, in BODY space: +Y = toward the head, +Z = chest side, +X = the avatar's left ----
  // [upper, lower] direction pairs. Left = +1, right = -1 via s.
  const HOVER={ arm:s=>[N(s*.30,-1,.10),N(s*.18,-.80,.58)], leg:s=>[N(s*.07,-1,.03),N(s*.05,-1,-.14)], toe:N(0,-.80,.60) };
  const CRU={ lead:[N(.14,1,.06),N(.10,1,.02)], rear:[N(-.28,-.78,.10),N(-.12,.45,.70)],
              legL:[N(.03,-1,-.12),N(.02,-.96,-.30)], legR:[N(-.03,-1,-.12),N(-.02,-.80,-.55)], toe:N(0,-1,-.15) };
  const BST={ arm:s=>[N(s*.05,1,.04),N(s*.02,1,.03)], leg:s=>[N(s*.015,-1,-.06),N(s*.01,-1,-.10)], toe:N(0,-1,-.05) };
  // spine (Spine->Chest->UpperChest->Neck) segment directions: relaxed / arched (cruise) / straight & tucked (boost)
  const SPINE={ h:[N(0,1,.04),N(0,1,.03),N(0,1,.02)], c:[N(0,1,.02),N(0,1,-.10),N(0,1,-.16)], b:[N(0,1,.04),N(0,1,0),N(0,1,-.04)] };
  const HEAD_PITCH={h:0,c:.32,b:.50};              // head axis tilt from vertical (rad); the face looks along the flight path
  const BASE_PITCH={h:.05,c:1.40,b:1.52};          // body lean from vertical (rad)
  const BONES=['Spine','Chest','UpperChest','Neck','Head','LeftArm','LeftForeArm','RightArm','RightForeArm','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];

  function spring(s,target,dt,w,z){const a=w*w*(target-s.x)-2*z*w*s.v;s.v+=a*dt;s.x+=s.v*dt}
  const lerpTo=(cur,tgt,dt,up,down)=>cur+(tgt-cur)*Math.min(1,dt*(tgt>cur?up:down));
  const A=(B,a,b,d)=>{const p=B[a],c=B[b];if(p&&c)aim(p,c,d.normalize())};  // aim() needs a unit vector
  const mix3=(h,c,b,f,out)=>out.set(0,0,0).addScaledVector(h,f.wH).addScaledVector(c,f.wC).addScaledVector(b,f.wB).normalize();

  function state(q){
    return q.fl||(q.fl={fw:0,on:false,sp:0,a:0,wH:1,wC:0,wB:0,th:{x:0,v:0},ro:{x:0,v:0},t:Math.random()*20,vy:0,py:null,name:'hover',pitch:0,roll:0});
  }

  // Returns true while the flight pose owns the skeleton.
  function apply(g,q,dt,st,m){
    const f=state(q),fly=st==='fly';
    f.fw=lerpTo(f.fw,fly?1:0,dt,7,9);                                  // fade the pose in/out over ~0.15 s
    if(f.fw<.004){if(f.on){f.on=false;q.model.rotation.y=0;f.th.x=f.th.v=f.ro.x=f.ro.v=0;f.py=null}f.wH=1;f.wC=f.wB=0;return false}
    f.on=true;f.t+=dt;
    const spd=m.speed||0,B=q.bones;

    // ---- measured motion: vertical speed, acceleration ----
    if(f.py!==null&&dt>0)f.vy+=(((g.position.y-f.py)/dt/(typeof SpaceFlight!=='undefined'?SpaceFlight.moveMul(g.position.y):1))-f.vy)*Math.min(1,dt*5);f.py=g.position.y;
    const acc=(spd-f.sp)/Math.max(dt,.001);f.a+=(acc-f.a)*Math.min(1,dt*8);f.sp=spd;
    const elev=Math.atan2(f.vy,Math.max(spd,4));                       // climb (+) / dive (-) angle of the flight path

    // ---- pose weights: rise quickly, decay slowly (braking from boost should feel heavy) ----
    const tH=1-sstep(2,13,spd),tB=sstep(46,62,spd),tC=Math.max(0,1-tH-tB);
    f.wH=lerpTo(f.wH,tH,dt,6,3.2);f.wC=lerpTo(f.wC,tC,dt,6,3.6);f.wB=lerpTo(f.wB,tB,dt,5,2.4);
    const ws=f.wH+f.wC+f.wB||1;f.wH/=ws;f.wC/=ws;f.wB/=ws;
    f.name=f.wB>.5?'boost':f.wC>.5?'cruise':f.wH>.5?'hover':(f.a>1?'takeoff':'cruise');

    // ---- pitch: lean from vertical, spring-driven. Anticipation on takeoff, flare when braking, follows climb/dive ----
    let th=f.wH*BASE_PITCH.h+f.wC*BASE_PITCH.c+f.wB*BASE_PITCH.b;
    th-=elev*.75*(1-f.wH);                                              // climbing stands you up a little, diving lays you flat
    th+=Math.min(.15,Math.max(0,f.a*.004));                             // leaning into acceleration
    th-=Math.min(.35,Math.max(0,-f.a*.012))*(1-f.wH);                   // braking: flare back (head up)
    th=Math.max(0,Math.min(1.62,th));
    spring(f.th,th,dt,6.5,.58);                                         // underdamped: ~10% overshoot = intentional-looking takeoff
    const yr=m.yawRate||0;
    spring(f.ro,Math.max(-.7,Math.min(.7,-yr*.16))*(1-f.wH*.6),dt,5.5,.75); // bank into turns (less when hovering)

    // ---- idle life: hover breathing/sway, cruise roll, boost buffet ----
    const t=f.t,bob=Math.sin(t*2.4)*.035*f.wH;
    const swayP=Math.sin(t*1.7)*.035*f.wH,swayR=Math.sin(t*1.3+1)*.03*f.wH+Math.sin(t*1.1)*.02*f.wC+Math.sin(t*47)*.006*f.wB;
    const pitch=f.th.x+swayP,roll=f.ro.x+swayR;f.pitch=pitch;f.roll=roll;

    // ---- body transform: pitch about the hips (not the feet), blended with whatever the clip/pan-lunge had ----
    const w=f.fw,mdl=q.model,lunge=mdl.rotation.x;
    mdl.rotation.x=lunge*(1-w)+pitch*w;mdl.rotation.y=roll*w;
    mdl.position.y=(q.oy||0)+w*(HIP*(1-Math.cos(pitch))+bob);
    mdl.position.z=-w*HIP*Math.sin(pitch);
    mdl.updateMatrixWorld(true);mdl.getWorldQuaternion(_qb);g.getWorldQuaternion(_qg);

    // ---- skeleton: remember the clip's pose so we can cross-fade into ours ----
    const sv=w<.999?BONES.map(n=>B[n]&&B[n].quaternion.clone()):null;
    const Db=(v,out)=>out.copy(v).applyQuaternion(_qb);
    const dir=(h,c,b,out)=>Db(mix3(h,c,b,f,_v),out);
    const o1=new THREE.Vector3(),o2=new THREE.Vector3();

    // spine: gentle arch for cruise, straight for boost
    A(B,'Spine','Chest',dir(SPINE.h[0],SPINE.c[0],SPINE.b[0],o1).addScaledVector(o2.set(0,0,Math.sin(t*2.4)*.03).applyQuaternion(_qb),f.wH)); // breathing: a small nudge, NOT a normalized vector
    A(B,'Chest','UpperChest',dir(SPINE.h[1],SPINE.c[1],SPINE.b[1],o1));
    A(B,'UpperChest','Neck',dir(SPINE.h[2],SPINE.c[2],SPINE.b[2],o1));
    // arms (left leads in cruise, right folds)
    for(const s of [1,-1]){
      const n=s===1?'Left':'Right',ph=s===1?0:2.1,hv=HOVER.arm(s),bs=BST.arm(s);
      const cu=s===1?CRU.lead:CRU.rear;
      // hover drift keeps the hands alive
      const dU=hv[0].clone();dU.x+=Math.sin(t*1.1+ph)*.05*f.wH;dU.z+=Math.sin(t*.9+ph)*.04*f.wH;
      const dF=hv[1].clone();dF.z+=Math.sin(t*1.5+ph)*.05*f.wH;dF.y+=Math.sin(t*1.2+ph)*.03*f.wH;
      const cUp=cu[0].clone(),cFo=cu[1].clone();if(s===1){cUp.x+=Math.sin(t*1.6)*.02*f.wC}else{cFo.z+=Math.sin(t*2.1)*.04*f.wC}
      A(B,n+'Arm',n+'ForeArm',dir(dU,cUp,bs[0],o1));
      A(B,n+'ForeArm',n+'Hand',dir(dF,cFo,bs[1],o1));
    }
    // legs: dangle with knee variation when hovering, together and trailing when moving
    for(const s of [1,-1]){
      const n=s===1?'Left':'Right',ph=s===1?0:1.7,hl=HOVER.leg(s),bl=BST.leg(s),cl=s===1?CRU.legL:CRU.legR;
      const lU=hl[0].clone(),lL=hl[1].clone();lL.z-=(s===1?.10:.03)*(Math.sin(t*.7+ph)*.5+.5)*f.wH;lL.x+=Math.sin(t*1.2+ph)*.02*f.wH;
      const cL=cl[1].clone();cL.z+=Math.sin(t*2.4+ph)*.05*(f.wC+.4*f.wB);
      A(B,n+'UpLeg',n+'Leg',dir(lU,cl[0],bl[0],o1));
      A(B,n+'Leg',n+'Foot',dir(lL,cL,bl[1],o1));
      A(B,n+'Foot',n+'Toes',dir(HOVER.toe,CRU.toe,BST.toe,o1)); // toes pointed
    }
    // neck + head: the face looks along the flight path (absolute: relative to the upright avatar, not the leaning body)
    const hp=f.wH*HEAD_PITCH.h+f.wC*HEAD_PITCH.c+f.wB*HEAD_PITCH.b;
    A(B,'Neck','Head',_v.set(0,Math.cos(hp*.5),Math.sin(hp*.5)).applyQuaternion(_qg));
    const he=f.he||(f.he=q.model.getObjectByName('Head_end'));            // a plain leaf node, not a Bone, so it isn't in q.bones
    if(B.Head&&he)aim(B.Head,he,_v.set(0,Math.cos(hp),Math.sin(hp)).applyQuaternion(_qg).normalize());

    if(sv)BONES.forEach((n,i)=>{const b=B[n];if(b&&sv[i]){const tq=b.quaternion.clone();b.quaternion.copy(sv[i]).slerp(tq,w)}});
    mdl.updateMatrixWorld(true);
    return true;
  }

  return {apply,state,HIP,CRUISE,BOOST};
})();
