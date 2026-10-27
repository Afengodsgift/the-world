// WARDEN: The Warden Isles data + terrain function. Pure (no THREE/DOM). Needs WRD (src/data/islands.js) and sstep (src/utils/math.js) at call time.
// Local coordinates (wx,wz) are metres from the isle centre WRD.x,WRD.z. The arena is a flat circular courtyard enclosed by a stone wall with ONE gate facing +z (south, toward the landing beach).
const WARDEN={
  plateauY:3.4,
  wallR:37,wallCr:2,wallStep:3.6,   // wall = ring of circles r=2 centred 37 m out; inner face at 35 m => the fighting rim
  arenaR:35,
  gateAng:0,gateSkip:.15,           // direction (sin a, cos a) = +z; circles within gateSkip rad of it are omitted => ~10 m gap
  pillars:[{a:Math.PI/4,d:16,r:1.2},{a:3*Math.PI/4,d:16,r:1.2},{a:5*Math.PI/4,d:16,r:1.2},{a:7*Math.PI/4,d:16,r:1.2}],
  landing:{x:0,z:120,r:30},         // where "Travel" drops you (dry land south of the arena)
  // SITES: every place you can fight. Local metres from the isle centre (+z = south, toward the landing beach). y = the flattened ground height; R = the fight circle.
  //   fog:true  = a boss fog gate: walking in seals the ring until the foe is felled (you cannot walk out); fog:false = a camp: foes wake when you come near, and you may run (they reset).
  //   foes: [{t: type id from Foes.js, dx, dz (offset from the site centre), face?}]. The court is the original walled arena (its own wall, no fog).
  sites:[
    {id:'court',n:'The Gate Court',x:0,z:0,R:35,y:3.4,fog:false,wall:true,foes:[{t:'duelist',dx:0,dz:-9}]},
    {id:'watch',n:'The Ashen Watch',x:-30,z:80,R:16,y:2.3,fog:false,foes:[{t:'soldier',dx:-3,dz:-2},{t:'soldier',dx:3,dz:-3}]},
    {id:'brokengate',n:'The Broken Gate',x:-75,z:-45,R:22,y:3.6,fog:true,foes:[{t:'paladin',dx:0,dz:-6}]},
    {id:'hollowkeep',n:'The Hollow Keep',x:85,z:-25,R:24,y:6.9,fog:true,foes:[{t:'parasite',dx:0,dz:-7}]},
    {id:'glade',n:"The Dancer's Glade",x:5,z:-120,R:24,y:2.0,fog:true,foes:[{t:'arissa',dx:0,dz:-7}]},
    {id:'cathedral',n:'The Hollow Cathedral',x:-50,z:-105,R:24,y:3.0,fog:true,foes:[{t:'ganfaul',dx:0,dz:-7}]},
    {id:'maw',n:'The Maw',x:75,z:-140,R:24,y:2.5,fog:true,foes:[{t:'maw',dx:0,dz:-7}]},
    {id:'den',n:"The Bear's Den",x:-115,z:60,R:20,y:2.5,fog:true,foes:[{t:'bear',dx:0,dz:-6}]},
    {id:'ridgeshot',n:'The Huntress Ridge',x:-20,z:-175,R:26,y:2.0,fog:true,foes:[{t:'archer',dx:0,dz:-9}]},
    {id:'blackgate',n:"The Black Knight's Gate",x:-128,z:-28,R:22,y:2.5,fog:true,foes:[{t:'darkknight',dx:0,dz:-7}]},
    {id:'arena',n:'The Ashen Arena',x:60,z:105,R:26,y:2.5,fog:false,duel:true,foes:[{t:'shade',dx:0,dz:-9}]},
    {id:'camp3',n:'The Drowned Camp',x:-100,z:15,R:16,y:2.5,fog:false,foes:[{t:'soldier',dx:-4,dz:-2},{t:'soldier',dx:4,dz:-2},{t:'soldier',dx:0,dz:-6}]},
    {id:'camp4',n:'The Ember Camp',x:100,z:60,R:16,y:2.5,fog:false,foes:[{t:'soldier',dx:-4,dz:-2},{t:'soldier',dx:4,dz:-2},{t:'soldier',dx:0,dz:-6}]},
    {id:'camp2',n:'The Ridge Post',x:55,z:-75,R:16,y:7.5,fog:false,foes:[{t:'soldier',dx:-3,dz:-2},{t:'soldier',dx:3,dz:-3}]}],
};
// the Ashen Catacombs (data/dungeon.js): its rooms are ordinary fight sites; its corridors are terrain pads (flat ground, no fight)
if(typeof DUNGEON!=='undefined'){const G=DUNGEON.build();for(const s of G.sites)WARDEN.sites.push(s);WARDEN.pads=G.pads;WARDEN.dungeon=G}else WARDEN.pads=[];
// What kind of place a site is, in plain words (used by the world map and the "you are near..." label). Pure.
function WardenKind(s){
  if(s.duel)return{icon:'⚔️',tag:'PvP duel arena'};
  if(s.dg)return{icon:'💀',tag:'Catacomb room'};
  if(s.wall)return{icon:'🏛️',tag:'Training court'};
  if(s.fog)return{icon:'👑',tag:'Boss fight'};
  return{icon:'⛺',tag:'Camp ('+s.foes.length+' soldiers)'}}
// terrain height of the isle (blended into H() by the WARDEN block in index.html)
function WardenH(wx,wz){
  const d=Math.hypot(wx,wz),R=WRD.R,base=Math.max(-12,(1-(d/R)**2)*4-.6),t=1-sstep(40,58,d);
  let h=base+(Math.sin(wx*.07)*Math.cos(wz*.09)*.9+Math.sin(wx*.19+wz*.13)*.35)*(1-t);
  h+=13*Math.exp(-((wx-95)**2+(wz+70)**2)/1800)+9*Math.exp(-((wx+85)**2+(wz+95)**2)/1300);   // two dark crags behind the arena
  h=h*(1-t)+WARDEN.plateauY*t;
  for(const q of WARDEN.sites){if(q.wall)continue;const dd=Math.hypot(wx-q.x,wz-q.z);if(dd<q.R+12){const k=1-sstep(q.R-2,q.R+12,dd);h=h*(1-k)+q.y*k}}   // every fight site is level ground
  for(const q of WARDEN.pads){const dd=Math.hypot(wx-q.x,wz-q.z);if(dd<q.R+10){const k=1-sstep(q.R-1,q.R+10,dd);h=h*(1-k)+q.y*k}}   // dungeon corridors
  return h}
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
  const ok=(wx,wz,min)=>{const d=Math.hypot(wx,wz);if(d<W.wallR+5||d>WRD.R-8)return false;for(const q of W.sites)if(!q.wall&&Math.hypot(wx-q.x,wz-q.z)<q.R+8)return false;for(const q of W.pads)if(Math.hypot(wx-q.x,wz-q.z)<q.R+10)return false;if(WardenH(wx,wz)<min)return false;if(wz>0&&Math.abs(wx)<9&&d<150)return false;return true};   // land only, clear of the wall and of the road from the landing beach to the gate
  const PIL=['Hilly_Prop_Ruins_Pillar_1','Hilly_Prop_Ruins_Pillar_2','Hilly_Prop_Ruins_Pillar_3'],
        BLD=['Shared_Prop_Boulder_1','Shared_Prop_Boulder_2','Shared_Prop_Boulder_3','Shared_Prop_Boulder_4','Shared_Prop_Boulder_5','Shared_Prop_Boulder_6','Hilly_Prop_Rock_1','Hilly_Prop_Rock_2','Hilly_Prop_Rock_3','Hilly_Prop_Rock_4','Cliff_Prop_Rock_1','Cliff_Prop_Rock_2'],
        TRE=['Hilly_Prop_Tree_Cedar_1','Hilly_Prop_Tree_Cedar_2','Hilly_Prop_Tree_Pine_1','Hilly_Prop_Tree_Pine_2','Hilly_Prop_Tree_Pine_3','Hilly_Prop_Tree_Oak_1'],
        MTN=['Mountain_1','Mountain_2','Mountain_3','Mountain_4'];
  // a broken avenue of ruined pillars lining the road to the gate (pairs, every ~11 m, some toppled)
  for(let z=48;z<=118;z+=11)for(const sg of[-1,1]){const wx=sg*(10+r()*3),wz=z+r()*3;if(WardenH(wx,wz)>.8)put(pick(PIL),wx,wz,2.6+r()*1.4,{tilt:r()<.3?.9:.12,sink:-.2})}
  // ruined pillar groves around the walls
  for(let i=0,n=0;n<10&&i<400;i++){const d=44+r()*60,an=r()*Math.PI*2,wx=Math.sin(an)*d,wz=Math.cos(an)*d;if(!ok(wx,wz,.9))continue;put(pick(PIL),wx,wz,2.2+r()*2.2,{tilt:.35,sink:-.3});n++}
  // dead woods, clumped by a cheap value-noise so it reads as stands of trees, not a grid
  for(let i=0,n=0;n<40&&i<3000;i++){const d=44+r()*150,an=r()*Math.PI*2,wx=Math.sin(an)*d,wz=Math.cos(an)*d;if(!ok(wx,wz,.9)||WardenH(wx,wz)>9)continue;
    const q=Math.sin(wx*.045+1.3)*Math.cos(wz*.05)+Math.sin((wx+wz)*.03);if(q<.1&&r()<.85)continue;put(pick(TRE),wx,wz,1.5+r()*1.4,{tilt:.12,sink:-.1});n++}
  // boulders and rock falls, thicker in the crags
  for(let i=0,n=0;n<36&&i<2500;i++){const d=40+r()*165,an=r()*Math.PI*2,wx=Math.sin(an)*d,wz=Math.cos(an)*d;if(!ok(wx,wz,.7))continue;put(pick(BLD),wx,wz,1.2+r()*2.6+(WardenH(wx,wz)>5?1.2:0),{tilt:.3,sink:-.15});n++}
  // far mountains on the landward rim, none across the south (landing beach side)
  for(let i=0,n=0;n<9&&i<400;i++){const d=150+r()*40,an=r()*Math.PI*2,wx=Math.sin(an)*d,wz=Math.cos(an)*d;if(wz>60||WardenH(wx,wz)<1.2)continue;put(pick(MTN),wx,wz,5.5+r()*4,{sink:-2.5});n++}
  // each boss site is a PLACE: a broken ring of landmarks just outside the fight circle, themed per site (ruin pillars / boulders / dead woods), with a gap where the fog gate faces the island centre
  const THEME={blackgate:{l:PIL,n:9,s:3.2,v:1.4,tilt:.3},cathedral:{l:PIL,n:10,s:3.6,v:1.6,tilt:.2},brokengate:{l:PIL,n:8,s:3.0,v:1.2,tilt:.4},ridgeshot:{l:PIL,n:7,s:2.8,v:1.2,tilt:.3},maw:{l:BLD,n:9,s:3.4,v:2.2,tilt:.4},hollowkeep:{l:BLD,n:8,s:3.0,v:2,tilt:.4},den:{l:TRE,n:10,s:2.1,v:.9,tilt:.12},glade:{l:TRE,n:9,s:1.9,v:.8,tilt:.12}};
  for(const q of W.sites){if(!q.fog||q.dg)continue;const th=THEME[q.id]||{l:PIL,n:8,s:2.6,v:1.2,tilt:.3},gate=Math.atan2(-q.x,-q.z);
    for(let i=0;i<th.n;i++){const an=i/th.n*Math.PI*2+(r()-.5)*.25;if(Math.abs(Math.atan2(Math.sin(an-gate),Math.cos(an-gate)))<.3)continue;
      const d=q.R+2+r()*3,wx=q.x+Math.sin(an)*d,wz=q.z+Math.cos(an)*d;if(WardenH(wx,wz)<.5)continue;put(pick(th.l),wx,wz,th.s+r()*th.v,{tilt:th.tilt,sink:-.25})}}
  return L}
