// WARDEN: The Warden Isles data + terrain function. Pure (no THREE/DOM). Needs WRD (src/data/islands.js) and sstep (src/utils/math.js) at call time.
// Local coordinates (wx,wz) are metres from the isle centre WRD.x,WRD.z. The arena is a flat circular courtyard enclosed by a stone wall with ONE gate facing +z (south, toward the landing beach).
const WARDEN={
  plateauY:3.4,
  wallR:37,wallCr:2,wallStep:3.6,   // wall = ring of circles r=2 centred 37 m out; inner face at 35 m => the fighting rim
  arenaR:35,
  gateAng:0,gateSkip:.15,           // direction (sin a, cos a) = +z; circles within gateSkip rad of it are omitted => ~10 m gap
  pillars:[{a:Math.PI/4,d:16,r:1.2},{a:3*Math.PI/4,d:16,r:1.2},{a:5*Math.PI/4,d:16,r:1.2},{a:7*Math.PI/4,d:16,r:1.2}],
  landing:{x:0,z:120,r:30},         // where "Travel" drops you (dry land south of the arena)
};
// terrain height of the isle (blended into H() by the WARDEN block in index.html)
function WardenH(wx,wz){
  const d=Math.hypot(wx,wz),R=WRD.R,base=Math.max(-12,(1-(d/R)**2)*4-.6),t=1-sstep(40,58,d);
  let h=base+(Math.sin(wx*.07)*Math.cos(wz*.09)*.9+Math.sin(wx*.19+wz*.13)*.35)*(1-t);
  h+=13*Math.exp(-((wx-95)**2+(wz+70)**2)/1800)+9*Math.exp(-((wx+85)**2+(wz+95)**2)/1300);   // two dark crags behind the arena
  return h*(1-t)+WARDEN.plateauY*t}
// every solid circle the isle adds (world coordinates): wall ring + pillars. WardenIsles pushes exactly these into `solids`; tests compare.
function WardenSolids(){
  const o=[],W=WARDEN,n=Math.round(2*Math.PI*W.wallR/W.wallStep);
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2;let g=Math.abs(((a-W.gateAng)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI);if(g<W.gateSkip)continue;
    o.push({x:WRD.x+Math.sin(a)*W.wallR,z:WRD.z+Math.cos(a)*W.wallR,r:W.wallCr,wall:true})}
  for(const p of W.pillars)o.push({x:WRD.x+Math.sin(p.a)*p.d,z:WRD.z+Math.cos(p.a)*p.d,r:p.r,pillar:true});
  return o}
