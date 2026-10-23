# World -> Space (vertical universe)

The world does not end at the sky. Everything below is a smooth function of **altitude**: no zones, no loading, no "space unlocked" event.
Both players derive the sky locally from their own altitude, so nothing visual is networked (only position/state, as before).

## Modules (`src/space/`)
| file | job |
|---|---|
| `SpaceManager.js` (`Space`) | altitude profile `Space.f.*` (0..1 factors) + the two-slice depth render (`Space.render`) |
| `SpaceFlight.js` (`SpaceFlight`) | how flight scales with altitude: climb/sideways multipliers, terminal velocity & gravity (re-entry), world bound |
| `SpaceEnvironment.js` (`SpaceEnv`) | the world seen from above: opaque sea, curved rim, atmosphere glow, world-fixed cloud deck |
| `SpaceObjects.js` / `SpaceEvents.js` | things to find out there (beacon, approach assist, discovery, shared journal) |
| `SpaceMap.js` (`SpaceMap`) | WHERE things are, in one place (belt, planet, the gate's axis), plus shared 3D value noise |
| `SpaceBelt.js` / `SpaceGate.js` / `SpacePlanet.js` | the asteroid field, the two-person ring inside it, and a second world (below) |

Other systems only *read* `Space.f`: `Environment.js` (sky colour, stars, fog, weather, cloud tint), `Ambience.js` (wind fades, space pad),
`CameraRig.js` (distance/FOV/shake, height-follow), `RemoteSmooth.js` (partner smoothing at altitude speeds). `index.html` calls
`Space.update`, `SpaceEnv.update`, `Space.render`, and uses `SpaceFlight` in the flight integration. Below 900 m every function is the
original behaviour (multiplier 1, 48 m/s terminal; covered by `tests/space.sim.mjs`).

## Altitude profile (`Space.f`), paced like the reference sheet
`above` 0.9-3 km (over the clouds) / `weather` 0.75-1.3 km (rain is below you) / `thin` 0.9-20 km (haze clears) / `deep` 1.5-20 km (blue deepens) /
`stars` 14-100 km (very gradual) / `dark` 30-100 km (violet haze, then black) / `space` 40-110 km / `quiet` 3-45 km (world sound fades). Ceiling 140 km.
Sky colour above the clouds ignores the weather below you; beyond the world's rim is sky/space, never a grey floor.

## Flying where you look
`SpaceFlight.vertical(e,bm,fwd)`: inside the original look range (view elevation -0.8..0.35) it is bit-identical to the original climb/dive clamp.
Looking further up/down (third person allows pitch -1.35..1.5 while flying) fades the horizontal speed out and raises climb/dive speed to the forward
speed: look straight up and you go straight up (900 m -> 100 km in ~40 s with Boost). `tests/space.sim.mjs` covers this.

## Why two render slices
One depth buffer cannot hold "the avatar 9 m away" and "the world 20 km below": islands shimmer and stripe. Above 900 m the frame is drawn
far slice (everything beyond `part`, with its own near plane) then near slice (depth cleared, colour kept, scene background removed or
three.js would clear the far pass). Shadow maps are not rendered twice.

## Discoveries in space (`SpaceObjects.js`, `SpaceEvents.js`)
`SpaceObjects.register({id,name,pos,build,update,found})` adds a thing to find. The module does the shared parts: a distant blinking beacon (only against a dark
sky, constant ~20 px on screen so it is noticed but still just a light), the real model only within 5 km, approach assist, and discovery.
- **Findable, not trippable:** you must be within 90 m AND look at it for ~1.4 s. One quiet line ("FOUND SOMETHING"), a soft low tone, no checklist.
- **Approach assist:** `SpaceFlight.setAssist` eases flight speed from full altitude speed (x200+ at 112 km) back to normal within 3 km -> 300 m of any object.
  Partners are judged with `moveMulRaw` so their smoothing does not depend on what *you* are near.
- **Shared:** objects call `SpaceEvents.discover(id, info)`, which writes ONE Journal entry (`WS.log('space', id, {text,icon,x,y,z})`, idempotent, converges
  between phones, persists in Supabase) and a `space` set. If your partner finds it you get a quiet "Your partner found something out here." Objects never touch
  Net or Supabase directly. `SpaceEvents.on/emit('sp:<type>')` is the live channel reserved for two-player interactions.
- **Satellite:** gold-foil bus, one good and one torn solar wing, dish, mast, nav light, 9 pieces of debris drifting around it; ~620 triangles, one 128x64 texture.
  It sits at (8, 112, -11) km: ~14 km from the top of a straight climb over the town, 41 degrees up. Its beacon turns cyan once found.
- Tests: `tests/space_objects.sim.mjs`.

## Out there: the belt, the ring, a second world (`SpaceBelt.js`, `SpaceGate.js`, `SpacePlanet.js`, positions in `SpaceMap.js`)
A trail with a reason to follow it: the satellite (112 km up) -> a blinking light far off toward the second world -> an asteroid field -> a ring in its middle that
faces the planet -> the planet itself. Nothing is marked on a map; you see a light, fly to it, and what you find points to the next thing.
- **Drift (`SpaceFlight.drift`)**: in open space you keep your momentum. Let go of the stick and the glide-out lasts up to ~8x longer (rate x0.12); pressing still accelerates
  at the normal rate. 1.0 (no change) below 40 km, so the ground and the sky are exactly as before. Applied to the horizontal and vertical smoothing in `index.html`.
- **Framework additions (`SpaceObjects`)**, all optional per definition: `r` (distances are measured to the surface, so a field or a planet is "reached" at its edge),
  `assist:[near,far]` (approach-assist range in metres from that surface), `findR`, `always` (updated every frame, the def owns `group.visible`: impostors), `noBeacon`.
- **Asteroid belt** (-190, 140, 230 km; 2.6 km radius): 118 rocks in four shapes drawn as four `InstancedMesh`es (~10k triangles), sizes 12 m to 300 m, a thin disc with a round
  clearing at its middle and a clear lane down the gate's axis. Seeded, so both phones see the same field with no network. The rocks are solid (`SpaceBelt.collide`:
  you slide around them, no damage). ~1 ms/frame inside the field, nothing outside it. Found by getting close to its edge and looking at it.
- **The ring** (the middle of the belt, 100 m radius, faces the planet): three broken arcs, cyan inlay, two posts 124 m apart inside it. Built on `Link.both`
  (`src/interaction/Link.js`, which gained an optional per-zone `dy` for 3D zones): when two people stand at the two posts at the same moment for 3 s it wakes: the inlay,
  posts and shimmer light and a column of light runs toward the planet. Positions only, no new network traffic; each phone writes the same idempotent
  `SpaceEvents.discover('gate_awake')`, so it stays awake for good (the next session starts lit). Alone at a post you get one line after 5 s: "It hums. It wants someone at
  the other post." Two people at the same post do nothing.
- **A second world** (-520, 300, 610 km; radius 90 km; ~805 km from home): procedurally generated (teal and indigo seas, rust and dusk-violet continents, dark ridges, ice caps,
  a separate cloud layer, a thin amber atmosphere), so it is visibly somewhere else. Drawn as an impostor like the home world (the far slice ends at 900 km): beyond 600 km it is
  drawn 600 km away and scaled by the same factor, which keeps its apparent size exactly. Fades in with the stars (nothing below ~35 km, fully by ~95 km). Textures are
  generated 4+2 rows per frame while you climb past 6 km, so nothing stalls. Solid (held 600 m above the surface); approach assist slows you to normal speed in the last 4 km.
  Found within 150 km looking at it: "Another world. Nobody has been here." There is nothing to land on yet; that is the hook for later.
- **The arrow** (`SpaceObjects.next`, `spaceTrack()` in `index.html`): in space an amber arrow with a label ("Signal", "A light", "A ring", "A world" and the distance) points at the next thing
  on the trail you have not found: satellite -> belt -> ring -> planet. Found things drop out and it moves on, so a visit to space always has somewhere to go and nothing needs
  a code or a URL. It is projected by hand (these things are hundreds of km away, far beyond the camera's 4 km far plane, which would flip the usual world-to-screen helper) and is
  kept out of the Boost / Jump corner. The planet sits just above where the world opens up (60 km) because the flight camera looks ~24 degrees down: any higher and it hangs just
  above the top of the screen and nobody sees it (this is what happened the first time).
- **The planet has its own sun** (`SpaceMap.sun`, fixed) and its own shaders: lit by the home world's sun it was a black disc half of every day. From the belt it is a bright gibbous world.
- Tests: `tests/space_world.sim.mjs` (placement, drift, framework additions, the belt's layout and collision, the gate with the real `Link` incl. the failure cases and
  persistence, the planet's generation/impostor/collision/discovery, the trail arrow, inertness on the ground). Also checked in a real headless Chromium (software WebGL) driving the actual game.

## Next (not built yet)
Two-player interaction with the satellite (two ports 18 m apart, both players activate), what the ring does besides pointing, a surface you can reach on the second world
(landing, weather, a reason to go), a space map, more rocks that move (asteroids that drift across your path), sound for the belt and the ring.

## Flight camera (`CameraRig.js`)
Designed from third-person camera practice: a tight chase camera for fast action (damping that is too loose feels floaty and lets the target leave the
frame), a chest pivot with a framing offset (Cinemachine's "vertical arm"), distance that depends on pitch, look-ahead, and a moderate damped FOV.
Everything is blended by a smooth flying weight, so the walking camera is unchanged (9 m).
- 4.6 m behind (3.4 m looking straight up, 5.2 m looking down, +1 m at boost); the old camera was 9-16 m
- height follow is stiff in flight (lag = speed/k; the old loose follow trailed by more than the camera distance at climb speed)
- camera raised along its own up axis (target too): same view direction, character low in frame, the sky you are heading into above it
- speed effects use total 3D speed, so flying straight up counts as flying fast; FOV 66 -> 76 cruise -> 89 boost (was 98); no extra pull-back in space
- `tests/camera_flight.sim.mjs` checks framing at ground level and at 20/60/120 km (up to 16 km/s), distances, FOV, no NaN

## Open space (how big it is)
- **No wall.** Above 60 km the world's edge is gone; space is open out to 1,200 km from home. The limit exists only because 32-bit floats cannot hold a skinned
  avatar together much farther out (verified: limbs tear apart at 5,000 km). The fix is a floating origin (render relative to the camera): planned, then the limit goes.
- **Speed scales with distance from home** (`SpaceFlight.moveMulRaw(y, rr)`: altitude, or half the horizontal distance if larger, blended in over 30-70 km so the atmosphere is
  exactly as before). Crossing space feels the same at 100 km and 1,000 km: 1,000 km out in ~30 s boosted, and the same scaling slows you on the way back (no overshoot).
- **Falling home:** below 60 km the only way to be outside the funnel is to have come down from open space; the excess is shrunk in proportion to the descent, so you arrive
  inside the world at 1.5 km, never a jump (largest single-frame slide measured ~600 m).
- **Home stays visible:** the real world fades into the dark by 700 km (fog) while a flat impostor of the world disc (true angular size, kept inside the depth range) plus a soft
  halo (never smaller than ~.045 rad) takes over. HUD shows "N km from home" beyond 150 km.
- **Dust** (220 world-fixed motes as line segments) streaks past in space: the only reference that shows you moving, since the stars are infinitely far.
