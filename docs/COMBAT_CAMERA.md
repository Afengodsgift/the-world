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
Separate exploration / close-combat (grapple) cameras, wall-obstruction fade of scenery, vertical-combat pitch, camera-sensitivity / distance / invert UI, finishers and per-boss phase-transition cinematics (Gwyn kneeling), skippable intro for every boss.

## Dynamic action camera additions
- Lock-on now also frames a weighted midpoint (look-at leans 12-30% toward the boss, more as he gets further away) so you and the boss stay in frame; tall bosses lift the look-at (pitch bias).
- Dodge flares the FOV a few degrees (springs back); collision pull-in (armFree) and shoulder offset were already in.

## Dynamic Blink (Kage, Dark Knight, Vael, veil-class blinkers)
- Arrival vector random per blink: behind / side / front / above (lands ON the marked spot, then an overhead). Ring lock >= 20 ticks before arrival, as always.
- Hang time by move id: `blink` instant (26-tick windup), `blinkm` ~2 s, `blinkl` ~4 s (phase 3 / Mastery only, rare). Shadow particles swirl around you during the long hang.
- On arrival: smoke burst + a crossed pair of rift slashes; the follow-up strike has 8 ticks of its windup already played (never below 18 ticks left).

## Multi-foe framing + distance (this pass)
- **Threat-weighted framing:** with 2+ foes awake the look-at leans toward the weighted middle of the awake ones (weight = 1/(1+0.35 d)^1.6, the locked foe x2.5; 55% middle / 45% target), and the camera pulls back up to 2.4 m for the crowd. One foe is framed exactly as before.
- **Camera distance:** `V` cycles Normal / Far / Close (stored in `wcam.dist`, +-5 m of bias at the extremes). There is still no settings screen for sensitivity or invert.
- Built: skippable intros (any tap / key; seen ones not repeated) and Gwyn's kneeling phase-2 cinematic (`kneel` preset, clips gw_kneel / gw_pray / power). Still not built: grapple / exploration cameras, scenery fade, vertical-combat pitch, finishers, other bosses' phase cinematics.
