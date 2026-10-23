// WARDEN: Catacombs progress + loot rules (no THREE/DOM; tests run it in a vm). Rooms stay cleared for the whole Ashen Cycle (they re-arm when the cycle turns); chests are one per cycle each.
// Saved in localStorage 'wdg' = {cleared:{id:1}, chests:{id:1}, runs, cycle}. Everything read back is sanitised against the real room / chest ids.
const WardenDungeon=(()=>{
  const KEY='wdg',S={cleared:{},chests:{},runs:0,cycle:1};
  const rooms=()=>typeof DUNGEON!=='undefined'?DUNGEON.ROOMS.filter(r=>!r.safe):[];
  const chestIds=()=>typeof DUNGEON!=='undefined'?DUNGEON.CHESTS.map(c=>c.id):[];
  const clampI=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(v)?v|0:lo));
  function load(){try{const j=JSON.parse(localStorage.getItem(KEY)||'null');if(!j)return;S.runs=clampI(j.runs,0,1e6);S.cycle=clampI(j.cycle,1,99);S.cleared={};S.chests={};
    for(const r of rooms())if(j.cleared&&j.cleared[r.id])S.cleared[r.id]=1;for(const id of chestIds())if(j.chests&&j.chests[id])S.chests[id]=1}catch(e){}}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
  load();
  const isCleared=id=>!!S.cleared[id];
  function clear(id){if(!rooms().some(r=>r.id===id))return false;if(S.cleared[id])return false;S.cleared[id]=1;save();return true}
  const doorOpen=d=>!d.need||!!S.cleared[d.need];
  const chestReady=c=>!!S.cleared[c.need]&&!S.chests[c.id];
  const chestTaken=c=>!!S.chests[c.id];
  function take(c){if(!chestReady(c))return false;S.chests[c.id]=1;save();return true}
  const progress=()=>{const R=rooms();return{n:R.filter(r=>S.cleared[r.id]).length,of:R.length}};
  // the Isles turned over (an Ashen Cycle ended): everything re-arms. A finished catacombs counts as a run.
  function reset(cycle){const done=rooms().length>0&&rooms().every(r=>S.cleared[r.id]);if(done)S.runs++;S.cleared={};S.chests={};if(cycle)S.cycle=clampI(cycle,1,99);save()}
  // chest loot. vault: a Rare-or-better weapon + embers; main: a guaranteed Relic weapon + a lot of embers. Both grow with the cycle. r = rng() in [0,1)
  function loot(kind,cycle,r){cycle=Math.max(1,cycle|0||1);const c=cycle-1;
    if(kind==='main')return{embers:500+150*c,rar:3,kind};
    return{embers:200+80*c,rar:r()<.25+.03*Math.min(c,8)?3:2,kind}}
  const reset_=()=>{S.cleared={};S.chests={};S.runs=0;S.cycle=1;save()};
  return{S,load,save,isCleared,clear,doorOpen,chestReady,chestTaken,take,progress,reset,loot,hardReset:reset_}})();
if(typeof module!=='undefined')module.exports=WardenDungeon;
