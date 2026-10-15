// Consumables: the rules behind Outlaw Isle's manually used items (pure logic, no DOM / three.js; tests/consumables.sim.js). src/games/OutlawItems.js is the part that touches the game.
//   Stim Injector  60 HP over 5 s (12/s). One heal at a time, refused at full health, 10 s cooldown: no instant or stacked healing.
//   Armor Plate    50 armor points that soak 70% of every hit until used up or 60 s pass. Separate from health. Refused while the current plate is still >= half: using one SETS armor to 50, it never adds up.
//   Frag Grenade   thrown along the crosshair (max 24 m), explodes on landing: 110 damage at the centre falling to 25% at the 6.5 m edge, 45% if cover is in the way, half vs bosses,
//                  35% against players (self / partner). Damage comes from THIS table on the host, never from a message.
//   Ammo Pack      Outlaw weapons reload from an endless supply, so the pack is an instant refill: every owned magazine is topped up and a reload in progress is finished with no wait.
//                  Refused when every owned magazine is already full.
// Every item has a use time (the wind-up during which you cannot fire or reload), a shared lock after any item, and a per-item cooldown. The item is only consumed when the use completes.
// Prices are tuned against the wave economy (a solo Normal wave 1 pays about 150 coins: one or two items per wave early on; (40+12*wave) per cleared wave plus kills).
const Consumables=(()=>{
  const ORDER=['stim','armor','gren','ammo'];
  const ITEMS={
    stim:{n:'Stim Injector',icon:'\u{1F489}',key:'KeyH',max:4,price:90,use:.8,cd:10,heal:60,healT:5,start:1,w:3,sub:'+60 HP over 5 s'},
    armor:{n:'Armor Plate',icon:'\u{1F6E1}️',key:'KeyV',max:3,price:140,use:1.3,cd:6,armor:50,life:60,start:0,w:2,sub:'50 armor, soaks 70% of hits, 60 s'},
    gren:{n:'Frag Grenade',icon:'\u{1F4A3}',key:'KeyX',max:4,price:110,use:.35,cd:1.6,dmg:110,rad:6.5,range:24,start:2,w:3,sub:'110 blast damage, 6.5 m'},
    ammo:{n:'Ammo Pack',icon:'\u{1F4E6}',key:'KeyN',max:3,price:70,use:.7,cd:4,start:1,w:2,sub:'instant full magazines'}};
  const LOCK=.45,ABSORB=.7,SELF=.35,BOSS=.5,COVER=.45,MINFALL=.25;
  const isItem=id=>typeof id==='string'&&Object.prototype.hasOwnProperty.call(ITEMS,id);
  const newState=()=>({n:{stim:0,armor:0,gren:0,ammo:0},lock:0,cd:{stim:0,armor:0,gren:0,ammo:0},use:null,heal:0,healRate:0,armor:0,armorT:0});
  const starter=()=>{const o={};for(const id of ORDER)o[id]=ITEMS[id].start;return o};
  // saved counts -> clean ints inside [0,max]; anything unknown is dropped
  function sanitize(raw){const o={};for(const id of ORDER){const v=raw&&Number(raw[id]);o[id]=Number.isFinite(v)?Math.max(0,Math.min(ITEMS[id].max,Math.floor(v))):0}return o}
  function add(s,id,k){if(!isItem(id))return 0;const a=Math.min(Math.max(0,ITEMS[id].max-s.n[id]),Math.max(0,Math.floor(k)||0));s.n[id]+=a;return a}
  function canBuy(s,coins,id){if(!isItem(id))return {ok:false,r:'unknown item'};if(s.n[id]>=ITEMS[id].max)return {ok:false,r:'stack full'};if(coins<ITEMS[id].price)return {ok:false,r:'not enough coins'};return {ok:true}}
  // c = {down, blocked (flying / swimming), hp, maxHp, ammoMissing}
  function canUse(s,id,c){
    if(!isItem(id))return {ok:false,r:'Unknown item'};
    if(c.down)return {ok:false,r:'You are down'};
    if(s.use)return {ok:false,r:'Busy'};
    if(c.blocked)return {ok:false,r:'Not now'};
    if(s.n[id]<=0)return {ok:false,r:'None left'};
    if(s.lock>0||s.cd[id]>0)return {ok:false,r:'Not ready'};
    if(id==='stim'){if(s.heal>0)return {ok:false,r:'Already healing'};if(c.hp>=c.maxHp)return {ok:false,r:'Health full'}}
    if(id==='armor'&&s.armor>=ITEMS.armor.armor*.5)return {ok:false,r:'Armor still good'};
    if(id==='ammo'&&!c.ammoMissing)return {ok:false,r:'Ammo full'};
    return {ok:true}}
  const begin=(s,id)=>{s.use={id,t:0,d:ITEMS[id].use}};
  const cancel=s=>{s.use=null};
  const progress=s=>s.use?Math.min(1,s.use.t/s.use.d):-1;
  // advances locks / cooldowns / the use timer; returns the id of an item whose use just completed (it is consumed here), else null
  function step(s,dt){
    s.lock=Math.max(0,s.lock-dt);for(const id of ORDER)s.cd[id]=Math.max(0,s.cd[id]-dt);
    if(!s.use)return null;s.use.t+=dt;if(s.use.t<s.use.d)return null;
    const id=s.use.id;s.use=null;s.n[id]=Math.max(0,s.n[id]-1);s.cd[id]=ITEMS[id].cd;s.lock=LOCK;return id}
  function apply(s,id){
    if(id==='stim'){s.heal=ITEMS.stim.heal;s.healRate=ITEMS.stim.heal/ITEMS.stim.healT}
    else if(id==='armor'){s.armor=ITEMS.armor.armor;s.armorT=ITEMS.armor.life}}   // SET, never add
  // heal-over-time + armor timer; returns the HP to add this frame (never past maxHp, nothing while down)
  function tickEffects(s,dt,hp,maxHp,down){
    let g=0;if(down){s.heal=0}else if(s.heal>0){const want=Math.min(s.heal,s.healRate*dt);g=Math.max(0,Math.min(want,maxHp-hp));s.heal-=want;if(hp+g>=maxHp)s.heal=0}
    if(s.armor>0){s.armorT-=dt;if(s.armorT<=0){s.armor=0;s.armorT=0}}
    return g}
  // damage after armor: {hp, soak}. Integer maths so armor and health stay whole numbers.
  function absorb(s,d){d=Math.max(0,d);if(s.armor<=0||d<=0)return {hp:d,soak:0};const soak=Math.min(s.armor,Math.round(d*ABSORB));s.armor-=soak;if(s.armor<=0){s.armor=0;s.armorT=0}return {hp:d-soak,soak}}
  const resetEffects=s=>{s.use=null;s.heal=0;s.healRate=0;s.armor=0;s.armorT=0;s.lock=0};   // respawn / new showdown (the stack itself is kept)
  // blast damage at ground distance dist (m). target: 'npc' | 'boss' | 'player'. covered = a solid piece of cover is between the blast and the target.
  function grenadeDamage(dist,target,covered){const G=ITEMS.gren;if(!(dist>=0)||dist>=G.rad)return 0;
    const near=1.5,k=dist<=near?1:1-(1-MINFALL)*(dist-near)/(G.rad-near);let d=G.dmg*k;
    if(covered)d*=COVER;if(target==='boss')d*=BOSS;else if(target==='player')d*=SELF;return Math.max(1,Math.round(d))}
  // ---- validation of what arrives over the network (nothing from a message is trusted as a number of damage / items) ----
  // a thrown grenade message: finite numbers, a landing inside the throw range, a plausible flight time, on the island, and not faster than the cooldown allows
  function grenadeMsgOk(p,last,now,R){
    if(!p||typeof p!=='object')return null;const n=['x0','z0','x1','z1','ft'];for(const k of n)if(!Number.isFinite(p[k]))return null;
    const G=ITEMS.gren,d=Math.hypot(p.x1-p.x0,p.z1-p.z0);if(d>G.range+2)return null;if(p.ft<.3||p.ft>1.8)return null;
    if(R&&(Math.hypot(p.x1-R.x,p.z1-R.z)>R.r||Math.hypot(p.x0-R.x,p.z0-R.z)>R.r))return null;
    if(typeof p.id!=='string'&&!Number.isFinite(p.id))return null;if(last!==undefined&&now-last<(G.cd*1000)*.6)return null;
    return {id:p.id,x0:p.x0,z0:p.z0,y0:Number.isFinite(p.y0)?Math.max(-50,Math.min(500,p.y0)):0,x1:p.x1,z1:p.z1,ft:p.ft}}
  // a client's hit report on a raider: damage can never exceed what the raider has (a headshot kill is sent as 9999), zone must be a known name
  const ZONES=['head','torso','arm','leg','neck'];
  function hitOk(p,npc){if(!p||!npc||npc.dead)return null;const d=Number(p.d);if(!Number.isFinite(d)||d<=0)return null;return {d:Math.min(d,npc.max*1.01+1),z:ZONES.includes(p.z)?p.z:'torso'}}
  // weighted pick of a supply-crate item: rand in [0,1). Bosses always drop one, raiders 8% of the time.
  function rollDrop(rand,boss){const chance=boss?1:.08;if(rand()>=chance)return null;let tot=0;for(const id of ORDER)tot+=ITEMS[id].w;let r=rand()*tot;for(const id of ORDER){r-=ITEMS[id].w;if(r<0)return id}return ORDER[ORDER.length-1]}
  return {ORDER,ITEMS,LOCK,ABSORB,SELF,newState,starter,sanitize,add,canBuy,canUse,begin,cancel,progress,step,apply,tickEffects,absorb,resetEffects,grenadeDamage,grenadeMsgOk,hitOk,rollDrop,isItem};
})();
