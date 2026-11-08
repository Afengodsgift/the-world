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
- Not built yet: destructible structures, arena hazards at phase changes. (Weapon loss is built: see Disarm below.)

## Dark Knight kit (batch 2)
- **Void Runes / Anchors**: every blink leaves a rune where he vanished (max 5, 16 s). Iron Pursuit / Executioner's Advance arms them (0.9 s fuse, ring turns white); standing in one when it blows = 20% HP + stagger (never lethal). Three runes + a blink = the **Convergence**: lines run to you, you are dragged toward the centre for 1.5 s (dodge i-frames break the pull), the runes blow, then Final Sentence. Each client damages only itself; the host tells the guest (`sp` zr/zd/za).
- **Shadow Piercer**: make an afterimage while he is winding up a heavy move and he cancels into a Void Thrust, pierces the clone and takes 35 posture back.
- **Crown Fissure** (phase 2): the blade splits the floor; the cracks erupt ~1 s later in three beats. Rolling early is the mistake.
- **Death's Sentence**: when your posture breaks with him within 4.6 m: dragged to his hand, lifted, slammed (30% max HP, never lethal, once per 20 s). His body plays the library choke-lift clip (`dsgrab`, host-driven); YOUR body still just shows the stun pose (the victim half of the library's hell-slammer pair needs adding to the avatar emote sets; not done).
- **Phantom Barrage runes**: when the barrage ends each phantom leaves a void rune where it stood (fuse ~2.4-3 s, host/solo).

## Gwyn and Artorias kits (batch 3)
- **Gwyn, Conductive Ground**: Storm Grid, Spear and Crownfall leave volt patches (2-3, 6 s, max 6) that sting 1.5% HP per 0.7 s while you stand in them. A heavy melee blow (verdict / kingsfall / moon / hammer / groundbreaker / rend / sunder...) that lands while 2+ patches are down makes the current jump patch to patch (0.7 s fuse) and blow them all (12% HP, wide). **Wet tiles**: Storm Grid / Storm wet the floor for 9 s; volt patches made then have double radius and a 1.7x blast.
- **Artorias, Heavenfall x3**: instant, hung (+0.6 s in the air), or converted to an Abyssal wave along the ground (`heavenfalld`, `heavenwave`). Heavenfall joins his kit from phase 2.
- **Artorias, Impaler's Oath pin**: a landed Impaler pins you 1.5 s; mash any button (6 presses) to tear free with brief i-frames, otherwise Executioner's Advance follows (host only).
- **Artorias, Abyssal Roll**: dodge or guard EARLY into his Executioner's / Broken Advance (first 16 ticks of the startup) and 55% of the time he cancels into a roll to your flank and cuts (7 s cooldown).

## Ganfaul, Vael, Arissa, Gwyndolin (batch 4) and the zone look
- **Ganfaul, Echo Blade**: every melee swing leaves a golden arc where the blade passed; 1.5 s later it detonates (10% HP). **Time Anchor**: stagger him mid heavy move and 60% of the time he rewinds to where he stood 1 s ago, posture half back, and thrusts.
- **Vael, Shadow Decoy**: each blink leaves a red afterimage for 1.2 s; touching it drains 15% of your current HP, heals him and takes 30 posture off him. In phase 2 he chains up to 3 more blinks, about half of them instant micro-blinks (`blinkz`, 5-tick windup, the follow-up cut keeps its full tell).
- **Arissa, Rhythm**: every hit she lands quickens her rests 5% (max 25%); her tells never change. Parrying or hitting her breaks the rhythm. **Mirror Sway**: hit her in the first 14 ticks of a step and half the time she slips to your flank and sweeps (6 s cooldown).
- **Gwyndolin, Lunar Mirrors** (phase 2): three mirrors stand round the arena; each Sun Volley, each mirror throws a shot at where you WILL be (velocity x 0.7 s), marked by a ring for 0.9 s. **Illusions**: each Sun Volley (phase 2) splits two moonlit copies either side of you; each looses its own marked shot 1.9 s before fading (3.4 s); one cut disperses a copy and its shot.
- **Zone look** (runes, volt, echo, mirror shots, decoys): rings are built with the terrain height at every vertex (a flat disc is chopped by slopes), additive glow, soft fill and a light pillar, merged into ONE mesh per zone; beams are thin additive cylinders (GL lines are invisible on a phone). Checked in a headless render (tools in the session scratchpad).

## Erika, Smoke Step
Pressed inside ~5.6 m she vanishes (the blink; mark shows 14 ticks before she lands), a violet smoke clone stays where she stood for 3.4 s, aims, and looses a shot at where you will be (ring 0.9 s); she reappears 9.5 m away and draws. Cut the clone and it disperses with no shot. Host/solo creates the clone body; the shot ring reaches a co-op guest through the zone message, the clone body itself does not (unverified).

## The Capra Demon (new boss, The Capra Demon's Pit at x 120 z 130)
Packed from the supplied DS model with `tools/pack_bip_char.mjs` (7,460 tris, 1.2 MB), Gwyn's clip set and reaction pack retargeted onto his skeleton with `tools/rebase_mx.mjs`. Fast (spd 2.05), 760 HP, Artorias-class AI (`blackknight`) with its own personality (short rests), Iron Pursuit into twin cuts, Heavenfall (three forms), Crimson Tempest from phase 2, Sunder from phase 3, Abyssal Roll, Last Sovereign. **Hounds**: two box-built hounds (no dog model) pace round you; every ~5 s one leaps at a ringed spot (0.9 s, 7% HP). Cut a pacing hound and it flees 14 s. Host/solo only; the ring reaches a guest, the hound body does not (unverified).

## Kage, second arsenal (real sword animation)
Clips come from the Seede XR animation library (MIT, Mixamo skeleton): `tools/bake_mixamo_native.mjs` with `retarget`, `restFbx` = the library's `standard-t-pose.fbx`, `hipsScale` 0.4047, baked onto `assets/warden/samurai.glb` (14 `k_*` clips appended to `assets/warden_mx_samurai.json`). The Veil Dancer keeps her older set.
* HP 680 -> 1050, speed 1.9, damage x1.45, shorter rests (`PERS.samurai`), a proper draw for Iai / Silent Severance, inward / outward cut pair for Cut / Twin / Triple.
* New moves: Shadow Slide, Falling Crow (landing ring), Cyclone (two turns), Heaven-Splitter (travelling ground cut), Tengu Kicks, Reverse Moon (backflip kick), Kindle (flame ring), Thrust and Slash. Each hit has a tell >= 20 and a recovery >= 20; Splitter and Crow are perilous.
* Choreographed chains: Shadow Rush (slide -> cyclone), Crow Song (crow -> thrust-slash -> splitter, phase 2), Tengu Wheel (tengu -> reverse moon -> iai, phase 2), Nightfall (kindle -> cyclone -> splitter -> silent severance, phase 3). Tested in `tests/kage_arsenal.sim.js`.
* Not verified on a phone: how the retargeted clips look in motion at game speed (only pose sheets were checked), hit windows were taken from hand-speed peaks, not played.

## Artorias + the Dark Knight: great-sword arsenal
Library clips `g_*` (two-handed combo, spin, leap, slide, power slash, low slash, pommel, kicks, power-up) baked onto `penitent.glb` and `dknight.glb` the same way as Kage's. Eight shared moves: Fourfold Oath (3-hit combo, heavy last cut), Wyrmstrike (leap), Undertow (slide), Moonfall (travelling overhead, perilous), Pommel Strike (shove, high knock-back), Kick Wheel, Abyss Ring (ground ring), Undercut. Chains: Abyss Dance (undertow -> fourfold), Wyrmfall (wyrmstrike -> pommel -> moonfall, phase 2), Kick Storm (kickwheel -> fourfold -> abyssring, phase 3). `tests/boss_arsenal_hits.sim.js` runs every new Kage/Knight move against a real CombatCore player: it must land, damage, knock back or stun, and a raised guard must never cost more HP; telegraph styles must exist in WardenFx with a >= 40-tick delay. Gwyn, Capra and the Unbroken Oath keep their older sets (they do not have the new clips).

## Nightmare pack (every humanoid boss animated)
* Cause of "I take damage but he does nothing": a move with no hand-made clip spec had no mixer action created (`used` only listed clips named in `R.moves`), so nothing played. Now `R.pack` roles (Dark Knight, Penitent / Oath4, Gwyn, Capra, Kage, Vael, Saint, Veil Dancer) get **23 library clips** (`sx_*` sword-and-shield, `ax_*` axe, `bl_*` club, `mg_*` casting; Gwyn and Capra also the `g_*` great-sword set) and `WardenMX.auto()` gives every un-mapped foe move a clip by what it is: kick / spin / overhead / cast / N-hit chain, with hit windows from hand-speed peaks (`tools/clip_windows.mjs`, merged by `tools/merge_clips.mjs`). `tests/nightmare.sim.js` checks every foe move of every pack role.
* Not verified: how the auto-assigned clips LOOK in motion at game speed (only the table of peak times was checked), and the Kage / Vael T-pose report was not reproduced: the only T-pose path found in code is a role whose clip file is still loading or failed, so the files were checked for validity but not for load time on a phone (they grew to 1.4-2.4 MB each).
* Saint: HP 480 -> 980, speed 1.8, damage x1.5, short rests, Last Sovereign, five more signature moves and three chains; her own arena `The Veiled Sanctuary` (x 40, z -190). Gwyn's Cinder Throne and the Sanctuary have taller pillar rings.
* Twin Blades super: **Hundred Shadows** (11 cuts + a double X finisher) replaces Spirit Sever while the twin blades are drawn.

## Kage, the demon (tests/kage_demon.sim.js)
19 `kz*` moves from library kick / flip / great-sword clips (`assets/warden_mx_samurai.json` kz_*), in four hp tiers (opening, <75%, <50%, <22%): kicks and the twist pounce first; backflip kicks, aerial wheel, falling crow later; then the perilous sweep, Heaven Descent, Moonbreaker, Demon Slam, Quake Stomp and Demon's Grasp. Chains: Demon Kicks, Demon Rush, Sweep-Break, Abyss Demon. 1900 HP, speed 2.05. Rules unchanged: tell >= 20 before every hit (so rechambers are 20), recovery >= 20.

## Arcane magic (replaces Flow)
Same meter. Tap (35) = Thunderfall (3 bolts on the locked foe); full meter = Arcane Storm (7 bolts on up to 4 foes + a posture-breaking strike). Host applies the damage; a guest sends `{t:'mg'}`. Jump / Shadow / Twin taps are buffered 0.35 s.

## Veiled Saint, nastier
1300 HP, speed 1.95, dm 1.6; rest 0.5 / breath 0.42; her heavy kit unlocks a tier earlier (Hundred, Kingsweep, Marks at <75%; Thousand, Crownfall at <50%); new chains Veil Crown (<75%), Veil Rain (<50%), Veil Requiem (<22%); ring cooldown 140 ticks and 4.2 bladestorm weight in the last phase.
Saint choreography (assets/warden_mx_saint.json sa_*): Hundred = great-sword combo, Thousand = great-sword slash chain, Severance = one-hand sword flurry, Impaler = leaping stab, Double Impaler = thrust-and-slash, Kingsweep = low sweep; Bladestorm / Blade Ring / Crownfall / Marks each have their own casting pose. Windows are hand-speed peaks, so their timing is unverified in play.

## Phantom String (player main stance)
Light x5: Shadow Cross (light4, 2 cuts) then Phantom Rend (light5, cut + wide sweep). Heavy branches by what you were doing: after light4 = Crescent Wheel (3 spinning cuts), after light5 = Drop Blade (overhead), after the advancing cut = Piercing Lunge (thrust), after an evasive cut = Moon Breaker (rising cut + overhead); light3 > heavy is still the Whirl. Clips pz_* (great-sword library) baked onto the stock rig and crypto / madea / samurai / bjj. Slash and hit VFX trimmed about 30%. Twin blades use a mirrored quarter-turn grip per hand.

## Movement: Flash Step and Sidestep (ninja run removed)
Stick toward the foe (or forward, unlocked) + Dodge = Flash Step: 14 ticks, 5.2 m, 12 stamina, i-frames 1-9, white burst and spark trail. Locked on + stick sideways = Sidestep (unchanged). Neutral / back = the roll. Locomotion is back to the standard idle / walk / run; the nj_run clip is only used for the flash dash. Twin hilts are seated half-way along the hand (palm) with a mirrored quarter-turn.

## Disarm and hand-to-hand (Brawl.js)

Built fresh for the Warden Isles; it shares nothing with the Iron Fist Isle trials (Fists.js / DojoAI.js).

- **Losing the blade.** Every PERILOUS boss strike that hurts (not the floor bursts) has `dis`: on a hit it knocks the weapon out of the victim's hand. A fighter can be disarmed only if `wd` is set (the player always; a boss only if its type has `bare:true`, today Kage, the only boss with a detached sword) and not again for `DIS_CD` (40 s) after the weapon is back in hand, with a 10 s grace at the start of a fight (`dcd`).
- **On the floor.** `C.wp[ownerId] = {x,z,t}`, mirrored on the owner as `wx/wz` (net snapshot fields `arm/wx/wz`). A pulsing ring marks it. Walking over your own takes it back; after `RETURN_T` (25 s) it slides back by itself (no soft-lock).
- **Kicks punt weapons.** Moves with `wk` (kicks) send any weapon lying just in front of the kicker 6 m the way he faces. Both fighters can keep each other from theirs.
- **The boss guards it.** A boss holding a bare-handed fight (or guarding the player's weapon while armed) stands over the weapon on the player's side and punts it away (`bwfpunt`, 20-tick tell like every foe move) whenever the player closes in. A disarmed boss runs for his own blade and fights with `bwfjab / bwfkick / bwfspin / bwfdash`.
- **WRENCH** (`{t:'wrench'}`, X / the Wrench button): a grab that ignores guard and parry (a dodge beats it). On an armed foe with `wd` it is a disarm; on anyone else it is a hip throw (x3 damage).
- **Hand-to-hand** (while `arm===0`): Light = jab > cross > hook > knee > roundhouse (4-5 tick start-ups), Heavy branches (elbow break, uppercut, spinning back kick, leg sweep), power strike, step jab, flying knee-kick, slip counter after a dodge, push kick (Guard+Light), drop kick. Sword-only commands are ignored until the weapon is back.
- **Animation.** The 20 `bw_*` player clips (and 6 `bwf_*` Kage clips) are separate files fetched lazily the first time a fight starts (`WardenMX.extra`): `assets/warden_mx_bw.json`, `assets/avatars/<av>/warden_mx_bw.json` (crypto, madea, samurai, bjj), `assets/warden_mx_bwf_samurai.json`. Re-bake: `tools/mixamo/bw.json` (stock rig, `retarget_mixamo.js bake`; avatars `bake_human.mjs ... --twin=tools/mixamo/bw.json --set=warden_mx_bw`), `tools/mixamo/bwf.json` (native bake on the Kage rig).
- Not done: Saint / Gwyn / the other bosses cannot be disarmed (their weapons are part of the model, so it would not show); Boxer and Homunculus avatars have no bare-hand clips (same as the other new combat sets).
