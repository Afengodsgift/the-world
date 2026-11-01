// WARDEN progression (no THREE/DOM, tests run it in a vm): Embers, permanent upgrades, and Ashen Cycles (New Game+).
//   Embers  = currency dropped by every felled foe. Die and the ones you carry are left where you fell (walk over them to take them back); die again first and they are gone.
//   Upgrades (Ember Shrine): vig +10 max HP, end +6 max stamina, mig +4% damage, belt +1 flask capacity (all three kinds). Costs grow 1.45x per level.
//   Cycle   = felling every boss gate ends the cycle: the isles reset, foes grow (hp/damage), and a new twist joins (Quickened > Ironbound > Ravenous ...). Embers per kill grow with the cycle too.
// Saved in localStorage 'wprog'. Every read/write is wrapped: private windows throw.
const WardenProg=(()=>{
  const KEY='wprog',MAXL={vig:10,end:10,mig:10,belt:3},BASE={vig:100,end:90,mig:140,belt:260};
  const NAMES={vig:'Vigor',end:'Endurance',mig:'Might',belt:'Flask Belt'};
  const TWISTS=['','Quickened','Ironbound','Ravenous'];
  const S={cycle:1,embers:0,ups:{vig:0,end:0,mig:0,belt:0},done:{},mast:{},lost:null,total:0,best:1,kills:0,duel:{w:0,l:0,streak:0,best:0,rating:0}};
  let bosses=[];
  const clampI=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(v)?v|0:lo));
  function load(){try{const j=JSON.parse(localStorage.getItem(KEY)||'null');if(!j)return;S.cycle=clampI(j.cycle,1,99);S.embers=clampI(j.embers,0,1e9);S.total=clampI(j.total,0,1e12);S.best=clampI(j.best,1,99);S.kills=clampI(j.kills,0,1e9);
    for(const k in MAXL)S.ups[k]=clampI(j.ups&&j.ups[k],0,MAXL[k]);S.done={};if(j.done)for(const k in j.done)if(j.done[k])S.done[k]=1;S.mast={};if(j.mast)for(const k in j.mast)if(j.mast[k]===1||j.mast[k]===2)S.mast[k]=j.mast[k];
    if(j.duel){const d=j.duel;S.duel={w:clampI(d.w,0,1e6),l:clampI(d.l,0,1e6),streak:clampI(d.streak,0,1e6),best:clampI(d.best,0,1e6),rating:clampI(d.rating,0,9999)}}
    S.lost=j.lost&&Number.isFinite(j.lost.x)&&Number.isFinite(j.lost.z)&&j.lost.n>0&&typeof j.lost.sid==='string'?{sid:j.lost.sid,x:+j.lost.x,z:+j.lost.z,n:j.lost.n|0}:null}catch(e){}}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
  load();
  const setBosses=ids=>{bosses=ids.slice()};
  const twist=c=>TWISTS[Math.min(c-1,TWISTS.length-1)]||'';
  // what a cycle does to foes (applied on top of the solo / co-op multipliers in PlayerCombat)
  function cycleMul(c){c=c||S.cycle;const n=c-1;return{hp:1+.35*n,dm:1+.12*n,spd:Math.min(1.35,1+.05*n),sa:c>=3,ember:1+.5*n}}
  const cost=k=>S.ups[k]>=MAXL[k]?Infinity:Math.round(BASE[k]*Math.pow(1.45,S.ups[k]));
  function stats(){return{hp:100+10*S.ups.vig,st:100+6*S.ups.end,dm:1+.04*S.ups.mig,belt:S.ups.belt}}
  function buy(k){if(!(k in MAXL))return false;const c=cost(k);if(!Number.isFinite(c)||S.embers<c)return false;S.embers-=c;S.ups[k]++;save();return true}
  // embers for a felled foe; a boss the first time this cycle pays double
  function reward(T,siteId){const m=cycleMul().ember,boss=!!T.boss;let n=boss?150+Math.round(T.hp*.25):12+Math.round(T.hp*.05);if(boss&&siteId&&!S.done[siteId])n*=2;return Math.round(n*m)}
  function add(n){n=n|0;if(n<=0)return;S.embers+=n;S.total+=n;S.kills++;save()}
  const earn=n=>{n=n|0;if(n>0){S.embers+=n;save()}};const spend=n=>{if(S.embers<n)return false;S.embers-=n;save();return true};
  // Dying: the carried embers stay where you fell (one pile only).
  function die(sid,x,z){if(S.embers>0)S.lost={sid,x,z,n:S.embers};S.embers=0;save();return S.lost}
  function claim(){if(!S.lost)return 0;const n=S.lost.n;S.embers+=n;S.lost=null;save();return n}
  // A boss gate was cleared. Returns {cycle,bonus,twist} when that was the last one (the cycle turns over), otherwise null.
  function felled(siteId){if(!siteId||bosses.indexOf(siteId)<0)return null;S.done[siteId]=1;let n=0;for(const b of bosses)if(S.done[b])n++;
    if(n<bosses.length){save();return null}
    S.cycle++;S.best=Math.max(S.best,S.cycle);S.done={};const bonus=300*(S.cycle-1);S.embers+=bonus;S.total+=bonus;save();return{cycle:S.cycle,bonus,twist:twist(S.cycle)}}
  const progress=()=>{let n=0;for(const b of bosses)if(S.done[b])n++;return{n,of:bosses.length}};
  // ---- duels (the Ashen Arena): a rating that moves only against real players; a win against the Shade pays a little, against a player a lot ----
  const RANKS=[[0,'Rookie'],[100,'Duellist'],[250,'Blade'],[450,'Veteran'],[700,'Champion'],[1000,'Legend']];
  function rank(r){r=r===undefined?S.duel.rating:r;let n=RANKS[0][1];for(const [m,t] of RANKS)if(r>=m)n=t;return n}
  function duelResult(win,human){const d=S.duel;let emb=0;
    if(win){d.w++;if(human){d.streak++;d.best=Math.max(d.best,d.streak);d.rating=Math.min(9999,d.rating+25);emb=150+25*Math.min(d.streak-1,8)}else emb=40}
    else{d.l++;if(human){d.streak=0;d.rating=Math.max(0,d.rating-20);emb=20}}
    if(emb)earn(emb);save();return{embers:emb,rating:d.rating,rank:rank(),streak:d.streak}}
  const reset=()=>{S.cycle=1;S.embers=0;S.ups={vig:0,end:0,mig:0,belt:0};S.done={};S.mast={};S.lost=null;S.total=0;S.best=1;S.kills=0;S.duel={w:0,l:0,streak:0,best:0,rating:0};save()};
  return{S,NAMES,MAXL,setBosses,twist,cycleMul,cost,stats,buy,reward,add,die,claim,earn,spend,rank,duelResult,felled,progress,reset,load,save}})();
if(typeof module!=='undefined')module.exports=WardenProg;
