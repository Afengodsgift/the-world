// Pure data for the Verbs system (no THREE, no DOM). To add a new kind of interaction you
// normally edit THIS file, not Verbs.js:
//   VERBS  -> what a verb is (animation clip, prompt, duration)
//   CAMP   -> which verbs make up a site and how they are laid out
//   LOOT   -> seeded reward tables (results derive from the room seed, so no sync needed)
// Animation ids are the ids in assets/emotes.json (hammer, pickaxe, dig2, saw, chopw, lockpick, fish, fix...).
const VERBS={
  dig:    {emote:'dig2',    label:'Dig',    ms:2800, icon:'🕳️', verb:'dig up',past:'dug something up'},
  pickaxe:{emote:'pickaxe', label:'Mine',   ms:3600, icon:'⛏️', verb:'mine',past:'mined something'},
  hammer: {emote:'hammer',  label:'Repair', ms:3200, icon:'🔨', verb:'repair',past:'repaired something'}
  // next: saw, chopw (resource chain), lockpick (vaults), fish (water spots), push (heavy props)
};
// A camp = one site per island with one interactable per entry. dx/dz are metres from the camp centre.
const CAMP={
  radius:3.2,                   // how close you must stand to work
  parts:[{verb:'dig',dx:3.4,dz:.4,vis:'mound'},{verb:'pickaxe',dx:-3.2,dz:1.4,vis:'rock'},{verb:'hammer',dx:.2,dz:-3.6,vis:'fence'}],
  perIsland:1, main:2,          // how many camps per outer island / on the main island
  minSep:90,                    // metres between camps on the main island
  skip:['Outlaw Isle']          // islands that keep their own identity (Outlaw has the showdown town)
};
const LOOT={
  dig:[{id:'shell',n:'an odd seashell',ic:'🐚',w:36},{id:'coin',n:'an old coin',ic:'🪙',w:30},{id:'bone',n:'an ancient bone',ic:'🦴',w:16},
       {id:'key',n:'a rusty key',ic:'🗝️',w:12},{id:'relic',n:'a glowing relic',ic:'🏺',w:6,rare:1}],
  pickaxe:[{id:'quartz',n:'a quartz crystal',ic:'💎',w:40,c:'#dfe9ff'},{id:'amber',n:'a piece of amber',ic:'🟠',w:30,c:'#ffb347'},
       {id:'ruby',n:'a ruby',ic:'🔴',w:20,c:'#ff3b5c'},{id:'sapphire',n:'a sapphire',ic:'🔵',w:10,c:'#3b7bff',rare:1}]
};
