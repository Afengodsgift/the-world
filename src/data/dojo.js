// IRON FIST ISLE: pure data (no THREE, no DOM) for the hand-to-hand trials in src/games/Dojo.js.
// Every opponent is a fighter in the same deterministic CombatCore as the Warden duels, with the Bare Hands moveset (src/combat/Fists.js); what differs is the AI personality below.
//   ai.range   preferred fighting distance (m)          ai.reach   distance at which it starts an attack
//   ai.combo   attack scripts it picks from: l = Light (the string jab > cross > hook > knee > spin), h = Heavy (branches: uppercut, roundhouse), g = Guard + Heavy (a throw), p = a Perilous-style charged Power Strike
//   ai.par     chance it tries to parry a SLOW (>= 9 tick) attack of yours     ai.dg   chance it dodges one     ai.cd  pause between its attacks (ticks)     ai.read  1 = it learns your habits (Technician)
//   hp / dm / spd are multiplied by the round's scaling. `look` is the real character model it wears (AvatarKit base: j = the BJJ fighter in a gi, g = Gretel), `tint` colours it (a white gi becomes a red / blue / green / black one).
const DOJO_FOES={
  brawler:{name:'Brawler',hp:78,dm:.8,spd:1.1,scale:1.0,look:'j',tint:[1,.36,.3],ai:{range:1.55,reach:2.0,combo:['ll','lll','lh','llh'],par:.12,dg:.08,cd:[42,80],read:0},tip:'Wild, heavy combos'},
  boxer:{name:'Boxer',hp:62,dm:.72,spd:1.45,scale:.97,look:'j',tint:[.38,.6,1],ai:{range:1.7,reach:2.1,combo:['ll','lll','llll','ll'],par:.28,dg:.22,cd:[26,52],read:0},tip:'Fast hands, guards well'},
  kicker:{name:'Kickboxer',hp:68,dm:.85,spd:1.3,scale:1.0,look:'g',tint:[1,1,1],ai:{range:2.5,reach:2.9,combo:['h','lh','llh','h'],par:.2,dg:.3,cd:[40,76],read:0},tip:'Long range kicks'},
  grappler:{name:'Grappler',hp:120,dm:.9,spd:1,scale:1.12,look:'j',tint:[.42,.95,.42],ai:{range:1.45,reach:1.9,combo:['g','lg','lll','g'],par:.1,dg:.05,cd:[50,90],read:0},tip:'Throws if you turtle up'},
  staff:{name:'Staff Fighter',hp:70,dm:.95,spd:1.25,scale:1.0,look:'g',tint:[.9,1,.8],weapon:'bo',ai:{range:2.4,reach:2.8,combo:['ll','lll','h','llh'],par:.2,dg:.2,cd:[34,66],read:0},tip:'Long reach. GRAB or PERFECT PARRY to disarm him'},
  tech:{name:'Technician',hp:74,dm:.9,spd:1.35,scale:1.03,look:'g',tint:[.82,.9,1.15],ai:{range:1.8,reach:2.2,combo:['ll','lh','l','llh'],par:.35,dg:.3,cd:[30,60],read:1},tip:'Reads repeated attacks'},
  enforcer:{name:'The Enforcer',hp:330,dm:1.05,spd:1.15,scale:1.22,look:'j',tint:[.34,.34,.4],boss:true,ai:{range:1.8,reach:2.4,combo:['llll','lh','p','lg','llh'],par:.3,dg:.2,cd:[26,54],read:1},tip:'Boss: everything, plus power strikes'}};
// the trial: each round is a list of opponents. After the last, the trial goes on forever with a random pool and growing strength.
const DOJO_ROUNDS=[['brawler'],['boxer','brawler'],['kicker','boxer'],['staff'],['grappler','brawler','brawler'],['tech','kicker','staff'],['enforcer']];
const DOJO_POOL=['brawler','boxer','kicker','grappler','tech','staff'];
// belts: every 4 rounds you clear (lifetime) earns the next belt = +hp, +damage
const DOJO_BELTS=[{n:'White',c:'#f4f4f4'},{n:'Yellow',c:'#f2d23a'},{n:'Orange',c:'#f08a24'},{n:'Green',c:'#4fb34f'},{n:'Blue',c:'#3f7fe0'},{n:'Brown',c:'#8a5a34'},{n:'Black',c:'#222'}];
const DOJO_BELT_EVERY=4;
// fighting styles: per-move damage multipliers (mm), posture damage (pm), hp bonus, wider parry window (dfl, ticks). The player picks one at the ring.
const DOJO_STYLES={
  striker:{n:'Striker',ic:'\u{1F44A}',tip:'Fast punches hit harder',mm:{jab:1.3,cross:1.3,hook:1.3,knee:1.15,step:1.3,f_dash:1.2},pm:1.05,hp:0,dfl:0},
  kicker:{n:'Kicker',ic:'\u{1F9B6}',tip:'Kicks, spins and shoves hit harder',mm:{round:1.4,f_spin:1.4,knee:1.25,push:1.4,drop:1.3,upper:1.15},pm:1.0,hp:0,dfl:0},
  grappler:{n:'Grappler',ic:'\u{1F91C}',tip:'Throws and takedowns wreck; extra hp',mm:{throw:1.8,take:1.5,push:1.3,drop:1.3},pm:1.2,hp:16,dfl:0},
  counter:{n:'Counter',ic:'\u{1F300}',tip:'Wider parry window, huge counters',mm:{f_counter:2.2,upper:1.3,cross:1.1},pm:1.1,hp:0,dfl:3}};
const DOJO_STYLE_ORDER=['striker','kicker','grappler','counter'];
const DojoData={styles:DOJO_STYLES,styleOrder:DOJO_STYLE_ORDER,
  foes:DOJO_FOES,rounds:DOJO_ROUNDS,pool:DOJO_POOL,belts:DOJO_BELTS,
  belt:cleared=>Math.min(DOJO_BELTS.length-1,Math.floor(cleared/DOJO_BELT_EVERY)),
  // the line-up for round r (0-based): the scripted rounds, then endless random ones that grow with r
  lineup:(r,rnd)=>{if(r<DOJO_ROUNDS.length)return DOJO_ROUNDS[r].slice();const n=Math.min(4,2+Math.floor((r-DOJO_ROUNDS.length)/3)),l=[];for(let i=0;i<n;i++)l.push(DOJO_POOL[Math.floor(rnd()*DOJO_POOL.length)]);if((r-DOJO_ROUNDS.length)%5===4)l.push('enforcer');return l},
  // strength of round r: foes get tougher and hit harder, slowly
  scale:r=>({hp:1+.09*r,dm:1+.05*r}),
  // coins for clearing round r
  coins:(r,boss)=>boss?150:20+r*14,
  // player stats at a belt
  player:b=>({hp:120+b*8,dm:1+.04*b})};
if(typeof module!=='undefined')module.exports=DojoData;
