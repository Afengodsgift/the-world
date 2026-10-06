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

## Altitude profile (`Space.f`)
`above` 0.9-3 km (over the clouds) / `weather` 0.75-1.3 km (rain is below you) / `thin` 0.9-12 km (haze clears) / `dark` 2.5-20 km (blue -> black) /
`stars` 5-24 km / `space` 9-26 km / `quiet` 2.5-15 km (world sound fades). Ceiling 90 km.

## Why two render slices
One depth buffer cannot hold "the avatar 9 m away" and "the world 20 km below": islands shimmer and stripe. Above 900 m the frame is drawn
far slice (everything beyond `part`, with its own near plane) then near slice (depth cleared, colour kept, scene background removed or
three.js would clear the far pass). Shadow maps are not rendered twice.

## Next (not built yet)
Space flight model (momentum/stabilisation), debris, the satellite and asteroid discoveries, two-player interactions through `Net`,
space map, and the architecture hooks for a second planet. Create them as `SpaceObjects.js` / `SpaceEvents.js` etc. next to these files.
