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
// DRESSING: deterministic prop placement for the isle outside the arena (pure; own seeded rng so the world's rng never shifts). Returns [{p:pieceName, x,y,z (world), ry, s, tx, tz}] - nothing here is solid, it is scenery.
// Pieces are the Modular Terrain Collection kit packed by tools/pack_terrain.js. Counts are the phone budget: ~13k tris for the whole isle, merged per 90 m cell by WardenIsles.
function WardenProps(){
  let a=0x5EED77;const r=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const W=WARDEN,L=[],pick=l=>l[Math.floor(r()*l.length)],put=(p,wx,wz,s,o)=>{o=o||{};const y=WardenH(wx,wz)+(o.sink||0);L.push({p,x:WRD.x+wx,y,z:WRD.z+wz,ry:r()*Math.PI*2,s,tx:(r()-.5)*(o.tilt||0),tz:(r()-.5)*(o.tilt||0)})};
  const ok=(wx,wz,min)=>{const d=Math.hypot(wx,wz);if(d<W.wallR+5||d>WRD.R-8)return false;if(WardenH(wx,wz)<min)return false;if(wz>0&&Math.abs(wx)<9&&d<150)return false;return true};   // land only, clear of the wall and of the road from the landing beach to the gate
  const PIL=['Hilly_Prop_Ruins_Pillar_1','Hilly_Prop_Ruins_Pillar_2','Hilly_Prop_Ruins_Pillar_3'],
        BLD=['Shared_Prop_Boulder_1','Shared_Prop_Boulder_2','Shared_Prop_Boulder_3','Shared_Prop_Boulder_4','Shared_Prop_Boulder_5','Shared_Prop_Boulder_6','Hilly_Prop_Rock_1','Hilly_Prop_Rock_2','Hilly_Prop_Rock_3','Hilly_Prop_Rock_4','Cliff_Prop_Rock_1','Cliff_Prop_Rock_2'],
        TRE=['Hilly_Prop_Tree_Cedar_1','Hilly_Prop_Tree_Cedar_2','Hilly_Prop_Tree_Pine_1','Hilly_Prop_Tree_Pine_2','Hilly_Prop_Tree_Pine_3','Hilly_Prop_Tree_Oak_1'],
        MTN=['Mountain_1','Mountain_2','Mountain_3','Mountain_4'];
  // a broken avenue of ruined pillars lining the road to the gate (pairs, every ~11 m, some toppled)
  for(let z=48;z<=118;z+=11)for(const sg of[-1,1]){const wx=sg*(10+r()*3),wz=z+r()*3;if(WardenH(wx,wz)>.8)put(pick(PIL),wx,wz,2.6+r()*1.4,{tilt:r()<.3?.9:.12,sink:-.2})}
  // ruined pillar groves around the walls
  for(let i=0,n=0;n<14&&i<400;i++){const d=44+r()*60,an=r()*Math.PI*2,wx=Math.sin(an)*d,wz=Math.cos(an)*d;if(!ok(wx,wz,.9))continue;put(pick(PIL),wx,wz,2.2+r()*2.2,{tilt:.35,sink:-.3});n++}
  // dead woods, clumped by a cheap value-noise so it reads as stands of trees, not a grid
  for(let i=0,n=0;n<70&&i<3000;i++){const d=44+r()*150,an=r()*Math.PI*2,wx=Math.sin(an)*d,wz=Math.cos(an)*d;if(!ok(wx,wz,.9)||WardenH(wx,wz)>9)continue;
    const q=Math.sin(wx*.045+1.3)*Math.cos(wz*.05)+Math.sin((wx+wz)*.03);if(q<.1&&r()<.85)continue;put(pick(TRE),wx,wz,1.5+r()*1.4,{tilt:.12,sink:-.1});n++}
  // boulders and rock falls, thicker in the crags
  for(let i=0,n=0;n<60&&i<2500;i++){const d=40+r()*165,an=r()*Math.PI*2,wx=Math.sin(an)*d,wz=Math.cos(an)*d;if(!ok(wx,wz,.5))continue;put(pick(BLD),wx,wz,1.2+r()*2.6+(WardenH(wx,wz)>5?1.2:0),{tilt:.3,sink:-.15});n++}
  // far mountains on the landward rim, none across the south (landing beach side)
  for(let i=0,n=0;n<9&&i<400;i++){const d=150+r()*40,an=r()*Math.PI*2,wx=Math.sin(an)*d,wz=Math.cos(an)*d;if(wz>60||WardenH(wx,wz)<1.2)continue;put(pick(MTN),wx,wz,5.5+r()*4,{sink:-2.5});n++}
  return L}
