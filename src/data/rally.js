// Skybreak Rally tuning. Pure static data (no THREE, no DOM), like data/ship.js. Units: metres, seconds, radians.
// Heading convention is the repo's: forward = (sin h, cos h); the lateral axis is (cos h, -sin h) (same as Sailing.toWorld).
// Positive `steer` turns the heading toward the lateral axis (h increases); the input layer maps screen-right to the right sign.
const RALLY={
  g:22,                           // arcade gravity (a bit heavier than 9.8: jumps stay punchy but readable)
  // ---- ground car: shared constants (per-class values below override / scale these) ----
  car:{
    hl:1.9,hb:.95,                // wheelbase half-length / half-track used to sample the ground under the four wheels
    // ---- steering: ONE model (CarPhysics.turnRate) shared by the physics, the player and the AI ----
    L:2.7,                        // wheelbase (m): yaw rate = speed * tan(wheel angle) / L
    d0:.8,                        // wheel angle at standstill (rad): tight turning when slow
    vS:22,                        // speed (m/s) at which the wheel angle has fallen to about half: stability as you go faster
    minV:8,                       // low-speed floor in the bicycle formula so a crawl still turns briskly (but you cannot pivot on the spot)
    lat:50,                       // grip-limited lateral acceleration (m/s^2): caps the yaw rate at speed so there are no instant spins
    steerUp:30,steerDn:22,        // wheel response (1/s): fast when you ask for MORE lock or flick the other way, a touch softer when you let go
    brake:40,rev:11,vrev:12,      // braking decel, reverse accel, reverse top speed
    coast:3.2,drag:.012,          // engine braking, rolling resistance (x speed)
    boostAccel:42,                // extra push while boosting (m/s^2), capped at vmax*boostMul
    overspeed:1.5,                // how fast speed above the cap bleeds off (1/s): boost ends and landings coast down smoothly, never a jerk
    handGrip:.12,handTurn:1.3,handLat:1.25,handSlipLoss:.3, // handbrake: lateral grip x.22 (the tail comes out), sharper wheel, a little more lateral authority: a controllable slide
    slipKeep:.55,handKeep:.9,     // fraction of the removed sideways ENERGY that becomes forward energy (the rest is scrubbed off)
    slipLoss:.22,                 // speed lost per m/s of sideways velocity the tyres scrub off
    slopeK:.55,                   // share of real slope gravity applied (arcade: hills matter, they do not stop you)
    stickSlope:.8,                // ground-follow tolerance: surface may fall this much per metre travelled before the car leaves it
    stepUp:.7,                    // a step higher than this (or speed*dt*1.4) is a wall, not a slope
    carR:1.6,rest:.12,blockKeep:.9, // collision radius (m), bounce off solid scenery, speed kept while scraping along it
    wallKeep:.28,                 // speed kept after hitting a wall
    airYaw:.9,                    // yaw authority while airborne (rad/s at full stick)
    termV:55,airDrag:.03,         // terminal fall speed (m/s) and horizontal air drag (1/s): a car dropped from the sky never reaches absurd speeds
    hardLand:9,landLoss:.02,      // landing impact (m/s) above which speed is lost, per extra m/s (capped at 30%)
    offroad:{grip:.7,drag:3.2,vmax:.62}, // surface multipliers when env.surf says 'rough' (grass, sand)
  },
  // ---- three launch classes. Bodies are the two supplied flying cars (baked by tools/build_rally_cars.mjs): 'aero' (futuristic, 4 hover pods) and 'retro' (50s fin car).
  // Comet has no third model: it re-uses the aero body with a paint tint (a stat/handling variant, honestly labelled). Models face +Z, Y up, belly on y=0. ----
  cls:{
    ace:    {n:'Ace',    model:'assets/rally/car_aero.glb',                vmax:56,accel:27,turn:1.0,grip:11,boostMul:1.42,boostT:2.2,charges:3,mass:1.0},
    comet:  {n:'Comet',  model:'assets/rally/car_aero.glb',tint:'#ff5a2a',vmax:63,accel:29,turn:.92,grip:8.8,boostMul:1.50,boostT:2.0,charges:3,mass:.85},
    bruiser:{n:'Bruiser',model:'assets/rally/car_retro.glb',               vmax:51,accel:22,turn:.96,grip:13.5,boostMul:1.38,boostT:2.6,charges:4,mass:1.4},
  },
  // ---- flight mode (arcade plane). Gaps between islands are ~1000-2000 m, so a crossing is ~20-35 s at cruise ----
  fly:{
    cruise:58,vmin:34,vmax:76,    // thr in [-1,1] maps to vmin..vmax around cruise
    boostMul:1.45,
    pitchRate:1.15,pitchMax:1.05, // rad/s at full stick, and clamp (about 60 deg)
    level:1.4,                    // auto-level rate with no pitch input (1/s): accessible, no stalling into a spiral
    rollMax:.95,rollRate:4.2,     // bank angle follows the stick
    turn:1.05,                    // yaw rate at full bank (rad/s)
    gCouple:9,                    // climbing bleeds speed, diving gains it (m/s^2 per unit sin(pitch))
    speedRate:.8,                 // approach to the throttle target (1/s)
    vstall:36,                    // below this the nose drops a little (never a spin)
    ceil:900,                     // soft altitude ceiling
    soft:6,                       // ground-effect height: below this above the ground, the plane is nudged upward
    touch:1.4,                    // height at which the belly touches down
    safePitch:-.4,                // touching down nose-down steeper than this is a scrape, not a landing
  },
  // ---- combat racing: pickups and six items. Effects are brief (<= 1.3 s) and followed by a protection window, so nobody is ever stun-locked ----
  items:{
    boxR:3.6,respawn:7,protect:1.5,shieldT:6,maxMines:6,cool:.6,
    kinds:{blaster:{n:'Blaster',ic:'🔫'},burst:{n:'Burst',ic:'💥'},rocket:{n:'Rocket',ic:'🚀'},turbo:{n:'Turbo',ic:'⚡'},shield:{n:'Shield',ic:'🛡️'},mine:{n:'Mine',ic:'🪤'}},
    // what a hit does to the victim: t = disruption seconds, slow = speed cap multiplier while disrupted, kb = knockback impulse (m/s, horizontal)
    hit:{blaster:{t:.9,slow:.72,kb:1.5},rocket:{t:1.3,slow:.62,kb:7},burst:{t:.7,slow:.74,kb:9},mine:{t:1.2,slow:.58,kb:4}},
    bolt:{speed:96,life:1.6,r:2.7},                       // blaster: fast, straight
    rocket:{speed:68,add:18,life:3,r:3.2,turn:.5,range:85,cone:.55}, // homing: closing speed only ~16 m/s over the target and a 3 s life, so range and a swerve (or boost) matter; limited turn rate (rad/s), soft lock cone (rad)
    burst:{r:14},mine:{life:28,arm:.8,r:3.2,back:4.5},
    // item roll weights by race position (0 = leader, 1 = last): the leader gets defence and utility, the back of the pack gets teeth
    weights:{blaster:[.24,.20],burst:[.14,.12],rocket:[.04,.30],turbo:[.16,.22],shield:[.26,.08],mine:[.16,.08]},
  },
};
