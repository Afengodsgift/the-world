// WARDEN: sword hit detection. Authored arc, not bones. Pure functions.
// The blade is a ray from the attacker along angle theta(u) (u = progress through the active phase) out to `reach`; each tick is tested in SUB=4 sub-steps so a fast blade cannot skip a thin hurtbox.
const SwordHit=(()=>{
  const SUB=4,TAU=Math.PI*2;
  const angd=(a,b)=>{let d=(a-b)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return Math.abs(d)};
  // is the segment a->b blocked by a solid circle (excluding circles that contain a, i.e. we are standing in/at it)?
  function segBlocked(ax,az,bx,bz,solids){
    if(!solids)return false;const dx=bx-ax,dz=bz-az,L2=dx*dx+dz*dz;
    for(const s of solids){if(!(s.r>0)||s.nb)continue;if((ax-s.x)**2+(az-s.z)**2<s.r*s.r)continue;
      let t=L2>0?((s.x-ax)*dx+(s.z-az)*dz)/L2:0;t=t<0?0:t>1?1:t;const px=ax+dx*t-s.x,pz=az+dz*t-s.z;if(px*px+pz*pz<s.r*s.r)return true}
    return false}
  // one tick of blade: returns true if the blade touches the target hurtbox circle during any sub-step
  // seg: {a0,a1} sweep offsets (rad, relative to facing), k: tick index in the active phase, n: ticks in the active phase
  function tickHits(a,facing,mv,seg,k,n,t,solids,ay,ty){
    if(Math.abs((ay||0)-(ty||0))>1.2)return false;                       // height band
    const dx=t.x-a.x,dz=t.z-a.z,dist=Math.hypot(dx,dz),rad=t.r||.45;
    if(dist>mv.reach+rad)return false;
    if(segBlocked(a.x,a.z,t.x,t.z,solids))return false;                  // pillars / walls stop the blade
    const bearing=Math.atan2(dx,dz),half=(mv.w||.12)+(dist>rad?Math.asin(Math.min(1,rad/dist)):Math.PI);
    for(let s=0;s<SUB;s++){const u=(k+(s+1)/SUB)/n,th=facing+seg.a0+(seg.a1-seg.a0)*u;if(angd(th,bearing)<=half)return true}
    return false}
  return{SUB,angd,segBlocked,tickHits}})();
