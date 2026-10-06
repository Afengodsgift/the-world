// World layout data: town, floating island, outer islands, discoverable locations, race/hunt anchors.
// Pure static data (no THREE, no DOM). Order matters: later entries are derived from earlier ones.
const TOWN={x:25,z:62};
const SKY={x:-1900,z:2350,R:140,base:430}; // the floating island sits up in the cloud layer (clouds ~310-490), see src/world/SkyIsland.js
const ISL=[{n:'Ember Isle',x:-1400,z:-850,R:320,pk:55,c:'#ff6a3d'},{n:'Sunken Isle',x:1250,z:-420,R:270,pk:16,c:'#3dd6ff'},{n:'Palm Atoll',x:760,z:1400,R:230,pk:0,c:'#ffe066'},{n:'Frost Isle',x:-980,z:1450,R:300,pk:60,c:'#d9f0ff'},{n:'Far Reef',x:1950,z:1050,R:260,pk:20,c:'#b06bff'},{n:'Storm Cay',x:0,z:1750,R:180,pk:10,c:'#8bffb0'},{n:'The Boneyard',x:1700,z:-1150,R:200,pk:24,c:'#ffab5e'}];
// Outlaw Isle: dedicated island for the Outlaw Town shooter. Terrain is flattened to y near the center; vegetation is cleared within `clear`.
const OUT={x:-600,z:-1250,R:230,y:3.2,clear:70};
ISL.push({n:'Outlaw Isle',x:OUT.x,z:OUT.z,R:OUT.R,pk:0,c:'#e0a040'});
const KT={x:760,z:1400,hw:95,hh:65,rc:34};
// (The Floating Island's x/z below is a spot on its path, so Travel lands you on solid ground.)
const LOCS=[{n:'Town Square',x:25,z:62,r:16},{n:'Whispering Forest',x:-110,z:40,r:45},{n:'Shell Beach',x:0,z:182,r:26},{n:'Sky Peak',x:0,z:-137,r:22,y:32},{n:'The Cave',x:18,z:-88,r:9}].concat(ISL.map(I=>({n:I.n,x:I.x,z:I.z,r:I.R*.7}))).concat([{n:'The Floating Island',x:SKY.x+50,z:SKY.z+6,r:SKY.R*.8,y:SKY.base+6}]);
// Farm: flat meadow on the main island (found by scanning H() for the flattest spot clear of town, forest, cave, Bonk Ring and beach)
const FARM={x:30,z:120,R:19,clear:26};
LOCS.push({n:'Farm',x:FARM.x,z:FARM.z,r:28});
LOCS.push({n:'The Race Track',x:KT.x,z:KT.z,r:Math.max(KT.hw,KT.hh)});
const WP=[[TOWN.x+40*Math.cos(.59),TOWN.z+40*Math.sin(.59)],[0,-137],[900,-300],[1400,750],[550,1000]];
WP.push(WP[0]);
const BOARD={x:TOWN.x,z:TOWN.z-8.5};

// ISLX: "extension land" for the outer islands. Every outer island keeps its ORIGINAL dome (H() in index.html is unchanged inside 0.94 R), so everything derived from
// the dome (trees, star shards, hunt sites, camps) stays exactly where it was. Beyond that rim the island continues as a wide, wavy shelf with gentle hills and a couple of
// headlands out to ~1.3-1.6 R, so the islands are roughly 3x the area, with a wadeable (never swim-deep) join between the dome and the new land.
// Pure maths (no THREE/DOM). Outlaw Isle keeps its exact shape (it is a specialised arena). Used by H() and by src/world/Isles.js.
const ISLX=(()=>{
  const SKIP=['Outlaw Isle'],cache=new Map();
  const P=I=>{let p=cache.get(I);if(!p){let s=0;for(const ch of I.n)s=(s*31+ch.charCodeAt(0))%997;const f=s/997*6.283;
    p={f,hills:[[f,1.2,5+I.pk*.1,.2],[f+2.5,1.16,4,.17],[f+4.4,1.1,3,.15]]};cache.set(I,p)}return p};
  const on=I=>!SKIP.includes(I.n);
  const coast=(I,a)=>{const f=P(I).f;return I.R*(1.5+.15*Math.sin(3*a+f)+.09*Math.sin(5*a+f*1.7)+.05*Math.sin(8*a+f*.6))}; // shore radius ~1.21..1.79 R (the beach slope reaches 1.12x that)
  function h(I,x,z){
    if(!on(I))return -9;
    const dx=x-I.x,dz=z-I.z,d=Math.hypot(dx,dz);
    if(d<I.R*.94)return -9;                                   // the original dome owns everything inside
    const p=P(I),a=Math.atan2(dz,dx),S=coast(I,a);
    if(d>S*1.12)return -3;
    const inner=sstep(.94*I.R,1.1*I.R,d);
    let pl=2.2+1.1*Math.sin(x*.017+p.f)*Math.cos(z*.015+p.f*.5)+.7*Math.sin(x*.043+z*.037+p.f);
    for(const [ha,hd,amp,sg] of p.hills){const hx=I.x+Math.cos(ha)*hd*I.R,hz=I.z+Math.sin(ha)*hd*I.R,q=((x-hx)*(x-hx)+(z-hz)*(z-hz))/(2*sg*sg*I.R*I.R);if(q<9)pl+=amp*Math.exp(-q)}
    const base=-.3+(pl+.3)*inner;                             // starts at -0.3 (wadeable) where it meets the dome, rises to the plateau
    return base+(-3-base)*sstep(.86*S,1.12*S,d);              // plateau, then a beach slope down to the sea floor
  }
  return {h,coast,on,reach:I=>I.R*2.05};
})();
