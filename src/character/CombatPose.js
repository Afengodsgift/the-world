// CombatPose: strafing and backpedalling with a gun out, without strafe clips. While armed the whole body faces the AIM (Outlaw sets the heading), but the baked locomotion
// clips only run forward. So the legs are TWISTED to face the way you travel (hips yaw by the angle between aim and travel, clamped), the spine counter-rotates so the torso and
// arms stay on the aim, and when you move backwards the legs face forward and the clip plays in reverse (a backpedal). Works for the local player, the partner and raiders,
// since it only needs the avatar's position delta and heading. plan() is pure maths (tested in tests/combatpose.sim.js); twist() writes the bone rotations after the mixer update.
const CombatPose=(()=>{
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),MAXT=1.6;
  // q.cpT = current leg twist (rad), q.cpRev = playing the gait clip in reverse (backpedal). The travel direction is low-pass filtered (so network-smoothed/jittery
  // positions don't make the legs flutter), needs real sustained speed, and the twist can only change at a limited rate: no 'propeller legs'.
  function plan(q,dt,mdx,mdz,v,fy,moving){
    const k=1-Math.exp(-dt*9);q.cmx=(q.cmx||0)+((dt>0?mdx/dt:0)-(q.cmx||0))*k;q.cmz=(q.cmz||0)+((dt>0?mdz/dt:0)-(q.cmz||0))*k;
    const sp=Math.hypot(q.cmx,q.cmz);
    if(!moving||v<.8||sp<1.2){q.cpT=(q.cpT||0)*Math.max(0,1-dt*8);q.cpRev=false;return}
    const rel=wrap(Math.atan2(q.cmx,q.cmz)-fy),a=Math.abs(rel);
    if(q.cpRev){if(a<1.2)q.cpRev=false}else if(a>1.95)q.cpRev=true;      // hysteresis around 'sideways-back' so it doesn't flicker
    let target=q.cpRev?wrap(rel+(rel>0?-Math.PI:Math.PI)):rel;target=Math.max(-MAXT,Math.min(MAXT,target));
    const step=wrap(target-(q.cpT||0)),lim=5*dt;                         // at most ~5 rad/s
    q.cpT=wrap((q.cpT||0)+Math.max(-lim,Math.min(lim,step*(1-Math.exp(-10*dt)))))}
  const UP=new THREE.Vector3(0,1,0),qp=new THREE.Quaternion(),qd=new THREE.Quaternion(),qa=new THREE.Quaternion();
  function yawBone(b,ang){ // rotate a bone about the world vertical, whatever its local axes are:  local' = P^-1 * D * P * local
    if(!b||!b.parent)return;b.parent.updateWorldMatrix(true,false);b.parent.getWorldQuaternion(qp);qd.setFromAxisAngle(UP,ang);
    qa.copy(qp).invert().multiply(qd).multiply(qp);b.quaternion.premultiply(qa);b.updateMatrixWorld(true)}
  const BN=['Hips','Spine','Chest','UpperChest'];
  function untwist(q){ // put the bones back to what the animation gave us last frame, so a clip that doesn't key them can never make the twist accumulate
    if(!q.cpSaved)return;for(const [b,quat] of q.cpSaved)b.quaternion.copy(quat);q.cpSaved=null}
  function twist(q){
    const t=q.cpT||0,B=q.bones;if(!B||Math.abs(t)<.01)return;
    q.cpSaved=BN.filter(n=>B[n]).map(n=>[B[n],B[n].quaternion.clone()]);
    yawBone(B.Hips,t);                       // pelvis + legs face the way of travel...
    yawBone(B.Spine,-t*.34);yawBone(B.Chest,-t*.33);yawBone(B.UpperChest,-t*.33);   // ...and the torso swings back onto the aim (sums to -t)
  }
  return {plan,twist,untwist,wrap};
})();
