# THE WORLD — design & architecture direction

A small persistent universe for two people. Loop: **explore → notice → interact → world reacts →
discover → remember → explore again.** We build reusable foundations first, not isolated minigames.

## Ground truth (audited from the live repo)
- The world is **deterministic**: terrain, vegetation, shards and hunt sites derive from
  `mulberry(hashSeed(roomCode))`, so both clients build identical worlds with no sync.
  New content should derive from the seed; only *outcomes* travel.
- Realtime only used Supabase for channel + presence. All memory was per-device localStorage
  (`w4:<room>`, `w4t`, `w4sm`, `w4best`, `w4kart3`, `w4shark`, `w4slalom`, `w4dash`, `w4ow`, `w4ow2`).
- 24 hardcoded broadcast events (start/progress/finish trios per activity).
- 12 action animations exist but only `dig`/`interact` are used: pickup, useitem, push, hammer,
  saw, pickaxe, chopw, lockpick, dig2, fish, fix (+ throw).
- Unused: `village.glb`, `nature.glb`; houses are solid shells; the cave is a flat door plane.

## Foundations (build order)
| # | System | Where | Status |
|---|---|---|---|
| 0 | `Net` adapter — one namespaced event for all *new* systems | `src/core/Net.js` | **done** |
| 1 | `WorldState` — shared memory, Supabase + local + live | `src/core/WorldState.js` | **done** |
| 1 | Journal v0 — read-only view over the log | `src/ui/Journal.js` | **done** |
| 2 | Verbs — data-driven interactables over `Interaction` (camps: dig/mine/repair) | `src/interaction/Verbs.js`, `src/data/interactables.js` | **done** |
| 3 | Link — two-player primitives (`both`, `sync` done; hold/split/tether next) + Vaults (twin plates, call-together shrine) | `src/interaction/Link.js`, `src/world/Vaults.js` | **done** |
| 4 | Event Director — pure function of (roomSeed, timeSlot); meteor shower, wandering visitor, golden rings | `src/world/Events.js`, `src/world/events/*.js`, `src/data/events.js` | **done** (shark surge needs sea-life hooks) |
| 5 | Zones — island rule modifiers via one hook in `tick` | `src/world/Zones.js` | planned |
| 6 | Home — slots driven by state, a physical record of adventures | `src/home/Home.js` | planned |

Rules: new code never writes `S` directly; new systems register with `Net`/`Interaction`/`WS`
instead of editing `enter()`; no refactor of `tick()`; data in `src/data/`.

## WorldState contract
Writes are **convergent** so two phones can never overwrite each other:
sets → union, numbers → max, journal → insert-once per `(kind,key)`.
API: `WS.addToSet(k,x)`, `WS.max(k,n)`, `WS.set(k,v)`, `WS.get/getSet`, `WS.log(kind,key,data)`,
`WS.entries()`, `WS.onChange(fn)`. Tables: `supabase/001_world_memory.sql`.
Security note: anon key + unguessable room code; RLS allows read/insert/update, never delete.

## Verbs (design)
Interactable = `{id,pos|seedRule,radius,verb,tool?,durationMs,needs?,stateKey,onDone,visual}`.
Flow: proximity → prompt → hold Use (progress) → verb animation via `userData.emoteReq`
(bypassing the "land to emote" guard) → write WorldState → `Net.emit` op → both clients apply.
Late joiners read state; positions come from the seed. Existing `Interaction.register` entries
remain as the "start" verb for races/Outlaw/Tag.

## Two-player primitives (Link)
`both` (two zones held at once), `hold` (one holds, one acts), `sync` (same time window),
`split` (per-client info, role by sorted ids), `tether` (max distance).
Strong concepts: twin plates, spotter+digger, cipher door, counterweight lift, tandem push,
tether crossing, lockpick+lookout, synced emote lock, valve+crosser, air share, rescue,
catapult plate, fishing duo, ping+pin, split fog map, shrine ritual.

## Events (design)
`event = f(roomSeed, timeSlot)` — no network traffic for scheduling; only outcomes sync.
One active at a time, ≥6 min gap, 4–8 min life, quiet when offline. Telegraph through the world
(beam/sound/silhouette), not notifications. Use server time for the slot index.

## Island identities
Ember: heat vents/updrafts · Frost: ice friction · Sunken: underwater ruins + air (needs a carved
basin in `H()`) · Palm Atoll: speed/time, ghost replays · Far Reef: marine sanctuary/fishing ·
Storm Cay: wind (`S.kx/kz`) + lightning rods · Boneyard: relics, ghost bandits, vault ·
Outlaw Isle: stays specialized · Sky: wind currents, cloud platforms · Main: town restoration, cave hub.

## Outlaw arena (whole-island battlefield)
- `src/games/OutlawArena.js` (built by `Outlaw.build()`): the whole of Outlaw Isle is the arena, not just the 46 m town. Relief in `H()` (Lookout Ridge west ~13 m, Mine Mesa east ~9 m), desert ground colour, no vegetation within `OUT.clear` (175 m).
- Zones: Old Mine, Lookout Ridge (watchtower), Dry Gulch Ranch (barn, corral, windmill), a railroad along the north with a shuttling train (5 units, each 2 moving cover circles; standing on the tracks as it passes hurts), cacti + tumbleweeds. Four new named discoveries.
- Breakable cover (crates, hay, barrels) has HP and is real cover (bullets, NPC cover logic); red barrels explode and chain; everything grows back at each wave start. Bullets/rockets/dynamite damage it.
- Fronts: each wave the raiders come from 1 (waves 1-2), 2 (3-5) or 3 (6+) of five spawn points; snipers prefer the ridge; raiders sprint when far. NPC roaming limit is 195 m and land-checked.
- Net: layout is a fixed seed (identical everywhere, so breakable ids match). Events on the existing `og` channel: `cv` client damage -> host, `cb` break (host -> all), `fr` fronts, `rs` regrow. The train follows the wall clock and is re-synced to the host's phase (`tr` in the 10 Hz snapshot).
- Tests: `tests/outlaw_arena.sim.js` (relief, break/regrow host + client, chain, train, fronts). Slices still to do: shooting feel, wave variety (train robbery, stagecoach escort, jailbreak); a mounted gatling is a candidate obstacle.

## Combat Feel V2 (Outlaw) - slice 1: aim + camera
- **Hold fire + drag the same thumb = shoot while aiming**: `#owfire` captures its pointer and feeds `lookBy(dx,dy,1.15)` (src/input/InputManager.js, shared with the canvas look area); firing continues until release. No more lifting the thumb to look.
- **Aim is the camera's**: `aimPoint()` casts the CAMERA ray (starting past the player so nothing between camera and player intercepts it) to find what is under the crosshair; bullets then leave the muzzle toward that point. The old "snap to the nearest raider" redirect and the view drift toward targets are gone; `lockTarget` is now only a marker for a raider you already aim near (< .1 rad).
- **Body is independent of movement while armed**: movement stays camera-relative, but `S.rot` follows the aim, so you can strafe/backpedal/circle while aiming (the locomotion rotate-to-heading is skipped when `CameraRig.shooterActive()`).
- **Combat camera**: the armed default is now the over-the-shoulder view (`view:'tps'`; the eye button still toggles first person): ~4.1 m behind, 1.0 m shoulder offset, +3 deg FOV, pitch range -0.95..1.25 so you can aim up at the ridge/tower.
- **Reticle**: four small ticks that open with recoil and movement, flash red on a hit and gold + bigger on a crit.
- Next slices: hit zones + cover-aware rays, combat locomotion/animation, hit reactions + death, AI roles/cover/LOS/flanking, weapon feedback, two-player balancing.

## Combat Feel V2 - slice 2: hit zones + cover that really blocks
- `src/combat/HitZones.js` (pure maths, `tests/hitzones.sim.js`): every raider has 6 invisible volumes (head sphere, torso capsule, 2 arm capsules, 2 leg capsules), in units of its scale, rotated with its heading, slightly generous on a phone (radius grows a little with range, capped). A shot asks which body part the ray reaches FIRST, before any cover.
- Cover is a cylinder with a real height (`{x,z,r,y,h}`; no `h` = unlimited, e.g. buildings): crates 1.3 m, barrels 1.2, hay 1.7, boulders ~1.2 r, train cars 4 m. A ray that passes over a crate can hit the head of a raider standing behind it; lower down it is blocked (and the crate takes the damage).
- Damage = weapon damage x zone multiplier: torso 100%, arms 60%, legs 65%, head per weapon class (`WEAPONS[].snd`: pistol 2.2, smg 1.6, rifle 2, shotgun 1.5 per pellet, sniper 3.5) x a per-raider softener (brutes .7, sheriff boss .6, warlord .5) x (1 + 6% per crit upgrade level). The old random 8% crit is gone: headshots are the crits (gold reticle + gold number + crit sound).
- `aimPoint()` uses the same zones, so what the crosshair is on is what gets hit. The hit zone travels with client damage (`{k:'h',id,d,z}`) and is stored as `n.lastZone` for hit reactions (slice 4).
- NOT changed yet: raiders' own line of sight / cover choice is still the old 2D test (their cover blocks at any height), so they can't shoot you through a crate but you can shoot them over it. Slice 5 makes it symmetric.
- Debug: add `?hz=1` to the URL (or `Outlaw._t().dbgZones(true)`) to draw the zones.

## Roadmap
0 Net adapter ✔ · 1 WorldState + Journal ✔ · 2 Verbs v1 ✔ (cave interior still open) ·
3 Link ✔ (twin plates, synced shrine; lockpick+lookout later) · 4 Event Director ✔ (meteor, visitor, golden rings; shark surge later) · 5 Zones (Storm Cay wind, Frost friction first) · 6 Home v1 (trophy shelf, aquarium) ·
7 polish/perf.

## Testing
`tests/run_all.sh` runs the script-order check and four simulations (WorldState, Verbs, Vaults, Events) with
two fake clients, a fake Supabase and the real terrain/modules. Needs `three@0.147.0` (`npm i three@0.147.0`, set `NODE_PATH`).
Dev helpers: `Verbs.tp(i)`, `Vaults.tp(i)`, `Events.force('meteor'|'visitor'|'rings')`, or open the game with `?ev=meteor`.

## UI (glass theme)
`src/ui/theme.css` owns the look of every control: dark-tinted glass (readable on bright sky and at night), tokens prefixed `--w-`.
- **Landscape phones** are laid out by `index.html` (variables `--T --S --J --map-r --bar-b --sheet-h ...` in `@media (orientation:landscape) and (pointer:coarse)`).
  The theme only SKINS that layout; our own classes (`.dk`, `.pbar`, `.sheet`) read the same variables.
- **Portrait/desktop** fallback positions live in `@media not all and (orientation:landscape) and (pointer:coarse)` in theme.css.
- New UI: use `.gl .pill .dk .sheet .card .btn .veil .toast`, never inline styles for chrome. Don't define custom properties that index.html also defines (`tests/css_theme.check.js` enforces this).
- `Theme.js` adopts legacy race/activity text lines as glass pills and switches `<html class="lite">` (no blur) if FPS stays low; `?glass=full|lite` forces a mode.
- Two-player primitives (`Link`) refuse to complete without a connected partner, and `Vaults.solve` double-checks and logs a warning.

