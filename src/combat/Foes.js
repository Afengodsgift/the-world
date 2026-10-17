// WARDEN: the foe roster (pure data, no THREE/DOM). One entry per kind of enemy; sites (data/warden.js) say where they stand.
//   ai    = DuelistAI style (duelist | hollow | beast | knight | dancer | soldier)     role = WardenMX clip set        body = 'avatar' (the game's own rig + dress) or 'glb' (a natively rigged Mixamo model in assets/warden/<file>.glb)
//   boss  = gets the big HUD bar and a "felled" banner      pack = a foot soldier: at most PACK_ATK of them attack at once, and waking one wakes the others     aggro = metres at which an idle foe notices you (bosses: always awake)
//   dm    = outgoing damage multiplier (grunts hit softer than bosses)     bright = colour multiplier for dark Mixamo textures     grip = [rx,ry,rz,ox,oy,oz] sword orientation in the hand bone of a glb body
const Foes=(()=>{
  const PACK_ATK=2;
  const TYPES={
    duelist:{name:'The Duelist',hp:220,r:.54,scale:1.1,rm:1.1,spd:1.5,ai:'duelist',role:'duelist',body:'avatar',dress:2,sword:{f:'sword_claymore.glb',len:1.45,l0:6.6},boss:true,aggro:9},
    hollow:{name:'The Hollow Warden',hp:340,r:.85,scale:1.55,rm:1.45,spd:1.25,ai:'hollow',role:'hollow',body:'avatar',dress:2,tint:.07,boss:true,ph2:'The Hollow Warden rages.'},
    soldier:{name:'Ashen Soldier',hp:60,r:.45,scale:1,spd:1.3,ai:'soldier',role:'guard',body:'glb',files:['guard2','guard3'],bright:1.3,sword:{f:'sword_falchion.glb',len:1.0,l0:5.36},shield:true,pack:true,aggro:13,dm:.55},
    paladin:{name:'The Oathbound Knight',hp:300,r:.7,scale:1.3,rm:1.25,spd:1.3,ai:'knight',role:'paladin',body:'glb',file:'paladin',bright:2.6,boss:true,sword:{f:'sword_falchion.glb',len:1.1,l0:5.36},shield:true,aggro:11,ph2:'The knight casts his shield aside.'},
    parasite:{name:'The Hollow Parasite',hp:420,r:1.2,scale:1.9,rm:1.7,spd:1.2,ai:'beast',role:'parasite',body:'glb',file:'parasite',bright:1.2,boss:true,aggro:12,ph2:'The Parasite shrieks.'},
    arissa:{name:'Arissa, the Cinder Dancer',hp:260,r:.55,scale:1.12,rm:1.12,spd:1.5,ai:'dancer',role:'arissa',body:'glb',file:'arissa',bright:2.0,boss:true,aggro:10,ph2:'Arissa quickens.'}};
  for(const k in TYPES){TYPES[k].id=k;if(TYPES[k].ph2===undefined)TYPES[k].ph2=TYPES[k].name+' quickens.'}
  // fighter ids in the sim: 'P' is the player; foes are D, E, F, G... (the first foe is always 'D', as it was when there was only one)
  const IDS='DEFGHJKL';
  const ids=n=>IDS.slice(0,n).split('');
  // which site (if any) contains the point (local coords); `slack` widens the ring
  function siteAt(sites,wx,wz,slack){let best=null,bd=1e9;for(const s of sites){const d=Math.hypot(wx-s.x,wz-s.z);if(d<s.R+(slack||0)&&d<bd){bd=d;best=s}}return best}
  return{TYPES,PACK_ATK,ids,siteAt}})();
if(typeof module!=='undefined')module.exports=Foes;
