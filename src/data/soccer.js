// Soccer tuning: field, ball physics, touch/kick feel and match rules. Pure data (no logic), loaded before games/Soccer.js.
// The pitch POSITION lives in data/islands.js (PITCH) because the terrain flattening needs it at world-build time.
const SOCCER={
  hw:26,hh:16,                                     // playing surface half-length (x) / half-width (z), metres. Walls keep the ball in.
  goalW:7.2,goalH:2.6,goalD:3,                     // goal mouth width, crossbar height, net depth behind the end line
  ball:{r:.4,g:-18,roll:.55,air:.04,bounce:.6,wall:.7,maxSpeed:30},   // radius, gravity, rolling drag/s, air drag/s, bounce keep, wall keep
  touch:{reach:.7,minPush:2.6,carry:1.15,cd:.14},  // dribbling: running into the ball pushes it ahead of you
  kick:{reach:2.4,tap:11,full:22,loft:3.6,loftFull:6.5,charge:.7,assist:.55}, // tap = pass, hold up to `charge` s = full shot; assist = aim help toward goal (rad)
  // --- possession: the ball is held ahead of its owner (tight walking dribble -> loose sprint dribble) instead of being pushed ---
  ctrl:{reach:1.15,maxRel:11,dist:.95,distSprint:1.9,spring:16,loseDist:2.9,airMax:1.5,rhythm:.22},
  first:{minSpeed:4.5,bounce:.4,err:.8,lock:.4},                    // first touch: slow balls are taken cleanly, fast ones need a good angle or they squirt away
  pace:{base:1.15,sprint:.8,carry:.9,carrySprint:.88,stun:.45},     // multipliers on the world's walk (6 m/s) and sprint (12 m/s): ~6.9 jog, ~9.6 sprint
  pass:{cone:.65,range:34,minRange:4,minSp:8,maxSp:21,k:.55,lead:.9,lock:.3,charge:.5},   // target cone (rad); speed grows with distance and hold; leads a running mate
  shoot:{errStand:.035,errSprint:.11},                               // aim error in radians: sprinting makes shots wilder
  tackle:{reach:1.8,cone:1.05,base:.4,expose:.45,sprint:.25,knock:3.6,victimLock:.7,cd:.8,missCd:1.2,stun:.9},
  rng:Math.random,                                                   // tests swap in a fixed value
  match:{toWin:5,time:180,kickoffMax:20,goalPause:2.6,overPause:6,startRange:30},
  net:{rate:15}                                    // host -> guest snapshots per second
};
