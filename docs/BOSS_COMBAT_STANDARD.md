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
