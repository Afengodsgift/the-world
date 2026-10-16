# Superhuman movement: audit, plan, and what is built

## Audit: how movement works today (index.html `tickFrame`, `src/input`, `src/camera`, `src/character`)
- **Model:** velocity with inertia, not teleporting. Ground: `Locomotion.move` (walk 6, sprint 12 m/s when stick >0.9 or Shift; swim 9/16). Flight: target speed `34` (`70` boosted) x stick x look-direction factor, eased with exponential rates 4 up / 3.2 down; vertical from the view pitch (`SpaceFlight.vertical`); heading slerps to the stick.
- **State:** `S.state` is derived each frame by priority (fly / jump / fall / swim / run / walk / idle). Sprint is only a speed, not a state; there is no super sprint, no water running (water = swim at y = -1).
- **Boost before this change:** a plain toggle (`S.boost` via button / `B`), plus timed `S.burst` from rings/races. 70 vs 34 m/s, nothing else.
- **Camera:** `CameraRig` is orientation-from-input, position-from-state; flight camera is blended by a flying weight (close chase, framing offset, 3D-speed FOV 66 -> 76 -> 89). Shooter mode has its own over-the-shoulder rig (`shooterActive`).
- **Animation:** only `idle walk jog sprint swim tread jump fall smack hit hit2` + emotes exist as clips. Flight (hover / cruise / boost) is a **procedural bone layer** (`FlightPose`) on top of idle. No fly, charge, roll, dive, aerial-attack or water-run clips.
- **Sync:** ~10 Hz `s` broadcast `{x,y,z,r,st,pn,bc}`; remote avatars are interpolated/extrapolated (`RemoteSmooth`, snap > 40 m, velocity clamp now 240 m/s). Remote pose is derived from position deltas + `st`, so nothing visual is networked except the charge level `bc`.
- **Shared with Outlaw (do not destabilise):** weapon pose (`Outlaw.poseGun`), `shooterActive()` camera, hit zones, `S.hurt`. Flight already allows shooting; the charge never touches aiming.
- **Limits found:** one speed tier per mode; boost has no commitment/payoff; sprint feedback is only speed; no momentum carry into a jump; water is binary (swim); few verbs usable while moving.

## Built (first pass): charged boost  (`src/movement/Boost.js`, `tests/boost.sim.mjs`)
`READY -> CHARGING -> BURST -> RECOVER -> READY`. **Tap** the boost button/`B` = the old toggle (unchanged). **Hold** > 0.18 s = charge: you brake to 0.42x speed (steering stays), camera moves in and FOV narrows, pose compresses, a rising wind band builds, the button becomes a charge ring ("RELEASE" at full). **Release** = burst: 140-224 m/s (2-3.2x boost) for 0.5-1.15 s, sharp 0.1 s rise, camera pulls back + FOV to <= 90, shockwave ring, whoosh, drives you forward even with an idle stick. Then it tapers through recovery into normal flight. Cannot get stuck (full charge auto-fires; maxHold 2 s; must let go before charging again). Landing, water, or a hard hit cancel a charge. Partner sees your charge pose (`bc`).
All values are in `Boost.CFG` (tapT, chargeT, minCharge, maxHold, fullHold, brake, brakeRate, peakMul, rise, durMin/Max, recover, cooldown, upRate, hurtCancel): tune against real traversal (islands ~6 km across: a full burst crosses ~220 m/s x 1.15 s ~ 250 m).

## Plan (not built yet), in order
1. **Super sprint** + momentum jump: add `RUN -> SPRINT -> SUPER` speed tiers inside `Locomotion` (acceleration curve, lean, FOV/audio/dust), carry horizontal velocity through `jump`, running jump -> flight without an animation reset. Reuse `sprint` clip with timeScale.
2. **Water running**: entry/exit hysteresis on speed + approach angle, hold `y` near the surface (no physics), wake/splash from `WaterFX`, falls back to swim below threshold, jump/boost out of it.
3. **Air dash / barrel roll / sharp turn**: impulses and a roll spring added to `FlightPose` (roll is procedural: acceptable), collision-aware via the existing ground/solids checks.
4. **Actions while moving**: keep Outlaw firing/aiming through charge and burst (already compatible); aerial melee hooks (`Melee`) with direction/impact agreement; airborne collectibles.
5. **Missing animations** (to source, not fake): fly-forward body, charge crouch, roll, dive attack, water-run cycle, aerial kick/punch. Everything else is approximated procedurally.
