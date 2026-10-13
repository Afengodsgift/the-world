// Ship co-op tuning: the sloop, sailing, cannons, pirates. Pure data (no logic). The dock position lives in data/islands.js (DOCK).
// Model facts (Kenney Pirate Kit, ship-medium): keel at the origin, +Z is the bow (narrow end), deck 2.1 above the keel, 10.6 long x 4.4 wide;
// everything is drawn at `scale` so two avatars have a comfortable deck.
const SHIP={
  scale:1.25,sea:-.3,draft:1.5,deckY:2.1,          // draft = how far the keel sits below the sea; deckY is before scaling
  len:13.25,beam:5.5,hull:100,
  sailing:{vmax:14,accel:.5,coast:.35,turn:.9,turnV:.12,shore:-1.0,                // vmax m/s; shore = sea floor must be below this
           probe:[[0,6.4],[0,-6.4],[-2.5,0],[2.5,0],[-2.2,3.6],[2.2,3.6],[-2.4,-3.6],[2.4,-3.6]]},  // hull sample points (x,z) in ship space
  wind:{strength:1,storm:.6},
  deck:[[0,-3,2.7],[0,.3,2.7],[0,3.4,1.6]],        // walkable deck circles (x,z,r) in ship space
  stations:{helm:[0,-4.4],gun:[0,2.9]},
  cannon:{v:58,g:-16,reload:2.4,dmg:22,bro:{reload:4,range:90}},                  // ballistic shell, gunner reload, solo broadside
  enemy:{cap:2,spawnEvery:50,spawnDist:150,minDock:140,engage:75,keep:38,fireRange:85,turn:.55,
         small:{model:'ship-pirate-small',hp:60,v:8.5,r:5,reload:3.8,dmg:8,loot:[40,70]},
         large:{model:'ship-pirate-large',hp:120,v:7,r:7,reload:2.7,dmg:10,loot:[90,140]}},
  loot:{pick:8,life:150},
  net:{ship:12,enemies:8,aim:10}                    // snapshots per second
};
