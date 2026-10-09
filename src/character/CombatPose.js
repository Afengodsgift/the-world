// CombatPose: strafing and backpedalling with a gun out, without strafe clips. While armed the whole body faces the AIM (Outlaw sets the heading), but the baked locomotion
// clips only run forward. So the legs are TWISTED to face the way you travel (hips yaw by the angle between aim and travel, clamped), the spine counter-rotates so the torso and
// arms stay on the aim, and when you move backwards the legs face forward and the clip plays in reverse (a backpedal). Works for the local player, the partner and raiders,
// since it only needs the avatar's position delta and heading. plan() is pure maths (tested in tests/combatpose.sim.js); twist() writes the bone rotations after the mixer update.
const CombatPose=(()=>{
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),MAXT=1.6;
  // q.cpT = current leg twist (rad), q.cpRev = playing the gait clip in reverse (backpedal)
  function plan(q,dt,mdx,mdz,v,fy,moving){
    if(!moving||v<.6){q.cpT=(q.cpT||0)*Math.max(0,1-dt*10);q.cpRev=false;return}
    const rel=wrap(Math.atan2(mdx,mdz)-fy),a=Math.abs(rel);
    if(q.cpRev){if(a<1.2)q.cpRev=false}else if(a>1.95)q.cpRev=true;      // hysteresis around 'sideways-back' so it doesn't flicker
    let target=q.cpRev?wrap(rel+(rel>0?-Math.PI:Math.PI)):rel;target=Math.max(-MAXT,Math.min(MAXT,target));
    q.cpT=wrap((q.cpT||0)+wrap(target-(q.cpT||0))*(1-Math.exp(-12*dt)))}
  const UP=new THREE.Vector3(0,1,0),qp=new THREE.Quaternion(),qd=new THREE.Quaternion(),qa=new THREE.Quaternion();
  function yawBone(b,ang){ // rotate a bone about the world vertical, whatever its local axes are:  local' = P^-1 * D * P * local
    if(!b||!b.parent)return;b.parent.updateWorldMatrix(true,false);b.parent.getWorldQuaternion(qp);qd.setFromAxisAngle(UP,ang);
    qa.copy(qp).invert().multiply(qd).multiply(qp);b.quaternion.premultiply(qa);b.updateMatrixWorld(true)}
  function twist(q){
    const t=q.cpT||0,B=q.bones;if(!B||Math.abs(t)<.01)return;
    yawBone(B.Hips,t);                       // pelvis + legs face the way of travel...
    yawBone(B.Spine,-t*.34);yawBone(B.Chest,-t*.33);yawBone(B.UpperChest,-t*.33);   // ...and the torso swings back onto the aim (sums to -t)
  }
  return {plan,twist,wrap};
})();
