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
