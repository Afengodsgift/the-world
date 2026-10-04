# Flight + first-person shooting: design study and architecture

Built from the reference images (Superman hover / cruise / boost poses, Cyberpunk-style FPS viewmodel composition, and the
"good vs bad aiming" viewmodel diagram).

## 1. Flight: what the references say
| Question | Answer |
|---|---|
| What makes a hover feel like hovering? | Upright body, arms *away from the torso* with a soft elbow bend, legs together with pointed toes, level head, plus slow breathing/sway. Nothing is rigid, nothing is a walk cycle. |
| What changes in relaxed flight? | Body near-horizontal with a head-up arch, one arm leads, the other is *folded* (fist at the ribs), legs together with one knee bent. |
| What changes at high speed? | Steeper lean, both arms driven forward, head tucked in line, long legs: a spear silhouette. Plus *force cues* (FOV, speed lines, controlled buffet) instead of faster playback. |
| How to transition? | Never swap poses. Pose weights follow smoothed speed and **rise fast / decay slowly**; body pitch/roll are underdamped springs (a little overshoot on takeoff, a flare when braking); horizontal velocity has inertia. |

Animation-driven vs code-driven: baked clips = ground locomotion, emotes, melee. Flight, camera, viewmodel = procedural
(there are no flight clips, and procedural lets pose, speed and aim stay coupled).

## 2. First-person: what the references say
- Camera at eye height (1.64 m on this 1.88 m character), looking along exactly what the player drags (`S.yaw/S.pitch`).
- Weapon small, low, right of the crosshair; hands grip it; arms enter from below. **Rigid to the camera**: no blending between
  aim poses (that is the "BAD, halfway between" panels). Life comes from layered springs (sway, bob, recoil, reload dip, equip raise).
- Separate render pass with a fixed FOV so the gun never stretches when flight FOV widens, and never clips into walls.
- Composition defined in NDC and scaled by aspect ratio (phones are portrait), so it works on any screen.

## 3. How flying and shooting combine
Camera orientation is always the player's look direction. Flight only *adds*: FOV, bank, buffet, a head-following eye
position. The viewmodel stays rigid but carries (lowered/angled) at boost. Body pose follows the aim for other players.

## 4. Architecture (each concern is one module; `index.html` only calls them)
| Module | Responsibility |
|---|---|
| `src/character/FlightPose.js` | Pose tables (hover/cruise/boost), weights, spring pitch/roll, spine/arms/legs/head posing. Runs after the clip mixer. |
| `src/fx/FlightFX.js` | Speed lines (centre kept clear), hover swirl + downwash. |
| `src/camera/CameraRig.js` | Orbit / first-person / shoulder camera, flight FOV, bank, buffet, recoil kick, eye-follows-head, pitch range. |
| `src/combat/Viewmodel.js` | First-person arms + weapon, grip detection from the model, all viewmodel motion, muzzle position for tracers. |
| `src/games/Outlaw.js` | Gameplay only: calls `CameraRig.setShooter/kick`, `Viewmodel.update/kick`. |

Hooks in `index.html`: `FlightPose.apply` (inside the avatar animator), `CameraRig.update`, `FlightFX.screen`, `Viewmodel.render`.
Flight inertia lives in the movement code (`S.fvx/S.fvz`).

## 5. Tuning knobs
- Flight pose vectors: top of `FlightPose.js` (`HOVER`, `CRU`, `BST`, `SPINE`, `HEAD_PITCH`, `BASE_PITCH`).
- Flight FOV / bank / buffet: `CameraRig.update` ("FOV", "flight feel").
- Viewmodel size/position: `nx`, `sc`, depth in `Viewmodel.update` ("composition").
- Recoil per weapon: `RECOIL` in `Outlaw.js`.
