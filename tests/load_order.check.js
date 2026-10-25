// Verifies that in index.html every new module is loaded AFTER the modules it needs at load/run time.
const fs=require('fs');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const order=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1].replace(/^src\//,''));
const DEPS={ // file -> files that must come first
  'world/Environment.js':['core/Audio.js'],
  'space/SpaceManager.js':['space/SpaceFlight.js'],
  'movement/Boost.js':[],
  'world/Ocean.js':[],'data/surf.js':[],'surf/SurfCore.js':[],'surf/Surf.js':['data/surf.js','surf/SurfCore.js','world/Ocean.js','fx/WaterFX.js'],
  'space/SpaceEnvironment.js':['space/SpaceManager.js','world/Environment.js','world/Ocean.js'],
  'space/SpaceEvents.js':['core/Net.js','core/WorldState.js'],
  'space/SpaceObjects.js':['space/SpaceEvents.js','space/SpaceManager.js','space/SpaceFlight.js','core/Audio.js'],
  'audio/Ambience.js':['core/Audio.js','data/islands.js'],
  'core/Expedition.js':[],
  'combat/Melee.js':['core/Audio.js'],
  'games/OutlawArena.js':['utils/random.js'],
  'data/dungeon.js':[],'data/warden.js':['data/islands.js','utils/math.js','data/dungeon.js'],'combat/WardenDungeon.js':[],'games/WardenCatacombs.js':['data/dungeon.js','data/warden.js','combat/WardenDungeon.js','combat/PlayerCombat.js','combat/WardenProg.js'],
  'combat/Moves.js':[],'combat/SwordHit.js':[],'combat/Combos.js':[],'combat/CombatCore.js':['combat/Moves.js','combat/SwordHit.js','combat/Combos.js'],'combat/WardenAnim.js':[],
  'combat/WardenMX.js':[],'combat/DuelistAI.js':[],'combat/Foes.js':[],'combat/WardenFx.js':[],'combat/WardenSfx.js':[],'combat/WardenVfx.js':[],'combat/CineCam.js':[],'combat/Barrage.js':[],'combat/WardenNet.js':[],'combat/WardenProg.js':[],'combat/WardenGear.js':[],'combat/PlayerCombat.js':['combat/WardenDungeon.js','combat/WardenProg.js','combat/WardenGear.js','combat/Foes.js','combat/WardenFx.js','combat/WardenSfx.js','combat/WardenVfx.js','combat/CineCam.js','combat/WardenNet.js','combat/DuelistAI.js','combat/CombatCore.js','combat/Moves.js','combat/WardenAnim.js','combat/WardenMX.js','data/warden.js'],
  'games/WardenIsles.js':['data/islands.js','data/warden.js','utils/math.js','combat/PlayerCombat.js'],
  'combat/Scope.js':[],
  'combat/HitZones.js':[],
  'combat/EnemyAI.js':['combat/HitZones.js'],
  'combat/CombatAnims.js':[],
  'character/CombatPose.js':[],
  'character/GunLoco.js':[],
  'combat/Consumables.js':[],
  'games/OutlawItems.js':['combat/Consumables.js'],
  'world/Blocks.js':[],
  'world/WestKit.js':[],
  'world/WestTown.js':[],
  'world/Nav.js':['world/Blocks.js'],
  'combat/Tactics.js':['world/Nav.js'],
  'combat/BossBrain.js':[],
  'combat/BattleFX.js':[],
  'games/Outlaw.js':['world/Blocks.js','world/WestKit.js','world/WestTown.js','world/Nav.js','combat/Tactics.js','combat/BossBrain.js','combat/BattleFX.js','core/Audio.js','games/OutlawArena.js','combat/HitZones.js','combat/EnemyAI.js','combat/CombatAnims.js','character/GunLoco.js','combat/Consumables.js','games/OutlawItems.js'],
  'world/SeaLife.js':['core/Audio.js'],
  'core/WorldState.js':['core/Net.js'],
  'ui/Journal.js':['core/WorldState.js'],
  'world/Fx.js':['core/Systems.js'],
  'world/Sites.js':['utils/random.js'],
  'core/Seeded.js':['utils/random.js'],
  'interaction/Link.js':['core/Net.js','core/Systems.js'],
  'interaction/Verbs.js':['core/Net.js','core/WorldState.js','core/Systems.js','world/Fx.js','world/Sites.js','core/Seeded.js','interaction/VerbAnims.js','data/interactables.js','interaction/InteractionManager.js','utils/random.js'],
  'world/Events.js':['core/Net.js','core/WorldState.js','core/Systems.js','world/Fx.js','world/Sites.js','data/events.js','utils/random.js'],
  'world/events/meteor.js':['world/Events.js','world/Fx.js','core/WorldState.js'],
  'world/events/visitor.js':['world/Events.js','world/Fx.js','core/WorldState.js','interaction/InteractionManager.js','interaction/Verbs.js','world/Vaults.js'],
  'world/events/rings.js':['world/Events.js','world/Fx.js','core/WorldState.js'],
  'ship/Sailing.js':['data/ship.js'],
  'ship/Decks.js':[],
  'ship/Vessel.js':['world/Ocean.js','data/ship.js','data/decks.js','ship/Decks.js','ship/Sailing.js'],
  'ship/Bowsprit.js':['data/ship.js','ship/Ship.js','interaction/InteractionManager.js','core/Systems.js'],
  'combat/LockOn.js':['core/Systems.js'],
  'ship/Leviathan.js':['data/ship.js','ship/Fleet.js','ship/Ship.js','core/Net.js','core/Systems.js','combat/LockOn.js','world/Ocean.js'],
  'ship/Monster.js':['data/ship.js','ship/Fleet.js','ship/Ship.js','core/Net.js','core/Systems.js','combat/LockOn.js','world/Ocean.js'],
  'ship/Deckhands.js':['ship/Crew.js','ship/Fleet.js','ship/Ship.js','ship/Decks.js','ship/Vessel.js','core/Systems.js'],
  'ship/Crew.js':['combat/LockOn.js','ship/Fleet.js','ship/Decks.js','ship/Vessel.js','core/Net.js','core/Systems.js','world/Fx.js'],
  'ship/Fleet.js':['data/ship.js','ship/Sailing.js','ship/Decks.js','ship/Vessel.js','ship/Ship.js','interaction/InteractionManager.js','core/Net.js','core/Systems.js','world/Fx.js','core/Audio.js'],
  'ship/Ship.js':['data/ship.js','data/decks.js','data/islands.js','ship/Sailing.js','ship/Decks.js','ship/Vessel.js','interaction/InteractionManager.js','core/Net.js','core/Systems.js','world/Fx.js'],
  'games/Soccer.js':['data/soccer.js','data/islands.js','interaction/InteractionManager.js','core/Net.js','core/Systems.js','world/Fx.js'],
  'world/Vaults.js':['core/Net.js','core/WorldState.js','core/Systems.js','world/Fx.js','world/Sites.js','core/Seeded.js','interaction/Link.js','interaction/VerbAnims.js','data/puzzles.js','interaction/InteractionManager.js','utils/random.js'],
};
let bad=0;
for(const [f,deps] of Object.entries(DEPS)){
  if(!order.includes(f)){if(fs.existsSync(__dirname+'/../src/'+f)){console.log('FAIL',f,'exists but is NOT loaded by index.html');bad++}continue}
  for(const d of deps){const a=order.indexOf(d),b=order.indexOf(f);
    if(a<0){console.log('FAIL',f,'needs',d,'which index.html never loads');bad++}
    else if(a>b){console.log('FAIL',f,'is loaded before its dependency',d);bad++}}
}
for(const f of fs.readdirSync(__dirname+'/../src',{recursive:true}).filter(x=>x.endsWith('.js')&&!order.includes(x.replace(/\\/g,'/')))){console.log('WARN src/'+f+' is not loaded by index.html')}
console.log(bad?bad+' problem(s)':'load order OK ('+order.length+' scripts checked)');process.exit(bad?1:0);
