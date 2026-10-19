// WARDEN Combat v2, Phase 1: the combo resolver. Pure table logic (no THREE/DOM): which move does this input start, given what the fighter is doing?
// Light: tap for the 3-hit Quick Cut (light > light2 > light3, each follows from the previous one's cancel window or a short gap), Forward+Light = Advancing Cut (steps in),
// Light shortly after a dodge = Evasive Punish. Heavy tapped inside a Light's cancel window = Rising Slash (slower follow-up, big posture damage); otherwise Heavy charges as before.
// Every id returned must exist in Moves.js (tests check). A chain index of 3 means "finished": the next Light starts a fresh chain.
const Combos=(()=>{
  const CHAIN_GAP=30,EVADE_GAP=18;   // ticks: how long after the last attack you may still continue a chain / after a dodge ends you may still punish
  // ctx: {from: id of the move being cancelled out of (null if free), adv: forward held, chain: chain index reached by the last move (0 if the gap expired), sinceDodge: ticks since a dodge ended}
  function light(ctx){
    const f=ctx.from;
    if(ctx.guard&&!f)return 'shove';
    if(f==='light'||f==='advance'||f==='evade')return 'light2';
    if(f==='light2')return 'light3';
    if(f)return 'light';
    if(ctx.adv)return 'advance';
    if(ctx.sinceDodge<=EVADE_GAP)return 'evade';
    if(ctx.chain===1)return 'light2';if(ctx.chain===2)return 'light3';
    return 'light'}
  function heavy(ctx){const f=ctx.from;return f==='light3'?'whirl':f==='light'||f==='light2'||f==='advance'||f==='evade'?'rising':null}
  return{light,heavy,CHAIN_GAP,EVADE_GAP,IDS:['light','light2','light3','advance','evade','rising','shove','whirl']}})();
if(typeof module!=='undefined')module.exports=Combos;
