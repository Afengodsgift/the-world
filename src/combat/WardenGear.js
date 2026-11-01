// WARDEN gear (no THREE/DOM; tests run it in a vm): weapon types, random affixes, rarity, drops, the inventory and the Wandering Merchant's stock.
//   Weapon = {id, ty, rar (0 common .. 3 relic), af:[[affix, tier],..]}. Type sets the base feel (damage, reach, stamina cost, posture), affixes add effects.
//   Saved in localStorage 'wgear' = {inv:[items], eq:id, n:counter}. Everything read back is clamped: a hand-edited save cannot break the sim.
const WardenGear=(()=>{
  const KEY='wgear',CAP=24;
  // file: model (relative to assets/); l0 = the model's own blade length, want = metres in the player's hand
  const TYPES={
    falchion:{n:'Falchion',role:'player',file:'warden/sword_falchion.glb',l0:5.36,want:.95,dm:1,rm:1,sm:1,pm:1,d:'Balanced'},
    cutlass:{n:'Cutlass',role:'player',file:'pirates/sword_002.glb',l0:1.85,want:.95,dm:.9,rm:1,sm:.75,pm:.9,flow:1.3,d:'Light and cheap: swing more, Flow builds faster'},
    longsword:{n:'Longsword',role:'player',file:'pirates/sword_001.glb',l0:1.94,want:1.15,dm:1,rm:1.12,sm:1,pm:1,d:'Longer reach'},
    claymore:{n:'Claymore',role:'player_gs',file:'warden/sword_claymore.glb',l0:6.6,want:1.55,dm:1.3,rm:1.08,sm:1.25,pm:1.1,d:'Heavy hits, hungry for stamina'},
    axe:{n:'Hand Axe',role:'player_axe',file:'pirates/axe.glb',l0:.95,want:.8,dm:1.2,rm:.94,sm:1.3,pm:1.5,d:'Shatters posture'},
    // baked from the uploaded packs by tools/bake_weapons.mjs: normalised to length 1 (grip 12% up), so l0 is 1 and want is the whole length in metres
    katana:{n:'Katana',role:'player',file:'warden/w_katana.glb',l0:1,want:1.15,dm:.95,rm:1.05,sm:.8,pm:.85,flow:1.4,d:'Swift: cheap swings, Flow builds fast'},
    sunblade:{n:'Sunblade',role:'player',file:'warden/w_sunblade.glb',l0:1,want:1.3,dm:1.1,rm:1.15,sm:1.05,pm:1,d:'Long gilded blade'},
    saber:{n:'Saber',role:'player',file:'warden/w_saber.glb',l0:1,want:1.2,dm:.95,rm:1.08,sm:.85,pm:.95,flow:1.15,d:'Light and wide-reaching'},
    emberbrand:{n:'Emberbrand',role:'player',file:'warden/w_emberbrand.glb',l0:1,want:1.25,dm:1.05,rm:1.05,sm:1,pm:1,flow:1.25,d:'Flame-forged: Flow builds faster'},
    bloodrender:{n:'Bloodrender',role:'player',file:'warden/w_bloodrender.glb',l0:1,want:1.3,dm:1.2,rm:1.05,sm:1.15,pm:1.1,d:'Hits hard, drinks stamina'},
    knight:{n:'Dread Sword',role:'player',file:'warden/w_knight.glb',l0:1,want:1.05,dm:1.1,rm:1,sm:1,pm:1.15,d:'Wicked and balanced; breaks posture'},
    wingblade:{n:'Wingblade',role:'player_gs',file:'warden/w_wingblade.glb',l0:1,want:1.75,dm:1.4,rm:1.12,sm:1.35,pm:1.15,d:'A great blade: slow, brutal'},
    waraxe:{n:'War Axe',role:'player_axe',file:'warden/w_waraxe.glb',l0:1,want:1.3,dm:1.3,rm:1,sm:1.35,pm:1.6,d:'Cleaves posture apart'},
    hammer:{n:'Battle Hammer',role:'player_axe',file:'warden/w_hammer.glb',l0:1,want:1.35,dm:1.35,rm:.98,sm:1.45,pm:1.8,d:'Crushes guards; heavy on stamina'}};
  // [adjective, label(value), per-tier values]
  const AFFIX={
    dmg:{adj:'Keen',lbl:v=>'+'+v+'% damage',v:[6,10,15]},
    bleed:{adj:'Serrated',lbl:v=>'Hits bleed for '+v+'/s',v:[2,3,5]},
    vamp:{adj:'Hungering',lbl:v=>'Heal '+v+'% of damage dealt',v:[3,5,8]},
    flowg:{adj:'Dancing',lbl:v=>'+'+v+'% Flow gain',v:[25,40,60]},
    gild:{adj:'Gilded',lbl:v=>'+'+v+'% Embers',v:[15,25,40]},
    sturdy:{adj:'Stalwart',lbl:v=>'+'+v+'% max health',v:[6,10,15]},
    frugal:{adj:'Thrifty',lbl:v=>'-'+v+'% stamina cost',v:[8,12,18]},
    deft:{adj:'Guarding',lbl:v=>'Deflect window +'+v+' ticks',v:[1,2,3]}};
  const RAR=['Common','Fine','Rare','Relic'],RCOL=['#bdb6a8','#7fc77f','#6aa6ff','#ff9a3a'];
  const BASEP={falchion:60,cutlass:80,longsword:110,claymore:170,axe:140,katana:130,sunblade:150,saber:110,emberbrand:160,bloodrender:180,knight:150,wingblade:210,waraxe:190,hammer:200},RP=[1,2.6,6,14];
  const S={inv:[],eq:'start',n:1,seed:0,sold:[]};
  const clampI=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(v)?v|0:lo));
  function sane(it){if(!it||typeof it.id!=='string'||!TYPES[it.ty])return null;const rar=clampI(it.rar,0,3),af=[];
    for(const a of Array.isArray(it.af)?it.af:[])if(Array.isArray(a)&&AFFIX[a[0]]&&af.length<rar&&!af.some(x=>x[0]===a[0]))af.push([a[0],clampI(a[1],0,2)]);
    return{id:it.id.slice(0,24),ty:it.ty,rar,af}}
  const START={id:'start',ty:'falchion',rar:0,af:[]};
  function load(){try{const j=JSON.parse(localStorage.getItem(KEY)||'null');S.inv=[];S.n=1;S.eq='start';S.seed=0;S.sold=[];if(!j)return;S.n=clampI(j.n,1,1e9);S.seed=clampI(j.seed,0,1e9);S.sold=Array.isArray(j.sold)?j.sold.filter(x=>typeof x==='string').slice(0,8).map(x=>x.slice(0,24)):[];
    for(const it of Array.isArray(j.inv)?j.inv:[]){const c=sane(it);if(c&&c.id!=='start'&&S.inv.length<CAP&&!S.inv.some(x=>x.id===c.id))S.inv.push(c)}
    if(typeof j.eq==='string'&&(j.eq==='start'||j.eq==='fists'||S.inv.some(x=>x.id===j.eq)))S.eq=j.eq}catch(e){}}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
  load();
  const all=()=>[START,FISTS].concat(S.inv);
  const byId=id=>all().find(x=>x.id===id)||START;
  const equipped=()=>byId(S.eq);
  function name(it){const t=TYPES[it.ty].n;if(!it.af.length)return it.rar?'Plain '+t:(it.id==='start'?'Worn '+t:t);const a=AFFIX[it.af[0][0]].adj;return it.rar>=3?a+' '+t+' of Ash':a+' '+t}
  // fold weapon type + affixes into the numbers the fight needs
  function stats(it){it=it||equipped();const T=TYPES[it.ty],o={dm:T.dm,rm:T.rm,sm:T.sm,pm:T.pm,dfl:0,hp:1,flow:T.flow||1,bleed:0,vamp:0,gild:1};
    for(const [k,t] of it.af){const v=AFFIX[k].v[t];
      if(k==='dmg')o.dm*=1+v/100;else if(k==='bleed')o.bleed=v;else if(k==='vamp')o.vamp=v/100;else if(k==='flowg')o.flow*=1+v/100;
      else if(k==='gild')o.gild*=1+v/100;else if(k==='sturdy')o.hp*=1+v/100;else if(k==='frugal')o.sm*=1-v/100;else if(k==='deft')o.dfl+=v}
    return o}
  const price=it=>Math.round(BASEP[it.ty]*RP[it.rar]*(1+.25*it.af.reduce((s,a)=>s+a[1],0)));
  const sellValue=it=>Math.round(price(it)*.4);
  // tiny deterministic rng (mulberry32) so the Merchant's stock is the same for everybody on the same stock seed and tests are repeatable
  function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
  const TKEYS=Object.keys(TYPES),AKEYS=Object.keys(AFFIX);   // (random drops and the Merchant only roll the weapons above)
  // BARE HANDS: always yours, never dropped, bought or sold. A style of fighting rather than a weapon: see Fists.js (strings, throws, takedowns). No model: file is null.
  TYPES.fists={n:'Bare Hands',role:'player_fists',file:null,l0:1,want:0,dm:1,rm:1,sm:.8,pm:1.05,flow:1.15,d:'No blade. Fast strings, throws and takedowns: break their posture, then finish them.'};
  BASEP.fists=0;
  const FISTS={id:'fists',ty:'fists',rar:0,af:[]};
  function make(r,rar,ty,idp){ty=ty||TKEYS[Math.floor(r()*TKEYS.length)];const pool=AKEYS.slice(),af=[];
    for(let i=0;i<rar;i++){const k=pool.splice(Math.floor(r()*pool.length),1)[0];const tier=Math.min(2,Math.max(0,Math.floor(r()*2+(rar>=3?1:rar>=2?.4:0))));af.push([k,tier])}
    return{id:(idp||'w')+Math.floor(r()*1e9).toString(36),ty,rar,af}}
  // rarity roll for a drop. boss: always something good-ish, better each cycle; grunt: seldom and low
  function rollRar(r,boss,cycle){const c=Math.min(cycle||1,8)-1,x=r();
    if(!boss)return x<.12+.01*c?1:0;
    const relic=.04+.02*c,rare=.28+.03*c,fine=.5;return x<relic?3:x<relic+rare?2:x<relic+rare+fine?1:0}
  function drop(r,boss,cycle){if(!boss&&r()>.07)return null;return make(r,rollRar(r,boss,cycle),null,'d')}
  function add(it){const c=sane(it);if(!c||S.inv.length>=CAP)return false;S.inv.push(c);save();return true}
  const full=()=>S.inv.length>=CAP;
  function equip(id){if(id!=='start'&&id!=='fists'&&!S.inv.some(x=>x.id===id))return false;S.eq=id;save();return true}
  function sell(id){const i=S.inv.findIndex(x=>x.id===id);if(i<0)return 0;const v=sellValue(S.inv[i]);S.inv.splice(i,1);if(S.eq===id)S.eq='start';save();return v}
  // the Wandering Merchant: 3 weapons that change every time a cycle turns or a boss falls (seed from progress, passed in)
  function stock(seed){if(S.seed!==seed){S.seed=seed;S.sold=[];save()}const r=rng(seed*2654435761+17),out=[];for(let i=0;i<3;i++){const rar=i===0?1:i===1?(r()<.5?1:2):(r()<.4?2:3);const it=make(r,rar,null,'m');it.id='m'+seed+'_'+i;if(S.sold.indexOf(it.id)<0)out.push(it)}return out}
  function buy(it,embers){const p=price(it);if(embers<p||full())return 0;const c=sane(it);if(!c)return 0;S.inv.push(c);S.sold.push(it.id);save();return p}
  const reset=()=>{S.inv=[];S.eq='start';S.n=1;S.seed=0;S.sold=[];save()};
  return{S,TYPES,AFFIX,RAR,RCOL,CAP,START,all,byId,equipped,name,stats,price,sellValue,make,drop,rollRar,rng,add,full,equip,sell,stock,buy,reset,load,save,sane}})();
if(typeof module!=='undefined')module.exports=WardenGear;
