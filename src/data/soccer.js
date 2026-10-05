// Soccer tuning: field, ball physics, touch/kick feel and match rules. Pure data (no logic), loaded before games/Soccer.js.
// The pitch POSITION lives in data/islands.js (PITCH) because the terrain flattening needs it at world-build time.
const SOCCER={
  hw:26,hh:16,                                     // playing surface half-length (x) / half-width (z), metres. Walls keep the ball in.
  goalW:7.2,goalH:2.6,goalD:3,                     // goal mouth width, crossbar height, net depth behind the end line
  ball:{r:.4,g:-18,roll:.55,air:.04,bounce:.6,wall:.7,maxSpeed:30},   // radius, gravity, rolling drag/s, air drag/s, bounce keep, wall keep
  touch:{reach:.7,minPush:2.6,carry:1.15,cd:.14},  // dribbling: running into the ball pushes it ahead of you
  kick:{reach:2.4,tap:11,full:22,loft:3.6,loftFull:6.5,charge:.7,assist:.55}, // tap = pass, hold up to `charge` s = full shot; assist = aim help toward goal (rad)
  match:{toWin:5,time:180,kickoffMax:20,goalPause:2.6,overPause:6,startRange:30},
  net:{rate:15}                                    // host -> guest snapshots per second
};
