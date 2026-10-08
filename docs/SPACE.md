# World -> Space (vertical universe)

The world does not end at the sky. Everything below is a smooth function of **altitude**: no zones, no loading, no "space unlocked" event.
Both players derive the sky locally from their own altitude, so nothing visual is networked (only position/state, as before).

## Modules (`src/space/`)
| file | job |
|---|---|
| `SpaceManager.js` (`Space`) | altitude profile `Space.f.*` (0..1 factors) + the two-slice depth render (`Space.render`) |
| `SpaceFlight.js` (`SpaceFlight`) | how flight scales with altitude: climb/sideways multipliers, terminal velocity & gravity (re-entry), world bound |
| `SpaceEnvironment.js` (`SpaceEnv`) | the world seen from above: opaque sea, curved rim, atmosphere glow, world-fixed cloud deck |

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

## Next (not built yet)
Space flight model (momentum/stabilisation), asteroids and loose debris, two-player interaction with the satellite (two ports 18 m apart, both players must
activate), the distant unknown object, space map, and the hooks for a second planet. Create them as `SpaceObjects.js` / `SpaceEvents.js` etc. next to these files.

## Flight camera (`CameraRig.js`)
Designed from third-person camera practice: a tight chase camera for fast action (damping that is too loose feels floaty and lets the target leave the
frame), a chest pivot with a framing offset (Cinemachine's "vertical arm"), distance that depends on pitch, look-ahead, and a moderate damped FOV.
Everything is blended by a smooth flying weight, so the walking camera is unchanged (9 m).
- 4.6 m behind (3.4 m looking straight up, 5.2 m looking down, +1 m at boost); the old camera was 9-16 m
- height follow is stiff in flight (lag = speed/k; the old loose follow trailed by more than the camera distance at climb speed)
- camera raised along its own up axis (target too): same view direction, character low in frame, the sky you are heading into above it
- speed effects use total 3D speed, so flying straight up counts as flying fast; FOV 66 -> 76 cruise -> 89 boost (was 98); no extra pull-back in space
- `tests/camera_flight.sim.mjs` checks framing at ground level and at 20/60/120 km (up to 16 km/s), distances, FOV, no NaN
