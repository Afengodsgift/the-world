# The World - Boss Combat Standard

> **Harder to master, not harder to understand.**
> A boss may overwhelm you, catch you adapting and punish predictable habits. When you get hit you must be able to say why.

## Difficulty identity
Every boss demands mastery of something: **mechanical** (timing, parries, dodges), **mental** (feints, patterns, adapting), **spatial** (distance, hazards, several threats), **emotional** (presence, music, cinematics, phase escalation), **replay** (new combinations, the Mastery rematch).
We never nerf a boss because you died. We ask: is the attack readable, does counterplay exist, is the punishment earned?

## Intelligence layers (src/combat/DuelistAI.js)
| Layer | Implemented as |
|---|---|
| Player awareness | `habits()` tallies back-dodges, side-dodges, roll-ins, charged heavies, light spam and a metronome rhythm (3 swings with near-equal gaps) |
| Range awareness | each move has a REACH; boss kits switch with distance (ranged / closer / melee) |
| Punishment | the existing guard-punisher and recovery-punisher, plus `MIND` answers |
| Adaptation | `read()`: once one habit leads clearly (3+ repeats, 1.5x the next), 50% roll, 6-9 s cooldown, habit score cut to 20% after the answer. Never a guaranteed counter |
| Recovery awareness | breaths / repositioning (`PERS.breath`), rests scale with personality |
| Phase intelligence | `COMBO`: from phase 2 an existing move can chain into another (orb -> volley, cut -> moon...), plus new phase kits |

Every answer is an existing move with its normal tell (>= 20 ticks), and the game says what it saw: **"KAGE READS YOUR BACK-DODGE"**. A new boss must register in `MIND`, `PERS` and `COMBO` and pass `tests/boss_mind.sim.js`.

## Combat personalities
- **Kage** - disciplined: feints, delayed overheads on a metronome, answers back-dodges with blink + iai.
- **Gwyn** - overwhelming king; rests shrink as his power fades (desperation), answers back-dodges with a pursuit into a Verdict.
- **Artorias** - relentless: 30% shorter rests, short breaths, never lets you settle.
- **Gwyndolin** - controls distance: volleys punish retreat, rings punish circling, tentacles punish closing in.
- **The Dark Knight** - oppressive: spirit blades punish retreat, the sword ring punishes circling, chains from blink.

## Mastery rematch (sites with `mast:true`, today: The Hollow Crown Hall)
Fell the boss once -> "Mastery rematch unlocked". Next fights: 1.5x health, 1.25x damage, phases arrive earlier (62% / 30%), reads need only 2 repeats and 65% chance, rests 15% shorter. First mastery clear: +1200 embers, repeats +250. Same boss, same arena, a higher level of mastery.

## Still to build (per boss "defining spectacle")
Arena changes at phase transitions, destructible structures, weapon loss -> new stance, boss reacting to a repeatedly parried signature, final-phase rhythm change, a cinematic counter for a difficult correct sequence.

## Set pieces (Kage, the Dark Knight) — first batch
- **Parry adaptation**: parry the same move three times (a perfect parry counts double) and the boss stops trusting it; for its next two uses it is feinted, delayed or chained (`DuelistAI.MUT`). A banner says so. Never changes a tell, only what follows it.
- **The Stillness** (phase 3): he stops for one second (sheathes / kneels), then a double draw on a new rhythm. The stillness is the tell. Not during Last Sovereign or while an ally holds the boss token.
- **Deathblow**: three perfect parries in a row (7 s window, no hit taken between) on a boss breaks its guard for 2 s, stalls time and costs it 4% HP; fills the Sever meter.
- **Phase mood**: a vignette overlay darkens the arena at phase 2 and 3 (ember for Kage, void-violet for the Dark Knight).
- Not built yet: destructible structures, weapon loss -> stance change (needs animation assets), arena hazards at phase changes.

## Dark Knight kit (batch 2)
- **Void Runes / Anchors**: every blink leaves a rune where he vanished (max 5, 16 s). Iron Pursuit / Executioner's Advance arms them (0.9 s fuse, ring turns white); standing in one when it blows = 20% HP + stagger (never lethal). Three runes + a blink = the **Convergence**: lines run to you, you are dragged toward the centre for 1.5 s (dodge i-frames break the pull), the runes blow, then Final Sentence. Each client damages only itself; the host tells the guest (`sp` zr/zd/za).
- **Shadow Piercer**: make an afterimage while he is winding up a heavy move and he cancels into a Void Thrust, pierces the clone and takes 35 posture back.
- **Crown Fissure** (phase 2): the blade splits the floor; the cracks erupt ~1 s later in three beats. Rolling early is the mistake.
- **Death's Sentence**: when your posture breaks with him within 4.6 m: dragged to his hand, lifted, slammed (30% max HP, never lethal, once per 20 s). Effects + camera only: no grab animation on the stock rig yet.
- Not built: runes from the Phantom Barrage clones.

## Gwyn and Artorias kits (batch 3)
- **Gwyn, Conductive Ground**: Storm Grid, Spear and Crownfall leave volt patches (2-3, 6 s, max 6) that sting 1.5% HP per 0.7 s while you stand in them. A heavy melee blow (verdict / kingsfall / moon / hammer / groundbreaker / rend / sunder...) that lands while 2+ patches are down makes the current jump patch to patch (0.7 s fuse) and blow them all (12% HP, wide). Not built: wet tiles doubling the radius.
- **Artorias, Heavenfall x3**: instant, hung (+0.6 s in the air), or converted to an Abyssal wave along the ground (`heavenfalld`, `heavenwave`). Heavenfall joins his kit from phase 2.
- **Artorias, Impaler's Oath pin**: a landed Impaler pins you 1.5 s; mash any button (6 presses) to tear free with brief i-frames, otherwise Executioner's Advance follows (host only).
- **Artorias, Abyssal Roll**: dodge or guard EARLY into his Executioner's / Broken Advance (first 16 ticks of the startup) and 55% of the time he cancels into a roll to your flank and cuts (7 s cooldown).

## Ganfaul, Vael, Arissa, Gwyndolin (batch 4) and the zone look
- **Ganfaul, Echo Blade**: every melee swing leaves a golden arc where the blade passed; 1.5 s later it detonates (10% HP). **Time Anchor**: stagger him mid heavy move and 60% of the time he rewinds to where he stood 1 s ago, posture half back, and thrusts.
- **Vael, Shadow Decoy**: each blink leaves a red afterimage for 1.2 s; touching it drains 15% of your current HP, heals him and takes 30 posture off him. In phase 2 he chains up to 3 more blinks.
- **Arissa, Rhythm**: every hit she lands quickens her rests 5% (max 25%); her tells never change. Parrying or hitting her breaks the rhythm. **Mirror Sway**: hit her in the first 14 ticks of a step and half the time she slips to your flank and sweeps (6 s cooldown).
- **Gwyndolin, Lunar Mirrors** (phase 2): three mirrors stand round the arena; each Sun Volley, each mirror throws a shot at where you WILL be (velocity x 0.7 s), marked by a ring for 0.9 s. Not built: the two illusion copies.
- **Zone look** (runes, volt, echo, mirror shots, decoys): rings are built with the terrain height at every vertex (a flat disc is chopped by slopes), additive glow, soft fill and a light pillar, merged into ONE mesh per zone; beams are thin additive cylinders (GL lines are invisible on a phone). Checked in a headless render (tools in the session scratchpad).

## Erika, Smoke Step
Pressed inside ~5.6 m she vanishes (the blink; mark shows 14 ticks before she lands), a violet smoke clone stays where she stood for 3.4 s, aims, and looses a shot at where you will be (ring 0.9 s); she reappears 9.5 m away and draws. Cut the clone and it disperses with no shot. Host/solo creates the clone body; the shot ring reaches a co-op guest through the zone message, the clone body itself does not (unverified).

## The Capra Demon (new boss, The Capra Demon's Pit at x 120 z 130)
Packed from the supplied DS model with `tools/pack_bip_char.mjs` (7,460 tris, 1.2 MB), Gwyn's clip set and reaction pack retargeted onto his skeleton with `tools/rebase_mx.mjs`. Fast (spd 2.05), 760 HP, Artorias-class AI (`blackknight`) with its own personality (short rests), Iron Pursuit into twin cuts, Heavenfall (three forms), Crimson Tempest from phase 2, Sunder from phase 3, Abyssal Roll, Last Sovereign. Not built: the two hounds (no dog model yet).

## Kage, second arsenal (real sword animation)
Clips come from the Seede XR animation library (MIT, Mixamo skeleton): `tools/bake_mixamo_native.mjs` with `retarget`, `restFbx` = the library's `standard-t-pose.fbx`, `hipsScale` 0.4047, baked onto `assets/warden/samurai.glb` (14 `k_*` clips appended to `assets/warden_mx_samurai.json`). The Veil Dancer keeps her older set.
* HP 680 -> 1050, speed 1.9, damage x1.45, shorter rests (`PERS.samurai`), a proper draw for Iai / Silent Severance, inward / outward cut pair for Cut / Twin / Triple.
* New moves: Shadow Slide, Falling Crow (landing ring), Cyclone (two turns), Heaven-Splitter (travelling ground cut), Tengu Kicks, Reverse Moon (backflip kick), Kindle (flame ring), Thrust and Slash. Each hit has a tell >= 20 and a recovery >= 20; Splitter and Crow are perilous.
* Choreographed chains: Shadow Rush (slide -> cyclone), Crow Song (crow -> thrust-slash -> splitter, phase 2), Tengu Wheel (tengu -> reverse moon -> iai, phase 2), Nightfall (kindle -> cyclone -> splitter -> silent severance, phase 3). Tested in `tests/kage_arsenal.sim.js`.
* Not verified on a phone: how the retargeted clips look in motion at game speed (only pose sheets were checked), hit windows were taken from hand-speed peaks, not played.

## Artorias + the Dark Knight: great-sword arsenal
Library clips `g_*` (two-handed combo, spin, leap, slide, power slash, low slash, pommel, kicks, power-up) baked onto `penitent.glb` and `dknight.glb` the same way as Kage's. Eight shared moves: Fourfold Oath (3-hit combo, heavy last cut), Wyrmstrike (leap), Undertow (slide), Moonfall (travelling overhead, perilous), Pommel Strike (shove, high knock-back), Kick Wheel, Abyss Ring (ground ring), Undercut. Chains: Abyss Dance (undertow -> fourfold), Wyrmfall (wyrmstrike -> pommel -> moonfall, phase 2), Kick Storm (kickwheel -> fourfold -> abyssring, phase 3). `tests/boss_arsenal_hits.sim.js` runs every new Kage/Knight move against a real CombatCore player: it must land, damage, knock back or stun, and a raised guard must never cost more HP; telegraph styles must exist in WardenFx with a >= 40-tick delay. Gwyn, Capra and the Unbroken Oath keep their older sets (they do not have the new clips).
