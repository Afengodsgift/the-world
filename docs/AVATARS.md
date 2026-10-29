# Player avatars + wardrobe

Two full-human, stylized avatars (male **Crypto**, female **Madea**) replace the player's chibi body, with a small wardrobe
(hair/hood colour, outfit look, clothing colour, accessories). The original chibi characters (Man / Woman / Warrior / Robot) are
**still in the game** and still selectable in the lobby; NPCs (crew, raiders, foes, deckhands, duelists) always use them.

## Architecture

| Layer | Where | Notes |
|---|---|---|
| Identity / gameplay state | `S`, `me.userData` (unchanged) | Position, health, combat, input never touched by the wardrobe. |
| Appearance config | `AvatarKit.normalize/encode/decode` | `{v,b,h,hc,o,oc,a}` -> string `"1.f.0.3.1.5.5"` (<= 24 chars). Any input normalises to something valid; unknown body -> default avatar; a clothing colour that does not suit the outfit look is replaced. |
| Model + rig | `assets/avatars/<name>.glb` (+ `.json` sidecar, `.mask.png`) | Game rig bone names (45 joints), one skinned mesh, one material. Cached prototype, `SkeletonUtils.clone` per player. |
| Animation controller | `assets/avatars/<name>/*.json` | Per-avatar clip sets (see below). Looked up through `q.av` by `emoAct`, `GunLoco`, `CombatAnims`, `WardenMX`, the main gait. No `q.av` = stock tables. |
| Equipment | by bone **name** | Props on hand bones (pan, sword, rod) are re-parented to the new rig on a swap. Gun / helm / flight poses are procedural and read the live bones. Accessories are owned by `AvatarKit` and attached through `boneInverse * bindMatrix` (correct at any pose). |

Files: `src/avatar/AvatarKit.js` (catalog, schema, load/cache, swap, recolour, accessories), `src/avatar/Wardrobe.js` (UI),
`index.html` (`dressRig` = rig set-up shared by chibi + avatars, `dress(g,skin,app)`, lobby row, presence), small lookups in
`GunLoco.js`, `CombatAnims.js`, `WardenMX.js`, `PlayerCombat.js`.

### Safe replacement and cleanup
`AvatarKit.apply(g, appearance)` is idempotent and latest-wins: same body -> restyle in place (same model, same mixer); other
body -> new clone, old mixer stopped and `uncacheRoot`ed, old skeleton + per-instance materials disposed, props re-homed,
`onSwap` listeners run (PlayerCombat drops its sword/clip layer built on the old rig). Geometries, textures and the mask are
shared through the cache and never disposed per player. `tests/avatar_browser.mjs` swaps 11 times and checks meshes, mixer
actions and `renderer.info.memory` do not grow.

## Models and rigs

| | Crypto (male) | Madea (female) |
|---|---|---|
| Source | uploaded `Crypto.fbx` (Mixamo, FBX 7.x) | uploaded `Madea.fbx` (Mixamo, FBX 6.1) |
| Height | 1.88 m -> 3.93 rig units (game scale 0.5 = chibi-sized) | 1.70 m -> 3.56 rig units |
| Triangles / vertices | 9000 / 5198 | 8995 / 5893 |
| Textures | 1024 colour, 512 normal, 512 emissive (JPEG) + 512 recolour mask | 1024 colour (JPEG) + 512 mask |
| File | 524 KB (gzip ~417 KB) | 504 KB (gzip ~360 KB) |
| Skeleton | Mixamo 65 joints -> game rig 45 joints | same |

The characters keep **their own** modelled proportions and rest pose; nothing is re-posed into the chibi pose.
The skeleton is rebuilt on the game rig's node tree and bone names, each bone frame swung onto the character's own bone
direction. Weights of unused finger joints are merged onto the game joints. Built by `tools/avatar/build_avatar.mjs`
(`THREE_NM=... MESHOPT_JS=... node tools/avatar/build_avatar.mjs <in.fbx> <out.glb> --name=crypto --height=1.88`).

## Animations
The repo's clips were authored for the chibi rig. `tools/avatar/retarget_clips.mjs` bakes a human-proportioned copy of every
set for each avatar: world-space delta retarget, a posture correction so the stock idle becomes a relaxed upright stance,
arm-chain fading by arm elevation, finger-curl damping, a wrist swing/twist limiter (22 deg), hips scaled by leg-length ratio
with a ground solve (soles within +-3 mm over 5380 frames), and measured planted-foot speed so strides do not skate:
walk ratio 1.42-1.43, jog 1.45-1.49 (the gait timescale and the gun `meta.spd` are divided/scaled by it at runtime).

Sets (all 8 have the same clip names, order and durations as the stock files - checked by `tests/avatar_assets.check.js`):
`anims` (idle/walk/jog/sprint/jump/fall/swim/tread/land/hit/smack...), `emotes`, `verb_anims`, `gun_anims` (aim/fire/8-way
strafe/death), `combat_anims`, `warden_anims`, `warden_mx_player`, `warden_mx_duelist` (sword/guard/dodge/hit/death/lock-on).
First load = `anims + emotes + verb + combat`; `gun_anims` streams in 1.2 s after the body; Warden sets load when a fight starts.

**Honest limitation:** these are derived from the chibi clips, not re-authored from the original Mixamo / UAL source animations.
If the originals (UAL1_Standard.glb, KayKit Rig_Medium, the Mixamo Pro Rifle Pack FBX folder) are supplied, re-bake with
`tools/retarget_ual.js` / `tools/retarget_mixamo.mjs` aimed at the new rigs for better fidelity.

## Customisation (all free; there is no purchase flow)
* **Body**: male / female.
* **Hair / mask & hood colour**: 8 colours (Natural = as modelled). Applies to the head's non-skin texels (vertex zone 1, skin protected by a mask) - the female's hair, the male's hood.
* **Outfit looks**: Signature (as modelled), Dyed, Two-tone (lower body darker), Shadow (dark). Recolour is luminance-preserving so wear and detail stay.
* **Clothing colour**: 10-colour palette, filtered per look (e.g. Shadow only offers dark-friendly colours).
* **Accessories**: goggles, headband, cap, scarf, backpack (cap and headband are exclusive). Procedural low-poly, shared geometry, tinted by the clothing colour.
* One material per player, so one draw call per avatar; the recolour is a shader patch (`onBeforeCompile`) sharing one program.

Not done (needs authored meshes): **alternative hair styles** and genuinely different outfits. The field `h` is reserved in the schema.
The recolour is a hue/luminance treatment of the baked texture, not separate garments.

UI: lobby buttons (Male, Female, the 4 chibis, Wardrobe) and `Wardrobe` in the emote panel in game. Landscape two-pane sheet with a live
rotating preview (own renderer, created on open and fully disposed on close; the main scene stops rendering while it is open).
Apply / Cancel / Esc. Refused (and Apply disabled) during Warden combat or an Outlaw match.
The look is saved per device in `localStorage` (`tw_avatar_v1`; `tw_chibi_v1` for a chibi choice).

## Multiplayer
Presence carries `{name,color,skin,ap}` where `ap` is the compact appearance string and `skin` the matching legacy chibi index.
* New client sees new client: dressed from `ap`; a change restyles in place (same body) or swaps (new body).
* Late joiner: `syncPresence` reads `ap` from presence state, so no separate message is needed.
* Older client (no `ap`): shown as the stock chibi. An older client sees a new player as the chibi with the matching skin (`skin`).
* Garbage `ap`: falls back to the default avatar. Movement, health and combat messages are separate channels and are not touched.

## Performance (measured where stated)
Measured in headless Chromium with software WebGL (**not a phone**); device numbers still needed:
* Avatar: 9000 tris, 1 skinned mesh, 1 material, 45 bones, 1 recolour program shared by all players.
* Per avatar download: ~0.42 MB (model, gzip) + ~0.65 MB (first clip sets, gzip) + ~0.26 MB gun set on demand; Warden sets on demand. Raw JSON clip sets are ~6.4 MB per avatar uncompressed.
* GPU texture memory (computed, not measured): about 7 MB (Madea) / 10 MB (Crypto) including mipmaps.
* Swapping 11 times: geometries / textures / mixer actions did not grow (`tests/avatar_browser.mjs`).
* Not measured: real-device FPS, battery, thermal, load time on a cellular connection. Use the in-game battery saver (30 fps) on low-end phones.

## Licensing / sources
Both characters come from the user's uploaded Mixamo FBX files (Adobe Mixamo). Mixamo's terms allow using the characters and
animations in games and apps, but not redistributing them as a standalone asset pack - confirm against the current Adobe terms for
your account before shipping commercially. No other third-party assets were added; the accessories, UI and recolour code are original.
`three`, `meshoptimizer` (simplifier) and `sharp` are build-time dependencies only.

## Tests
* `tests/avatar_kit.sim.js` - schema, compatibility, fallbacks, persistence.
* `tests/avatar_assets.check.js` - rig bones, budgets, every clip set vs the stock set.
* `tests/avatar_browser.mjs` - real game: dress, swap cleanup, wardrobe rules, presence (late join / older client / junk), chibi still works, flight/emotes finite. Not in `run_all.sh` (needs Chromium).
* Existing `tests/outlaw_browser.mjs` and `tests/warden_browser.mjs` were run against this build (Outlaw: same results as the untouched baseline; Warden: all pass).

## Known issues / next
* Animations are derived from chibi clips (see above); hair styles and real outfit variants need authored meshes.
* Hand-held prop grips (gun, sword, fishing rod, frying pan) were checked in headless screenshots only (all sit in the hand and follow it); tune with `PlayerCombat.setGrip` / `PAN_GRIP` if a grip looks off on a device.
* Switching from an avatar back to a chibi is only possible in the lobby.
