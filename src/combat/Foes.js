// WARDEN: the foe roster (pure data, no THREE/DOM). One entry per kind of enemy; sites (data/warden.js) say where they stand.
//   ai    = DuelistAI style (duelist | hollow | beast | knight | dancer | soldier)     role = WardenMX clip set        body = 'avatar' (the game's own rig + dress) or 'glb' (a natively rigged Mixamo model in assets/warden/<file>.glb)
//   boss  = gets the big HUD bar and a "felled" banner      pack = a foot soldier: at most PACK_ATK of them attack at once, and waking one wakes the others     aggro = metres at which an idle foe notices you (bosses: always awake)
//   dm    = outgoing damage multiplier (grunts hit softer than bosses)     bright = colour multiplier for dark Mixamo textures     grip = [rx,ry,rz,ox,oy,oz] sword orientation in the hand bone of a glb body
const Foes=(()=>{
  const PACK_ATK=2;
  const TYPES={
    duelist:{name:'The Duelist',hp:220,r:.54,scale:1.1,rm:1.1,spd:1.5,ai:'duelist',role:'duelist',body:'avatar',dress:2,sword:{f:'sword_claymore.glb',len:1.45,l0:6.6},boss:true,aggro:9},
    shade:{name:'The Arena Shade',hp:200,r:.54,scale:1.1,rm:1.1,spd:1.5,ai:'duelist',role:'duelist',body:'avatar',dress:2,sword:{f:'sword_claymore.glb',len:1.45,l0:6.6}},
    hollow:{name:'The Hollow Warden',hp:340,r:.85,scale:1.55,rm:1.45,spd:1.25,ai:'hollow',role:'hollow',body:'avatar',dress:2,tint:.07,sa:true,boss:true,ph2:'The Hollow Warden rages.'},
    soldier:{name:'Ashen Soldier',hp:60,r:.45,scale:1,spd:1.3,ai:'soldier',role:'guard',body:'glb',files:['guard2','guard3'],bright:1.3,sword:{f:'sword_falchion.glb',len:1.0,l0:5.36},shield:true,pack:true,aggro:13,dm:.55},
    paladin:{name:'The Oathbound Knight',hp:300,r:.7,scale:1.3,rm:1.25,spd:1.3,ai:'knight',role:'paladin',rise:true,body:'glb',file:'paladin',bright:2.6,boss:true,sword:{f:'sword_falchion.glb',len:1.1,l0:5.36},shield:true,aggro:11,ph2:'The knight casts his shield aside.'},
    parasite:{name:'The Hollow Parasite',hp:420,r:1.2,scale:1.9,rm:1.7,spd:1.2,ai:'beast',role:'parasite',body:'glb',file:'parasite',bright:1.2,sa:true,boss:true,aggro:12,ph2:'The Parasite shrieks.'},
    ganfaul:{name:'Ganfaul, the Hollow Knight',hp:380,r:.8,scale:1.45,rm:1.45,spd:1.2,ai:'knight',role:'ganfaul',rise:true,body:'glb',file:'ganfaul',bright:2.4,sa:true,boss:true,sword:{f:'sword_claymore.glb',len:1.5,l0:6.6},aggro:11,echo:true,ph2:'Ganfaul raises his blade and the ground answers.'},
    darkknight:{name:'Artorias, the Abyss Walker',hp:340,r:.9,scale:1.5,rm:1.4,spd:1.35,ai:'blackknight',role:'penitent',rise:true,body:'glb',file:'penitent',bright:1.5,sa:true,boss:true,aggro:11,barrage:true,ph2:'Artorias drops to one knee... and the abyss lifts him.'},
    vampire:{name:'Vael, the Crimson Duelist',hp:360,r:.55,scale:.95,rm:1.12,spd:1.7,dm:1.2,ai:'stalker',role:'vampire',rise:true,body:'glb',file:'vampire',bright:1.9,boss:true,sword:{f:'sword_falchion.glb',len:1.05,l0:5.36},sword2:true,vamp:true,blink:true,aggro:12,ph2:'Vael bares his fangs. The blood rushes.'},
    penitent:{name:'The Iron Penitent',hp:560,r:.9,scale:1.5,rm:1.5,spd:1.45,dm:1.3,ai:'penitent',role:'penitent',rise:true,body:'glb',file:'penitent',bright:1.5,sa:true,boss:true,oath:true,aggro:12,ph2:'The Penitent kneels, and rises heavier. The sentence is not finished.'},
    saint:{name:'The Veiled Saint',hp:480,r:.75,scale:1.5,rm:1.1,spd:1.5,dm:1.2,ai:'saint',role:'saint',body:'glb',file:'saint',bright:1.1,boss:true,oath:true,aggro:14,ph2:'The Saint lifts her veil. The ground remembers.'},
    veil:{name:'The Veil Dancer',hp:400,r:.65,scale:1.5,rm:1.15,spd:1.9,dm:1.2,ai:'veil',role:'veil',body:'glb',file:'veil',bright:2.4,boss:true,oath:true,sword:{f:'w_katana.glb',len:1.2,l0:1},grip:[2.337,0,3.1416,0,.354,.288],blink:true,aggro:12,ph2:'The Dancer steps out of her own shadow.'},
    samurai:{name:'Kage, the Shadowflame Samurai',hp:520,r:.7,scale:1.4,rm:1.3,spd:1.75,dm:1.25,ai:'samurai',role:'samurai',body:'glb',file:'samurai',rise:true,bright:2.2,boss:true,sword:{f:'w_katana.glb',len:1.15,l0:1},grip:[2.337,0,3.1416,0,.354,.288],blink:true,aggro:12,ph2:'Kage lowers his stance. The sheath is empty.',ph3:'Kage kneels. The flames rise. This is the final draw.'},
    goblin:{name:'Skrag, the Snare-Trapper',hp:300,r:.42,scale:.68,rm:.95,spd:1.65,dm:1.15,ai:'trapper',role:'goblin',body:'glb',file:'goblin',bright:2.6,boss:true,traps:true,aggro:16,ph2:'Skrag cackles. The ground is full of teeth.'},
    maw:{name:'The Maw',hp:460,r:1.15,scale:1.8,rm:1.7,spd:1.25,ai:'beast',role:'maw',body:'glb',file:'maw',bright:1.4,sa:true,boss:true,aggro:12,ph2:'The Maw bellows.'},
    bear:{name:'The Ashfur Bear',hp:300,r:1.0,scale:1.6,rm:1.5,spd:1.45,ai:'beast',role:'bear',body:'glb',file:'bear',bright:1.4,sa:true,boss:true,aggro:12,ph2:'The Bear goes berserk.'},
    archer:{name:'Erika, the Ashen Huntress',hp:240,r:.5,scale:1.12,rm:1.1,spd:1.55,ai:'archer',role:'archer',body:'glb',file:'archer',bright:2.2,boss:true,aggro:16,ph2:'Erika draws faster.'},
    arissa:{name:'Arissa, the Cinder Dancer',hp:260,r:.55,scale:1.12,rm:1.12,spd:1.5,ai:'dancer',role:'arissa',body:'glb',file:'arissa',bright:2.0,boss:true,aggro:10,ph2:'Arissa quickens.'}};
  // the Ashen Catacombs' own foes: variants of existing bodies and movesets (data/dungeon.js uses these ids)
  const clone=(b,id,o)=>{TYPES[id]=Object.assign({},TYPES[b],o)};
  clone('paladin','gaoler',{name:'The Gaoler',hp:380,scale:1.5,bright:1.8,ph2:'The Gaoler tears off his shield and swings the keys.'});
  clone('hollow','vaultwarden',{name:'The Vault Warden',hp:300,ph2:'The Vault Warden rattles his chains.'});
  clone('ganfaul','ganfauld',{hp:270});
  clone('darkknight','darkknightd',{hp:240});
  for(const k in TYPES){TYPES[k].id=k;if(TYPES[k].ph2===undefined)TYPES[k].ph2=TYPES[k].name+' quickens.'}
  // fighter ids in the sim: 'P' is the player; foes are D, E, F, G... (the first foe is always 'D', as it was when there was only one)
  const IDS='DEFGHJKL';
  const ids=n=>IDS.slice(0,n).split('');
  // which site (if any) contains the point (local coords); `slack` widens the ring
  function siteAt(sites,wx,wz,slack){let best=null,bd=1e9;for(const s of sites){const d=Math.hypot(wx-s.x,wz-s.z);if(d<s.R+(slack||0)&&d<bd){bd=d;best=s}}return best}
  return{TYPES,PACK_ATK,ids,siteAt}})();
if(typeof module!=='undefined')module.exports=Foes;
