# Parkour Isle

A separate island (`PKI`, x 1900 / z -2050, appended to `H()` like the Warden Isles, gated by `PKI.on`; `?parkour=0` turns it off) with a 960 m point-to-point parkour course and a race against 3 AI runners.

**Where:** world map -> 🏁 *Parkour Race*, or Travel -> *Parkour Isle* (lands on the start line). Two pads by the start line: pink = race, cyan = free run.

## Controls (own scheme, active only during a run)
| | |
|---|---|
| Stick | run. Momentum: wide arcs at speed, instant turns when slow |
| JUMP (Space) | jump / long jump (sprint) / vault (auto when running into a low block) / wall-up (tap early before a tall block) / wall-kick / wall-jump / ledge climb |
| SLIDE (C / Shift) | slide under low arches; also drops from a ledge and releases a wall-run |
| JUMP in the air (no wall) | AIR DASH: once per flight, forward boost + flow |
| SLIDE in the air | DIVE: fast drop, rolls out on landing (keeps speed) |
| FLIP (V) | trick in the air. Clean landing = speed + flow; landing early = stumble |
| RESPAWN (R) / EXIT | back to the last checkpoint / leave the run |

**FLOW** (0..100 %) rises with every move in a chain and raises top speed from 9.5 to 14 m/s; it decays after 1.6 s of plain running and resets on a stumble or fall.

## Code
- `src/parkour/ParkourCore.js` pure movement engine (player and AI step the same body). Tested by `tests/parkour_core.sim.js`.
- `src/parkour/ParkourCourse.js` pure course data from axis-aligned boxes + AI waypoints with action hints + checkpoints + pits (the ground under high sections is lethal).
- `src/parkour/ParkourAI.js` runner brain (presses the same buttons). `tests/parkour_course.sim.js` is the automated playtest: a skilled runner must finish with no falls, weak ones must mostly finish.
- `src/parkour/ParkourAnim.js` picks a baked Mixamo clip from the body state. Clips: `assets/parkour_anims.json` (chibi), `assets/avatars/<id>/parkour.json` (crypto, madea, samurai; lazy, 0.5 MB each). Source configs `tools/mixamo/pk.json`.
- `src/parkour/ParkourIsle.js` island terrain, course meshes (5 merged draw calls), pads, race, HUD, buttons.
- index.html hooks (same pattern as Surf): input takeover, `Parkour.frame()` after the physics, `animateClips` override via `q.pk`, partner sees your clip via the `pk` field of the state packet.

## Not verified on a real phone
Feel and difficulty with a thumb; wall-run clip orientation (one authored side, used for both walls); Redmi A3x frame rate; co-op (partner sees you, but the race is per player).

Running into a wall 1.6-3.7 m tall climbs it automatically; jumping at a wall in the air grabs and climbs it too.
