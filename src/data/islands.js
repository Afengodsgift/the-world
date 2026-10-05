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
