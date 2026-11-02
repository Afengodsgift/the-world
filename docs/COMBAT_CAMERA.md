# The World - Combat Camera (V1, in progress)

Golden rule: **the camera never makes a difficult attack harder to read.** It helps orientation; it does not play the fight.

## Built (src/camera/CameraRig.js + src/combat/PlayerCombat.js)
- **One owner of the camera transform** (CameraRig). Fight code only sets *targets*: `setBias` (distance for foe size / distance / count), `combat(d, fov)` (per-move offsets, eased), `pulse(fov)` (spring impulse), `shake`, `setFocus`, `setArena`. Cinematics (CineCam) take over through their own preset and hand back.
- **Auto lock-on:** the first awake boss is locked as soon as the fight starts, the next one when it falls, a boss that wakes later is picked up; turning lock off yourself keeps it off.
- **Lock-on yaw:** turns only when the target leaves a ~11 degree cone, max 3.2 rad/s (a boss passing behind swings round smoothly, no 180 flip), and any camera drag by the player suspends it for 1.2 s.
- **Per-move responses** (`camMoves`): charges/leaps widen +2.4 m / +6 deg FOV, flurries pull back +1.6 m so the whole sequence reads, projectile fields +1.9 m, area bursts +2.2 m. Perilous start: -2.2 deg micro-zoom; perfect parry: -3.2 deg + a tiny shake; mikiri/perilous dodge: -4 deg + shake. No dramatic zooms.
- **Arena:** camera clamped to the arena circle and pushed out of pillars; obstruction pull-in with slow ease-out.
- Settings (localStorage `wcam`): `assist` (0 = no automatic turning), `move` (0 = no per-move responses).

## Not built yet
Separate exploration / close-combat (grapple) cameras, wall-obstruction fade of scenery, threat-weighted framing with several enemies, vertical-combat pitch, camera-sensitivity / distance / invert UI, finishers and per-boss phase-transition cinematics (Gwyn kneeling), skippable intro for every boss.
