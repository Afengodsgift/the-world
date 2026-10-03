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
| 2 | Verbs — data-driven interactables over `Interaction` | `src/interaction/Verbs.js`, `src/data/interactables.js` | next |
| 3 | Link — two-player primitives (both / hold / sync / split / tether) | `src/interaction/Link.js` | planned |
| 4 | Event Director — pure function of (roomSeed, timeSlot) | `src/world/Events.js` | planned |
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

## Roadmap
0 Net adapter ✔ · 1 WorldState + Journal ✔ · 2 Verbs v1 (dig, pickaxe, hammer + cave interior) ·
3 Link (twin plates, lockpick+lookout, synced emote) · 4 Event Director (meteor, shark surge,
golden ring) · 5 Zones (Storm Cay wind, Frost friction first) · 6 Home v1 (trophy shelf, aquarium) ·
7 polish/perf.
