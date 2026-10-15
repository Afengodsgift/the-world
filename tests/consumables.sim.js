// Consumables rules (src/combat/Consumables.js): stack limits, use rules, no stacked / instant healing, armor maths, grenade damage, network validation, drops.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={Math,Number,Object};vm.createContext(c);vm.runInContext(fs.readFileSync(R+'src/combat/Consumables.js','utf8')+';this.C=Consumables',c);const C=c.C;
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const ctx=o=>Object.assign({down:false,blocked:false,hp:50,maxHp:100,ammoMissing:true},o||{});
// ---- inventory ----
let s=C.newState();
ok(C.add(s,'stim',3)===3&&s.n.stim===3,'add within the stack limit');
ok(C.add(s,'stim',9)===1&&s.n.stim===C.ITEMS.stim.max,'add is capped at the stack limit ('+C.ITEMS.stim.max+')');
ok(C.add(s,'nope',1)===0&&C.add(s,'__proto__',1)===0&&C.add(s,'gren',-5)===0,'unknown ids / negative amounts add nothing');
ok(JSON.stringify(C.sanitize({stim:99,armor:-3,gren:'x',ammo:2.7,evil:5}))==='{"stim":4,"armor":0,"gren":0,"ammo":2}','saved counts are clamped to [0,max] and junk dropped');
ok(!C.canBuy(s,1e9,'stim').ok&&C.canBuy(C.newState(),89,'stim').r==='not enough coins'&&C.canBuy(C.newState(),90,'stim').ok,'buying needs coins and room');
// ---- use rules ----
s=C.newState();C.add(s,'stim',2);C.add(s,'armor',2);C.add(s,'gren',2);C.add(s,'ammo',2);
ok(C.canUse(s,'stim',ctx({hp:100})).r==='Health full','stim refused at full health');
ok(C.canUse(s,'stim',ctx({down:true})).r==='You are down','nothing can be used while down');
ok(C.canUse(s,'stim',ctx({blocked:true})).r==='Not now','nothing while flying / swimming');
ok(C.canUse(s,'ammo',ctx({ammoMissing:false})).r==='Ammo full','ammo pack refused when every magazine is full');
ok(C.canUse(C.newState(),'gren',ctx()).r==='None left','empty stack refused');
// full stim cycle: use time, consumed only at the end, heal over time, no stacking
C.begin(s,'stim');ok(C.canUse(s,'armor',ctx()).r==='Busy','a second item cannot start while one is being used');
let done=null;for(let t=0;t<.7;t+=.1)done=done||C.step(s,.1);ok(!done&&s.n.stim===2,'not consumed before the use time is up');
for(let t=0;t<.3;t+=.1)done=done||C.step(s,.1);ok(done==='stim'&&s.n.stim===1,'consumed exactly once when the use completes');
C.apply(s,'stim');ok(C.canUse(s,'stim',ctx()).r==='Not ready'||C.canUse(s,'stim',ctx()).r==='Already healing','cannot start another stim straight away');
s.lock=0;s.cd.stim=0;ok(C.canUse(s,'stim',ctx()).r==='Already healing','still healing: a second stim is refused even without cooldown');
let hp=40,total=0;for(let i=0;i<100;i++){const g=C.tickEffects(s,.1,hp,100,false);hp+=g;total+=g}
ok(Math.abs(total-60)<1e-6&&s.heal===0,'a stim heals 60 over 5 s, then stops ('+total.toFixed(2)+')');
s.heal=60;s.healRate=12;hp=95;const gg=C.tickEffects(s,1,hp,100,false);ok(gg===5&&s.heal===0,'healing never goes past max health and the rest is discarded');
s.heal=60;ok(C.tickEffects(s,1,10,100,true)===0&&s.heal===0,'a downed player stops healing');
// ---- armor ----
s=C.newState();C.add(s,'armor',3);C.apply(s,'armor');
ok(s.armor===50&&C.canUse(s,'armor',ctx()).r==='Armor still good','armor plate sets 50 and a fresh one cannot be re-applied (no stacking)');
let r=C.absorb(s,10);ok(r.soak===7&&r.hp===3&&s.armor===43,'armor soaks 70% of a hit ('+JSON.stringify(r)+')');
r=C.absorb(s,1000);ok(r.soak===43&&r.hp===957&&s.armor===0,'when it runs out the rest goes to health');
ok(C.absorb(s,20).hp===20&&C.absorb(s,20).soak===0,'no armor: full damage, nothing soaked');
C.apply(s,'armor');s.armor=20;ok(C.canUse(s,'armor',ctx()).ok,'a worn plate (< half) can be replaced');C.apply(s,'armor');ok(s.armor===50,'replacing sets 50, not 70');
C.apply(s,'armor');for(let i=0;i<61;i++)C.tickEffects(s,1,100,100,false);ok(s.armor===0,'armor expires after 60 s');
ok(C.absorb(C.newState(),-5).hp===0,'negative damage is ignored');
// ---- grenade damage ----
ok(C.grenadeDamage(0,'npc',false)===110&&C.grenadeDamage(1.5,'npc',false)===110,'full damage at the centre');
ok(C.grenadeDamage(6.4,'npc',false)>=27&&C.grenadeDamage(6.4,'npc',false)<31,'about 25% at the edge');
ok(C.grenadeDamage(6.5,'npc',false)===0&&C.grenadeDamage(50,'npc',false)===0&&C.grenadeDamage(NaN,'npc',false)===0,'nothing outside the radius');
let prev=999,mono=true;for(let d=0;d<6.5;d+=.25){const x=C.grenadeDamage(d,'npc',false);if(x>prev)mono=false;prev=x}ok(mono,'damage only falls with distance');
ok(C.grenadeDamage(2,'npc',true)<C.grenadeDamage(2,'npc',false)&&C.grenadeDamage(2,'boss',false)<C.grenadeDamage(2,'npc',false)&&C.grenadeDamage(2,'player',false)<C.grenadeDamage(2,'boss',false),'cover, bosses and players take less');
// ---- network validation ----
const g={id:'a1',x0:0,z0:0,y0:3,x1:10,z1:10,ft:.9},isl={x:0,z:0,r:200};
ok(!!C.grenadeMsgOk(g,undefined,1e6,isl),'a normal throw is accepted');
ok(!C.grenadeMsgOk(Object.assign({},g,{x1:500}),undefined,1e6,isl)&&!C.grenadeMsgOk(Object.assign({},g,{x1:30}),undefined,1e6,isl),'out-of-range / off-island landings are rejected');
ok(!C.grenadeMsgOk(Object.assign({},g,{ft:0}),undefined,1e6,isl)&&!C.grenadeMsgOk(Object.assign({},g,{ft:99}),undefined,1e6,isl)&&!C.grenadeMsgOk(Object.assign({},g,{x0:NaN}),undefined,1e6,isl),'bad flight time / NaN rejected');
ok(!C.grenadeMsgOk(g,1000,1200,isl)&&!!C.grenadeMsgOk(g,1000,3000,isl),'throws faster than the cooldown are rejected');
ok(!C.grenadeMsgOk(null)&&!C.grenadeMsgOk('x')&&!C.grenadeMsgOk({}),'garbage is rejected');
ok(C.grenadeMsgOk(Object.assign({d:99999},g),undefined,1e6,isl).d===undefined,'a message can not carry its own damage');
const npc={max:100,dead:0};
ok(C.hitOk({d:30,z:'head'},npc).d===30&&C.hitOk({d:9999,z:'head'},npc).d<=102,'hit reports are capped at the raider\'s health (a 9999 headshot kill still kills)');
ok(!C.hitOk({d:-1},npc)&&!C.hitOk({d:NaN},npc)&&!C.hitOk({d:5},{max:100,dead:1})&&!C.hitOk({d:5},null),'negative / NaN / dead-target hit reports rejected');
ok(C.hitOk({d:5,z:'<script>'},npc).z==='torso','unknown zone names become torso');
// ---- drops ----
let n=0,tot=20000,seq=0,rnd=()=>((seq=(seq*1664525+1013904223)>>>0)/4294967296);const cnt={};for(let i=0;i<tot;i++){const id=C.rollDrop(rnd,false);if(id){n++;cnt[id]=(cnt[id]||0)+1}}
ok(Math.abs(n/tot-.08)<.01,'raiders drop a supply crate about 8% of the time ('+(100*n/tot).toFixed(1)+'%)');
ok(C.ORDER.every(id=>cnt[id]>0)&&C.ORDER.every(id=>C.isItem(id)),'every item can drop');
ok(C.rollDrop(()=>0.5,true)!==null,'bosses always drop one');
console.log(bad?'FAILED '+bad:'all passed');process.exit(bad?1:0);
