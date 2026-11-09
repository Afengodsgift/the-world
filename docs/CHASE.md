# Cops & Robbers (src/race/ChaseCore.js, src/race/Chase.js)

One player is the ROBBER, the other the COP. Hover-cars (the Rally cars, CarPhysics) skim land and sea, so the whole world is the arena. Button 🚔 under the Deep.

Round: grab the LOOT (gold beam), then reach the GETAWAY (green beam) within 90 s. The cop wins by filling the BUST meter (stay within ~24 m for ~3 s).
- Robber: 🛢 OIL (2 per round) slows a cop who drives over it. Carrying the loot makes you 5% slower.
- Cop: boost into the robber within ~8 m to RAM (slows him, spikes the meter). Catch-up pace up to +9% when far behind. Radar is stale (every 2.5 s) until the loot is taken, then live.
- Boost charges regenerate (11 s each). Roles swap each round; match score is kept until you leave.
- AI plays the other side (Easy / Normal / Hard). Rounds average ~30 s AI vs AI; the sides win about 55 / 45.

Tests: `node tests/chase.sim.js` (rules, layout, AI-vs-AI on the real physics), `tests/chase_browser.mjs` (real game, needs Chromium).
Standing multiplier `c.pace` was added to CarPhysics (default 1, no effect on Rally).

## Co-op (vs a friend in the world)
Lobby: pick a role, then "👥 vs <friend>". The friend gets an invite and plays the other role. The HOST owns the rules: it steps ChaseCore with its own car and the
friend's dead-reckoned car, and broadcasts snapshots (`ch:s`, ~8 Hz) and events (`ch:e`). Each phone drives its own car and sends it as `ch:c` (10 Hz, CarPhysics.pack).
A guest robber asks for oil with `ch:a`. The layout is a pure function of the seed (`ch:go`), so both phones build the same heist. Next round: the host's button
re-sends `ch:go` with swapped roles. Leaving sends `ch:l`.
Test: `tests/chase_net_browser.mjs` (two pages on the harness hub).
