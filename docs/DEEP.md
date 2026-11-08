# The Deep (deep-sea dive)

Press the 🤿 button (right edge, under the Sky Raid 🛩) to open the lobby. A dive is a one-person submersible run into a trench basin that hangs 300 m under the sea south of Shell Beach (`AT` in `Deep.js`).

- **Rules**: `src/games/DeepCore.js` (pure, deterministic; `node tests/deep.sim.js`). **Drawing**: `DeepWorld.js`. **Controller / HUD / shop**: `Deep.js`.
- **Hooks in shared files** (all one-liners): the stick, `Deep.frame(dt)` after `CameraRig.update` and `Deep.locked()` in the busy check (`index.html`); `if(S.pocket)` early-out in `Dive.step`; `Deep.fog()` read in `Environment.js` just before the fog is applied.
- **Co-op**: the trench is seeded from today's date, so friends diving the same day see the same trench; their presence (hidden avatar, drawn as a sub) shows up without any handshake. Each diver keeps their own hull, loot and kills.
- **Loop**: oxygen clock (300 s), hull, battery (lamp, boost, harpoon, sonar), crush depth (250 m base, +42 per Depth rating level). Loot: 3 wrecks, a temple relic, vent crystals, gold glints, air pockets refill air and battery. Creatures: jellyfish (sting + stun), anglerfish below 110 m (they chase a lit lamp), the Kraken in the pit (telegraphed swipe / charge / ink) which drops the Abyssal Pearl (800 coins).
- **Payout**: coins for everything collected + a depth bonus; surfacing keeps 100%, blacking out keeps 40%. Upgrades in the Sub shop (hull, air, battery, depth rating, harpoon), saved on the phone (`deepup`, `deepbest`).
