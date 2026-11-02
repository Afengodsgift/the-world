# Animation + source-model archive (branch `animation-sources`)

Raw files the owner uploaded, kept so any session can fetch them without re-uploading.
Not part of the game build: `main` does not contain them.

Fetch: `git fetch origin animation-sources && git worktree add ../animsrc origin/animation-sources`

## packs/ (zip, unchanged)
Universal_Animation_LibraryStandard, Universal_Animation_Library_2Standard, Locomotion_Pack, Male_Locomotion_Pack,
Great_Sword_Pack, Pro_Sword_and_Shield_Pack, Lite_Sword_and_Shield_Pack, Sword_Animations, Capoeira_Pack,
Action_Adventure_Pack, WALK-RUN-CYCLES-MOCAP, KayKit_Character_Animations_1.1 / kaykit_character_animations_1.2.

## models/
- Crypto.fbx, Madea.fbx: the two full-human player characters.
- exported-model_3.glb: human animation clips source for the bake.
- samurai_character.glb: static Samurai model (Sketchfab Standard licence).

## Use
`tools/avatar/bake_human.mjs` (`--mx=<unzipped packs folder>`) bakes these into `assets/avatars/*`. See docs/AVATARS.md.

## Licences
Each pack keeps its own terms. Mixamo packs and the Sketchfab model may not be free to redistribute; KayKit/Quaternius are CC0. This repo is public.
