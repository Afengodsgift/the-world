// Verifies that in index.html every new module is loaded AFTER the modules it needs at load/run time.
const fs=require('fs');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const order=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1].replace(/^src\//,''));
const DEPS={ // file -> files that must come first
  'world/Environment.js':['core/Audio.js'],
  'space/SpaceManager.js':['space/SpaceFlight.js'],
  'space/SpaceEnvironment.js':['space/SpaceManager.js','world/Environment.js'],
  'space/SpaceEvents.js':['core/Net.js','core/WorldState.js'],
  'space/SpaceObjects.js':['space/SpaceEvents.js','space/SpaceManager.js','space/SpaceFlight.js','core/Audio.js'],
  'audio/Ambience.js':['core/Audio.js','data/islands.js'],
  'combat/Melee.js':['core/Audio.js'],
  'games/OutlawArena.js':['utils/random.js'],
  'games/Outlaw.js':['core/Audio.js','games/OutlawArena.js'],
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
