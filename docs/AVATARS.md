# Player avatars + wardrobe

Two full-human, stylized avatars (male **Crypto**, female **Madea**) plus a third fixed-look character, the **Samurai** (ronin), replace the player's chibi body, with a small wardrobe
(hair/hood colour, outfit look, clothing colour, accessories). The original chibi characters (Man / Woman / Warrior / Robot) are
**still in the game** and still selectable in the lobby; NPCs (crew, raiders, foes, deckhands, duelists) always use them.

## Architecture

| Layer | Where | Notes |
|---|---|---|
| Identity / gameplay state | `S`, `me.userData` (unchanged) | Position, health, combat, input never touched by the wardrobe. |
| Appearance config | `AvatarKit.normalize/encode/decode` | `{v,b,h,hc,o,oc,a,w}` -> string `"1.f.0.3.1.5.5"` (+ `.w` only when an outfit set is worn; <= 26 chars). Any input normalises to something valid; unknown body -> default avatar; a clothing colour that does not suit the outfit look is replaced. |
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
The clips now come from real human animation data, not from the chibi clips. `tools/avatar/bake_human.mjs` retargets a Mixamo-skeleton source
(`exported-model_3.glb`, 178 clips, metres, T-pose rest taken from the skin's inverse bind matrices) straight onto each avatar's own rig, in world space
(`Q_target = Q_src * Q_src_rest^-1 * align * Q_target_rest`), with the hips offset scaled by leg length and the lowest sole solved onto the floor on grounded
frames. Locomotion loops (idle, walk, jog, sprint, swim, tread, crouch...) keep their natural cadence; one-shot clips are keyed at the stock clip's duration
(time-warp 0.45x-1.8x) so timings the game was tuned to are unchanged. Planted-foot speed is re-measured into `meta.json` (walk ~1.2-1.3, jog ~1.2-1.25 vs the
chibi clips) and multiplied at runtime by the avatar's model scale / 0.5, so strides do not skate.

| Set | Source |
|---|---|
| `anims`, `combat_anims`, `emotes`, `verb_anims`, `warden_anims` | `exported-model_3.glb` (human clips: Idle_A, Walk, Jog, Sprint, Jump_*, Swim_*, Hit_*, Death_*, emotes, fishing, farming, sword...) |
| `warden_mx_player`, `warden_mx_duelist` | the Mixamo packs (Pro Sword and Shield, Great Sword, Capoeira) via `--mx=<packs folder>`; same durations as before, so the hit windows (`imp`, `s0`, `s1`, `hits`, `trav`) are kept |
| `gun_anims` | still derived from the chibi gun clips by `retarget_clips.mjs` (no rifle pack was supplied); `meta.gaitChibi` keeps its stride ratio |

Re-bake: `THREE_NM=... node tools/avatar/bake_human.mjs assets/avatars/crypto.glb <source.glb> assets/avatars/crypto [--only=anims,emotes] [--mx=<packs>] [--report]`
(run it for `madea` too, then bump `ASSET_V`). Clips with no good source (situps, flipf, lie_in, saw...) keep the earlier version.
Sets are checked by `tests/avatar_assets.check.js` (same names/order; durations equal except the natural-cadence loops listed in `meta.natural`).

**Body size:** avatars draw at model scale 0.56 (chibi 0.5) and the skin is bulked out along welded normals (`AvatarOutfits.bulk`, Crypto +0.05, Madea +0.04 rig units, torso/limbs full, head 30%, hands/feet 25%) so they read less thin; the skeleton is unchanged.

## The Samurai (third character)
A Sketchfab model ("Samurai character" by Marfa4, **licence: Sketchfab Standard** - check that licence allows shipping it in a public game before release; the
file is a static, unrigged T-pose mesh with 94k vertices and 32 PNG textures, 27 MB). `tools/avatar/static_raw.mjs` (run through
`build_avatar.mjs --static=... --cfg=tools/avatar/cfg/samurai.json --height=2.0 --tris=60000 --tex=2048`) turns it into a game avatar:
node transforms baked, glass parts dropped, each part simplified to a budget (19.4k tris total), the 11 base-colour textures packed into **one 2048x1536 atlas** (one material, 1.1 MB file),
the Crypto skeleton fitted to the mesh (uniform scale + arm swing measured from the fingertips, sandal spacing), and **automatic skin weights**
(distance to bone segments, per-part bone whitelists, Laplacian smoothing; hat / mask / eyes bound rigidly to the head, flask + katana to the hips; the skin under the clothes is inset so the
simplified garments never show it through). The weights are an automatic fit - fine for a stylised game character, not hand-painted; the hem of the cape follows the hips only.
He is 2.0 m with the hat (Crypto 1.88 m) at the same model scale. Clips come from the same pipeline as the others (`retarget_clips.mjs` then `bake_human.mjs`, incl. `--mx`).
`CAT.s.fixed`: the look is as modelled - hair colour, outfit looks/sets and accessories are ignored by `normalize`, and the wardrobe only offers the body choice.

## Customisation (all free; there is no purchase flow)
* **Body**: male / female.
* **Hair / mask & hood colour**: 8 colours (Natural = as modelled). Applies to the head's non-skin texels (vertex zone 1, skin protected by a mask) - the female's hair, the male's hood.
* **Outfit looks**: Signature (as modelled), Dyed, Two-tone (lower body darker), Shadow (dark). Recolour is luminance-preserving so wear and detail stay.
* **Clothing colour**: 10-colour palette, filtered per look (e.g. Shadow only offers dark-friendly colours).
* **Accessories**: goggles, headband, cap, scarf, backpack (cap and headband are exclusive). Procedural low-poly, shared geometry, tinted by the clothing colour.
* One material per player, so one draw call per avatar; the recolour is a shader patch (`onBeforeCompile`) sharing one program.

* **Outfit sets** (`w`): Casual, Knight, Samurai, Pirate for both bodies, built at run time by `src/avatar/Outfits.js` (no downloads). Cloth (shirt, sleeves, trousers, boots) is a *shell*: the body's own triangles for a region pushed out along welded vertex normals and skinned to the same skeleton, so it follows every animation; geometry is cached per body+region, materials are per player. Armour, helmets, hats, sashes and belts are small rigid primitives sized from the bind-pose bone positions and attached to bones. The Outfit-colour swatch tints the main garment (tunic, kimono, waistcoat, tabard). A set replaces the recolour looks; Knight/Samurai/Pirate bring their own headgear (cap + headband are dropped). Stylised low-poly pieces, not hand-modelled garments; the underlying body clothes can still show at seams, and the female hip belt/holsters are covered by a slightly proud hip band.

Not done (needs authored meshes): **alternative hair styles** and hand-modelled outfits. The field `h` is reserved in the schema.

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
* Animations are derived from chibi clips (see above); hair styles and hand-modelled outfits need authored meshes (the four procedural outfit sets are a stand-in that can be replaced piece by piece).
* Hand-held prop grips (gun, sword, fishing rod, frying pan) were checked in headless screenshots only (all sit in the hand and follow it); tune with `PlayerCombat.setGrip` / `PAN_GRIP` if a grip looks off on a device.
* Switching from an avatar back to a chibi is only possible in the lobby.
