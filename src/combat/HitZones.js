// HitZones: spatial hit detection for Outlaw. Pure maths (no THREE/DOM) so it is unit-tested on its own (tests/hitzones.sim.js).
// A shot asks "WHAT PART of the raider did the ray hit, and is that part actually visible from the shooter?":
//   1. every raider has six lightweight invisible volumes (head, torso, 2 arms, 2 legs), sized in units of the raider's scale and rotated with its heading;
//   2. cover is a cylinder with a real HEIGHT (cover entries {x,z,r,y,h}; h undefined = unlimited, e.g. buildings), so a shot that passes over a crate can hit a
//      head that sticks out above it, while the same ray lower down is blocked;
//   3. the shot's nearest hit wins: the first volume the ray reaches before it reaches any cover decides the zone (and so the damage).
// Damage = weapon damage x zone multiplier (arms/legs reduced; head multiplier per weapon class, softer on heavy raiders). No per-weapon hard-coding beyond HEAD.
const HitZones=(()=>{
  // [zone, ax,ay,az, bx,by,bz, radius] in the raider's local frame, x scale (a == b is a sphere). Slightly generous for thumbs on a phone.
  const Z=[
    ['head', 0,1.62,.02, 0,1.62,.02, .2],
    ['torso',0,1.0,0,    0,1.42,0,   .27],
    ['arm',  .37,1.4,0,  .41,.98,.06,.1],
    ['arm', -.37,1.4,0, -.41,.98,.06,.1],
    ['leg',  .12,.9,0,   .12,.08,0,  .14],
    ['leg', -.12,.9,0,  -.12,.08,0,  .14]];
  const BODY={y:1.0,r:1.25}; // broad phase sphere (x scale)
  const MULT={torso:1,arm:.6,leg:.65};
  const HEAD={pistol:2.2,smg:1.6,rifle:2,shotgun:1.5,sniper:3.5};   // headshot multiplier per weapon class (WEAPONS[].snd)
  const headMult=(snd,hs,critLvl)=>(HEAD[snd]||2)*(hs===undefined?1:hs)*(1+.06*(critLvl||0));
  const zoneMult=(zone,snd,hs,critLvl)=>zone==='head'?headMult(snd,hs,critLvl):(MULT[zone]||1);

  function raySphere(ox,oy,oz,dx,dy,dz,cx,cy,cz,r){
    const lx=cx-ox,ly=cy-oy,lz=cz-oz,tca=lx*dx+ly*dy+lz*dz;if(tca<0&&lx*lx+ly*ly+lz*lz>r*r)return null;
    const d2=lx*lx+ly*ly+lz*lz-tca*tca;if(d2>r*r)return null;const th=Math.sqrt(r*r-d2),t=tca-th;return t>0?t:(tca+th>0?0:null)}
  // ray (unit d) vs capsule a-b radius r -> t or null (after Inigo Quilez)
  function rayCapsule(ox,oy,oz,dx,dy,dz,ax,ay,az,bx,by,bz,r){
    const bax=bx-ax,bay=by-ay,baz=bz-az,oax=ox-ax,oay=oy-ay,oaz=oz-az,baba=bax*bax+bay*bay+baz*baz;
    if(baba<1e-9)return raySphere(ox,oy,oz,dx,dy,dz,ax,ay,az,r);
    const bard=bax*dx+bay*dy+baz*dz,baoa=bax*oax+bay*oay+baz*oaz,rdoa=dx*oax+dy*oay+dz*oaz,oaoa=oax*oax+oay*oay+oaz*oaz;
    const a=baba-bard*bard,b=baba*rdoa-baoa*bard,c=baba*oaoa-baoa*baoa-r*r*baba;
    if(a>1e-9){const h=b*b-a*c;if(h>=0){const t=(-b-Math.sqrt(h))/a,y=baoa+t*bard;if(y>0&&y<baba&&t>0)return t;
      const cx=y<=0?ax:bx,cy=y<=0?ay:by,cz=y<=0?az:bz;return raySphere(ox,oy,oz,dx,dy,dz,cx,cy,cz,r)}return null}
    // ray parallel to the axis: only the end caps can be hit
    const t1=raySphere(ox,oy,oz,dx,dy,dz,ax,ay,az,r),t2=raySphere(ox,oy,oz,dx,dy,dz,bx,by,bz,r);
    return t1===null?t2:t2===null?t1:Math.min(t1,t2)}
  // local -> world for a raider at (px,py,pz) facing ry (rotation about y), scale sc
  const toW=(px,py,pz,ry,sc,x,y,z)=>{const c=Math.cos(ry),s=Math.sin(ry);return [px+(x*c+z*s)*sc,py+y*sc,pz+(-x*s+z*c)*sc]};
  function volumes(px,py,pz,ry,sc){return Z.map(v=>({zone:v[0],a:toW(px,py,pz,ry,sc,v[1],v[2],v[3]),b:toW(px,py,pz,ry,sc,v[4],v[5],v[6]),r:v[7]*sc}))}
  // nearest zone hit by ray (o,d unit) within max, or null. grow: extra radius per metre of range (helps small targets far away on a phone), capped.
  function hit(ox,oy,oz,dx,dy,dz,max,px,py,pz,ry,sc,grow){
    const bd=Math.hypot(px-ox,pz-oz),g=Math.min(.3,bd*(grow===undefined?.004:grow));
    if(raySphere(ox,oy,oz,dx,dy,dz,px,py+BODY.y*sc,pz,BODY.r*sc+g)===null)return null;
    let best=max,zone=null;
    for(const v of Z){const a=toW(px,py,pz,ry,sc,v[1],v[2],v[3]),b=toW(px,py,pz,ry,sc,v[4],v[5],v[6]),t=rayCapsule(ox,oy,oz,dx,dy,dz,a[0],a[1],a[2],b[0],b[1],b[2],v[7]*sc+g);
      if(t!==null&&t<best){best=t;zone=v[0]}}
    return zone?{t:best,zone}:null}
  // nearest cover cylinder along the ray -> {t,c}. A ray that starts inside a cover circle ignores it (you can stand right next to a crate).
  function coverT(o,d,max,cover){
    let best=max,hit=null;const a=d.x*d.x+d.z*d.z;if(a<1e-8)return {t:best,c:null};
    for(const c of cover){const fx=o.x-c.x,fz=o.z-c.z,b=fx*d.x+fz*d.z,k=fx*fx+fz*fz-c.r*c.r,D=b*b-a*k;if(D<0)continue;
      const sq=Math.sqrt(D),t0=(-b-sq)/a;if(t0<=0||t0>=best)continue;
      if(c.h!==undefined){const t1=(-b+sq)/a,y0=o.y+d.y*t0,y1=o.y+d.y*t1,top=c.y+c.h;if(Math.min(y0,y1)>=top||Math.max(y0,y1)<=c.y-.3)continue} // passes over (or under) it
      best=t0;hit=c}
    return {t:best,c:hit}}
  return {hit,coverT,rayCapsule,volumes,zoneMult,headMult,HEAD,MULT};
})();
