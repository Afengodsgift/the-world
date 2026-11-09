# Sword duel layer (Kage first)

- **Clash** (`CombatCore` step 5a): a swing that strikes a fighter whose own blade is live (active window, or the last 6 startup ticks) and pointed back is caught: both swings are spent, no damage, hit-stop, both recoil. Heavier swing (>=1.5x power) wins the bind (loser recoils 30 ticks, winner 9). Perilous, grabs, magic and super-armour never clash. Event `clash {x,z,win}`.
- **Kage** (`DuelistAI.kageDuel`): reads your swings and parries some (the parry timing is random inside the swing, so some land and some are early/late), blocks charged heavies, gets warier as you hit him, and after a clash or a deflect answers at once with a cut/twin/moon instead of resting. Only existing commands are used, so every move keeps its tell and recovery.
- **Camera / feel** (`PlayerCombat`): duel framing pulls back and widens while a boss is within 7.5 m, focus moves toward the midpoint; each clash gives sparks, hit-stop, a punch-in, a few degrees of yaw swing, `CLASH / CLASH - YOU HOLD / OVERPOWERED` call-outs; a parried swing says `PARRIED`.
- Tests: `tests/duel.sim.js`.
