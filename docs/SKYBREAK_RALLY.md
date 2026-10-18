# SKYBREAK RALLY — audit, decisions, plan

Island-to-island racing inside THE WORLD. This file records the Phase 1 audit (what the repo and the asset pack really contain), the decisions
that follow from it, and the build status. It follows the rules in `DESIGN.md`: new systems register with `Net` / `Interaction` / `Systems`,
no refactor of `tick()`, data lives in `src/data/`, and every system gets a simulation test.

## 1. Status

| Phase | Item | State |
|---|---|---|
| 1 | Repository + asset audit | **done** (this file) |
| 2a | Vehicle physics core (ground, air, ramp launch, boost, flight, transformation, packet) | **done**: `src/race/CarPhysics.js`, `src/data/rally.js`, `tests/rally_car.sim.js` (55 checks) |
| 2b | Vehicle body + chase camera + input takeover + touch controls | blocked on a car model (section 3) |
| 3 | Track system (kit-grid authoring, analytic surface, checkpoints, boosts, hazards) | next; does not need a car model |
| 4–8 | Flight transition in the world, multiplayer race, AI, polish, expansion | planned (section 7) |

Nothing in `index.html` has been changed yet. The new files are not loaded by the game, so existing islands, multiplayer, controls and
activities behave exactly as before. All 44 existing suites plus the new one pass (`tests/run_all.sh`).

## 2. What the repository actually contains

* **There is no vehicle in the game.** The existing "Ground Race" (`KT` on Palm Atoll, `buildKartTrack`/`kartTick` in `index.html`) is run
  **on foot**: the avatar gets a 1.2x pace multiplier and gold pads give a 1.9x burst (`kartMul()`). `assets/cart.glb` is a market cart and
  `assets/kart_track.glb` is one straight + a finish line (16 KB). The only moving "vehicle" is the sloop (`src/ship/*`).
* **Flight exists, but for the avatar.** `S.flying` (34 m/s, 70 boosted), `Boost.js`, `SpaceFlight.js`, `FlightFX.js`, flight FOV/roll in
  `CameraRig.js`, and a ring-based Sky Race (`WP` waypoints). The rally flight mode is a separate, vehicle-style model on purpose (bank to turn,
  throttle, pitch with auto-level); it can reuse `FlightFX`/`Boost` visuals later.
* **Ship is the right precedent for a vehicle.** Pure physics module (`Sailing.js`), tuning in `data/ship.js`, a controller (`Ship.js`) that
  takes over the stick via `Ship.locked()` in `tick()`, a camera hook (`CameraRig.setShip`), host/guest sync at 12 Hz through `Net`, its own
  tests. Rally mirrors that structure. The one unavoidable `tick()` edit is the same two lines Ship already added (input takeover + pin the
  avatar to the seat).
* **Terrain:** one global `H(x,z)` plus `solids[]` circles. Islands are domes (relief ~4 m + a peak `pk`; Palm Atoll `pk:0`, Frost Isle `pk:60`),
  radius 180–320 m. A grounded lap on one island is therefore a few hundred metres; elevation variety has to be built (bridges, ramps, cliff
  pieces), and the long distances belong to the air.
* **Island gaps (coast to coast, measured from `data/islands.js`):** Palm Atoll → Storm Cay 427 m (~7 s at 58 m/s), Storm Cay → Frost Isle 545 m
  (~9 s), Palm Atoll → Far Reef 750 m (~13 s), Palm Atoll → Frost 1211 m (~21 s). **Proposed first route:** Palm Atoll (flat, already hosts the
  race track) → Storm Cay → Frost Isle (mountain finale, `pk:60`). Two flights of 7–9 s are short enough to be exciting and long enough for aerial gates.
* **Networking:** `Net.emit(type,data)` / `Net.on(type,fn)` over one Supabase broadcast event, `self:false`, presence per player. No ordering or
  delivery guarantee and **no server authority**. WorldState (convergent set/max/log) is available for results. The game is built for two people.
* **UI:** glass theme (`theme.css`, `.gl .pill .dk .sheet .card .btn .veil .toast`), `HudMode.extra` to switch to a minimal HUD, `Interaction`
  registry for "Start …" prompts, `Systems.add` for a per-frame loop isolated by try/catch.
* **Build/test:** no bundler, `<script>` order in `index.html` (enforced by `tests/load_order.check.js`), three r147 from a CDN (GLTFLoader and
  FBXLoader present, **OBJLoader is not loaded**), `tools/` holds offline asset bakers.

## 3. The asset pack you sent (`modular_racekart_track_collection_hilly_terrain.zip`)

**It is a modular track and terrain kit, not a car pack.** 206 OBJ + 206 MTL, 13 MB, **no vehicles, no flying vehicle, no animations, no
sounds, no textures** (flat-colour materials only). Searching for car/kart/vehicle/plane/wing/wheel in every filename finds nothing.
Either the wrong zip was attached or the cars are a separate pack. I have not invented any vehicle assets.

| Group | Count | Highlights |
|---|---|---|
| `Track_*` | 109 | Standard + Striped road, Single/Double, straights, widening, curves (3x3…6x6), esse (S-bend), inclines, finish lines (checkered/blank); **Bridge** set (flat, curve, start, gentle/sharp inclines, supported / floating variants, piers, **11 low-poly Collider meshes**); **Cliff** set (edges 1–3 tall, inclines 1–3 tall, curves up to 6x6) |
| `Terrain_*` | 35 | Grass flat, hill corners/sides/esse (3x3…5x5), cliff walls (1–3 tall, inner/outer corners), water disc |
| `Prop_*` | 62 | **`Prop_Track_Ramp`** (+ support, railing), **`Prop_Track_Ramp_Speed_Boost`** (a ready-made boost pad), **`Prop_Obstacle_Hammer`** (+ housings: a swinging hazard), bump rows, arch, finish banners, curve/esse warning signs, fences, trees, rocks, hay, windmill |

* Geometry: 64 611 triangles for **all 206 pieces**; a typical piece is 30–300 triangles. **25 unique flat materials** (Grass, Dirt, Rock, woods,
  Red, Off_White, Green_Boost_2, Water…), so any track merged by material is a few thousand triangles and ~25 draw calls: very mobile-friendly.
* Grid: 1 unit = 1 cell. `Track_Standard_Straight_Single` is 1 x 0.5 x 3 (one cell wide, three long); curves span their name (`Curve_Single_4x4` is
  4 x 4 cells); `Prop_Track_Ramp` is 2 long x 1 high; `Track_Standard_Incline_*` rises 1.5 over 3 cells; `Cliff_Incline_*_3_Tall` is 8 x 3.5 x 5.
* **Not yet verified (needs a render):** exactly what "Single" vs "Double" mean (both bounding boxes are 1 cell wide), and the right world scale.
  Working assumption: **1 cell = 6 m**, which gives a 6 m road, a 12 m x 6 m launch ramp (27 degrees) and a 48 m x 21 m 3-tall cliff incline: a
  genuinely "massive" launch when stacked. This is a constant in the track builder, to be confirmed in the first in-game look.
* Format: OBJ/MTL. The game loads GLB. Plan: `tools/build_rally_kit.js` bakes **only the pieces a route uses** into one GLB (one node per piece,
  shared materials), committed under `assets/rally/`. Keeps the download small and avoids shipping an OBJ loader.

### What the pack can and cannot do for the brief

| Brief item | From the pack | Gap |
|---|---|---|
| Roads, curves, S-bends, inclines, bridges, elevated roads, finish line | yes | none |
| Big ramps / launch | `Prop_Track_Ramp`, cliff inclines, bridge inclines | a purpose-built "mega ramp" is composed from these |
| Boost pads | `Prop_Track_Ramp_Speed_Boost` | glow/sound are ours |
| Moving obstacle | `Prop_Obstacle_Hammer` | animation is ours (rotate about the housing) |
| Slalom, narrow passages | bumps, fences, rocks, hay, bridge pieces | placement is ours |
| Scenery | trees, rocks, windmill, hills | islands already have their own vegetation: reuse theirs where possible |
| **Cars, flying car, transformation clip, engine/tyre sound, wheels, paint** | **nothing** | **everything** |
| Aerial course (rings, gates, clouds, wind) | nothing | built from procedural gates / existing ring + cloud code |

## 4. Blocker and options for vehicles

I can build and test all handling without a model (done), and the track system next. Driving it on screen needs a car body. Options, best first:

1. **Send the actual car pack** (ideally with a flying car or at least separable wheels). Kenney's CC0 *Car Kit* style models (separate wheel
   nodes, flat colour atlas) fit this game's art direction and this kit's flat materials.
2. **No flying model exists?** Then the transformation is built from the car itself, exactly as the brief allows: wheels tuck up into the body,
   a pair of wing/fin meshes extend (simple generated geometry in the car's colour), a thruster glow lights up, with a ring burst and a FOV punch. It
   needs a car model whose wheels are separate nodes. It will not be claimed as an authored animation.
3. **Temporary body** (only if you want to see driving before the pack arrives): a clearly-labelled low-poly placeholder, swapped out the moment a real
   model is dropped in. I will not ship it as the final art.

## 5. Decisions

1. **Physics is a pure module** (`CarPhysics`), like `Sailing`: deterministic, no THREE/DOM, driven by an `env.ground(x,z,y)` callback. The same
   code runs the player, remote dead-reckoning and AI.
2. **Tracks are data, not meshes.** A route is an ordered list of kit pieces on a grid (type, cell, rotation, rise) plus checkpoints, boosts,
   hazards and landing zones. The visual is built from the pack pieces; **the drivable surface is analytic per piece type** (flat, linear incline,
   ramp, bridge deck), composed with `H()` and queried through a spatial hash. No per-frame mesh raycasting (mobile). The pack's Collider meshes
   inform the profile, they are not used at runtime.
3. **Launch comes from geometry.** The car leaves the ground only where the surface falls away faster than it can follow (`stickSlope`), carrying
   the surface's climb rate, so ordinary hills never launch you and a ramp always does. Verified against ballistic maths (apex within 12 %).
4. **Flight is its own mode, not the avatar's flight.** Bank to turn, pitch with auto-level (no unrecoverable dive), throttle = speed, climbing
   bleeds speed, diving gains it, boost. Touch-down is allowed only inside a landing zone; elsewhere the ground pushes you back up (scrape, small
   speed cost), so a missed landing costs a little speed instead of the race.
5. **Transformation preserves state.** `toFly`/`toCar` keep position, heading, velocity and boost charges (tested); the race layer only decides *when*.
6. **Vehicle classes are stat blocks** (`ace` balanced, `comet` fast/loose, `bruiser` heavy/grippy/more boost). Different handling is real today;
   different bodies arrive with the pack.
7. **Multiplayer = host-coordinated, client-simulated.** Each player simulates their own car and broadcasts a 10-number packet (~48 bytes) at
   ~10 Hz via `Net`; receivers dead-reckon with `RemoteSmooth`. The race host (whoever starts it) owns the start time (`t0` in the future, so
   clients start together), validates checkpoints, and publishes rankings. Discrete events (start, checkpoint, transform, recover, finish) are
   reliable-ish messages with sequence numbers and a snapshot resend, because broadcast has no delivery guarantee. **Honest limit:** there is
   no server authority, so validation is plausibility (gate order, minimum possible time between gates from top speed, position within the gate
   radius), enough for friends, not tamper-proof. A real anti-cheat would need a Supabase Edge Function referee, which I would propose only if
   you want public leaderboards. No database writes happen per physics step; only results go to WorldState.
8. **AI uses the same physics module** and follows the route's racing line and aerial path with a skill profile (target speed fraction, lookahead,
   mistake rate); no rubber-banding speed cheats. Human-vs-AI traffic costs nothing on the wire if AI runs only on the host and is sent like a player.

## 6. Performance budget

Merged kit pieces (<= ~25 draw calls for a whole island's track), `StaticBatch.autoFreeze` for scenery, one shared material per colour, no per-frame
allocation in physics (reused event object; tested for finite/bounded state over 90 000 random steps), HUD via the existing glass classes, effects
pooled. No new dependency, no physics engine, no build step.

## 7. Plan from here (order adjusted from the brief)

The brief's Phase 2 assumed a car model. Since the pack has none, the order is: **2a physics (done) → 3a track system and its tests (no model needed)
→ 2b body/camera/controls (as soon as a model exists; placeholder meanwhile) → 3b first playable island → 4 flight in the world → 5 multiplayer
→ 6 AI → 7 polish → 8 expansion.** Each step ships with a simulation test, and `tests/run_all.sh` stays green.

Next commit: `src/race/Track.js` (pieces → surface function + checkpoint/lap/progress logic, pure) and `tests/rally_track.sim.js`, then the kit
baker `tools/build_rally_kit.js`.

## 8. Open questions

1. Which car pack should the vehicles come from (the zip attached was the track kit)? Does it include a flying car or separable wheels?
2. Confirm the first route: Palm Atoll → Storm Cay → Frost Isle?
3. Public leaderboards later, or friends only? (decides whether a server-side referee is worth building)
