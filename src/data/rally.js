// Skybreak Rally tuning. Pure static data (no THREE, no DOM), like data/ship.js. Units: metres, seconds, radians.
// Heading convention is the repo's: forward = (sin h, cos h); the lateral axis is (cos h, -sin h) (same as Sailing.toWorld).
// Positive `steer` turns the heading toward the lateral axis (h increases); the input layer maps screen-right to the right sign.
const RALLY={
  g:22,                           // arcade gravity (a bit heavier than 9.8: jumps stay punchy but readable)
  // ---- ground car: shared constants (per-class values below override / scale these) ----
  car:{
    hl:1.9,hb:.95,                // wheelbase half-length / half-track used to sample the ground under the four wheels
    steerRate:9,                  // how fast the wheel follows the stick (1/s)
    vTurn:6,                      // below this speed steering fades out (a car cannot pivot on the spot)
    vHigh:34,                     // above this speed turn rate falls off (stability at speed)
    brake:40,rev:11,vrev:12,      // braking decel, reverse accel, reverse top speed
    coast:3.2,drag:.012,          // engine braking, rolling resistance (x speed)
    boostAccel:34,                // extra push while boosting (m/s^2), capped at vmax*boostMul
    overspeed:1.8,                // how fast speed above the cap bleeds off (1/s): boost ends and landings coast down smoothly, never a jerk
    handGrip:.16,                 // handbrake multiplies lateral grip by this (slides)
    slipLoss:.22,                 // speed lost per m/s of sideways velocity the tyres scrub off
    slopeK:.55,                   // share of real slope gravity applied (arcade: hills matter, they do not stop you)
    stickSlope:.8,                // ground-follow tolerance: surface may fall this much per metre travelled before the car leaves it
    stepUp:.7,                    // a step higher than this (or speed*dt*1.4) is a wall, not a slope
    wallKeep:.28,                 // speed kept after hitting a wall
    airYaw:.9,                    // yaw authority while airborne (rad/s at full stick)
    termV:55,airDrag:.03,         // terminal fall speed (m/s) and horizontal air drag (1/s): a car dropped from the sky never reaches absurd speeds
    hardLand:9,landLoss:.02,      // landing impact (m/s) above which speed is lost, per extra m/s (capped at 30%)
    offroad:{grip:.7,drag:3.2,vmax:.62}, // surface multipliers when env.surf says 'rough' (grass, sand)
  },
  // ---- three launch classes. The pack gives us no cars, so these are stat blocks the visuals plug into later ----
  cls:{
    ace:    {n:'Ace',    vmax:46,accel:22,turn:1.95,grip:7.0,boostMul:1.42,boostT:2.2,charges:3,mass:1.0},
    comet:  {n:'Comet',  vmax:52,accel:24,turn:1.65,grip:5.4,boostMul:1.50,boostT:2.0,charges:3,mass:.85},
    bruiser:{n:'Bruiser',vmax:42,accel:18,turn:1.75,grip:9.0,boostMul:1.38,boostT:2.6,charges:4,mass:1.4},
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
};
