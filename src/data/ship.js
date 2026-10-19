// Ship co-op tuning: your ship, sailing, cannons, pirate fleets. Pure data (no logic). The dock position lives in data/islands.js (DOCK).
// Hulls: every class names a model file, the baked walkable deck grid (data/decks.js, tools/bake_decks.mjs) and a scale. Sizes in metres after scale.
//   your ship : Kenney ship-medium x2.2 = 23.3 long x 10.6 wide (it was x1.25 = 13 long): a big three-level deck (main deck, raised stern deck with the wheel, bow)
//   enemies   : the Lowpoly Pirates kit hulls at native size (21 m / 29 m) + Kenney pirate hulls scaled 1.6 / 1.9 / 2.0 + (later) the galleon boss
// deckM = height of the main deck above the keel (model units x scale); the hull is sunk so the main deck stands `fb` metres above the sea (1.125 = level with the harbour pier, DOCK.top).
const SHIP={
  sea:-.3,fb:1.125,
  sailing:{vmax:13,accel:.45,coast:.32,turn:.62,turnV:.1,shore:-1.0,minWind:.8,boostMul:1.75,boostT:6,boostCd:14},     // vmax m/s; shore = sea floor must be below this. Hull probe points are generated from the hull size (Sailing.probes)
  wind:{strength:1,storm:.6},
  cannon:{pReload:1.3,aimYaw:.62,aimUp:.5,aimDown:.08,v:62,g:-14,reload:3.2,dmg:24,splash:4.2,pdmg:16,spread:.022,range:130,bro:{reload:4,range:110}},       // ballistic ball: speed, gravity, per-gun reload, hull damage, deck splash radius / damage to people, aim scatter
  net:{ship:12,enemies:8,aim:10},                    // snapshots per second
  loot:{pick:8,life:150},
  enemy:{cap:2,spawnEvery:50,spawnDist:150,minDock:140,engage:75,keep:38,fireRange:85,turn:.55}
};
// ---------- hull classes ----------
// guns: cannons per side (placed along the main deck rails automatically); crew: pirates aboard {cut: cutlass, pis: pistol, mus: musket}
SHIP.cls={
  galleon:{name:'Your galleon',file:'assets/ships/galleon.glb',grid:'galleon',scale:1,mdeck:7.8,hp:420,guns:5,helm:[0,-8.95],dais:{x:0,z:-8.6,r:1.3,h:10.2},gangway:{side:-1,z0:-1.6,z1:1.6,h:1.2},mast:20,v:15,turn:.5},      // the player's own ship: the Sketchfab low-poly galleon (tools/prep_galleon.mjs): 32 m, main deck, raised stern deck with the wheel, bow deck
  sloop:{name:'Your ship',file:'assets/ships/ship-medium.glb',grid:'ship-medium',scale:2.2,mdeck:2.1,hp:240,guns:4,sails:/^sail/,flags:/^flag/,helm:[0,-3.35],mast:8},
  skiff:{name:'Reef Rat',file:'assets/ships/ship-pirate-small.glb',grid:'ship-pirate-small',scale:3.6,mdeck:2.1,hp:90,guns:2,sails:/^sail/,flags:/^flag/,
         v:9.5,turn:.8,reload:3.6,dmg:.8,crew:{cut:3,pis:1},style:'ram',coin:[60,100],
         cap:{n:'Nib the Quick',t:'Reef Rat',col:'#ffd23f',hp:150,wp:'cut',say:['Board her, lads!','Nobody outruns the Rat!','Hand over the shinies!']}},
  barnacle:{name:'The Barnacle',file:'assets/pirates/ship.glb',grid:'pp-ship',scale:2.1,mdeck:3.2,hp:130,guns:3,
         v:8,turn:.55,reload:3.2,dmg:1,crew:{cut:3,pis:3},style:'broadside',coin:[100,160],
         cap:{n:'Mad Mags',t:'Barnacle Belle',col:'#ff6b8b',hp:190,wp:'pis',say:['Fire at will!','You look rich, darlin\'!','Say goodbye to your sails!']}},
  maiden:{name:'Salty Maiden',file:'assets/ships/ship-pirate-medium.glb',grid:'ship-pirate-medium',scale:3.9,mdeck:2.1,hp:170,guns:3,sails:/^sail/,flags:/^flag/,
         v:7.5,turn:.5,reload:3,dmg:1,crew:{cut:5,pis:2},style:'board',coin:[130,200],
         cap:{n:'Redbeard Rook',t:'Salty Maiden',col:'#ff8a3d',hp:320,wp:'cut',say:['I\'ll gut ye like a fish!','Steel and salt!','Come aboard and die!']}},
  whisper:{name:'Iron Whisper',file:'assets/pirates/ship_001.glb',grid:'pp-ship-001',scale:2.0,mdeck:3.5,hp:200,guns:4,
         v:7,turn:.42,reload:2.6,dmg:1.1,crew:{cut:2,mus:4},style:'gunnery',coin:[170,260],
         cap:{n:'Silent Vane',t:'Iron Whisper',col:'#9ad7ff',hp:280,wp:'mus',say:['...','Steady... aim...','Every ball finds a home.']}},
  kraken:{name:'Kraken\'s Wrath',file:'assets/ships/ship-pirate-large.glb',grid:'ship-pirate-large',scale:4.8,mdeck:2.1,hp:300,guns:5,sails:/^sail/,flags:/^flag/,
         v:6.5,turn:.4,reload:2.8,dmg:1.2,crew:{cut:5,pis:2,mus:2},style:'board',coin:[260,380],boss:1,
         cap:{n:'Admiral Calloway',t:'Scourge of the Reef',col:'#b05bff',hp:700,wp:'cut',say:['The sea belongs to me!','Kneel, or drown!','You dare sail my waters?']}}
};
// deck geometry derived from the class: half sizes in metres (before the baked grid refines them)
for(const k in SHIP.cls){const c=SHIP.cls[k];c.id=k;c.deckM=c.mdeck*c.scale;c.draft=c.deckM-SHIP.fb}
SHIP.player='galleon';const PK=SHIP.cls[SHIP.player];
SHIP.scale=PK.scale;SHIP.deckY=PK.mdeck;SHIP.draft=PK.draft;SHIP.hull=PK.hp;
SHIP.stations={eyeUp:2.5,eyeFwd:-.3,wheel:{dx:.32,y:10.78,z:-8.05},helm:[PK.helm[0]*SHIP.scale,PK.helm[1]*SHIP.scale]};   // helm spot in ship space (metres): in front of the wheel on the raised stern deck
